import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger, LogLevel } from '@nestjs/common';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { startHeartbeat } from './heartbeat/heartbeat';
import { attachSocketIo } from './rooms/socket-io';

function applyLogLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? 'log').toLowerCase();
  const map: Record<string, LogLevel> = {
    error: 'error',
    warn: 'warn',
    log: 'log',
    debug: 'debug',
    verbose: 'verbose',
  };
  return map[raw] ?? 'log';
}

const LEVEL_ORDER: LogLevel[] = ['error', 'warn', 'log', 'debug', 'verbose'];

function logLevelsUpTo(level: LogLevel): LogLevel[] {
  const idx = LEVEL_ORDER.indexOf(level);
  return LEVEL_ORDER.slice(0, idx < 0 ? 2 : idx + 1);
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
    { bodyParser: false },
  );

  const fastify = app.getHttpAdapter().getInstance();

  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    function (req: any, body: string, done: any) {
      if (!body || body === '') {
        done(null, {});
        return;
      }
      try {
        const json = JSON.parse(body);
        done(null, json);
      } catch (err: any) {
        err.statusCode = 400;
        done(err, undefined);
      }
    },
  );

  await app.register(fastifyCookie as any, {
    secret: process.env.COOKIE_SECRET ?? 'aspects-internal',
  });

  Logger.overrideLogger(logLevelsUpTo(applyLogLevel()));

  app.enableCors({ origin: true, credentials: true });

  const config = app.get(ConfigService);
  startHeartbeat(config.redisUrl, 'aspects_backend', 15, 45);

  await app.listen(config.port, '0.0.0.0');

  const httpServer = (fastify as any).server;
  attachSocketIo(httpServer, app);

  logger.log(`aspects_backend listening on :${config.port}`);
  logger.log(`socket.io attached`);
}

bootstrap().catch((e) => {
  new Logger('Bootstrap').error('Bootstrap failed: ' + String(e?.stack ?? e));
  process.exit(1);
});