import asyncio
import json
import re
import logging
import traceback
from .memory_client import MemoryClient
from .history_client import HistoryClient
from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from .ai_client import call_ai
from .prompt_builder import PromptBuilder
from .config import KAFKA_BOOTSTRAP_SERVERS, KAFKA_TOPIC_AI_RESPONSES, KAFKA_GROUP_AI_WORKER, KAFKA_TOPIC_AI_REQUESTS
from .exceptions import InsufficientFundsError
from .pricing import compute_token_cost
from .kafka_producer import UsageProducer

logging.basicConfig(
    level=logging.INFO,
    format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

memory = MemoryClient()
history = HistoryClient()
usage_producer = UsageProducer()

async def _emit_usage(
    *,
    correlation_id: str,
    user_id: int | None,
    model: str,
    usage: dict | None,
    success: bool,
    error: str | None = None,
    source: str = "ai_worker",
):
    try:
        if success and usage:
            real_model = usage.get("model", model)
            tokens_in = usage.get("tokens_in", 0)
            tokens_out = usage.get("tokens_out", 0)
            cost = compute_token_cost(real_model, tokens_in, tokens_out)
            await usage_producer.emit(
                source=source,
                model=real_model,
                tokens_in=tokens_in,
                tokens_out=tokens_out,
                cost_usd=cost,
                correlation_id=correlation_id,
                user_id=user_id,
                success=True,
                error=None,
            )
        else:
            await usage_producer.emit(
                source=source,
                model=model,
                tokens_in=0,
                tokens_out=0,
                cost_usd=0.0,
                correlation_id=correlation_id,
                user_id=user_id,
                success=False,
                error=error,
            )
    except Exception:
        logger.exception("Failed to emit usage event")

async def _call_ai_with_usage(
    *,
    full_prompt: str,
    model: str,
    temperature: float,
    thinking: bool,
    correlation_id: str,
    user_id: int | None,
    mode: str,
):
    try:
        ai_response, usage = await call_ai("", full_prompt, model, temperature, thinking)
        if ai_response is None:
            raise RuntimeError(usage.get("error", "empty AI response"))

        await _emit_usage(
            correlation_id=correlation_id,
            user_id=user_id,
            model=model,
            usage=usage,
            success=True,
        )
        return ai_response, usage

    except InsufficientFundsError as e:
        logger.warning(f"[{mode}] AI balance low: {e}")
        await _emit_usage(
            correlation_id=correlation_id,
            user_id=user_id,
            model=model,
            usage=None,
            success=False,
            error=f"insufficient funds: {e}",
        )
        return "Казна нищает, милорд =(", None

    except Exception as e:
        logger.error(f"[{mode}] AI response error: {e}")
        logger.error(traceback.format_exc())
        await _emit_usage(
            correlation_id=correlation_id,
            user_id=user_id,
            model=model,
            usage=None,
            success=False,
            error=str(e) or "unknown error",
        )
        return "Произошла ошибка при обращении к ИИ =(", None

async def handle_request_chat(msg):
    correlation_id = msg.get("correlation_id", "")
    channel_id = msg["channel_id"]
    content = msg["content"]
    user_id = msg.get("user_id")
    user_data = msg.get("user_data")
    channel_data = msg.get("channel_data")
    ltm = msg.get("ltm", [])
    settings = msg.get("settings", {})
    thinking = settings.get("thinking", False)
    model = settings.get("model", "Gemini")
    temperature = 1.0

    instruction = PromptBuilder.build_system_prompt_chat(user_data, channel_data, ltm, settings)

    history_messages = await history.get_channel_history(channel_id, limit=20)
    history_text = PromptBuilder.format_history(history_messages)
    full_prompt = (
        f"{instruction}\n"
        f"{history_text}\n"
        f"Текущее сообщение пользователя: {content}\n"
        f"Твой ответ:"
    )

    ai_response = None
    success = False
    error_text = None

    try:
        ai_response, usage = await call_ai("", full_prompt, model, temperature, thinking)
        if ai_response is None:
            raise RuntimeError(usage.get("error", "empty AI response"))

        success = True
        tokens_in = usage.get("tokens_in", 0)
        tokens_out = usage.get("tokens_out", 0)
        cost = compute_token_cost(usage.get("model", model), tokens_in, tokens_out)

        await usage_producer.emit(
            source="ai_worker",
            model=usage.get("model", model),
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            cost_usd=cost,
            correlation_id=correlation_id,
            user_id=user_id,
            success=True,
            error=None,
        )
    except InsufficientFundsError as e:
        logger.warning(f"AI balance low: {e}")
        ai_response = "Казна нищает, милорд =("
        error_text = f"insufficient funds: {e}"
    except Exception as e:
        logger.error(f"AI response error: {e}")
        logger.error(traceback.format_exc())
        ai_response = "Произошла ошибка при обращении к ИИ =("
        error_text = str(e)

    if not success:
        try:
            await usage_producer.emit(
                source="ai_worker",
                model=model,
                tokens_in=0,
                tokens_out=0,
                cost_usd=0.0,
                correlation_id=correlation_id,
                user_id=user_id,
                success=False,
                error=error_text,
            )
        except Exception:
            logger.exception("Failed to emit failure usage")
    ltm_match = re.search(r'<LTM>(.*?)</LTM>', ai_response, re.DOTALL)
    if ltm_match:
        fact = ltm_match.group(1).strip()
        if fact:
            await memory.add_ltm_fact(fact)
        ai_response = re.sub(r'<LTM>.*?</LTM>', '', ai_response, flags=re.DOTALL).strip()

    del_matches = re.findall(r'<DEL_LTM>(\d+)</DEL_LTM>', ai_response)
    for fact_id in del_matches:
        await memory.delete_ltm_fact(int(fact_id))
    ai_response = re.sub(r'<DEL_LTM>\d+</DEL_LTM>', '', ai_response).strip()

    return {
        "response": ai_response,
    }

async def _process_ltm_tags(ai_response: str) -> str:
    # <LTM>Text</LTM>
    ltm_match = re.search(r'<LTM>(.*?)</LTM>', ai_response, re.DOTALL)
    if ltm_match:
        fact = ltm_match.group(1).strip()
        if fact:
            await memory.add_ltm_fact(fact)
        ai_response = re.sub(r'<LTM>.*?</LTM>', '', ai_response, flags=re.DOTALL).strip()

    # <DEL_LTM>id</DEL_LTM>
    del_matches = re.findall(r'<DEL_LTM>(\d+)</DEL_LTM>', ai_response)
    for fact_id in del_matches:
        await memory.delete_ltm_fact(int(fact_id))
    ai_response = re.sub(r'<DEL_LTM>\d+</DEL_LTM>', '', ai_response).strip()

    return ai_response
async def handle_request_chat(msg):
    correlation_id = msg.get("correlation_id", "")
    channel_id = msg["channel_id"]
    content = msg["content"]
    user_id = msg.get("user_id")
    user_data = msg.get("user_data")
    channel_data = msg.get("channel_data")
    ltm = msg.get("ltm", [])
    settings = msg.get("settings", {})
    thinking = settings.get("thinking", False)
    model = settings.get("model", "Gemini")

    instruction = PromptBuilder.build_system_prompt_chat(user_data, channel_data, ltm, settings)

    history_messages = await history.get_channel_history(channel_id, limit=20)
    history_text = PromptBuilder.format_history(history_messages)
    full_prompt = (
        f"{instruction}\n"
        f"{history_text}\n"
        f"Текущее сообщение пользователя: {content}\n"
        f"Твой ответ:"
    )

    ai_response, _ = await _call_ai_with_usage(
        full_prompt=full_prompt,
        model=model,
        temperature=1.0,
        thinking=thinking,
        correlation_id=correlation_id,
        user_id=user_id,
        mode="chat",
    )

    ai_response = await _process_ltm_tags(ai_response)
    return {"response": ai_response}


async def handle_request_ball(msg):
    correlation_id = msg.get("correlation_id", "")
    content = msg["content"]
    user_id = msg.get("user_id")
    user_data = msg.get("user_data")
    channel_data = msg.get("channel_data")
    ltm = msg.get("ltm", [])
    settings = msg.get("settings", {})
    thinking = settings.get("thinking", False)
    model = settings.get("model", "Gemini")

    instruction = PromptBuilder.build_system_prompt_ball(user_data, channel_data, ltm, settings)
    full_prompt = (
        f"{instruction}\n"
        f"Текущее сообщение пользователя: {content}\n"
        f"Твой ответ:"
    )

    ai_response, _ = await _call_ai_with_usage(
        full_prompt=full_prompt,
        model=model,
        temperature=1.0,
        thinking=thinking,
        correlation_id=correlation_id,
        user_id=user_id,
        mode="ball",
    )

    return {"response": ai_response}


async def handle_request_revelation(msg):
    correlation_id = msg.get("correlation_id", "")
    content = msg["content"]
    user_id = msg.get("user_id")
    user_data = msg.get("user_data")
    channel_data = msg.get("channel_data")
    ltm = msg.get("ltm", [])
    settings = msg.get("settings", {})
    thinking = settings.get("thinking", False)
    model = settings.get("model", "Gemini")

    instruction = PromptBuilder.build_system_prompt_revelation(user_data, channel_data, ltm, settings)
    full_prompt = (
        f"{instruction}\n"
        f"Текущее сообщение пользователя: {content}\n"
        f"Твой ответ:"
    )

    ai_response, _ = await _call_ai_with_usage(
        full_prompt=full_prompt,
        model=model,
        temperature=1.0,
        thinking=thinking,
        correlation_id=correlation_id,
        user_id=user_id,
        mode="revelation",
    )

    return {"response": ai_response}

async def main():
    consumer = AIOKafkaConsumer(
        KAFKA_TOPIC_AI_REQUESTS,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        group_id=KAFKA_GROUP_AI_WORKER,
        value_deserializer=lambda m: json.loads(m.decode('utf-8')),
        auto_offset_reset="earliest"
    )
    producer = AIOKafkaProducer(
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )
    
    await consumer.start()
    await usage_producer.start()
    await producer.start()
    
    logger.info("AI Worker online")
    
    try:
        async for msg in consumer:
            request = msg.value
            correlation_id = request.get('correlation_id')
            mode = request.get('mode')
            logger.debug(f"Received request {correlation_id} for mode {mode}")
            
            if mode == "chat":
                response = await handle_request_chat(request)
            elif mode == "revelation":
                response = await handle_request_revelation(request)
            elif mode == "ball":
                response = await handle_request_ball(request)
            else:
                response = {}
            response['correlation_id'] = correlation_id
            response['mode'] = mode
            
            await producer.send(KAFKA_TOPIC_AI_RESPONSES, response)
            logger.info(f"Sent answer for {correlation_id}")
    finally:
        await consumer.stop()
        await producer.stop()
        await memory.close()
        await history.close()
        await usage_producer.stop()

if __name__ == "__main__":
    asyncio.run(main())