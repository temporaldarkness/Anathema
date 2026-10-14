import { Injectable } from '@nestjs/common';

@Injectable()
export class ConfigService {
  get port(): number {
    return parseInt(process.env.PORT ?? '8010', 10);
  }
  get databaseUrl(): string {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    return url;
  }
  get redisUrl(): string {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL is not set');
    return url;
  }
  get webwayBackendUrl(): string {
    return process.env.WEBWAY_BACKEND_URL ?? 'http://webway_backend:8000';
  }
  get webwayApiKey(): string {
    const key = process.env.WEBWAY_API_KEY;
    if (!key) throw new Error('WEBWAY_API_KEY is not set');
    return key;
  }
  get publicUrl(): string {
    return process.env.PUBLIC_URL ?? '/games/aspects';
  }
}