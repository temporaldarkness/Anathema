import Redis from 'ioredis';
import { Logger } from '@nestjs/common';

const logger = new Logger('Heartbeat');

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
      logger.warn(`heartbeat failed for ${serviceName}: ${String(e)}`);
    }
  };
  tick();
  setInterval(tick, intervalSec * 1000).unref();
}