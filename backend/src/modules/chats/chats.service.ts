import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
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

  async getOrCreateChat(orderId: string, executorId: string, userId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { applications: true }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // 1. Caller identity authorization check
    const isEmployer = order.employerId === userId;
    const isSelfExecutor = executorId === userId;

    if (!isEmployer && !isSelfExecutor) {
      throw new ForbiddenException('You are not authorized to start this chat');
    }

    // 2. Executor user validation check
    const executor = await db.user.findUnique({ where: { id: executorId } });
    if (!executor || executor.deletedAt) {
      throw new NotFoundException('Executor not found');
    }

    // 3. Relationship verification between executorId and orderId
    const isAssignedExecutor = order.executorId === executorId;
    const hasApplied = order.applications?.some(app => app.executorId === executorId);

    if (isEmployer && !isAssignedExecutor && !hasApplied) {
      throw new ForbiddenException('Cannot start a chat with an executor who has not applied to this order');
    }

    if (isSelfExecutor && !isAssignedExecutor && !hasApplied) {
      const openStatuses: OrderStatus[] = [OrderStatus.PUBLISHED, OrderStatus.HAS_RESPONSES];
      if (!openStatuses.includes(order.status)) {
        throw new ForbiddenException('Cannot start a chat on an order that is not open');
      }
    }

    const chat = await db.chat.upsert({
      where: {
        orderId_executorId: { orderId, executorId }
      },
      update: {},
      create: {
        orderId,
        executorId,
        employerId: order.employerId, // Always use the order's actual employer
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 50 },
        order: true,
        employer: { select: { id: true, name: true, avatar: true } },
        executor: { select: { id: true, name: true, avatar: true } },
      }
    });

    if (chat.employerId !== userId && chat.executorId !== userId) {
      chat.messages = [];
    }

    this.logger.info('CHAT_CREATED', `Chat initialized for order ${orderId}`, { orderId, userId });
    return chat;
  }

  private sanitizeText(text: string, maxLen = 4000): string {
    if (!text) return '';
    const trimmed = text.trim();
    return trimmed.length > maxLen ? trimmed.substring(0, maxLen) : trimmed;
  }

  detectContacts(text: string): boolean {
    if (!text) return false;

    // Normalize: lowercase and strip spaces, dashes, parentheses and pluses to detect hidden phone numbers
    const normalized = text.toLowerCase().replace(/[\s\-\(\)\+]/g, '');

    // Pattern for phone numbers (7 to 11 contiguous digits)
    const phoneRegex = /\d{7,11}/;
    if (phoneRegex.test(normalized)) return true;

    // Pattern for keywords / URLs / social platforms
    const contactKeywords = /(https?:\/\/[^\s]+|wa\.me|t\.me|instagram\.com|vk\.com|telegram|whatsapp|телеграм|ватсап|viber|вайбер|телефон|номер|связь)/i;
    if (contactKeywords.test(text)) return true;

    return false;
  }

  async sendMessage(chatId: string, senderId: string, text: string) {
    const sender = await this.prisma.user.findUnique({ where: { id: senderId } });
    if (!sender || sender.deletedAt) throw new ForbiddenException('User account is deleted');

    const chat = await this.prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat) throw new NotFoundException('Chat not found');
    if (chat.employerId !== senderId && chat.executorId !== senderId) {
      throw new ForbiddenException('Not a member of this chat');
    }

    const sanitizedText = this.sanitizeText(text, 4000);

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          chatId,
          senderId,
          text: sanitizedText,
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

    const hasContacts = this.detectContacts(sanitizedText);
    const messageWithContacts = { ...message, hasContacts };

    this.gateway.server.to(`chat:${chatId}`).emit('message.new', {
        event: 'message.new',
        eventId: randomUUID(),
        data: messageWithContacts
    });

    const recipientId = chat.employerId === senderId ? chat.executorId : chat.employerId;
    this.gateway.server.to(`user:${recipientId}`).emit('chat.update', {
        event: 'chat.update',
        eventId: randomUUID(),
        data: { chatId, lastMessage: messageWithContacts }
    });

    return messageWithContacts;
  }

  async getMyChats(userId: string, params?: { skip?: number; take?: number }) {
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
      orderBy: { updatedAt: 'desc' },
      skip: params?.skip,
      take: params?.take ?? 30
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

    const takeLimit = Math.min(limit !== undefined ? Number(limit) : 50, 100);

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
    const mappedMessages = reversedMessages.map(msg => ({
      ...msg,
      hasContacts: this.detectContacts(msg.text)
    }));

    return {
      messages: mappedMessages,
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
