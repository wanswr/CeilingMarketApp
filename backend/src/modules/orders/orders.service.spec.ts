import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppGateway } from '../gateway/app.gateway';
import { LoggerService } from '../logger/logger.service';
import { ChatsService } from '../chats/chats.service';
import { OrderStatus } from '@prisma/client';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    order: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    application: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
  };

  const mockAppGateway = {
    broadcast: jest.fn(),
  };

  const mockLoggerService = {
    setService: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const mockChatsService = {
    getOrCreateChat: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AppGateway, useValue: mockAppGateway },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: ChatsService, useValue: mockChatsService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('canTransition', () => {
    it('should block transition to CANCELLED if order is in IN_PROGRESS state', () => {
      const order = { id: 'order-1', status: OrderStatus.IN_PROGRESS };
      mockPrismaService.order.findUnique.mockResolvedValue(order);

      expect(
        service.transitionStatus('order-1', OrderStatus.CANCELLED, 'user-1')
      ).rejects.toThrow(ConflictException);
    });

    it('should block transition to CANCELLED if order is in COMPLETED state', () => {
      const order = { id: 'order-1', status: OrderStatus.COMPLETED };
      mockPrismaService.order.findUnique.mockResolvedValue(order);

      expect(
        service.transitionStatus('order-1', OrderStatus.CANCELLED, 'user-1')
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('apply', () => {
    it('should throw ForbiddenException if user role is not WORKER', async () => {
      mockPrismaService.order.findUnique.mockResolvedValue({ id: 'order-1', status: OrderStatus.PUBLISHED, date: new Date() });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-1', role: 'EMPLOYER' });

      await expect(
        service.apply('order-1', 'user-1')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return a double-booking warning if worker has another order on the same date', async () => {
      const targetDate = new Date('2026-06-25T12:00:00Z');
      mockPrismaService.order.findUnique.mockResolvedValue({ id: 'order-1', status: OrderStatus.PUBLISHED, date: targetDate });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'worker-1', role: 'WORKER' });
      mockPrismaService.application.findUnique.mockResolvedValue(null);
      mockPrismaService.order.findFirst.mockResolvedValue({ id: 'busy-order', status: OrderStatus.CLAIMED });

      const mockApp = { id: 'app-1', executorId: 'worker-1' };
      const mockUpdatedOrder = { id: 'order-1', status: OrderStatus.HAS_RESPONSES };

      mockPrismaService.application.create.mockResolvedValue(mockApp);
      mockPrismaService.order.update.mockResolvedValue(mockUpdatedOrder);

      const result = await service.apply('order-1', 'worker-1');
      expect(result.warning).toBe('Вы уже взяли заказ на эту дату. Уверены, что хотите откликнуться?');
      expect(result.order).toBeDefined();
    });
  });

  describe('acceptApplication', () => {
    it('should throw ConflictException if order is already claimed', async () => {
      mockPrismaService.application.findUnique.mockResolvedValue({
        id: 'app-1',
        executorId: 'worker-1',
        order: { employerId: 'employer-1', status: OrderStatus.CLAIMED }
      });

      await expect(
        service.acceptApplication('app-1', 'employer-1')
      ).rejects.toThrow(ConflictException);
    });
  });
});
