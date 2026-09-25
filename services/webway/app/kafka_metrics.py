import asyncio
from concurrent.futures import ThreadPoolExecutor
from kafka import KafkaConsumer
from kafka.structs import TopicPartition

_executor = ThreadPoolExecutor(max_workers=2)

def _collect_metrics_sync(bootstrap: str) -> dict:
    try:
        consumer = KafkaConsumer(
            bootstrap_servers=bootstrap,
            request_timeout_ms=5000,
            api_version_auto_timeout_ms=5000,
        )
        topics = consumer.topics()
        result = []
        for name in sorted(topics):
            if name.startswith("__"):
                continue
            partitions = consumer.partitions_for_topic(name) or set()
            if not partitions:
                continue
            tps = [TopicPartition(name, p) for p in partitions]
            ends = consumer.end_offsets(tps)
            starts = consumer.beginning_offsets(tps)
            total = sum(ends.values())
            live = sum(ends[tp] - starts[tp] for tp in tps)
            result.append({
                "name": name,
                "partitions": len(partitions),
                "total_messages": total,
                "live_messages": live,
            })
        consumer.close()
        return {"ok": True, "topics": result, "error": None}
    except Exception as e:
        return {"ok": False, "topics": [], "error": str(e)}


async def get_kafka_metrics(bootstrap: str) -> dict:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, _collect_metrics_sync, bootstrap)