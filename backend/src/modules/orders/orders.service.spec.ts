import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppGateway } from '../gateway/app.gateway';
import { LoggerService } from '../logger/logger.service';
import { ChatsService } from '../chats/chats.service';
import { OrderParserService } from './order-parser.service';
import { OrderSpatialService } from './order-spatial.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('OrdersService - State Machine & Access Controls', () => {
  let service: OrdersService;

  const mockPrisma = {
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    chat: {
      findMany: jest.fn(),
    },
    orderStatusHistory: {
      create: jest.fn(),
    },
  };

  const mockGateway = {
    broadcast: jest.fn(),
  };

  const mockLogger = {
    setService: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  const mockChats = {
    getOrCreateChat: jest.fn(),
  };

  const mockParser = {};
  const mockSpatial = {};

  beforeEach(async () => {
    jest.clearAllMocks();

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

  const canTransition = (from: OrderStatus, to: OrderStatus): boolean => {
    return (OrdersService.prototype as any).canTransition(from, to);
  };

  describe('Object-Level Access Controls (BAC / IDOR Protection)', () => {
    const mockOrder = {
      id: 'order-100',
      employerId: 'employer-1',
      executorId: 'executor-1',
      status: OrderStatus.PUBLISHED,
      isFrozen: false,
    };

    it('should throw NotFoundException if findOne cannot find the order', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce(null);
      await expect(service.findOne('nonexistent-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if non-employer attempts to update order', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce(mockOrder);
      await expect(
        service.update('order-100', { title: 'New Title' }, 'stranger-user')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if non-employer attempts to remove order', async () => {
      mockPrisma.order.findUnique.mockResolvedValueOnce(mockOrder);
      await expect(
        service.remove('order-100', 'stranger-user')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if non-executor attempts startWork', async () => {
      const claimedOrder = { ...mockOrder, status: OrderStatus.CLAIMED };
      mockPrisma.order.findUnique.mockResolvedValueOnce(claimedOrder);

      await expect(
        service.startWork('order-100', 'employer-1')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if non-executor attempts completeWork', async () => {
      const inProgressOrder = { ...mockOrder, status: OrderStatus.IN_PROGRESS };
      mockPrisma.order.findUnique.mockResolvedValueOnce(inProgressOrder);

      await expect(
        service.completeWork('order-100', 'employer-1')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if frozen order is modified or removed', async () => {
      const frozenOrder = { ...mockOrder, isFrozen: true, status: OrderStatus.FROZEN };
      mockPrisma.order.findUnique.mockResolvedValue(frozenOrder);

      await expect(
        service.update('order-100', { title: 'New Title' }, 'employer-1')
      ).rejects.toThrow(ForbiddenException);

      await expect(
        service.remove('order-100', 'employer-1')
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Happy Path (Legal Forward Transitions)', () => {
    it('should allow PENDING -> PUBLISHED', () => {
      expect(canTransition(OrderStatus.PENDING, OrderStatus.PUBLISHED)).toBe(true);
    });

    it('should allow PUBLISHED -> HAS_RESPONSES', () => {
      expect(canTransition(OrderStatus.PUBLISHED, OrderStatus.HAS_RESPONSES)).toBe(true);
    });

    it('should allow HAS_RESPONSES -> CLAIMED', () => {
      expect(canTransition(OrderStatus.HAS_RESPONSES, OrderStatus.CLAIMED)).toBe(true);
    });

    it('should allow CLAIMED -> IN_PROGRESS', () => {
      expect(canTransition(OrderStatus.CLAIMED, OrderStatus.IN_PROGRESS)).toBe(true);
    });

    it('should allow IN_PROGRESS -> COMPLETED', () => {
      expect(canTransition(OrderStatus.IN_PROGRESS, OrderStatus.COMPLETED)).toBe(true);
    });

    it('should allow COMPLETED -> REVIEWED', () => {
      expect(canTransition(OrderStatus.COMPLETED, OrderStatus.REVIEWED)).toBe(true);
    });
  });

  describe('Terminal CANCELLED State Rules', () => {
    it('should never allow transitions from CANCELLED to any state', () => {
      const statuses = Object.values(OrderStatus);
      statuses.forEach((toStatus) => {
        expect(canTransition(OrderStatus.CANCELLED, toStatus)).toBe(false);
      });
    });
  });

  describe('Locked FROZEN State Rules', () => {
    it('should never allow standard user transitions from FROZEN to any state', () => {
      const statuses = Object.values(OrderStatus);
      statuses.forEach((toStatus) => {
        expect(canTransition(OrderStatus.FROZEN, toStatus)).toBe(false);
      });
    });
  });

  describe('Blocked Cancellations During Critical Stages', () => {
    it('should allow cancellation from PUBLISHED', () => {
      expect(canTransition(OrderStatus.PUBLISHED, OrderStatus.CANCELLED)).toBe(true);
    });

    it('should allow cancellation from HAS_RESPONSES', () => {
      expect(canTransition(OrderStatus.HAS_RESPONSES, OrderStatus.CANCELLED)).toBe(true);
    });

    it('should allow cancellation from CLAIMED', () => {
      expect(canTransition(OrderStatus.CLAIMED, OrderStatus.CANCELLED)).toBe(true);
    });

    it('should BLOCK cancellation from IN_PROGRESS', () => {
      expect(canTransition(OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED)).toBe(false);
    });

    it('should BLOCK cancellation from COMPLETED', () => {
      expect(canTransition(OrderStatus.COMPLETED, OrderStatus.CANCELLED)).toBe(false);
    });

    it('should BLOCK cancellation from REVIEWED', () => {
      expect(canTransition(OrderStatus.REVIEWED, OrderStatus.CANCELLED)).toBe(false);
    });

    it('should BLOCK cancellation from DISPUTE', () => {
      expect(canTransition(OrderStatus.DISPUTE, OrderStatus.CANCELLED)).toBe(false);
    });
  });

  describe('Blocked Moves from COMPLETED Status', () => {
    it('should BLOCK any transition from COMPLETED except to REVIEWED and DISPUTE', () => {
      const statuses = Object.values(OrderStatus).filter(s => s !== OrderStatus.REVIEWED && s !== OrderStatus.DISPUTE);
      statuses.forEach((toStatus) => {
        expect(canTransition(OrderStatus.COMPLETED, toStatus)).toBe(false);
      });
    });
  });

  describe('Forward Progression and Duplication Constraints', () => {
    it('should block self-transitions (e.g., PUBLISHED -> PUBLISHED)', () => {
      const statuses = Object.values(OrderStatus);
      statuses.forEach((status) => {
        expect(canTransition(status, status)).toBe(false);
      });
    });

    it('should block backward transitions (e.g., IN_PROGRESS -> CLAIMED)', () => {
      expect(canTransition(OrderStatus.IN_PROGRESS, OrderStatus.CLAIMED)).toBe(false);
      expect(canTransition(OrderStatus.CLAIMED, OrderStatus.PUBLISHED)).toBe(false);
      expect(canTransition(OrderStatus.COMPLETED, OrderStatus.IN_PROGRESS)).toBe(false);
    });

    it('should block priority-based arbitrary multi-step forward progression', () => {
      expect(canTransition(OrderStatus.PUBLISHED, OrderStatus.COMPLETED)).toBe(false);
    });
  });
});
