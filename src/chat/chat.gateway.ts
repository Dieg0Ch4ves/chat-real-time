import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { UsePipes, ValidationPipe, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { RedisService } from '../redis/redis.service';
import { ChatService } from './chat.service';
import { JoinRoomDto, SendMessageDto } from './dto/chat.dto';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly auth: AuthService,
    private readonly redis: RedisService,
    private readonly chat: ChatService,
  ) {}

  async handleConnection(client: Socket) {
    const token =
      client.handshake.auth?.token ?? client.handshake.query?.token;

    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const user = await this.auth.verifyToken(token);
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

  async handleDisconnect(client: Socket) {
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
  @UsePipes(new ValidationPipe({ transform: true }))
  async onJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: JoinRoomDto,
  ) {
    const user = client.data.user;
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
  @UsePipes(new ValidationPipe({ transform: true }))
  async onSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendMessageDto,
  ) {
    const user = client.data.user;
    const message = await this.chat.sendMessage(dto, user.userId);

    // O adapter Redis (pub/sub) propaga o emit para todas as instâncias
    this.server.to(dto.roomId).emit('message:new', message);

    // Avisa o próprio usuário em outras abas/dispositivos via sala user:<id>
    this.server.to(`user:${user.userId}`).emit('message:delivered', {
      id: message.id,
    });

    return { event: 'message:ack', data: message };
  }
}
