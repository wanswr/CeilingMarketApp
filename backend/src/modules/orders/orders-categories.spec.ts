import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppGateway } from '../gateway/app.gateway';
import { LoggerService } from '../logger/logger.service';
import { ChatsService } from '../chats/chats.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderParserService } from './order-parser.service';
import { OrderSpatialService } from './order-spatial.service';
import { OrderStatus } from '@prisma/client';
import { ConflictException, ForbiddenException } from '@nestjs/common';

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
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    application: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    subscription: {
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
  const mockNotificationsService = { create: jest.fn().mockResolvedValue({}) };
  const mockOrderParserService = {};
  const mockOrderSpatialService = { findSpatial: jest.fn() };

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
        {
          provide: NotificationsService,
          useValue: mockNotificationsService,
        },
        {
          provide: OrderParserService,
          useValue: mockOrderParserService,
        },
        {
          provide: OrderSpatialService,
          useValue: mockOrderSpatialService,
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

    it('should fall back to "ceilings" category if no categoryId is provided', async () => {
      const dto = { title: 'New Order' };
      const userId = 'user-1';
      const mockCeilingCategory = { id: 'ceiling-id', slug: 'ceilings' };
      const mockCreatedOrder = { id: 'order-123', title: 'New Order', categoryId: 'ceiling-id', employerId: userId };

      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, role: 'EMPLOYER' });
      mockPrismaService.category.findUnique.mockResolvedValue(mockCeilingCategory);
      mockPrismaService.order.create.mockResolvedValue(mockCreatedOrder);

      const result = await service.create(dto, userId);

      expect(mockPrismaService.category.findUnique).toHaveBeenCalledWith({
        where: { slug: 'ceilings' },
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

  describe('update', () => {
    it('should successfully update order details when requested by the employer', async () => {
      const orderId = 'order-123';
      const userId = 'employer-1';
      const existingOrder = { id: orderId, employerId: userId, status: OrderStatus.PUBLISHED };
      const updateDto = { title: 'Updated Title', price: 12000 };
      const updatedOrder = { ...existingOrder, ...updateDto };

      mockPrismaService.order.findUnique.mockResolvedValue(existingOrder);
      mockPrismaService.order.update.mockResolvedValue(updatedOrder);

      const result = await service.update(orderId, updateDto, userId);

      expect(mockPrismaService.order.update).toHaveBeenCalledWith({
        where: { id: orderId },
        data: { title: 'Updated Title', price: 12000 }
      });
      expect(result).toEqual(updatedOrder);
    });

    it('should throw ForbiddenException if user is not the employer', async () => {
      const orderId = 'order-123';
      const userId = 'other-user';
      const existingOrder = { id: orderId, employerId: 'employer-1', status: OrderStatus.PUBLISHED };
      const updateDto = { title: 'Updated Title' };

      mockPrismaService.order.findUnique.mockResolvedValue(existingOrder);

      await expect(service.update(orderId, updateDto, userId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findSpatial', () => {
    it('should filter by categoryId if passed', async () => {
      const params = { lat: 55.7, lng: 37.6, radius: 10, categoryId: 'cat-123' };
      mockOrderSpatialService.findSpatial.mockResolvedValue([]);

      await service.findSpatial(params);

      expect(mockOrderSpatialService.findSpatial).toHaveBeenCalledWith(params);
    });
  });

  describe('Idempotency & Parallel Race Elimination', () => {
    describe('acceptApplication race condition', () => {
      it('should throw ConflictException if the order has already been updated to CLAIMED status', async () => {
        const userId = 'employer-1';
        const applicationId = 'app-123';
        const app = {
          id: applicationId,
          orderId: 'order-123',
          executorId: 'executor-1',
          order: { id: 'order-123', employerId: userId, status: OrderStatus.PUBLISHED }
        };

        mockPrismaService.application.findUnique.mockResolvedValue(app);
        mockPrismaService.order.updateMany.mockResolvedValue({ count: 0 });

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
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(existingOrder);

        const dbError = new Error('Unique constraint failed') as any;
        dbError.code = 'P2002';
        mockPrismaService.order.create.mockRejectedValue(dbError);

        const result = await service.create(dto, userId);

        expect(result).toEqual(existingOrder);
      });
    });

    describe('apply() idempotency key', () => {
      it('should return existing application on idempotencyKey hit', async () => {
        const orderId = 'order-123';
        const executorId = 'executor-1';
        const idempotencyKey = 'idem-app-1';
        const existingApp = { id: 'app-999', orderId, executorId, idempotencyKey };
        const order = { id: orderId, status: OrderStatus.PUBLISHED };
        const user = { id: executorId, role: 'WORKER' };

        mockPrismaService.order.findUnique.mockResolvedValue(order);
        mockPrismaService.user.findUnique.mockResolvedValue(user);
        mockPrismaService.subscription.findUnique.mockResolvedValue({ isActive: true, activeUntil: new Date(Date.now() + 1000 * 3600) });
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

  describe('Soft-deleted user blocking in Orders', () => {
    it('should block create() if employer is soft-deleted', async () => {
      const userId = 'employer-1';
      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, deletedAt: new Date() });
      await expect(service.create({ title: 'My order' }, userId)).rejects.toThrow(ForbiddenException);
    });

    it('should block apply() if worker is soft-deleted', async () => {
      const orderId = 'order-123';
      const executorId = 'executor-1';
      mockPrismaService.order.findUnique.mockResolvedValue({ id: orderId, status: OrderStatus.PUBLISHED });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: executorId, role: 'WORKER', deletedAt: new Date() });
      await expect(service.apply(orderId, executorId)).rejects.toThrow(ForbiddenException);
    });

    it('should block acceptApplication() if applicant is soft-deleted', async () => {
      const userId = 'employer-1';
      const applicationId = 'app-123';
      const app = {
        id: applicationId,
        orderId: 'order-123',
        executorId: 'executor-1',
        order: { id: 'order-123', employerId: userId, status: OrderStatus.PUBLISHED },
        executor: { id: 'executor-1', deletedAt: new Date() }
      };

      mockPrismaService.application.findUnique.mockResolvedValue(app);
      await expect(service.acceptApplication(applicationId, userId)).rejects.toThrow(ConflictException);
    });
  });
});
