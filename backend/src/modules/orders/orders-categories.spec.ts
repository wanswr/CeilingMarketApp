import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AppGateway } from '../gateway/app.gateway';
import { LoggerService } from '../logger/logger.service';
import { ChatsService } from '../chats/chats.service';
import { OrderStatus } from '@prisma/client';

describe('OrdersService - Categories & Filters', () => {
  let service: OrdersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    category: {
      findUnique: jest.fn(),
    },
    order: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
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
});
