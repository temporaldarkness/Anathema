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
  );

  await app.register(fastifyCookie as any, {
    secret: process.env.COOKIE_SECRET ?? 'aspects-internal',
  });

  app.enableCors({ origin: true, credentials: true });

  const config = app.get(ConfigService);
  startHeartbeat(config.redisUrl, 'aspects_backend', 15, 45);

  await app.listen(config.port, '0.0.0.0');

  const fastify = app.getHttpAdapter().getInstance();
  const httpServer = (fastify as any).server;
  attachSocketIo(httpServer, app);

  logger.log(`aspects_backend listening on :${config.port}`);
  logger.log(`socket.io attached`);
}

bootstrap().catch((e) => {
  console.error('Bootstrap failed:', e);
  process.exit(1);
});