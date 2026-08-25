import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { Role, OrderStatus, DisputeStatus, ResolutionType } from '@prisma/client';

describe('AdminService & Dispute State Machine', () => {
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

  describe('dispute state machine transitions', () => {
    it('A: Admin can resolve OPEN dispute', async () => {
      const mockDispute = {
        id: 'dispute-1',
        orderId: 'order-1',
        openedById: 'user-1',
        respondentId: 'worker-1',
        status: DisputeStatus.OPEN,
        order: mockOrder,
      };

      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockAdmin);
      mockPrismaService.dispute.findUnique.mockResolvedValueOnce(mockDispute);
      mockPrismaService.dispute.update.mockResolvedValueOnce({
        ...mockDispute,
        status: DisputeStatus.RESOLVED,
      });

      const result = await service.resolveDispute('admin-1', 'dispute-1', {
        resolutionType: ResolutionType.REFUND,
        resolution: 'Refund granted',
      });

      expect(result.status).toBe(DisputeStatus.RESOLVED);
    });

    it('B/D: Forbidden transition (OPEN -> APPEALED) is rejected by state machine', async () => {
      const mockDispute = {
        id: 'dispute-1',
        status: DisputeStatus.OPEN,
        order: mockOrder,
      };

      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockAdmin);
      mockPrismaService.dispute.findUnique.mockResolvedValueOnce(mockDispute);

      await expect(
        service.resolveDispute('admin-1', 'dispute-1', {
          resolutionType: ResolutionType.NO_ACTION,
          resolution: 'Invalid',
          status: DisputeStatus.APPEALED,
        })
      ).rejects.toThrow(ConflictException);
    });

    it('E: Cannot resolve CLOSED dispute', async () => {
      const mockDispute = {
        id: 'dispute-1',
        status: DisputeStatus.CLOSED,
        order: mockOrder,
      };

      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockAdmin);
      mockPrismaService.dispute.findUnique.mockResolvedValueOnce(mockDispute);

      await expect(
        service.resolveDispute('admin-1', 'dispute-1', {
          resolutionType: ResolutionType.NO_ACTION,
          resolution: 'Invalid',
          status: DisputeStatus.RESOLVED,
        })
      ).rejects.toThrow(ConflictException);
    });

    it('F/G: Participant can appeal RESOLVED dispute but not OPEN dispute', async () => {
      const openDispute = {
        id: 'dispute-1',
        openedById: 'user-1',
        respondentId: 'worker-1',
        status: DisputeStatus.OPEN,
      };

      mockPrismaService.dispute.findUnique.mockResolvedValueOnce(openDispute);
      await expect(service.appealDispute('user-1', 'dispute-1', 'Unfair')).rejects.toThrow(ConflictException);

      const resolvedDispute = {
        id: 'dispute-1',
        openedById: 'user-1',
        respondentId: 'worker-1',
        status: DisputeStatus.RESOLVED,
        appealedAt: null,
      };

      mockPrismaService.dispute.findUnique.mockResolvedValueOnce(resolvedDispute);
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockRegularUser);
      mockPrismaService.dispute.update.mockResolvedValueOnce({
        ...resolvedDispute,
        status: DisputeStatus.APPEALED,
      });

      const appealResult = await service.appealDispute('user-1', 'dispute-1', 'Unfair');
      expect(appealResult.status).toBe(DisputeStatus.APPEALED);
    });

    it('H: Repeated appeal is rejected', async () => {
      const alreadyAppealedDispute = {
        id: 'dispute-1',
        openedById: 'user-1',
        respondentId: 'worker-1',
        status: DisputeStatus.RESOLVED,
        appealedAt: new Date(),
      };

      mockPrismaService.dispute.findUnique.mockResolvedValueOnce(alreadyAppealedDispute);
      mockPrismaService.user.findUnique.mockResolvedValueOnce(mockRegularUser);

      await expect(service.appealDispute('user-1', 'dispute-1', 'Again')).rejects.toThrow(
        new ConflictException('Dispute has already been appealed once')
      );
    });
  });
});
