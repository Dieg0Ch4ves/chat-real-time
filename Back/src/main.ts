import { ValidationPipe, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './redis/redis-io.adapter';
import { RedisService } from './redis/redis.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const config = app.get(ConfigService);
  const redis = app.get(RedisService);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const adapter = new RedisIoAdapter(app, redis.pub, redis.sub);
  adapter.connectToRedis();
  app.useWebSocketAdapter(adapter);

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Chat API rodando em http://localhost:${port}`);
}

void bootstrap();
