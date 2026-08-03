import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import { createAdapter } from '@socket.io/redis-adapter';
import { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplication,
    private readonly pubClient: Redis,
    private readonly subClient: Redis,
  ) {
    super(app);
  }

  connectToRedis(): void {
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient, {
      key: 'chat:socket.io',
    });
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    server.adapter(this.adapterConstructor);
    return server;
  }
}
