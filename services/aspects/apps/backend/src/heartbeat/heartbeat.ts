import Redis from 'ioredis';

let client: Redis | null = null;

function getRedis(url: string): Redis {
  if (!client) client = new Redis(url);
  return client;
}

export function startHeartbeat(
  redisUrl: string,
  serviceName: string,
  intervalSec = 15,
  ttlSec = 45,
): void {
  const r = getRedis(redisUrl);
  const tick = async () => {
    try {
      await r.setex(`heartbeat:${serviceName}`, ttlSec, new Date().toISOString());
    } catch (e) {
      console.warn(`heartbeat failed for ${serviceName}:`, e);
    }
  };
  tick();
  setInterval(tick, intervalSec * 1000).unref();
}