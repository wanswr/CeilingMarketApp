import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    order: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
    },
    message: {
      count: jest.fn(),
    },
    notification: {
      count: jest.fn(),
    },
    portfolioItem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockLoggerService = {
    setContext: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockSubscriptionService = {
    checkActiveSubscription: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: SubscriptionService, useValue: mockSubscriptionService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findPublicProfile', () => {
    it('should return public profile fields and strictly omit private PII/security fields', async () => {
      const userId = 'user-456';
      const user = {
        id: userId,
        name: 'John Doe',
        avatar: 'avatar.png',
        rating: 5,
        experience: 2,
        completedOrders: 10,
        ordersCount: 15,
        isVerified: true,
        portfolioItems: [],
        deletedAt: null,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);

      const result = await service.findPublicProfile(userId);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          avatar: true,
          rating: true,
          experience: true,
          completedOrders: true,
          ordersCount: true,
          isVerified: true,
          portfolioItems: true,
          deletedAt: true,
          activeCategory: { select: { id: true, slug: true, name: true } },
        },
      });

      expect(result.id).toBe(userId);
      expect(result.name).toBe('John Doe');

      // Assert private/PII fields are NOT present
      expect(result).not.toHaveProperty('phone');
      expect(result).not.toHaveProperty('sessionVersion');
      expect(result).not.toHaveProperty('pushToken');
      expect(result).not.toHaveProperty('deletedAt');
      expect(result).not.toHaveProperty('isBlocked');
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('hash');
      expect(result).not.toHaveProperty('instagram');
      expect(result).not.toHaveProperty('telegram');
    });

    it('should throw NotFoundException if user has deletedAt set', async () => {
      const userId = 'deleted-user-789';
      const user = {
        id: userId,
        deletedAt: new Date(),
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);

      await expect(service.findPublicProfile(userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteProfile', () => {
    it('should soft-delete user and anonymize PII when no active orders exist', async () => {
      const userId = 'user-123';
      const user = { id: userId, deletedAt: null };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.order.count.mockResolvedValue(0);
      mockPrismaService.user.update.mockResolvedValue({ success: true });

      const result = await service.deleteProfile(userId);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: expect.objectContaining({
          name: 'Удалённый пользователь',
          avatar: null,
          phone: `deleted_${userId}`,
          instagram: null,
          telegram: null,
          pushToken: null,
          isVerified: false,
          phoneVerified: false,
          deletedAt: expect.any(Date),
        }),
      });

      expect(result).toEqual({ success: true });
    });

    it('should throw ConflictException if user has active orders in progress', async () => {
      const userId = 'user-123';
      const user = { id: userId, deletedAt: null };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.order.count.mockResolvedValue(1);

      await expect(service.deleteProfile(userId)).rejects.toThrow(
        new ConflictException('Нельзя удалить аккаунт при наличии активных заказов в работе')
      );
    });
  });
});
