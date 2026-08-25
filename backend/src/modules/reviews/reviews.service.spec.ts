import { Test, TestingModule } from '@nestjs/testing';
import { ReviewsService } from './reviews.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppGateway } from '../gateway/app.gateway';
import { LoggerService } from '../logger/logger.service';
import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';

describe('ReviewsService', () => {
  let service: ReviewsService;
  let mockPrisma: any;
  let mockGateway: any;
  let mockLogger: any;

  const mockEmployer = { id: 'emp-1', isBlocked: false, deletedAt: null };
  const mockExecutor = { id: 'exec-1', isBlocked: false, deletedAt: null };
  const mockOrder = {
    id: 'order-1',
    employerId: 'emp-1',
    executorId: 'exec-1',
    status: OrderStatus.COMPLETED,
    isFrozen: false,
    disputes: [],
    reviews: [],
  };

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      order: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      review: {
        create: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4.8 } }),
        findMany: jest.fn(),
      },
      orderStatusHistory: {
        create: jest.fn(),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn((cb) => cb(mockPrisma)),
    };

    mockGateway = {
      broadcast: jest.fn(),
    };

    mockLogger = {
      setService: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AppGateway, useValue: mockGateway },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<ReviewsService>(ReviewsService);
  });

  describe('create - Review Validation & State Transitions', () => {
    it('A: Valid employer review -> Review created, Order remains COMPLETED', async () => {
      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'emp-1') return Promise.resolve(mockEmployer);
        if (where.id === 'exec-1') return Promise.resolve(mockExecutor);
        return Promise.resolve(null);
      });
      mockPrisma.order.findUnique.mockResolvedValue(mockOrder);
      mockPrisma.review.create.mockResolvedValueOnce({ id: 'rev-1', rating: 5 });
      mockPrisma.review.findMany.mockResolvedValueOnce([
        { id: 'rev-1', authorId: 'emp-1', targetId: 'exec-1' },
      ]);

      const result = await service.create('emp-1', { orderId: 'order-1', rating: 5 });

      expect(result.id).toBe('rev-1');
      expect(mockPrisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('B: Valid executor review when employer review exists -> Order transitions to REVIEWED', async () => {
      mockPrisma.user.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === 'emp-1') return Promise.resolve(mockEmployer);
        if (where.id === 'exec-1') return Promise.resolve(mockExecutor);
        return Promise.resolve(null);
      });
      mockPrisma.order.findUnique.mockResolvedValue(mockOrder);
      mockPrisma.review.create.mockResolvedValueOnce({ id: 'rev-2', rating: 5 });
      mockPrisma.review.findMany.mockResolvedValueOnce([
        { id: 'rev-1', authorId: 'emp-1', targetId: 'exec-1' },
        { id: 'rev-2', authorId: 'exec-1', targetId: 'emp-1' },
      ]);
      mockPrisma.order.updateMany.mockResolvedValueOnce({ count: 1 });

      await service.create('exec-1', { orderId: 'order-1', rating: 5 });

      expect(mockPrisma.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'order-1', status: OrderStatus.COMPLETED },
        data: { status: OrderStatus.REVIEWED },
      });
      expect(mockPrisma.orderStatusHistory.create).toHaveBeenCalledWith({
        data: {
          orderId: 'order-1',
          oldStatus: OrderStatus.COMPLETED,
          newStatus: OrderStatus.REVIEWED,
          changedById: 'exec-1',
        },
      });
    });

    it('F/G: Blocked or deleted author -> 403 Forbidden', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'blocked-1', isBlocked: true, deletedAt: null });

      await expect(service.create('blocked-1', { orderId: 'order-1', rating: 5 })).rejects.toThrow(
        new ForbiddenException('Blocked or deleted user cannot leave reviews')
      );
    });

    it('H/I: Reviewing oneself -> 403 Forbidden', async () => {
      const selfOrder = { ...mockOrder, employerId: 'emp-1', executorId: 'emp-1' };
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'emp-1', isBlocked: false, deletedAt: null });
      mockPrisma.order.findUnique.mockResolvedValue(selfOrder);

      await expect(service.create('emp-1', { orderId: 'order-1', rating: 5 })).rejects.toThrow(
        ForbiddenException
      );
    });

    it('J/K: Non-participant user -> 403 Forbidden', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'stranger-1', isBlocked: false, deletedAt: null });
      mockPrisma.order.findUnique.mockResolvedValue(mockOrder);

      await expect(service.create('stranger-1', { orderId: 'order-1', rating: 5 })).rejects.toThrow(
        new ForbiddenException('Only order participants can leave a review')
      );
    });

    it('L/M/N: Order not COMPLETED or in DISPUTE -> ConflictException', async () => {
      const activeOrder = { ...mockOrder, status: OrderStatus.IN_PROGRESS };
      mockPrisma.user.findUnique.mockResolvedValue(mockEmployer);
      mockPrisma.order.findUnique.mockResolvedValue(activeOrder);

      await expect(service.create('emp-1', { orderId: 'order-1', rating: 5 })).rejects.toThrow(
        new ConflictException('Order must be completed to leave a review')
      );
    });

    it('D/E: Duplicate review attempt -> ConflictException (P2002 error handling)', async () => {
      const reviewedOrder = {
        ...mockOrder,
        reviews: [{ authorId: 'emp-1', targetId: 'exec-1' }],
      };
      mockPrisma.user.findUnique.mockResolvedValue(mockEmployer);
      mockPrisma.order.findUnique.mockResolvedValue(reviewedOrder);

      await expect(service.create('emp-1', { orderId: 'order-1', rating: 5 })).rejects.toThrow(
        new ConflictException('You have already left a review for this order')
      );
    });
  });
});
