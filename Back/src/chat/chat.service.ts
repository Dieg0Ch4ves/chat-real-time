import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Room } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SendMessageDto } from './dto/chat.dto';

const messageWithSenderInclude = {
  sender: { select: { id: true, name: true, email: true } },
} satisfies Prisma.MessageInclude;

export type MessageSender = Prisma.UserGetPayload<{
  select: { id: true; name: true; email: true };
}>;

export type MessageWithSender = Prisma.MessageGetPayload<{
  include: typeof messageWithSenderInclude;
}>;

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async joinRoom(roomId: string, userId: string): Promise<Room> {
    const room: Room = await this.prisma.room.upsert({
      where: { id: roomId },
      update: {},
      create: { id: roomId, name: roomId, createdBy: userId },
    });

    const member: Room | null = await this.prisma.room.findFirst({
      where: {
        id: roomId,
        members: { some: { id: userId } },
      },
    });

    if (!member) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { rooms: { connect: { id: room.id } } },
      });
    }

    return room;
  }

  async sendMessage(
    dto: SendMessageDto,
    senderId: string,
  ): Promise<MessageWithSender> {
    const room: Room | null = await this.prisma.room.findUnique({
      where: { id: dto.roomId },
    });
    if (!room) {
      throw new NotFoundException('Sala não encontrada');
    }

    return this.prisma.message.create({
      data: {
        content: dto.content,
        roomId: dto.roomId,
        senderId,
      },
      include: messageWithSenderInclude,
    });
  }

  async listRoomMessages(
    roomId: string,
    take = 50,
  ): Promise<MessageWithSender[]> {
    return this.prisma.message.findMany({
      where: { roomId },
      orderBy: { createdAt: 'asc' },
      take,
      include: messageWithSenderInclude,
    });
  }
}
