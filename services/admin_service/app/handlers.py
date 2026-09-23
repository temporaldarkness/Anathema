from .memory_client import MemoryClient

async def handle_maintenance(memory: MemoryClient, args: dict, channel_id: int = None):
    param = args.get("parameter")
    value = args.get("value")
    if param not in ['thinking', 'images', 'longterm', 'channel_caching', 'puppeteer']:
        return {"error": "Parameter not available"}
    if param is None or value is None:
        return {"error": "Missing parameter or value"}
    result = await memory.update_setting(param, str(value))
    return result

async def handle_channel(memory: MemoryClient, args: dict, channel_id: int = None):
    uid = args.get("uid")
    name = args.get("name")
    description = args.get("description")
    prompt = args.get("prompt")
    if not uid or not name:
        return {"error": "Missing uid or name"}
    ch_id = args.get("channel_id") or channel_id
    if not ch_id:
        return {"error": "Missing channel_id"}
    channel_data = {
        "uid": uid,
        "channel_id": ch_id,
        "human_name": name,
        "human_topic": description,
        "prompt": prompt
    }
    result = await memory.upsert_channel(channel_data)
    return {"result": result}