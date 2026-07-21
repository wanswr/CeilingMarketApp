import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
    },
  };

  const mockSubscriptionService = {
    checkActiveSubscription: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: SubscriptionService,
          useValue: mockSubscriptionService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('update', () => {
    it('should successfully update name and avatar without changing role', async () => {
      const userId = 'user-1';
      const dto = { name: 'New Name', avatar: 'new-avatar.png' };
      const updatedUser = { id: userId, name: 'New Name', avatar: 'new-avatar.png', role: null };

      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.update(userId, dto);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { name: 'New Name', avatar: 'new-avatar.png' },
      });
      expect(result).toEqual(updatedUser);
    });

    it('should allow setting role if current role is null', async () => {
      const userId = 'user-2';
      const dto = { role: 'WORKER' };
      const currentUser = { id: userId, role: null };
      const updatedUser = { id: userId, role: 'WORKER' };

      mockPrismaService.user.findUnique.mockResolvedValue(currentUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.update(userId, dto);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { role: 'WORKER' },
      });
      expect(result).toEqual(updatedUser);
    });

    it('should reject changing role if role is already set', async () => {
      const userId = 'user-3';
      const dto = { role: 'EMPLOYER' };
      const currentUser = { id: userId, role: 'WORKER' };

      mockPrismaService.user.findUnique.mockResolvedValue(currentUser);

      await expect(service.update(userId, dto)).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteProfile', () => {
    it('should anonymize user fields and set deletedAt instead of physically deleting', async () => {
      const userId = 'user-123';
      const user = { id: userId, deletedAt: null };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.user.update.mockResolvedValue({ id: userId });

      const result = await service.deleteProfile(userId);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: {
          name: 'Удалённый пользователь',
          avatar: null,
          phone: `deleted_${userId}`,
          instagram: null,
          telegram: null,
          pushToken: null,
          isVerified: false,
          phoneVerified: false,
          deletedAt: expect.any(Date),
        },
      });
      expect(result).toEqual({ success: true });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      const userId = 'non-existent-user';
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.deleteProfile(userId)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if user is already deleted', async () => {
      const userId = 'deleted-user';
      const user = { id: userId, deletedAt: new Date() };

      mockPrismaService.user.findUnique.mockResolvedValue(user);

      await expect(service.deleteProfile(userId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findPublicProfile', () => {
    it('should return profile if user is not deleted', async () => {
      const userId = 'user-456';
      const user = {
        id: userId,
        name: 'John Doe',
        avatar: 'avatar.png',
        rating: 5,
        experience: 2,
        completedOrders: 10,
        ordersCount: 15,
        instagram: null,
        telegram: null,
        isVerified: true,
        portfolioItems: [],
        subscription: null,
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
          instagram: true,
          telegram: true,
          isVerified: true,
          portfolioItems: true,
          subscription: true,
          deletedAt: true,
          activeCategory: { select: { id: true, slug: true, name: true } },
        },
      });
      expect(result).toEqual({
        id: userId,
        name: 'John Doe',
        avatar: 'avatar.png',
        rating: 5,
        experience: 2,
        completedOrders: 10,
        ordersCount: 15,
        instagram: null,
        telegram: null,
        isVerified: true,
        portfolioItems: [],
        subscription: null,
      });
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

  describe('findOne', () => {
    it('should return categoryLocked: false if user does not have activeCategoryId', async () => {
      const userId = 'user-123';
      const user = { id: userId, activeCategoryId: null };

      mockPrismaService.user.findUnique.mockResolvedValue(user);

      const result = await service.findOne(userId);

      expect(result.categoryLocked).toBe(false);
      expect(mockSubscriptionService.checkActiveSubscription).not.toHaveBeenCalled();
    });

    it('should return categoryLocked: true if user has activeCategoryId AND active subscription', async () => {
      const userId = 'user-123';
      const user = { id: userId, activeCategoryId: 'cat-777' };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockSubscriptionService.checkActiveSubscription.mockResolvedValue(true);

      const result = await service.findOne(userId);

      expect(result.categoryLocked).toBe(true);
      expect(mockSubscriptionService.checkActiveSubscription).toHaveBeenCalledWith(userId);
    });

    it('should return categoryLocked: false if user has activeCategoryId but NO active subscription', async () => {
      const userId = 'user-123';
      const user = { id: userId, activeCategoryId: 'cat-777' };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockSubscriptionService.checkActiveSubscription.mockResolvedValue(false);

      const result = await service.findOne(userId);

      expect(result.categoryLocked).toBe(false);
      expect(mockSubscriptionService.checkActiveSubscription).toHaveBeenCalledWith(userId);
    });
  });

  describe('setActiveCategory', () => {
    it('should throw ForbiddenException if user role is not WORKER', async () => {
      const userId = 'user-emp';
      const categoryId = 'cat-123';
      const user = { id: userId, role: 'EMPLOYER' };

      mockPrismaService.user.findUnique.mockResolvedValue(user);

      await expect(service.setActiveCategory(userId, categoryId)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if category does not exist or is inactive', async () => {
      const userId = 'user-wrk';
      const categoryId = 'non-existent-cat';
      const user = { id: userId, role: 'WORKER', activeCategoryId: null };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.category.findUnique.mockResolvedValue(null);

      await expect(service.setActiveCategory(userId, categoryId)).rejects.toThrow(NotFoundException);
    });

    it('should allow first category selection even if user has active subscription', async () => {
      const userId = 'user-wrk';
      const categoryId = 'cat-123';
      const user = { id: userId, role: 'WORKER', activeCategoryId: null };
      const category = { id: categoryId, slug: 'ceiling', isActive: true };
      const updatedUser = {
        id: userId,
        name: 'Worker Bob',
        role: 'WORKER',
        activeCategoryId: categoryId,
        activeCategory: { id: categoryId, slug: 'ceiling', name: 'Натяжные потолки' },
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.category.findUnique.mockResolvedValue(category);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);
      mockSubscriptionService.checkActiveSubscription.mockResolvedValue(true); // Active sub

      const result = await service.setActiveCategory(userId, categoryId);

      expect(result).toEqual(updatedUser);
      expect(mockSubscriptionService.checkActiveSubscription).not.toHaveBeenCalled(); // No sub check on first selection
    });

    it('should block category change if user has a different active category AND active subscription', async () => {
      const userId = 'user-wrk';
      const categoryId = 'cat-456';
      const user = { id: userId, role: 'WORKER', activeCategoryId: 'cat-123' };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockSubscriptionService.checkActiveSubscription.mockResolvedValue(true); // Active sub

      await expect(service.setActiveCategory(userId, categoryId)).rejects.toThrow(ForbiddenException);
      expect(mockSubscriptionService.checkActiveSubscription).toHaveBeenCalledWith(userId);
    });

    it('should allow category update if category is different but subscription is NOT active', async () => {
      const userId = 'user-wrk';
      const categoryId = 'cat-456';
      const user = { id: userId, role: 'WORKER', activeCategoryId: 'cat-123' };
      const category = { id: categoryId, slug: 'plumbing', isActive: true };
      const updatedUser = { id: userId, activeCategoryId: categoryId };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockSubscriptionService.checkActiveSubscription.mockResolvedValue(false); // Inactive sub
      mockPrismaService.category.findUnique.mockResolvedValue(category);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.setActiveCategory(userId, categoryId);

      expect(result.activeCategoryId).toBe(categoryId);
      expect(mockSubscriptionService.checkActiveSubscription).toHaveBeenCalledWith(userId);
    });

    it('should allow selecting the exact same category even if subscription is active', async () => {
      const userId = 'user-wrk';
      const categoryId = 'cat-123';
      const user = { id: userId, role: 'WORKER', activeCategoryId: 'cat-123' };
      const category = { id: categoryId, slug: 'ceiling', isActive: true };
      const updatedUser = { id: userId, activeCategoryId: categoryId };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockPrismaService.category.findUnique.mockResolvedValue(category);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.setActiveCategory(userId, categoryId);

      expect(result.activeCategoryId).toBe(categoryId);
      expect(mockSubscriptionService.checkActiveSubscription).not.toHaveBeenCalled(); // No sub check because category is identical
    });
  });
});
