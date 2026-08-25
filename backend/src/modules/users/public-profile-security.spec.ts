import { UsersService } from './users.service';
import { NotFoundException } from '@nestjs/common';

describe('Public Profile Security & Pagination Guards', () => {
  let service: UsersService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      portfolioItem: {
        findMany: jest.fn(),
      },
    };
    service = new UsersService(mockPrisma as any, null as any);
  });

  describe('findPublicProfile', () => {
    it('A: throws NotFoundException if requested user is blocked', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'blocked-user',
        isBlocked: true,
        deletedAt: null,
      });

      await expect(service.findPublicProfile('blocked-user')).rejects.toThrow(NotFoundException);
    });

    it('B: throws NotFoundException if requested user is soft-deleted', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'deleted-user',
        isBlocked: false,
        deletedAt: new Date(),
      });

      await expect(service.findPublicProfile('deleted-user')).rejects.toThrow(NotFoundException);
    });

    it('C: returns public profile with only whitelisted attributes for active normal user', async () => {
      const activeUser = {
        id: 'user-1',
        name: 'Master Ivan',
        avatar: 'http://avatar.jpg',
        rating: 4.9,
        experience: 5,
        completedOrders: 20,
        ordersCount: 22,
        isVerified: true,
        portfolioItems: [],
        isBlocked: false,
        deletedAt: null,
        activeCategory: { id: 'cat-1', slug: 'ceilings', name: 'Plumbing' },
      };

      mockPrisma.user.findUnique.mockResolvedValueOnce(activeUser);

      const profile = await service.findPublicProfile('user-1');

      expect(profile.id).toBe('user-1');
      expect(profile.name).toBe('Master Ivan');
      expect(profile.trustScore).toBeDefined();
      expect((profile as any).phone).toBeUndefined();
      expect((profile as any).isBlocked).toBeUndefined();
      expect((profile as any).deletedAt).toBeUndefined();
      expect((profile as any).sessionVersion).toBeUndefined();
      expect((profile as any).pushToken).toBeUndefined();
    });
  });

  describe('getPortfolio', () => {
    it('D: throws NotFoundException if user is blocked or soft-deleted', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'blocked-user',
        isBlocked: true,
        deletedAt: null,
      });

      await expect(service.getPortfolio('blocked-user')).rejects.toThrow(NotFoundException);
    });

    it('E: clamps take parameter to max 100 for active user', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: 'user-1',
        isBlocked: false,
        deletedAt: null,
      });
      mockPrisma.portfolioItem.findMany.mockResolvedValueOnce([]);

      await service.getPortfolio('user-1', { skip: -5, take: 500 });

      expect(mockPrisma.portfolioItem.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 100,
      });
    });
  });
});
