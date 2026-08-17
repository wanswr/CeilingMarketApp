import { Test, TestingModule } from '@nestjs/testing';
import { ChatsService } from './chats.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppGateway } from '../gateway/app.gateway';
import { LoggerService } from '../logger/logger.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

describe('ChatsService', () => {
  let service: ChatsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    chat: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      create: jest.fn(),
      groupBy: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockAppGateway = {
    server: {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    },
  };

  const mockLoggerService = {
    setService: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: AppGateway,
          useValue: mockAppGateway,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<ChatsService>(ChatsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrCreateChat - Security & IDOR Cases', () => {
    const mockOrderA = {
      id: 'order-A',
      employerId: 'employer-A',
      executorId: null,
      status: OrderStatus.PUBLISHED,
      applications: [
        { id: 'app-1', executorId: 'worker-A' }
      ]
    };

    const mockClosedOrder = {
      id: 'order-closed',
      employerId: 'employer-A',
      executorId: null,
      status: OrderStatus.CANCELLED,
      applications: []
    };

    const mockWorkerA = { id: 'worker-A', deletedAt: null };
    const mockWorkerB = { id: 'worker-B', deletedAt: null };

    it('Case 1: Employer A + Order A + Worker A (applicant) -> ALLOW', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue(mockOrderA);
      mockPrismaService.user.findUnique.mockResolvedValue(mockWorkerA);
      mockPrismaService.chat.upsert.mockResolvedValue({
        id: 'chat-A',
        orderId: 'order-A',
        employerId: 'employer-A',
        executorId: 'worker-A',
        messages: []
      });

      const chat = await service.getOrCreateChat('order-A', 'worker-A', 'employer-A');
      expect(chat.id).toBe('chat-A');
      expect(mockPrismaService.chat.upsert).toHaveBeenCalled();
    });

    it('Case 2: Employer A + Order A + Worker B (NOT associated with Order A) -> DENY', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue(mockOrderA);
      mockPrismaService.user.findUnique.mockResolvedValue(mockWorkerB);

      await expect(
        service.getOrCreateChat('order-A', 'worker-B', 'employer-A')
      ).rejects.toThrow(new ForbiddenException('Cannot start a chat with an executor who has not applied to this order'));
    });

    it('Case 3: Worker A + Order A + executorId = Worker B -> DENY (substitution attempt)', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue(mockOrderA);

      await expect(
        service.getOrCreateChat('order-A', 'worker-B', 'worker-A')
      ).rejects.toThrow(new ForbiddenException('You are not authorized to start this chat'));
    });

    it('Case 4: Worker A + Order Closed + executorId = Worker A (no relationship & not open) -> DENY', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue(mockClosedOrder);
      mockPrismaService.user.findUnique.mockResolvedValue(mockWorkerA);

      await expect(
        service.getOrCreateChat('order-closed', 'worker-A', 'worker-A')
      ).rejects.toThrow(new ForbiddenException('Cannot start a chat on an order that is not open'));
    });

    it('Case 5: Worker A + Foreign Order B -> DENY if no relationship and not open', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue(mockClosedOrder);
      mockPrismaService.user.findUnique.mockResolvedValue(mockWorkerA);

      await expect(
        service.getOrCreateChat('order-closed', 'worker-A', 'worker-A')
      ).rejects.toThrow(new ForbiddenException('Cannot start a chat on an order that is not open'));
    });

    it('Case 6: Non-participant user attempting to get messages for existing foreign chat -> DENY', async () => {
      const chat = { id: 'chat-foreign', employerId: 'employer-A', executorId: 'worker-A' };
      mockPrismaService.chat.findUnique.mockResolvedValue(chat);

      await expect(
        service.getMessages('chat-foreign', 'stranger-user')
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getMessages', () => {
    it('should paginate messages using descending cursor query and reverse to chronological order', async () => {
      const chatId = 'chat-1';
      const userId = 'user-employer';
      const chat = { id: chatId, employerId: userId, executorId: 'user-executor' };
      const mockMessages = [
        { id: 'msg-4', text: 'Message 4', createdAt: new Date('2023-01-04') },
        { id: 'msg-3', text: 'Message 3', createdAt: new Date('2023-01-03') },
        { id: 'msg-2', text: 'Message 2', createdAt: new Date('2023-01-02') },
        { id: 'msg-1', text: 'Message 1', createdAt: new Date('2023-01-01') },
      ];

      mockPrismaService.chat.findUnique.mockResolvedValue(chat);
      mockPrismaService.message.findMany.mockResolvedValue(mockMessages);

      const result = await service.getMessages(chatId, userId, undefined, 3);

      expect(mockPrismaService.chat.findUnique).toHaveBeenCalledWith({ where: { id: chatId } });
      expect(mockPrismaService.message.findMany).toHaveBeenCalledWith({
        where: { chatId },
        orderBy: { createdAt: 'desc' },
        take: 4,
        cursor: undefined,
        skip: undefined,
        include: { sender: { select: { id: true, name: true, avatar: true } } },
      });

      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].id).toBe('msg-2');
      expect(result.messages[2].id).toBe('msg-4');
      expect(result.nextCursor).toBe('msg-1');
    });

    it('should return null nextCursor if messages length does not exceed limit', async () => {
      const chatId = 'chat-1';
      const userId = 'user-employer';
      const chat = { id: chatId, employerId: userId, executorId: 'user-executor' };
      const mockMessages = [
        { id: 'msg-2', text: 'Message 2', createdAt: new Date('2023-01-02') },
        { id: 'msg-1', text: 'Message 1', createdAt: new Date('2023-01-01') },
      ];

      mockPrismaService.chat.findUnique.mockResolvedValue(chat);
      mockPrismaService.message.findMany.mockResolvedValue(mockMessages);

      const result = await service.getMessages(chatId, userId, undefined, 3);

      expect(result.messages).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('getMyChats', () => {
    it('should aggregate unread counts using a single groupBy call to prevent N+1 queries', async () => {
      const userId = 'user-1';
      const chats = [
        { id: 'chat-1', employerId: userId, executorId: 'user-2' },
        { id: 'chat-2', employerId: 'user-3', executorId: userId },
      ];
      const mockGroupedCounts = [
        { chatId: 'chat-1', _count: { _all: 3 } },
      ];

      mockPrismaService.chat.findMany.mockResolvedValue(chats);
      mockPrismaService.message.groupBy.mockResolvedValue(mockGroupedCounts);

      const result = await service.getMyChats(userId);

      expect(mockPrismaService.chat.findMany).toHaveBeenCalled();
      expect(mockPrismaService.message.groupBy).toHaveBeenCalledWith({
        by: ['chatId'],
        where: {
          chatId: { in: ['chat-1', 'chat-2'] },
          senderId: { not: userId },
          isRead: false,
        },
        _count: {
          _all: true,
        },
      });

      expect(result).toHaveLength(2);
      expect(result[0].unreadCount).toBe(3);
      expect(result[1].unreadCount).toBe(0);
    });
  });

  describe('sendMessage', () => {
    it('should touch update Chat.updatedAt and atomically create Message inside a transaction', async () => {
      const chatId = 'chat-1';
      const userId = 'user-1';
      const chat = { id: chatId, employerId: userId, executorId: 'user-2' };
      const message = { id: 'msg-1', chatId, senderId: userId, text: 'Hello' };

      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, deletedAt: null });
      mockPrismaService.chat.findUnique.mockResolvedValue(chat);
      mockPrismaService.message.create.mockReturnValue({ query: 'createMessage' });
      mockPrismaService.chat.update.mockReturnValue({ query: 'updateChat' });
      mockPrismaService.$transaction.mockResolvedValue([message, chat]);

      const result = await service.sendMessage(chatId, userId, 'Hello');

      expect(mockPrismaService.$transaction).toHaveBeenCalledWith([
        { query: 'createMessage' },
        { query: 'updateChat' }
      ]);
      expect(result).toEqual({ ...message, hasContacts: false });
    });

    it('should block sendMessage if sender is soft-deleted and throw ForbiddenException', async () => {
      const chatId = 'chat-1';
      const userId = 'user-1';
      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, deletedAt: new Date() });

      await expect(service.sendMessage(chatId, userId, 'Hello')).rejects.toThrow(
        new ForbiddenException('User account is deleted')
      );
    });
  });

  describe('detectContacts', () => {
    it('should return false for regular messages', () => {
      expect(service.detectContacts('Привет, как дела?')).toBe(false);
      expect(service.detectContacts('Работа по монтажу потолка.')).toBe(false);
    });

    it('should return true if message contains potential phone numbers', () => {
      expect(service.detectContacts('Мой номер 89123456789')).toBe(true);
      expect(service.detectContacts('Звони: +7 (912) 345-67-89')).toBe(true);
      expect(service.detectContacts('8 9 1 2 3 4 5 6 7 8 9')).toBe(true);
    });

    it('should return true if message contains social links or keywords', () => {
      expect(service.detectContacts('Пиши в телеграм')).toBe(true);
      expect(service.detectContacts('Напиши в ватсап wa.me/79123456789')).toBe(true);
      expect(service.detectContacts('Ссылка на вк vk.com/profile')).toBe(true);
      expect(service.detectContacts('Мой инстаграм instagram.com/ceiling')).toBe(true);
    });
  });
});
