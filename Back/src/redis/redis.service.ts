import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_PUB = 'REDIS_PUB';
export const REDIS_SUB = 'REDIS_SUB';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private presenceClient!: Redis;

  constructor(
    @Inject(REDIS_PUB) readonly pub: Redis,
    @Inject(REDIS_SUB) readonly sub: Redis,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.presenceClient = this.createClient();
  }

  onModuleDestroy() {
    this.presenceClient.disconnect();
    this.pub.disconnect();
    this.sub.disconnect();
  }

  private createClient(): Redis {
    return new Redis({
      host: this.config.get('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
    });
  }

  async setOnline(userId: string) {
    await this.presenceClient.set(`presence:user:${userId}`, '1');
    await this.presenceClient.sadd('presence:online', userId);
  }

  async setOffline(userId: string) {
    await this.presenceClient.srem('presence:online', userId);
    await this.presenceClient.del(`presence:user:${userId}`);
  }

  async isOnline(userId: string): Promise<boolean> {
    return (await this.presenceClient.exists(`presence:user:${userId}`)) === 1;
  }

  async getOnlineUsers(): Promise<string[]> {
    return this.presenceClient.smembers('presence:online');
  }
}
