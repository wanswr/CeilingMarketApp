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

    it('should block application with ConflictException if worker has another order on the same date', async () => {
      const targetDate = new Date('2026-06-25T12:00:00Z');
      mockPrismaService.order.findUnique.mockResolvedValue({ id: 'order-1', status: OrderStatus.PUBLISHED, date: targetDate });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'worker-1', role: 'WORKER' });
      mockPrismaService.application.findUnique.mockResolvedValue(null);
      mockPrismaService.order.findFirst.mockResolvedValue({ id: 'busy-order', status: OrderStatus.CLAIMED });

      await expect(
        service.apply('order-1', 'worker-1')
      ).rejects.toThrow(ConflictException);
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

  describe('openDispute', () => {
    it('should allow dispute to be opened by employer on a CLAIMED order', async () => {
      const order = { id: 'order-1', employerId: 'employer-1', executorId: 'worker-1', status: OrderStatus.CLAIMED, details: 'original details' };
      mockPrismaService.order.findUnique.mockResolvedValue(order);
      mockPrismaService.order.update.mockResolvedValue({ ...order, status: OrderStatus.DISPUTE });

      const result = await service.openDispute('order-1', 'employer-1', 'Some dispute reason');
      expect(result.status).toBe(OrderStatus.DISPUTE);
    });

    it('should allow dispute to be opened by executor on an IN_PROGRESS order', async () => {
      const order = { id: 'order-1', employerId: 'employer-1', executorId: 'worker-1', status: OrderStatus.IN_PROGRESS, details: 'original details' };
      mockPrismaService.order.findUnique.mockResolvedValue(order);
      mockPrismaService.order.update.mockResolvedValue({ ...order, status: OrderStatus.DISPUTE });

      const result = await service.openDispute('order-1', 'worker-1', 'Some dispute reason');
      expect(result.status).toBe(OrderStatus.DISPUTE);
    });

    it('should throw ForbiddenException if dispute is opened by a non-participant', async () => {
      const order = { id: 'order-1', employerId: 'employer-1', executorId: 'worker-1', status: OrderStatus.CLAIMED };
      mockPrismaService.order.findUnique.mockResolvedValue(order);

      await expect(
        service.openDispute('order-1', 'outsider-1', 'Some reason')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ConflictException if trying to dispute an already cancelled order', async () => {
      const order = { id: 'order-1', employerId: 'employer-1', executorId: 'worker-1', status: OrderStatus.CANCELLED };
      mockPrismaService.order.findUnique.mockResolvedValue(order);

      await expect(
        service.openDispute('order-1', 'employer-1', 'Some reason')
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findStuckOrders', () => {
    it('should search database for stuck orders using a threshold', async () => {
      mockPrismaService.order.findMany = jest.fn().mockResolvedValue([{ id: 'order-1', status: OrderStatus.CLAIMED }]);
      const result = await service.findStuckOrders(24);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('order-1');
    });
  });
});
