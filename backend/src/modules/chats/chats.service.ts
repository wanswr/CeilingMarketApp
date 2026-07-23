import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AppGateway } from '../gateway/app.gateway';
import { LoggerService } from '../logger/logger.service';
import { randomUUID } from 'crypto';

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
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { applications: true }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.employerId !== employerId) {
      throw new ForbiddenException('You are not the owner of this order');
    }

    const hasApplied = order.applications.some(app => app.executorId === executorId);
    if (!hasApplied) {
      throw new ConflictException('Executor has not applied to this order');
    }

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

    if (chat.employerId !== employerId && chat.executorId !== employerId) {
      chat.messages = [];
    }

    this.logger.info('CHAT_CREATED', `Chat initialized for order ${orderId}`, { orderId, userId: employerId });
    return chat;
  }

  async sendMessage(chatId: string, senderId: string, text: string) {
    const sender = await this.prisma.user.findUnique({ where: { id: senderId } });
    if (!sender || sender.deletedAt) {
      throw new ForbiddenException('Sender account is deleted or inactive');
    }

    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat) throw new NotFoundException('Chat not found');
    if (chat.employerId !== senderId && chat.executorId !== senderId) {
      throw new ForbiddenException('Not a member of this chat');
    }

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          chatId,
          senderId,
          text,
        },
        include: {
          sender: { select: { id: true, name: true, avatar: true } }
        }
      }),
      this.prisma.chat.update({
        where: { id: chatId },
        data: { updatedAt: new Date() }
      })
    ]);

    this.gateway.server.to(`chat:${chatId}`).emit('message.new', {
        event: 'message.new',
        eventId: randomUUID(),
        data: message
    });

    const recipientId = chat.employerId === senderId ? chat.executorId : chat.employerId;
    this.gateway.server.to(`user:${recipientId}`).emit('chat.update', {
        event: 'chat.update',
        eventId: randomUUID(),
        data: { chatId, lastMessage: message }
    });

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

    const unreadCounts = await this.prisma.message.groupBy({
      by: ['chatId'],
      where: {
        chatId: { in: chats.map(c => c.id) },
        senderId: { not: userId },
        isRead: false
      },
      _count: {
        _all: true
      }
    });

    const unreadMap = new Map<string, number>();
    unreadCounts.forEach(item => {
      unreadMap.set(item.chatId, item._count._all);
    });

    return chats.map(chat => ({
      ...chat,
      unreadCount: unreadMap.get(chat.id) || 0
    }));
  }

  async getMessages(chatId: string, userId: string, cursor?: string, limit?: number) {
    const chat = await this.prisma.chat.findUnique({ where: { id: chatId } });
    if (!chat) throw new NotFoundException('Chat not found');
    if (chat.employerId !== userId && chat.executorId !== userId) throw new ForbiddenException();

    const takeLimit = limit !== undefined ? limit : 50;

    const messages = await this.prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'desc' },
      take: takeLimit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor ? 1 : undefined,
      include: { sender: { select: { id: true, name: true, avatar: true } } }
    });

    let nextCursor: string | null = null;
    let slicedMessages = messages;

    if (messages.length > takeLimit) {
      nextCursor = messages[takeLimit].id;
      slicedMessages = messages.slice(0, takeLimit);
    }

    const reversedMessages = [...slicedMessages].reverse();

    return {
      messages: reversedMessages,
      nextCursor,
    };
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
    this.gateway.server.to(`user:${otherId}`).emit('message.read', {
        event: 'message.read',
        eventId: randomUUID(),
        data: { chatId }
    });

    return { success: true };
  }
}
