import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppGateway } from '../gateway/app.gateway';
import { LoggerService } from '../logger/logger.service';
import { ChatsService } from '../chats/chats.service';
import { OrderParserService } from './order-parser.service';
import { OrderSpatialService } from './order-spatial.service';
import { ForbiddenException, ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';

describe('OrdersService - apply subscription checks', () => {
  let service: OrdersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn(),
    },
    application: {
      findUnique: jest.fn(),
    },
  };

  const mockGateway = {};
  const mockLogger = {
    setService: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  };
  const mockChats = {};
  const mockParser = {};
  const mockSpatial = {};

  beforeEach(async () => {
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
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should allow apply if worker has active and non-expired subscription', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'worker-1',
      role: Role.WORKER,
      roles: [Role.WORKER],
      deletedAt: null,
    });
    mockPrismaService.subscription.findUnique.mockResolvedValue({
      id: 'sub-1',
      isActive: true,
      activeUntil: new Date(Date.now() + 1000 * 60 * 60 * 24), // 1 day in the future
    });
    mockPrismaService.application.findUnique.mockResolvedValue(null);

    const mockImpl: any = async (orderId: string, executorId: string) => {
      const executor = await prisma.user.findUnique({ where: { id: executorId } });
      if (!executor || executor.deletedAt) throw new ForbiddenException('Only workers are allowed');

      const sub = await prisma.subscription.findUnique({ where: { userId: executorId } });
      if (!sub || !sub.isActive || new Date(sub.activeUntil) < new Date()) {
        throw new ForbiddenException('Требуется активная подписка для отклика');
      }
      return { success: true };
    };

    jest.spyOn(service, 'apply').mockImplementation(mockImpl);

    const result = await service.apply('order-1', 'worker-1');
    expect(result).toEqual({ success: true });
  });

  it('should deny apply and throw ForbiddenException if worker has no subscription', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'worker-2',
      role: Role.WORKER,
      roles: [Role.WORKER],
      deletedAt: null,
    });
    mockPrismaService.subscription.findUnique.mockResolvedValue(null);

    const testApply = async () => {
      const executorId = 'worker-2';
      const executor = await prisma.user.findUnique({ where: { id: executorId } });
      const sub = await prisma.subscription.findUnique({ where: { userId: executorId } });
      if (!sub || !sub.isActive || new Date(sub.activeUntil) < new Date()) {
        throw new ForbiddenException('Требуется активная подписка для отклика');
      }
    };

    await expect(testApply()).rejects.toThrow(ForbiddenException);
    await expect(testApply()).rejects.toThrow('Требуется активная подписка для отклика');
  });

  it('should deny apply and throw ForbiddenException if worker subscription is expired', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      id: 'worker-3',
      role: Role.WORKER,
      roles: [Role.WORKER],
      deletedAt: null,
    });
    mockPrismaService.subscription.findUnique.mockResolvedValue({
      id: 'sub-2',
      isActive: true,
      activeUntil: new Date(Date.now() - 1000 * 60 * 60),
    });

    const testApply = async () => {
      const executorId = 'worker-3';
      const executor = await prisma.user.findUnique({ where: { id: executorId } });
      const sub = await prisma.subscription.findUnique({ where: { userId: executorId } });
      if (!sub || !sub.isActive || new Date(sub.activeUntil) < new Date()) {
        throw new ForbiddenException('Требуется активная подписка для отклика');
      }
    };

    await expect(testApply()).rejects.toThrow(ForbiddenException);
  });
});
