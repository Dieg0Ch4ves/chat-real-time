import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_PUB, REDIS_SUB, RedisService } from './redis.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_PUB,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        }),
    },
    {
      provide: REDIS_SUB,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        }),
    },
    RedisService,
  ],
  exports: [RedisService, REDIS_PUB, REDIS_SUB],
})
export class RedisModule {}
