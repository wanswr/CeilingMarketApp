import { ORDER_STATE_MACHINE } from './order-state-machine';
import { OrderStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { AdminService } from '../admin/admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderParserService } from './order-parser.service';
import { OrderSpatialService } from './order-spatial.service';
import { LoggerService } from '../logger/logger.service';
import { OrderStatus, Role } from '@prisma/client';
import { ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';

describe('FROZEN Policy & Invariants Unit Tests', () => {
  let ordersService: OrdersService;
  let adminService: AdminService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      order: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      orderApplication: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        AdminService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: OrderParserService, useValue: {} },
        { provide: OrderSpatialService, useValue: {} },
        {
          provide: LoggerService,
          useValue: { setContext: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    ordersService = module.get<OrdersService>(OrdersService);
    adminService = module.get<AdminService>(AdminService);
  });

  describe('1. Transitions INTO and OUT OF FROZEN', () => {
    const validFreezeStatuses = [
      OrderStatus.PUBLISHED,
      OrderStatus.HAS_RESPONSES,
      OrderStatus.CLAIMED,
      OrderStatus.IN_PROGRESS,
      OrderStatus.DISPUTE,
    ];

    validFreezeStatuses.forEach((status) => {
      it(`allows freeze and unfreeze cycle for status ${status}`, async () => {
        const mockOrder = { id: 'ord-1', status, frozenFromStatus: null };
        prismaMock.order.findUnique.mockResolvedValue(mockOrder as any);
        prismaMock.order.update.mockImplementation(({ data }) =>
          Promise.resolve({ ...mockOrder, ...data }),
        );

        // Freeze
        const frozenOrder = await adminService.freezeOrder('admin-1', 'ord-1', 'Investigation');
        expect(frozenOrder.status).toBe(OrderStatus.FROZEN);
        expect(frozenOrder.frozenFromStatus).toBe(status);

        // Mock order in FROZEN state for unfreeze call
        prismaMock.order.findUnique.mockResolvedValue(frozenOrder as any);

        // Unfreeze
        const unfrozenOrder = await adminService.unfreezeOrder('ord-1', 'admin-1');
        expect(unfrozenOrder.status).toBe(status);
        expect(unfrozenOrder.frozenFromStatus).toBeNull();
      });
    });

    it('rejects freezing CANCELLED order', async () => {
      prismaMock.order.findUnique.mockResolvedValue({ id: 'ord-c', status: OrderStatus.CANCELLED } as any);
      await expect(adminService.freezeOrder('admin-1', 'ord-c', 'Investigation')).rejects.toThrow(ConflictException);
    });

    it('rejects freezing REVIEWED order', async () => {
      prismaMock.order.findUnique.mockResolvedValue({ id: 'ord-r', status: OrderStatus.REVIEWED } as any);
      await expect(adminService.freezeOrder('admin-1', 'ord-r', 'Investigation')).rejects.toThrow(ConflictException);
    });

    it('rejects unfreeze if targetStatus does not match frozenFromStatus', async () => {
      prismaMock.order.findUnique.mockResolvedValue({
        id: 'ord-f',
        status: OrderStatus.FROZEN,
        frozenFromStatus: OrderStatus.PUBLISHED,
      } as any);

      await expect(adminService.unfreezeOrder('ord-f', OrderStatus.IN_PROGRESS)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('2. Initiator Authorization Safeguards', () => {
    it('rejects non-system initiator trying to freeze order via validateTransition', () => {
      expect(() =>
        (ORDER_STATE_MACHINE as any)[OrderStatus.PUBLISHED],
      ).toThrow(ForbiddenException);

      expect(() =>
        (ORDER_STATE_MACHINE as any)[OrderStatus.PUBLISHED],
      ).toThrow(ForbiddenException);
    });

    it('rejects non-system initiator trying to unfreeze order via validateTransition', () => {
      expect(() =>
        (ORDER_STATE_MACHINE as any)[OrderStatus.FROZEN],
      ).toThrow(ForbiddenException);

      expect(() =>
        (ORDER_STATE_MACHINE as any)[OrderStatus.FROZEN],
      ).toThrow(ForbiddenException);
    });
  });

  describe('3. Invariants & Operation Blocking on FROZEN Orders', () => {
    const frozenOrder = {
      id: 'ord-frozen',
      status: OrderStatus.FROZEN,
      employerId: 'emp-1',
      executorId: 'exec-1',
    };

    beforeEach(() => {
      prismaMock.order.findUnique.mockResolvedValue(frozenOrder as any);
      prismaMock.user.findUnique.mockResolvedValue({ id: 'user-1', isBlocked: false, deletedAt: null } as any);
    });

    it('blocks starting work on FROZEN order', async () => {
      await expect(ordersService.startWork('ord-frozen', 'exec-1')).rejects.toThrow(ConflictException);
    });

    it('blocks completing work on FROZEN order', async () => {
      await expect(ordersService.completeWork('ord-frozen', 'exec-1')).rejects.toThrow(ConflictException);
    });

    it('blocks applying to FROZEN order', async () => {
      await expect(ordersService.apply('ord-frozen', 'exec-2')).rejects.toThrow(ConflictException);
    });

    it('blocks accepting application on FROZEN order', async () => {
      await expect(ordersService.acceptApplication('ord-frozen', 'app-1')).rejects.toThrow(ConflictException);
    });
  });
});
