import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendMessageDto } from './dto/chat.dto';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async joinRoom(roomId: string, userId: string) {
    const room = await this.prisma.room.upsert({
      where: { id: roomId },
      update: {},
      create: { id: roomId, name: roomId, createdBy: userId },
    });

    const member = await this.prisma.room.findFirst({
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

  async sendMessage(dto: SendMessageDto, senderId: string) {
    const room = await this.prisma.room.findUnique({
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
      include: { sender: { select: { id: true, name: true, email: true } } },
    });
  }

  async listRoomMessages(roomId: string, take = 50) {
    return this.prisma.message.findMany({
      where: { roomId },
      orderBy: { createdAt: 'asc' },
      take,
      include: { sender: { select: { id: true, name: true, email: true } } },
    });
  }
}
