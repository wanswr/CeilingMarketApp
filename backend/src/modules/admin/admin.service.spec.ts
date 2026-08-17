import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { Role, OrderStatus, DisputeStatus, ResolutionType } from '@prisma/client';

describe('AdminService', () => {
  let service: AdminService;
  let prisma: any;

  const mockAdmin = {
    id: 'admin-1',
    role: Role.ADMIN,
    roles: [Role.ADMIN],
    isBlocked: false,
  };

  const mockRegularUser = {
    id: 'user-1',
    role: Role.EMPLOYER,
    roles: [Role.EMPLOYER],
    isBlocked: false,
  };

  const mockTargetUser = {
    id: 'worker-1',
    role: Role.WORKER,
    roles: [Role.WORKER],
    isBlocked: false,
  };

  const mockOrder = {
    id: 'order-1',
    employerId: 'user-1',
    executorId: 'worker-1',
    status: OrderStatus.CLAIMED,
    isFrozen: false,
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    orderStatusHistory: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    report: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    dispute: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    session: {
      updateMany: jest.fn(),
    },
    adminAuditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
  };

  const mockLoggerService = {
    setService: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((cb) => cb(mockPrismaService));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('blockUser', () => {
    it('should allow ADMIN to block a user and record audit log', async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockAdmin);
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockTargetUser);
      mockPrismaService.user.update.mockResolvedValueOnce({ ...mockTargetUser, isBlocked: true });

      const result = await service.blockUser('admin-1', 'worker-1', 'Violation of terms');

      expect(result.isBlocked).toBe(true);
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'worker-1' },
        data: expect.objectContaining({
          isBlocked: true,
          blockedReason: 'Violation of terms',
          blockedById: 'admin-1',
        }),
      });
      expect(mockPrismaService.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminId: 'admin-1',
          action: 'BLOCK_USER',
          targetType: 'User',
          targetId: 'worker-1',
          reason: 'Violation of terms',
        }),
      });
    });

    it('should throw ForbiddenException if performing user is not ADMIN', async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockRegularUser);

      await expect(
        service.blockUser('user-1', 'worker-1', 'Spam'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('freezeOrder & unfreezeOrder', () => {
    it('should allow ADMIN to freeze an order', async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockAdmin);
      mockPrismaService.order.findUnique.mockResolvedValueOnce(mockOrder);
      mockPrismaService.order.update.mockResolvedValueOnce({
        ...mockOrder,
        isFrozen: true,
        status: OrderStatus.FROZEN,
      });

      const result = await service.freezeOrder('admin-1', 'order-1', 'Investigation needed');

      expect(result.status).toBe(OrderStatus.FROZEN);
      expect(mockPrismaService.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminId: 'admin-1',
          action: 'FREEZE_ORDER',
          targetType: 'Order',
          targetId: 'order-1',
        }),
      });
    });

    it('should allow ADMIN to unfreeze an order with explicit restoreStatus', async () => {
      const frozenOrder = { ...mockOrder, isFrozen: true, status: OrderStatus.FROZEN };
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockAdmin);
      mockPrismaService.order.findUnique.mockResolvedValueOnce(frozenOrder);
      mockPrismaService.order.update.mockResolvedValueOnce({
        ...mockOrder,
        isFrozen: false,
        status: OrderStatus.PUBLISHED,
      });

      const result = await service.unfreezeOrder('admin-1', 'order-1', OrderStatus.PUBLISHED, 'Resolved');

      expect(result.isFrozen).toBe(false);
      expect(mockPrismaService.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminId: 'admin-1',
          action: 'UNFREEZE_ORDER',
          targetType: 'Order',
          targetId: 'order-1',
        }),
      });
    });

    it('should restore pre-freeze status from OrderStatusHistory when restoreStatus is omitted', async () => {
      const frozenOrder = { ...mockOrder, isFrozen: true, status: OrderStatus.FROZEN };
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockAdmin);
      mockPrismaService.order.findUnique.mockResolvedValueOnce(frozenOrder);
      mockPrismaService.orderStatusHistory.findFirst.mockResolvedValueOnce({
        orderId: 'order-1',
        oldStatus: OrderStatus.CLAIMED,
        newStatus: OrderStatus.FROZEN,
      });
      mockPrismaService.order.update.mockResolvedValueOnce({
        ...mockOrder,
        isFrozen: false,
        status: OrderStatus.CLAIMED,
      });

      const result = await service.unfreezeOrder('admin-1', 'order-1', undefined, 'Resolved dispute');

      expect(result.status).toBe(OrderStatus.CLAIMED);
      expect(result.isFrozen).toBe(false);
      expect(mockPrismaService.orderStatusHistory.findFirst).toHaveBeenCalledWith({
        where: { orderId: 'order-1', newStatus: OrderStatus.FROZEN },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('reports', () => {
    it('should throw NotFoundException if target user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockRegularUser);
      mockPrismaService.user.findUnique.mockResolvedValueOnce(null); // targetUser null

      await expect(
        service.createReport('user-1', { targetUserId: 'nonexistent-user', reason: 'Spam' })
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if reporter user is inactive or blocked', async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce({ id: 'user-1', isBlocked: true });

      await expect(
        service.createReport('user-1', { targetUserId: 'worker-1', reason: 'Spam' })
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('disputes', () => {
    it('should allow a participant user to open a dispute on a CLAIMED order', async () => {
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockRegularUser);
      mockPrismaService.order.findUnique.mockResolvedValueOnce(mockOrder);
      mockPrismaService.dispute.findFirst.mockResolvedValueOnce(null);
      mockPrismaService.dispute.create.mockResolvedValueOnce({
        id: 'dispute-1',
        orderId: 'order-1',
        openedBy: 'user-1',
        respondentId: 'worker-1',
        reason: 'Unfinished work',
        status: DisputeStatus.OPEN,
      });

      const result = await service.openDispute('user-1', {
        orderId: 'order-1',
        reason: 'Unfinished work',
      });

      expect(result.id).toBe('dispute-1');
      expect(mockPrismaService.dispute.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if trying to open a dispute on a PUBLISHED order', async () => {
      const publishedOrder = { ...mockOrder, status: OrderStatus.PUBLISHED };
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockRegularUser);
      mockPrismaService.order.findUnique.mockResolvedValueOnce(publishedOrder);

      await expect(
        service.openDispute('user-1', { orderId: 'order-1', reason: 'No worker assigned' })
      ).rejects.toThrow(ConflictException);
    });

    it('should allow ADMIN to resolve a dispute', async () => {
      const mockDispute = {
        id: 'dispute-1',
        orderId: 'order-1',
        openedBy: 'user-1',
        respondentId: 'worker-1',
        status: DisputeStatus.OPEN,
        order: mockOrder,
      };

      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockAdmin);
      mockPrismaService.dispute.findUnique.mockResolvedValueOnce(mockDispute);
      mockPrismaService.dispute.update.mockResolvedValueOnce({
        ...mockDispute,
        status: DisputeStatus.RESOLVED,
        resolutionType: ResolutionType.REFUND,
        resolution: 'Refund granted to employer',
      });

      const result = await service.resolveDispute('admin-1', 'dispute-1', {
        resolutionType: ResolutionType.REFUND,
        resolution: 'Refund granted to employer',
      });

      expect(result.status).toBe(DisputeStatus.RESOLVED);
      expect(mockPrismaService.adminAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminId: 'admin-1',
          action: 'RESOLVE_DISPUTE',
          targetType: 'Dispute',
          targetId: 'dispute-1',
        }),
      });
    });

    it('should throw ConflictException when trying to resolve an already RESOLVED dispute', async () => {
      const mockClosedDispute = {
        id: 'dispute-1',
        orderId: 'order-1',
        openedBy: 'user-1',
        respondentId: 'worker-1',
        status: DisputeStatus.RESOLVED,
        order: mockOrder,
      };

      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockAdmin);
      mockPrismaService.dispute.findUnique.mockResolvedValueOnce(mockClosedDispute);

      await expect(
        service.resolveDispute('admin-1', 'dispute-1', {
          resolutionType: ResolutionType.NO_ACTION,
          resolution: 'Already done',
        })
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ForbiddenException if regular user tries to resolve dispute', async () => {
      const mockDispute = {
        id: 'dispute-1',
        orderId: 'order-1',
        openedBy: 'user-1',
        respondentId: 'worker-1',
        status: DisputeStatus.OPEN,
        order: mockOrder,
      };
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockRegularUser);
      mockPrismaService.dispute.findUnique.mockResolvedValueOnce(mockDispute);

      await expect(
        service.resolveDispute('user-1', 'dispute-1', {
          resolutionType: ResolutionType.NO_ACTION,
          resolution: 'Dismissed',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
