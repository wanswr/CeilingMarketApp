import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppGateway } from '../gateway/app.gateway';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class ChatsService {
  constructor(
    private prisma: PrismaService,
    private gateway: AppGateway,
    private logger: LoggerService,
  ) {
    this.logger.setService('ChatsService');
  }

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
    this.logger.info('CHAT_CREATED', `Chat initialized for order ${orderId}`, { orderId, userId: employerId });
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

    this.gateway.server.to(`chat:${chatId}`).emit('message.new', message);

    const recipientId = chat.employerId === senderId ? chat.executorId : chat.employerId;
    this.gateway.server.to(`user:${recipientId}`).emit('chat.update', { chatId, lastMessage: message });

    return message;
  }

  async getMyChats(userId: string) {
    const chats = await this.prisma.chat.findMany({
      where: {
        OR: [
          { employerId: userId },
          { executorId: userId }
        ]
      },
      include: {
        order: { select: { id: true, title: true, status: true } },
        employer: { select: { id: true, name: true, avatar: true } },
        executor: { select: { id: true, name: true, avatar: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }
      },
      orderBy: { updatedAt: 'desc' }
    });

    const chatsWithUnread = await Promise.all(chats.map(async (chat) => {
        const unreadCount = await this.prisma.message.count({
            where: {
                chatId: chat.id,
                senderId: { not: userId },
                isRead: false
            }
        });
        return { ...chat, unreadCount };
    }));

    return chatsWithUnread;
  }

  async getMessages(chatId: string, userId: string) {
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) throw new NotFoundException();
    if (chat.employerId !== userId && chat.executorId !== userId) throw new ForbiddenException();

    return this.prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { id: true, name: true, avatar: true } } }
    });
  }

  async markAsRead(chatId: string, userId: string) {
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) throw new NotFoundException();
    if (chat.employerId !== userId && chat.executorId !== userId) throw new ForbiddenException();

    await this.prisma.message.updateMany({
        where: {
            chatId,
            senderId: { not: userId },
            isRead: false
        },
        data: { isRead: true }
    });

    const otherId = chat.employerId === userId ? chat.executorId : chat.employerId;
    this.gateway.server.to(`user:${otherId}`).emit('message.read', { chatId });

    return { success: true };
  }
}
