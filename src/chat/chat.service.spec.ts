import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ChatService } from './chat.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ChatService', () => {
  let service: ChatService;
  let prisma: {
    room: { upsert: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock };
    user: { update: jest.Mock };
    message: { create: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      room: { upsert: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn() },
      user: { update: jest.fn() },
      message: { create: jest.fn(), findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ChatService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ChatService);
  });

  describe('joinRoom', () => {
    it('cria a sala se ela não existir e vincula o usuário como membro', async () => {
      prisma.room.upsert.mockResolvedValue({ id: 'sala-1', name: 'sala-1' });
      prisma.room.findFirst.mockResolvedValue(null);

      const room = await service.joinRoom('sala-1', 'user-1');

      expect(prisma.room.upsert).toHaveBeenCalledWith({
        where: { id: 'sala-1' },
        update: {},
        create: { id: 'sala-1', name: 'sala-1', createdBy: 'user-1' },
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { rooms: { connect: { id: 'sala-1' } } },
      });
      expect(room).toEqual({ id: 'sala-1', name: 'sala-1' });
    });

    it('não vincula de novo quando o usuário já é membro', async () => {
      prisma.room.upsert.mockResolvedValue({ id: 'sala-1' });
      prisma.room.findFirst.mockResolvedValue({ id: 'sala-1' });

      await service.joinRoom('sala-1', 'user-1');

      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    const dto = { roomId: 'sala-1', content: 'olá' };

    it('persiste a mensagem incluindo os dados do remetente', async () => {
      prisma.room.findUnique.mockResolvedValue({ id: 'sala-1' });
      prisma.message.create.mockResolvedValue({ id: 'msg-1', content: 'olá' });

      const message = await service.sendMessage(dto, 'user-1');

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: { content: 'olá', roomId: 'sala-1', senderId: 'user-1' },
        include: { sender: { select: { id: true, name: true, email: true } } },
      });
      expect(message).toEqual({ id: 'msg-1', content: 'olá' });
    });

    it('lança NotFoundException quando a sala não existe', async () => {
      prisma.room.findUnique.mockResolvedValue(null);

      await expect(service.sendMessage(dto, 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });

  describe('listRoomMessages', () => {
    it('busca em ordem cronológica e limita a 50 por padrão', async () => {
      prisma.message.findMany.mockResolvedValue([]);

      await service.listRoomMessages('sala-1');

      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { roomId: 'sala-1' },
        orderBy: { createdAt: 'asc' },
        take: 50,
        include: { sender: { select: { id: true, name: true, email: true } } },
      });
    });

    it('respeita o limite informado', async () => {
      prisma.message.findMany.mockResolvedValue([]);

      await service.listRoomMessages('sala-1', 10);

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });
  });
});
