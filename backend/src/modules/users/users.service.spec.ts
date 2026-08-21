import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionService } from '../subscription/subscription.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('UsersService Account Deletion & 30-Day Recovery', () => {
  let service: UsersService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      order: {
        count: jest.fn(),
      },
      dispute: {
        count: jest.fn(),
      },
      payment: {
        count: jest.fn(),
      },
      session: {
        updateMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SubscriptionService, useValue: { checkActiveSubscription: jest.fn().mockResolvedValue(false) } },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('deleteProfile', () => {
    it('A: Normal user deletion request -> sets deletedAt and revokes sessions', async () => {
      const mockUser = { id: 'user-1', deletedAt: null };
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrisma.order.count.mockResolvedValueOnce(0);
      mockPrisma.dispute.count.mockResolvedValueOnce(0);
      mockPrisma.payment.count.mockResolvedValueOnce(0);

      const deletionDate = new Date();
      mockPrisma.user.update.mockResolvedValueOnce({ ...mockUser, deletedAt: deletionDate });

      const result = await service.deleteProfile('user-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
        }),
      });
      expect(mockPrisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
    });

    it('B: User with active dispute -> deletion -> 409 Conflict', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1', deletedAt: null });
      mockPrisma.order.count.mockResolvedValueOnce(0);
      mockPrisma.dispute.count.mockResolvedValueOnce(1);

      await expect(service.deleteProfile('user-1')).rejects.toThrow(
        new ConflictException('Cannot delete account with active disputes')
      );
    });

    it('C: User with active order in progress -> deletion -> 409 Conflict', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1', deletedAt: null });
      mockPrisma.order.count.mockResolvedValueOnce(1);

      await expect(service.deleteProfile('user-1')).rejects.toThrow(
        new ConflictException('Cannot delete account with active orders in progress')
      );
    });

    it('F/P: Idempotency -> repeated deletion request preserves original deletedAt date without resetting 30-day period', async () => {
      const originalDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1', deletedAt: originalDate });

      const result = await service.deleteProfile('user-1');

      expect(result.deletedAt).toBe(originalDate);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('restoreProfile', () => {
    it('G/H: Account recovery within 30 days -> deletedAt set to null', async () => {
      const deletedRecently = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1', deletedAt: deletedRecently });
      mockPrisma.user.update.mockResolvedValueOnce({ id: 'user-1', deletedAt: null });

      const result = await service.restoreProfile('user-1');

      expect(result.success).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { deletedAt: null },
      });
    });

    it('I: Account recovery after 30 days -> 409 Conflict error', async () => {
      const deletedLongAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000); // 35 days ago
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'user-1', deletedAt: deletedLongAgo });

      await expect(service.restoreProfile('user-1')).rejects.toThrow(
        new ConflictException('Account recovery period of 30 days has expired')
      );
    });
  });
});
