import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionService } from './subscription.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('SubscriptionService - Category-bound Subscriptions', () => {
  let service: SubscriptionService;
  let prisma: any;

  const mockPrismaService = {
    subscription: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    category: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((cb) => cb(mockPrismaService));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('A & B: checkActiveSubscription per category', () => {
    it('Scenario A: User + Category A subscription -> checkActiveSubscription(A) = true', async () => {
      mockPrismaService.subscription.findUnique.mockResolvedValueOnce({
        id: 'sub-1',
        userId: 'user-1',
        categoryId: 'cat-A',
        isActive: true,
        activeUntil: new Date(Date.now() + 86400000),
      });

      const isActive = await service.checkActiveSubscription('user-1', 'cat-A');
      expect(isActive).toBe(true);
      expect(mockPrismaService.subscription.findUnique).toHaveBeenCalledWith({
        where: { userId_categoryId: { userId: 'user-1', categoryId: 'cat-A' } },
      });
    });

    it('Scenario B: User + Category A subscription -> checkActiveSubscription(B) = false', async () => {
      mockPrismaService.subscription.findUnique.mockResolvedValueOnce(null);

      const isActive = await service.checkActiveSubscription('user-1', 'cat-B');
      expect(isActive).toBe(false);
      expect(mockPrismaService.subscription.findUnique).toHaveBeenCalledWith({
        where: { userId_categoryId: { userId: 'user-1', categoryId: 'cat-B' } },
      });
    });
  });

  describe('C & J: activate subscription for specific category', () => {
    it('Scenario C & J: User with subscription A can activate subscription B, and re-activation updates same record without duplicates', async () => {
      mockPrismaService.category.findUnique.mockResolvedValue({ id: 'cat-B', isActive: true });
      mockPrismaService.subscription.findUnique.mockResolvedValueOnce(null);
      mockPrismaService.subscription.upsert.mockResolvedValueOnce({
        id: 'sub-B',
        userId: 'user-1',
        categoryId: 'cat-B',
        isActive: true,
        activeUntil: new Date(),
      });

      const result = await service.activate('user-1', 'cat-B', 30);
      expect(result.id).toBe('sub-B');
      expect(mockPrismaService.subscription.upsert).toHaveBeenCalledWith({
        where: { userId_categoryId: { userId: 'user-1', categoryId: 'cat-B' } },
        update: expect.objectContaining({ isActive: true }),
        create: expect.objectContaining({ userId: 'user-1', categoryId: 'cat-B' }),
        include: { category: true },
      });
    });
  });

  describe('D: First free category rule', () => {
    it('should allow first free category claim if freeCategoryUsed is false', async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce({ id: 'user-1', freeCategoryUsed: false });
      mockPrismaService.category.findUnique.mockResolvedValueOnce({ id: 'cat-A', isActive: true });
      mockPrismaService.subscription.upsert.mockResolvedValueOnce({ id: 'sub-A', categoryId: 'cat-A' });

      const result = await service.claimFreeCategory('user-1', 'cat-A', 30);
      expect(result.id).toBe('sub-A');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { freeCategoryUsed: true },
      });
    });

    it('Scenario D: User already used free category -> attempt free category B -> forbidden', async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce({ id: 'user-1', freeCategoryUsed: true });

      await expect(service.claimFreeCategory('user-1', 'cat-B', 30)).rejects.toThrow(
        new ForbiddenException('Бесплатное первое направление уже было использовано')
      );
    });
  });

  describe('I: Simultaneous Subscriptions', () => {
    it('Scenario I: One user can have simultaneous active subscriptions for A and B', async () => {
      const mockSubs = [
        { id: 'sub-A', userId: 'user-1', categoryId: 'cat-A', isActive: true, activeUntil: new Date(Date.now() + 86400000) },
        { id: 'sub-B', userId: 'user-1', categoryId: 'cat-B', isActive: true, activeUntil: new Date(Date.now() + 86400000) },
      ];
      mockPrismaService.subscription.findMany.mockResolvedValueOnce(mockSubs);

      const userSubs = await service.getUserSubscriptions('user-1');
      expect(userSubs).toHaveLength(2);
      expect(userSubs[0].categoryId).toBe('cat-A');
      expect(userSubs[1].categoryId).toBe('cat-B');
    });
  });
});
