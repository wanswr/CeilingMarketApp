import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
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
});
