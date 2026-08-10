import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AuthenticatedSocket, AuthService } from '../auth/auth.service';
import { RedisService } from '../redis/redis.service';
import { ChatService } from './chat.service';
import { JoinRoomDto, SendMessageDto } from './dto/chat.dto';

type ChatSocket = Socket<any, any, any, { user?: AuthenticatedSocket }>;

@WebSocketGateway({
  cors: { origin: '*' },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly redis: RedisService,
    private readonly chat: ChatService,
  ) {}

  private extractToken(client: ChatSocket): string | undefined {
    const authToken: unknown = client.handshake.auth.token;
    if (typeof authToken === 'string') return authToken;

    const queryToken = client.handshake.query.token;
    return typeof queryToken === 'string' ? queryToken : undefined;
  }

  async handleConnection(client: ChatSocket) {
    const token = this.extractToken(client);

    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const user = this.auth.verifyToken(token);
      client.data.user = user;
      await client.join(`user:${user.userId}`);
      await this.redis.setOnline(user.userId);
      this.server.emit('presence:update', {
        userId: user.userId,
        online: true,
      });
      this.logger.log(`Conectado: ${user.email}`);
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: ChatSocket) {
    const user = client.data.user;
    if (!user) return;

    await this.redis.setOffline(user.userId);
    this.server.emit('presence:update', {
      userId: user.userId,
      online: false,
    });
    this.logger.log(`Desconectado: ${user.email}`);
  }

  @SubscribeMessage('room:join')
  async onJoinRoom(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() dto: JoinRoomDto,
  ) {
    const user = client.data.user!;
    await this.chat.joinRoom(dto.roomId, user.userId);
    await client.join(dto.roomId);

    const online = await this.redis.getOnlineUsers();
    const messages = await this.chat.listRoomMessages(dto.roomId);

    return {
      event: 'room:joined',
      data: { roomId: dto.roomId, online, messages },
    };
  }

  @SubscribeMessage('message:send')
  async onSendMessage(
    @ConnectedSocket() client: ChatSocket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const user = client.data.user!;
    const message = await this.chat.sendMessage(dto, user.userId);

    this.server.to(dto.roomId).emit('message:new', message);

    this.server.to(`user:${user.userId}`).emit('message:delivered', {
      id: message.id,
    });

    return { event: 'message:ack', data: message };
  }
}
