import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { SubscriptionService } from '../subscription/subscription.service';

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
    order: {
      count: jest.fn().mockResolvedValue(1),
    },
    application: {
      count: jest.fn().mockResolvedValue(1),
    },
    chat: {
      count: jest.fn().mockResolvedValue(1),
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

      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, deletedAt: null });
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.update(userId, dto);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { name: 'New Name', avatar: 'new-avatar.png' },
      });
      expect(result).toEqual(updatedUser);
    });

    it('should ignore role field passed to update()', async () => {
      const userId = 'user-4';
      const dto = { name: 'Bob', role: 'WORKER' };
      const updatedUser = { id: userId, name: 'Bob', role: null };

      mockPrismaService.user.findUnique.mockResolvedValue({ id: userId, deletedAt: null });
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.update(userId, dto as any);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { name: 'Bob' }, // role is ignored
      });
      expect(result).toEqual(updatedUser);
    });
  });

  describe('setRole', () => {
    it('should allow setting role if current role is null and requested role is in allowed roles list', async () => {
      const userId = 'user-2';
      const role = 'WORKER';
      const currentUser = { id: userId, role: null, roles: ['WORKER', 'EMPLOYER'] };
      const updatedUser = { id: userId, role: 'WORKER' };

      mockPrismaService.user.findUnique.mockResolvedValue(currentUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.setRole(userId, role as any);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { role: 'WORKER' },
      });
      expect(result).toEqual(updatedUser);
    });

    it('should allow changing role even if user has active orders, since parallel roles is supported', async () => {
      const userId = 'user-3';
      const role = 'EMPLOYER';
      const currentUser = { id: userId, role: 'WORKER', roles: ['WORKER', 'EMPLOYER'] };
      const updatedUser = { id: userId, role: 'EMPLOYER' };

      mockPrismaService.user.findUnique.mockResolvedValue(currentUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.setRole(userId, role as any);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { role: 'EMPLOYER' },
      });
      expect(result).toEqual(updatedUser);
    });

    it('should reject changing role if requested role is not in the allowed roles array', async () => {
      const userId = 'user-3';
      const role = 'EMPLOYER';
      const currentUser = { id: userId, role: 'WORKER', roles: ['WORKER'] }; // EMPLOYER not allowed

      mockPrismaService.user.findUnique.mockResolvedValue(currentUser);

      await expect(service.setRole(userId, role as any)).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteProfile', () => {
    it('should anonymize user fields and set deletedAt instead of physically deleting', async () => {
      const userId = 'user-123';
      const user = { id: userId, deletedAt: null };

      mockPrismaService.user.findUnique.mockResolvedValue(user);
      (mockPrismaService.order.count as jest.Mock).mockResolvedValue(0);
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

  describe('findPublicProfile - Whitelist & Privacy Contract', () => {
    it('should return ONLY public whitelist fields and exclude phone, sessionVersion, pushToken, deletedAt, and blocked fields', async () => {
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
        activeCategory: { id: 'cat-1', slug: 'ceilings', name: 'Ceilings' },
        deletedAt: null,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(user);

      const result: any = await service.findPublicProfile(userId);

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
          portfolioItems: {
            select: {
              id: true,
              imageUrl: true,
              description: true,
              workType: true,
              createdAt: true,
            },
          },
          activeCategory: { select: { id: true, slug: true, name: true } },
          deletedAt: true,
        },
      });

      // Verify Whitelist keys
      const allowedKeys = [
        'id', 'name', 'avatar', 'rating', 'experience',
        'completedOrders', 'ordersCount', 'isVerified',
        'portfolioItems', 'activeCategory', 'trustScore'
      ];
      expect(Object.keys(result).sort()).toEqual(allowedKeys.sort());

      // Verify Sensitive fields are strictly undefined
      expect(result.phone).toBeUndefined();
      expect(result.sessionVersion).toBeUndefined();
      expect(result.pushToken).toBeUndefined();
      expect(result.deletedAt).toBeUndefined();
      expect(result.isBlocked).toBeUndefined();
      expect(result.blockedAt).toBeUndefined();
      expect(result.blockedReason).toBeUndefined();
      expect(result.blockedById).toBeUndefined();
      expect(result.instagram).toBeUndefined();
      expect(result.telegram).toBeUndefined();
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

  describe('Soft-deleted user action blocking', () => {
    const deletedUser = { id: 'user-1', deletedAt: new Date() };

    it('should block update() for soft-deleted user and throw NotFoundException', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(deletedUser);
      await expect(service.update('user-1', { name: 'Bob' })).rejects.toThrow(NotFoundException);
    });

    it('should block setRole() for soft-deleted user and throw NotFoundException', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(deletedUser);
      await expect(service.setRole('user-1', 'WORKER')).rejects.toThrow(NotFoundException);
    });

    it('should block setActiveCategory() for soft-deleted user and throw NotFoundException', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(deletedUser);
      await expect(service.setActiveCategory('user-1', 'cat-123')).rejects.toThrow(NotFoundException);
    });
  });
});
