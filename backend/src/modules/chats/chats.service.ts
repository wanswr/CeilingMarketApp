import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppGateway } from '../gateway/app.gateway';

@Injectable()
export class ChatsService {
  constructor(
    private prisma: PrismaService,
    private gateway: AppGateway,
  ) {}

  async getOrCreateChat(orderId: string, executorId: string, employerId: string) {
    const chat = await this.prisma.chat.upsert({
      where: {
        orderId_executorId: { orderId, executorId }
      },
      update: {},
      create: {
        orderId,
        executorId,
        employerId,
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 50 },
        order: true,
        employer: { select: { id: true, name: true, avatar: true } },
        executor: { select: { id: true, name: true, avatar: true } },
      }
    });
    return chat;
  }

  async sendMessage(chatId: string, senderId: string, text: string) {
    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat) throw new NotFoundException('Chat not found');
    if (chat.employerId !== senderId && chat.executorId !== senderId) {
      throw new ForbiddenException('Not a member of this chat');
    }

    const message = await this.prisma.message.create({
      data: {
        chatId,
        senderId,
        text,
      },
      include: {
        sender: { select: { id: true, name: true, avatar: true } }
      }
    });

    // Notify participants via WebSocket
    this.gateway.server.to(`chat_${chatId}`).emit('message.new', message);

    // Also broadcast globally for notifications if needed
    // this.gateway.broadcast('notification.message', { chatId, message });

    return message;
  }

  async getMyChats(userId: string) {
    return this.prisma.chat.findMany({
      where: {
        OR: [
          { employerId: userId },
          { executorId: userId }
        ]
      },
      include: {
        order: { select: { title: true, status: true } },
        employer: { select: { name: true, avatar: true } },
        executor: { select: { name: true, avatar: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }
      },
      orderBy: { updatedAt: 'desc' }
    });
  }
}
