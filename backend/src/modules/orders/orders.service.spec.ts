import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { OrderStatus } from '@prisma/client';
import { ORDER_STATE_MACHINE } from './order-state-machine';
import { PrismaService } from '../../prisma/prisma.service';
import { AppGateway } from '../gateway/app.gateway';
import { LoggerService } from '../logger/logger.service';
import { ChatsService } from '../chats/chats.service';
import { OrderParserService } from './order-parser.service';
import { OrderSpatialService } from './order-spatial.service';
import { ForbiddenException, ConflictException, NotFoundException } from '@nestjs/common';

describe('OrdersService - canTransition state machine', () => {
  describe('Happy Path (Legal Forward Transitions)', () => {
    it('should allow PENDING -> PUBLISHED', () => {
      expect(ORDER_STATE_MACHINE[OrderStatus.PENDING][OrderStatus.PUBLISHED]).toBeDefined();
    });

    it('should allow PUBLISHED -> HAS_RESPONSES', () => {
      expect(ORDER_STATE_MACHINE[OrderStatus.PUBLISHED][OrderStatus.HAS_RESPONSES]).toBeDefined();
    });

    it('should allow HAS_RESPONSES -> CLAIMED', () => {
      expect(ORDER_STATE_MACHINE[OrderStatus.HAS_RESPONSES][OrderStatus.CLAIMED]).toBeDefined();
    });

    it('should allow CLAIMED -> IN_PROGRESS', () => {
      expect(ORDER_STATE_MACHINE[OrderStatus.CLAIMED][OrderStatus.IN_PROGRESS]).toBeDefined();
    });

    it('should allow IN_PROGRESS -> COMPLETED', () => {
      expect(ORDER_STATE_MACHINE[OrderStatus.IN_PROGRESS][OrderStatus.COMPLETED]).toBeDefined();
    });

    it('should allow COMPLETED -> REVIEWED', () => {
      expect(ORDER_STATE_MACHINE[OrderStatus.COMPLETED][OrderStatus.REVIEWED]).toBeDefined();
    });
  });

  describe('Terminal CANCELLED State Rules', () => {
    it('should never allow transitions from CANCELLED to any state', () => {
      const cancelledTransitions = ORDER_STATE_MACHINE[OrderStatus.CANCELLED];
      expect(Object.keys(cancelledTransitions || {})).toHaveLength(0);
    });
  });

  describe('Blocked Cancellations During Critical Stages', () => {
    it('should allow cancellation from PUBLISHED', () => {
      expect(ORDER_STATE_MACHINE[OrderStatus.PUBLISHED][OrderStatus.CANCELLED]).toBeDefined();
    });

    it('should allow cancellation from HAS_RESPONSES', () => {
      expect(ORDER_STATE_MACHINE[OrderStatus.HAS_RESPONSES][OrderStatus.CANCELLED]).toBeDefined();
    });

    it('should allow cancellation from CLAIMED', () => {
      expect(ORDER_STATE_MACHINE[OrderStatus.CLAIMED][OrderStatus.CANCELLED]).toBeDefined();
    });

    it('should BLOCK cancellation from IN_PROGRESS', () => {
      expect(ORDER_STATE_MACHINE[OrderStatus.IN_PROGRESS][OrderStatus.CANCELLED]).toBeUndefined();
    });

    it('should BLOCK cancellation from COMPLETED', () => {
      expect(ORDER_STATE_MACHINE[OrderStatus.COMPLETED][OrderStatus.CANCELLED]).toBeUndefined();
    });

    it('should BLOCK cancellation from REVIEWED', () => {
      expect(ORDER_STATE_MACHINE[OrderStatus.REVIEWED][OrderStatus.CANCELLED]).toBeUndefined();
    });

    it('should BLOCK cancellation from DISPUTE', () => {
      expect(ORDER_STATE_MACHINE[OrderStatus.DISPUTE][OrderStatus.CANCELLED]).toBeUndefined();
    });
  });

  describe('Blocked Moves from COMPLETED Status', () => {
    it('should BLOCK any transition from COMPLETED except to REVIEWED and DISPUTE', () => {
      const allowedFromCompleted = Object.keys(ORDER_STATE_MACHINE[OrderStatus.COMPLETED]);
      expect(allowedFromCompleted.sort()).toEqual([OrderStatus.DISPUTE, OrderStatus.REVIEWED].sort());
    });
  });

  describe('Forward Progression and Duplication Constraints', () => {
    it('should block self-transitions (e.g., PUBLISHED -> PUBLISHED)', () => {
      expect(ORDER_STATE_MACHINE[OrderStatus.PUBLISHED][OrderStatus.PUBLISHED]).toBeUndefined();
    });

    it('should block backward transitions (e.g., IN_PROGRESS -> CLAIMED)', () => {
      expect(ORDER_STATE_MACHINE[OrderStatus.IN_PROGRESS][OrderStatus.CLAIMED]).toBeUndefined();
    });

    it('should block priority-based arbitrary multi-step forward progression', () => {
      expect(ORDER_STATE_MACHINE[OrderStatus.PUBLISHED][OrderStatus.COMPLETED]).toBeUndefined();
    });
  });
});

describe('OrdersService.remove Safe Removal (Soft Cancel, History Retention)', () => {
  let service: OrdersService;
  let mockPrisma: any;
  let mockGateway: any;
  let mockLogger: any;
  let mockChats: any;
  let mockParser: any;
  let mockSpatial: any;

  beforeEach(async () => {
    mockPrisma = {
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      chat: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      orderStatusHistory: {
        create: jest.fn(),
      },
      $transaction: jest.fn((cb) => cb(mockPrisma)),
    };

    mockGateway = {
      broadcast: jest.fn(),
    };

    mockLogger = {
      setService: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockChats = {};
    mockParser = {};
    mockSpatial = {};

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AppGateway, useValue: mockGateway },
        { provide: LoggerService, useValue: mockLogger },
        { provide: ChatsService, useValue: mockChats },
        { provide: OrderParserService, useValue: mockParser },
        { provide: OrderSpatialService, useValue: mockSpatial },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  it('should throw ForbiddenException if user is not the order employer', async () => {
    const mockOrder = { id: 'order-1', employerId: 'employer-A', status: OrderStatus.PUBLISHED };
    mockPrisma.order.findUnique.mockResolvedValueOnce(mockOrder);

    await expect(service.remove('order-1', 'stranger-user')).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.order.delete).not.toHaveBeenCalled();
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
  });

  it('should transition order to CANCELLED and log OrderStatusHistory without physical delete', async () => {
    const mockOrder = { id: 'order-1', employerId: 'employer-A', executorId: null, status: OrderStatus.PUBLISHED };
    const mockUpdatedOrder = { ...mockOrder, status: OrderStatus.CANCELLED };

    mockPrisma.order.findUnique
      .mockResolvedValueOnce(mockOrder) // first query in remove()
      .mockResolvedValueOnce(mockUpdatedOrder) // lightweight order query in broadcast("order.status.changed")
      .mockResolvedValueOnce(mockUpdatedOrder); // lightweight order query in broadcast("order.deleted")

    mockPrisma.order.update.mockResolvedValueOnce(mockUpdatedOrder);

    const result = await service.remove('order-1', 'employer-A');

    expect(result).toEqual({ id: 'order-1', status: OrderStatus.CANCELLED });
    expect(mockPrisma.order.delete).not.toHaveBeenCalled();
    expect(mockPrisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { status: OrderStatus.CANCELLED },
    });
    expect(mockPrisma.orderStatusHistory.create).toHaveBeenCalledWith({
      data: {
        orderId: 'order-1',
        oldStatus: OrderStatus.PUBLISHED,
        newStatus: OrderStatus.CANCELLED,
        changedById: 'employer-A',
      },
    });
    expect(mockGateway.broadcast).toHaveBeenCalledWith(
      'order.status.changed',
      expect.objectContaining({
        event: 'order.status.changed',
        userId: 'employer-A',
      })
    );
  });

  it('should block cancellation if order has an active dispute', async () => {
    const mockOrderWithDispute = {
      id: 'order-1',
      employerId: 'employer-A',
      status: OrderStatus.CLAIMED,
      disputes: [{ id: 'disp-1', status: 'OPEN' }],
    };
    mockPrisma.order.findUnique.mockResolvedValueOnce(mockOrderWithDispute);

    await expect(service.remove('order-1', 'employer-A')).rejects.toThrow(
      new ConflictException('Cannot cancel order with an active dispute')
    );
    expect(mockPrisma.order.delete).not.toHaveBeenCalled();
  });

  it('should block cancellation if order has a completed payment', async () => {
    const mockOrderWithPayment = {
      id: 'order-1',
      employerId: 'employer-A',
      status: OrderStatus.CLAIMED,
      payments: [{ id: 'pay-1', status: 'COMPLETED' }],
    };
    mockPrisma.order.findUnique.mockResolvedValueOnce(mockOrderWithPayment);

    await expect(service.remove('order-1', 'employer-A')).rejects.toThrow(
      new ConflictException('Cannot cancel order with completed payment obligation')
    );
    expect(mockPrisma.order.delete).not.toHaveBeenCalled();
  });

  it('should return safely without duplicating history if order is already CANCELLED', async () => {
    const mockCancelledOrder = {
      id: 'order-1',
      employerId: 'employer-A',
      status: OrderStatus.CANCELLED,
    };
    mockPrisma.order.findUnique.mockResolvedValueOnce(mockCancelledOrder);

    const result = await service.remove('order-1', 'employer-A');

    expect(result).toEqual({ id: 'order-1', status: OrderStatus.CANCELLED });
    expect(mockPrisma.order.delete).not.toHaveBeenCalled();
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
    expect(mockPrisma.orderStatusHistory.create).not.toHaveBeenCalled();
  });
});

describe('OrdersService.acceptApplication Response Contract', () => {
  it('should return { order, chat } response structure upon accepting an application', async () => {
    const mockOrder = {
      id: 'order-1',
      employerId: 'emp-1',
      status: OrderStatus.PUBLISHED,
      isFrozen: false,
    };
    const mockApp = {
      id: 'app-1',
      orderId: 'order-1',
      executorId: 'exec-1',
      order: mockOrder,
      executor: { id: 'exec-1', deletedAt: null },
    };
    const mockChat = {
      id: 'chat-1',
      orderId: 'order-1',
      employerId: 'emp-1',
      executorId: 'exec-1',
    };
    const mockUpdatedOrder = {
      ...mockOrder,
      status: OrderStatus.CLAIMED,
      executorId: 'exec-1',
      employer: { id: 'emp-1', name: 'Emp' },
      executor: { id: 'exec-1', name: 'Exec' },
    };

    const mockPrismaTx = {
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(mockUpdatedOrder),
      },
      orderStatusHistory: {
        create: jest.fn().mockResolvedValue({}),
      },
      application: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const mockPrismaService = {
      application: {
        findUnique: jest.fn().mockResolvedValue(mockApp),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(mockPrismaTx)),
      user: {
        findUnique: jest.fn().mockResolvedValue({ role: 'EMPLOYER' }),
      },
    };

    const mockChatsService = {
      getOrCreateChat: jest.fn().mockResolvedValue(mockChat),
    };

    const mockGateway = {
      broadcast: jest.fn(),
    };

    const mockLogger = {
      setService: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const service = new OrdersService(
      mockPrismaService as any,
      mockGateway as any,
      mockLogger as any,
      mockChatsService as any,
      {} as any,
      {} as any,
    );

    const result = await service.acceptApplication('app-1', 'emp-1');

    expect(result).toHaveProperty('order');
    expect(result).toHaveProperty('chat');
    expect(result.order.id).toBe('order-1');
    expect(result.order.status).toBe(OrderStatus.CLAIMED);
    expect(result.chat.id).toBe('chat-1');
  });
});
