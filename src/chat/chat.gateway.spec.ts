import { Test, TestingModule } from '@nestjs/testing';
import { Server } from 'socket.io';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { AuthenticatedSocket, AuthService } from '../auth/auth.service';
import { RedisService } from '../redis/redis.service';

type GatewayClient = Parameters<ChatGateway['handleConnection']>[0];

const user: AuthenticatedSocket = {
  userId: 'user-1',
  email: 'ana@exemplo.com',
  name: 'Ana',
};

const makeClient = (token?: string) => {
  const client = {
    handshake: { auth: token === undefined ? {} : { token }, query: {} },
    data: {} as { user?: AuthenticatedSocket },
    join: jest.fn(),
    disconnect: jest.fn(),
  };
  return { client, asGateway: client as unknown as GatewayClient };
};

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let auth: { verifyToken: jest.Mock };
  let redis: {
    setOnline: jest.Mock;
    setOffline: jest.Mock;
    getOnlineUsers: jest.Mock;
  };
  let chat: {
    joinRoom: jest.Mock;
    sendMessage: jest.Mock;
    listRoomMessages: jest.Mock;
  };
  let serverEmit: jest.Mock;
  let roomEmit: jest.Mock;
  let to: jest.Mock;

  beforeEach(async () => {
    auth = { verifyToken: jest.fn() };
    redis = {
      setOnline: jest.fn(),
      setOffline: jest.fn(),
      getOnlineUsers: jest.fn(),
    };
    chat = {
      joinRoom: jest.fn(),
      sendMessage: jest.fn(),
      listRoomMessages: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatGateway,
        { provide: AuthService, useValue: auth },
        { provide: RedisService, useValue: redis },
        { provide: ChatService, useValue: chat },
      ],
    }).compile();

    gateway = module.get(ChatGateway);

    serverEmit = jest.fn();
    roomEmit = jest.fn();
    to = jest.fn().mockReturnValue({ emit: roomEmit });
    gateway.server = { emit: serverEmit, to } as unknown as Server;
  });

  describe('handleConnection', () => {
    it('desconecta o socket que chega sem token', async () => {
      const { client, asGateway } = makeClient();

      await gateway.handleConnection(asGateway);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(auth.verifyToken).not.toHaveBeenCalled();
    });

    it('autentica, entra na sala do usuário e anuncia presença online', async () => {
      auth.verifyToken.mockReturnValue(user);
      const { client, asGateway } = makeClient('token-valido');

      await gateway.handleConnection(asGateway);

      expect(client.data.user).toEqual(user);
      expect(client.join).toHaveBeenCalledWith('user:user-1');
      expect(redis.setOnline).toHaveBeenCalledWith('user-1');
      expect(serverEmit).toHaveBeenCalledWith('presence:update', {
        userId: 'user-1',
        online: true,
      });
    });

    it('desconecta quando o token é inválido', async () => {
      auth.verifyToken.mockImplementation(() => {
        throw new Error('token inválido');
      });
      const { client, asGateway } = makeClient('token-ruim');

      await gateway.handleConnection(asGateway);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(redis.setOnline).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('ignora sockets que nunca autenticaram', async () => {
      const { asGateway } = makeClient();

      await gateway.handleDisconnect(asGateway);

      expect(redis.setOffline).not.toHaveBeenCalled();
      expect(serverEmit).not.toHaveBeenCalled();
    });

    it('marca offline e anuncia a saída', async () => {
      const { client, asGateway } = makeClient();
      client.data.user = user;

      await gateway.handleDisconnect(asGateway);

      expect(redis.setOffline).toHaveBeenCalledWith('user-1');
      expect(serverEmit).toHaveBeenCalledWith('presence:update', {
        userId: 'user-1',
        online: false,
      });
    });
  });

  describe('room:join', () => {
    it('entra na sala e devolve presença e histórico', async () => {
      const messages = [{ id: 'msg-1', content: 'oi' }];
      chat.joinRoom.mockResolvedValue({ id: 'sala-1' });
      chat.listRoomMessages.mockResolvedValue(messages);
      redis.getOnlineUsers.mockResolvedValue(['user-1']);

      const { client, asGateway } = makeClient();
      client.data.user = user;

      const result = await gateway.onJoinRoom(asGateway, { roomId: 'sala-1' });

      expect(chat.joinRoom).toHaveBeenCalledWith('sala-1', 'user-1');
      expect(client.join).toHaveBeenCalledWith('sala-1');
      expect(result).toEqual({
        event: 'room:joined',
        data: { roomId: 'sala-1', online: ['user-1'], messages },
      });
    });
  });

  describe('message:send', () => {
    it('propaga para a sala, confirma entrega e devolve o ack', async () => {
      const message = { id: 'msg-1', content: 'olá' };
      chat.sendMessage.mockResolvedValue(message);

      const { client, asGateway } = makeClient();
      client.data.user = user;

      const result = await gateway.onSendMessage(asGateway, {
        roomId: 'sala-1',
        content: 'olá',
      });

      expect(to).toHaveBeenCalledWith('sala-1');
      expect(roomEmit).toHaveBeenCalledWith('message:new', message);

      expect(to).toHaveBeenCalledWith('user:user-1');
      expect(roomEmit).toHaveBeenCalledWith('message:delivered', {
        id: 'msg-1',
      });

      expect(result).toEqual({ event: 'message:ack', data: message });
    });
  });
});
