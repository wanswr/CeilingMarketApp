import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppGateway } from '../gateway/app.gateway';
import { LoggerService } from '../logger/logger.service';
import { ChatsService } from '../chats/chats.service';
import { OrderStatus } from '@prisma/client';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('OrdersService - Categories & Filters', () => {
  let service: OrdersService;
  let prisma: PrismaService;

  const mockPrismaService: any = {
    category: {
      findUnique: jest.fn(),
    },
    order: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
    application: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(async (cb) => cb(mockPrismaService)),
  };

  const mockAppGateway = {
    broadcast: jest.fn(),
  };

  const mockLoggerService = {
    setService: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockChatsService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
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
        {
          provide: ChatsService,
          useValue: mockChatsService,
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should use explicit categoryId if provided', async () => {
      const dto = { title: 'New Order', categoryId: 'cat-777' };
      const userId = 'user-1';
      const mockCreatedOrder = { id: 'order-123', title: 'New Order', categoryId: 'cat-777', employerId: userId };

      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, role: 'EMPLOYER' });
      mockPrismaService.order.create.mockResolvedValue(mockCreatedOrder);

      const result = await service.create(dto, userId);

      expect(mockPrismaService.order.create).toHaveBeenCalledWith({
        data: {
          title: 'New Order',
          categoryId: 'cat-777',
          employerId: userId,
          status: OrderStatus.PUBLISHED,
        },
      });
      expect(result).toEqual(mockCreatedOrder);
    });

    it('should throw ForbiddenException if user is soft-deleted during create', async () => {
      const dto = { title: 'New Order' };
      const userId = 'user-deleted';
      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, deletedAt: new Date() });

      await expect(service.create(dto, userId)).rejects.toThrow(ForbiddenException);
    });

    it('should fall back to "ceiling" category if no categoryId is provided', async () => {
      const dto = { title: 'New Order' };
      const userId = 'user-1';
      const mockCeilingCategory = { id: 'ceiling-id', slug: 'ceiling' };
      const mockCreatedOrder = { id: 'order-123', title: 'New Order', categoryId: 'ceiling-id', employerId: userId };

      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, role: 'EMPLOYER' });
      mockPrismaService.category.findUnique.mockResolvedValue(mockCeilingCategory);
      mockPrismaService.order.create.mockResolvedValue(mockCreatedOrder);

      const result = await service.create(dto, userId);

      expect(mockPrismaService.category.findUnique).toHaveBeenCalledWith({
        where: { slug: 'ceiling' },
      });
      expect(mockPrismaService.order.create).toHaveBeenCalledWith({
        data: {
          title: 'New Order',
          categoryId: 'ceiling-id',
          employerId: userId,
          status: OrderStatus.PUBLISHED,
        },
      });
      expect(result).toEqual(mockCreatedOrder);
    });
  });

  describe('findAll', () => {
    it('should filter by categoryId if passed', async () => {
      const params = { categoryId: 'cat-123' };
      mockPrismaService.order.findMany.mockResolvedValue([]);

      await service.findAll(params);

      expect(mockPrismaService.order.findMany).toHaveBeenCalledWith({
        where: { categoryId: 'cat-123' },
        take: 200,
        include: {
          employer: { select: { id: true, name: true, rating: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should not filter by categoryId if omitted', async () => {
      const params = {};
      mockPrismaService.order.findMany.mockResolvedValue([]);

      await service.findAll(params);

      expect(mockPrismaService.order.findMany).toHaveBeenCalledWith({
        where: {},
        take: 200,
        include: {
          employer: { select: { id: true, name: true, rating: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findSpatial', () => {
    it('should filter by categoryId if passed', async () => {
      const params = { lat: 55.7, lng: 37.6, radius: 10, categoryId: 'cat-123' };
      mockPrismaService.order.findMany.mockResolvedValue([]);

      await service.findSpatial(params);

      expect(mockPrismaService.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          categoryId: 'cat-123',
        }),
      }));
    });

    it('should not filter by categoryId if omitted', async () => {
      const params = { lat: 55.7, lng: 37.6, radius: 10 };
      mockPrismaService.order.findMany.mockResolvedValue([]);

      await service.findSpatial(params);

      expect(mockPrismaService.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          categoryId: undefined,
        }),
      }));
    });

    it('should select applications count via _count and never select raw applications details', async () => {
      const params = { lat: 55.7, lng: 37.6, radius: 10 };
      mockPrismaService.order.findMany.mockResolvedValue([]);

      await service.findSpatial(params);

      expect(mockPrismaService.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
        select: expect.objectContaining({
          _count: { select: { applications: true } }
        }),
      }));
      expect(mockPrismaService.order.findMany).toHaveBeenCalledWith(expect.not.objectContaining({
        applications: expect.any(Object),
      }));
    });
  });

  describe('Idempotency & Parallel Race Elimination', () => {
    describe('acceptApplication race condition', () => {
      it('should throw ForbiddenException if executor is soft-deleted', async () => {
        const userId = 'employer-1';
        const applicationId = 'app-123';
        const app = {
          id: applicationId,
          orderId: 'order-123',
          executorId: 'executor-deleted',
          order: { id: 'order-123', employerId: userId, status: OrderStatus.PUBLISHED },
          executor: { id: 'executor-deleted', deletedAt: new Date() }
        };

        mockPrismaService.application.findUnique.mockResolvedValue(app);

        await expect(service.acceptApplication(applicationId, userId)).rejects.toThrow(ForbiddenException);
      });

      it('should throw ConflictException if the order has already been updated to CLAIMED status', async () => {
        const userId = 'employer-1';
        const applicationId = 'app-123';
        const app = {
          id: applicationId,
          orderId: 'order-123',
          executorId: 'executor-1',
          order: { id: 'order-123', employerId: userId, status: OrderStatus.PUBLISHED },
          executor: { id: 'executor-1', deletedAt: null }
        };

        mockPrismaService.application.findUnique.mockResolvedValue(app);
        mockPrismaService.order.updateMany.mockResolvedValue({ count: 0 }); // Represents order already claimed by someone else

        await expect(service.acceptApplication(applicationId, userId)).rejects.toThrow(ConflictException);
        expect(mockPrismaService.order.updateMany).toHaveBeenCalledWith({
          where: {
            id: 'order-123',
            status: { in: [OrderStatus.PUBLISHED, OrderStatus.HAS_RESPONSES] }
          },
          data: {
            status: OrderStatus.CLAIMED,
            executorId: 'executor-1',
            claimedAt: expect.any(Date)
          }
        });
      });
    });

    describe('create() idempotency key', () => {
      it('should return existing order on idempotencyKey hit', async () => {
        const dto = { title: 'New Order', categoryId: 'cat-123', idempotencyKey: 'idem-order-1' };
        const userId = 'user-1';
        const existingOrder = { id: 'order-123', title: 'New Order', categoryId: 'cat-123', idempotencyKey: 'idem-order-1' };

        mockPrismaService.order.findUnique.mockResolvedValue(existingOrder);

        const result = await service.create(dto, userId);

        expect(mockPrismaService.order.findUnique).toHaveBeenCalledWith({
          where: { idempotencyKey: 'idem-order-1' }
        });
        expect(result).toEqual(existingOrder);
        expect(mockPrismaService.order.create).not.toHaveBeenCalled();
      });

      it('should return existing order if P2002 conflict occurs during race condition', async () => {
        const dto = { title: 'New Order', categoryId: 'cat-123', idempotencyKey: 'idem-order-2' };
        const userId = 'user-1';
        const existingOrder = { id: 'order-123', title: 'New Order', categoryId: 'cat-123', idempotencyKey: 'idem-order-2' };

        mockPrismaService.order.findUnique
          .mockResolvedValueOnce(null) // First check: no existing order
          .mockResolvedValueOnce(existingOrder); // After catch: returns duplicate

        const dbError = new Error('Unique constraint failed') as any;
        dbError.code = 'P2002';
        mockPrismaService.order.create.mockRejectedValue(dbError);

        const result = await service.create(dto, userId);

        expect(result).toEqual(existingOrder);
      });
    });

    describe('apply() idempotency key', () => {
      it('should throw ForbiddenException if executor is soft-deleted during apply', async () => {
        const orderId = 'order-123';
        const executorId = 'executor-deleted';
        mockPrismaService.order.findUnique.mockResolvedValue({ id: orderId, status: OrderStatus.PUBLISHED });
        mockPrismaService.user.findUnique.mockResolvedValue({ id: executorId, role: 'WORKER', deletedAt: new Date() });

        await expect(service.apply(orderId, executorId, 500)).rejects.toThrow(ForbiddenException);
      });

      it('should return existing application on idempotencyKey hit', async () => {
        const orderId = 'order-123';
        const executorId = 'executor-1';
        const idempotencyKey = 'idem-app-1';
        const existingApp = { id: 'app-999', orderId, executorId, idempotencyKey };
        const order = { id: orderId, status: OrderStatus.PUBLISHED };
        const user = { id: executorId, role: 'WORKER' };

        mockPrismaService.order.findUnique.mockResolvedValue(order);
        mockPrismaService.user.findUnique.mockResolvedValue(user);
        mockPrismaService.application.findUnique.mockResolvedValue(existingApp);

        const result = await service.apply(orderId, executorId, 500, idempotencyKey);

        expect(mockPrismaService.application.findUnique).toHaveBeenCalledWith({
          where: { idempotencyKey }
        });
        expect(result).toEqual({ app: existingApp, order });
        expect(mockPrismaService.application.create).not.toHaveBeenCalled();
      });
    });
  });
});
