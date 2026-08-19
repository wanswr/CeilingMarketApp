import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppGateway } from '../gateway/app.gateway';
import { LoggerService } from '../logger/logger.service';
import { ChatsService } from '../chats/chats.service';
import { OrderParserService } from './order-parser.service';
import { OrderSpatialService } from './order-spatial.service';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

describe('OrdersService - apply category-bound subscription checks', () => {
  let service: OrdersService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    application: {
      findUnique: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
    $executeRaw: jest.fn(),
  };

  const mockGateway = { broadcast: jest.fn() };
  const mockLogger = { setService: jest.fn(), info: jest.fn(), error: jest.fn() };
  const mockChats = {};
  const mockParser = {};
  const mockSpatial = {};

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((cb) => cb(mockPrismaService));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AppGateway, useValue: mockGateway },
        { provide: LoggerService, useValue: mockLogger },
        { provide: ChatsService, useValue: mockChats },
        { provide: OrderParserService, useValue: mockParser },
        { provide: OrderSpatialService, useValue: mockSpatial },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should allow apply if worker has active subscription on order category', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'worker-1',
      role: Role.WORKER,
      roles: [Role.WORKER],
      freeCategoryUsed: true,
      deletedAt: null,
    });
    mockPrismaService.order.findUnique.mockImplementation(async ({ where }) => ({
      id: where.id,
      categoryId: 'cat-A',
      status: 'PUBLISHED',
    }));
    mockPrismaService.order.update.mockResolvedValue({
      id: 'order-1',
      categoryId: 'cat-A',
      status: 'HAS_RESPONSES',
    });
    mockPrismaService.subscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      userId: 'worker-1',
      categoryId: 'cat-A',
      isActive: true,
      activeUntil: new Date(Date.now() + 86400000),
    });
    mockPrismaService.application.findUnique.mockResolvedValue(null);
    mockPrismaService.application.count.mockResolvedValue(0);
    mockPrismaService.application.create.mockResolvedValue({ id: 'app-1' });

    const result = await service.apply('order-1', 'worker-1');
    expect((result as any).id || (result as any).app?.id).toBe('app-1');
    expect(mockPrismaService.subscription.findUnique).toHaveBeenCalledWith({
      where: { userId_categoryId: { userId: 'worker-1', categoryId: 'cat-A' } },
    });
  });

  it('should auto-grant first free category when worker has no prior subscription and freeCategoryUsed is false', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'worker-2',
      role: Role.WORKER,
      roles: [Role.WORKER],
      freeCategoryUsed: false,
      deletedAt: null,
    });
    mockPrismaService.order.findUnique.mockImplementation(async ({ where }) => ({
      id: where.id,
      categoryId: 'cat-A',
      status: 'PUBLISHED',
    }));
    mockPrismaService.order.update.mockResolvedValue({
      id: 'order-1',
      categoryId: 'cat-A',
      status: 'HAS_RESPONSES',
    });
    mockPrismaService.subscription.findUnique.mockResolvedValue(null);
    mockPrismaService.application.findUnique.mockResolvedValue(null);
    mockPrismaService.application.count.mockResolvedValue(0);
    mockPrismaService.application.create.mockResolvedValue({ id: 'app-2' });

    const result = await service.apply('order-1', 'worker-2');

    expect((result as any).id || (result as any).app?.id).toBe('app-2');
    expect(mockPrismaService.user.update).toHaveBeenCalledWith({
      where: { id: 'worker-2' },
      data: { freeCategoryUsed: true },
    });
  });

  it('should deny apply if worker has subscription on Category A but order is in Category B and free category used', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'worker-3',
      role: Role.WORKER,
      roles: [Role.WORKER],
      freeCategoryUsed: true,
      deletedAt: null,
    });
    mockPrismaService.order.findUnique.mockImplementation(async ({ where }) => ({
      id: where.id,
      categoryId: 'cat-B',
      status: 'PUBLISHED',
    }));
    mockPrismaService.subscription.findUnique.mockResolvedValue(null);

    await expect(service.apply('order-2', 'worker-3')).rejects.toThrow(
      new ForbiddenException('Требуется активная подписка на категорию заказа для отклика')
    );
  });
});
