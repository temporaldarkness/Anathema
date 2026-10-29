import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from '@nestjs/common';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { startHeartbeat } from './heartbeat/heartbeat';
import { attachSocketIo } from './rooms/socket-io';

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

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.ANON_COOKIE_SECRET) {
      throw new Error('ANON_COOKIE_SECRET must be set in production');
    }
    if (!process.env.INTERNAL_API_TOKEN) {
      logger.warn(
        'INTERNAL_API_TOKEN is not set — x-internal-token path is disabled',
      );
    }
  }

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
  console.error('Bootstrap failed:', e);
  process.exit(1);
});