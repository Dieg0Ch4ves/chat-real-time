import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import type { AddressInfo } from 'net';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisIoAdapter } from '../src/redis/redis-io.adapter';
import { RedisService } from '../src/redis/redis.service';

describe('Chat (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  const suffix = Date.now();
  const credentials = {
    email: `e2e-${suffix}@exemplo.com`,
    name: 'Usuário E2E',
    password: 'senha123',
  };
  const roomId = `e2e-room-${suffix}`;

  const sockets: Socket[] = [];

  const connect = (auth: Record<string, string>): Socket => {
    const socket = io(baseUrl, { auth, transports: ['websocket'] });
    sockets.push(socket);
    return socket;
  };

  const waitFor = <T>(socket: Socket, event: string, timeoutMs = 10_000) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timeout aguardando "${event}"`)),
        timeoutMs,
      );
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    const redis = app.get(RedisService);
    const adapter = new RedisIoAdapter(app, redis.pub, redis.sub);
    adapter.connectToRedis();
    app.useWebSocketAdapter(adapter);

    await app.listen(0);

    prisma = app.get(PrismaService);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;
  });

  afterAll(async () => {
    for (const socket of sockets) {
      socket.disconnect();
    }

    if (prisma) {
      await prisma.message.deleteMany({ where: { roomId } });
      await prisma.room.deleteMany({ where: { id: roomId } });
      await prisma.user.deleteMany({ where: { email: credentials.email } });
    }

    await app?.close();
  });

  describe('HTTP', () => {
    it('GET /health responde ok', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({ status: 'ok' });
    });

    it('POST /auth/register cria o usuário e devolve o token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);

      const body = response.body as {
        access_token: string;
        user: { id: string; email: string };
      };

      expect(body.access_token).toEqual(expect.any(String));
      expect(body.user.email).toBe(credentials.email);
    });

    it('POST /auth/register rejeita email duplicado com 409', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(409);
    });

    it('POST /auth/login rejeita senha errada com 401', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: 'senha-errada' })
        .expect(401);
    });

    it('POST /auth/register valida o corpo da requisição com 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'nao-e-email', name: 'x', password: '123' })
        .expect(400);
    });
  });

  describe('WebSocket', () => {
    let token: string;
    let userId: string;

    beforeAll(async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(200);

      const body = response.body as {
        access_token: string;
        user: { id: string };
      };
      token = body.access_token;
      userId = body.user.id;
    });

    it('recusa a conexão de socket sem token', async () => {
      const socket = io(baseUrl, { transports: ['websocket'] });
      sockets.push(socket);

      await waitFor(socket, 'disconnect');
      expect(socket.connected).toBe(false);
    });

    it('completa o fluxo: conectar, entrar na sala e trocar mensagens', async () => {
      const socket = connect({ token });
      await waitFor(socket, 'connect');

      const joined = waitFor<{
        roomId: string;
        online: string[];
        messages: unknown[];
      }>(socket, 'room:joined');
      socket.emit('room:join', { roomId });

      const joinPayload = await joined;
      expect(joinPayload.roomId).toBe(roomId);
      expect(joinPayload.online).toContain(userId);
      expect(joinPayload.messages).toEqual([]);

      const incoming = waitFor<{ id: string; content: string }>(
        socket,
        'message:new',
      );
      socket.emit('message:send', { roomId, content: 'olá do e2e' });

      const message = await incoming;
      expect(message.content).toBe('olá do e2e');

      const persisted = await prisma.message.findMany({ where: { roomId } });
      expect(persisted).toHaveLength(1);
      expect(persisted[0].content).toBe('olá do e2e');
    });
  });
});
