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

logging.basicConfig(
    level=logging.INFO,
    format = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

memory = MemoryClient()
history = HistoryClient()

async def handle_request_chat(msg):
    channel_id = msg["channel_id"]
    content = msg["content"]
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
    
    try:
        ai_response = await call_ai("", full_prompt, model, temperature, thinking)
    except InsufficientFundsError as e:
        logger.warning(f"AI balance low: {e}")
        ai_response = "Казна нищает, милорд =("
    except Exception as e:
        logger.error(f"AI response error: {e}")
        logger.error(traceback.format_exc())
        ai_response = "Произошла ошибка при обращении к ИИ =("
    
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
    
    return {
        "response": ai_response,
    }

async def handle_request_ball(msg):
    channel_id = msg["channel_id"]
    content = msg["content"]
    user_data = msg.get("user_data")
    channel_data = msg.get("channel_data")
    ltm = msg.get("ltm", [])
    settings = msg.get("settings", {})
    thinking = settings.get("thinking", False)
    model = settings.get("model", "Gemini")
    temperature = 1.0
    
    instruction = PromptBuilder.build_system_prompt_ball(user_data, channel_data, ltm, settings)
    full_prompt = (
        f"{instruction}\n"
        f"Текущее сообщение пользователя: {content}\n"
        f"Твой ответ:"
    )
    
    try:
        ai_response = await call_ai("", full_prompt, model, temperature, thinking)
    except InsufficientFundsError as e:
        logger.warning(f"AI balance low: {e}")
        ai_response = "Казна нищает, милорд =("
    except Exception as e:
        logger.error(f"AI response error: {e}")
        logger.error(traceback.format_exc())
        ai_response = "Произошла ошибка при обращении к ИИ =("
    return {
        "response": ai_response,
    }

async def handle_request_revelation(msg):
    channel_id = msg["channel_id"]
    content = msg["content"]
    user_data = msg.get("user_data")
    channel_data = msg.get("channel_data")
    ltm = msg.get("ltm", [])
    settings = msg.get("settings", {})
    thinking = settings.get("thinking", False)
    model = settings.get("model", "Gemini")
    temperature = 1.0
    
    instruction = PromptBuilder.build_system_prompt_revelation(user_data, channel_data, ltm, settings)
    full_prompt = (
        f"{instruction}\n"
        f"Текущее сообщение пользователя: {content}\n"
        f"Твой ответ:"
    )
    
    try:
        ai_response = await call_ai("", full_prompt, model, temperature, thinking)
    except InsufficientFundsError as e:
        logger.warning(f"AI balance low: {e}")
        ai_response = "Казна нищает, милорд =("
    except Exception as e:
        logger.error(f"AI response error: {e}")
        logger.error(traceback.format_exc())
        ai_response = "Произошла ошибка при обращении к ИИ =("
    return {
        "response": ai_response,
    }

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

if __name__ == "__main__":
    asyncio.run(main())