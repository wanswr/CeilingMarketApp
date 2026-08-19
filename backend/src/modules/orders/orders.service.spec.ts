import { OrdersService } from './orders.service';
import { OrderStatus } from '@prisma/client';

describe('OrdersService - canTransition state machine', () => {
  const canTransition = (from: OrderStatus, to: OrderStatus): boolean => {
    return (OrdersService.prototype as any).canTransition(from, to);
  };

  describe('Happy Path (Legal Forward Transitions)', () => {
    it('should allow PENDING -> PUBLISHED', () => {
      expect(canTransition(OrderStatus.PENDING, OrderStatus.PUBLISHED)).toBe(true);
    });

    it('should allow PUBLISHED -> HAS_RESPONSES', () => {
      expect(canTransition(OrderStatus.PUBLISHED, OrderStatus.HAS_RESPONSES)).toBe(true);
    });

    it('should allow HAS_RESPONSES -> CLAIMED', () => {
      expect(canTransition(OrderStatus.HAS_RESPONSES, OrderStatus.CLAIMED)).toBe(true);
    });

    it('should allow CLAIMED -> IN_PROGRESS', () => {
      expect(canTransition(OrderStatus.CLAIMED, OrderStatus.IN_PROGRESS)).toBe(true);
    });

    it('should allow IN_PROGRESS -> COMPLETED', () => {
      expect(canTransition(OrderStatus.IN_PROGRESS, OrderStatus.COMPLETED)).toBe(true);
    });

    it('should allow COMPLETED -> REVIEWED', () => {
      expect(canTransition(OrderStatus.COMPLETED, OrderStatus.REVIEWED)).toBe(true);
    });
  });

  describe('Terminal CANCELLED State Rules', () => {
    it('should never allow transitions from CANCELLED to any state', () => {
      const statuses = Object.values(OrderStatus);
      statuses.forEach((toStatus) => {
        expect(canTransition(OrderStatus.CANCELLED, toStatus)).toBe(false);
      });
    });
  });

  describe('Blocked Cancellations During Critical Stages', () => {
    it('should allow cancellation from PUBLISHED', () => {
      expect(canTransition(OrderStatus.PUBLISHED, OrderStatus.CANCELLED)).toBe(true);
    });

    it('should allow cancellation from HAS_RESPONSES', () => {
      expect(canTransition(OrderStatus.HAS_RESPONSES, OrderStatus.CANCELLED)).toBe(true);
    });

    it('should allow cancellation from CLAIMED', () => {
      expect(canTransition(OrderStatus.CLAIMED, OrderStatus.CANCELLED)).toBe(true);
    });

    it('should BLOCK cancellation from IN_PROGRESS', () => {
      expect(canTransition(OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED)).toBe(false);
    });

    it('should BLOCK cancellation from COMPLETED', () => {
      expect(canTransition(OrderStatus.COMPLETED, OrderStatus.CANCELLED)).toBe(false);
    });

    it('should BLOCK cancellation from REVIEWED', () => {
      expect(canTransition(OrderStatus.REVIEWED, OrderStatus.CANCELLED)).toBe(false);
    });

    it('should BLOCK cancellation from DISPUTE', () => {
      expect(canTransition(OrderStatus.DISPUTE, OrderStatus.CANCELLED)).toBe(false);
    });
  });

  describe('Blocked Moves from COMPLETED Status', () => {
    it('should BLOCK any transition from COMPLETED except to REVIEWED and DISPUTE', () => {
      const statuses = Object.values(OrderStatus).filter(s => s !== OrderStatus.REVIEWED && s !== OrderStatus.DISPUTE);
      statuses.forEach((toStatus) => {
        expect(canTransition(OrderStatus.COMPLETED, toStatus)).toBe(false);
      });
    });
  });

  describe('Forward Progression and Duplication Constraints', () => {
    it('should block self-transitions (e.g., PUBLISHED -> PUBLISHED)', () => {
      const statuses = Object.values(OrderStatus);
      statuses.forEach((status) => {
        expect(canTransition(status, status)).toBe(false);
      });
    });

    it('should block backward transitions (e.g., IN_PROGRESS -> CLAIMED)', () => {
      expect(canTransition(OrderStatus.IN_PROGRESS, OrderStatus.CLAIMED)).toBe(false);
      expect(canTransition(OrderStatus.CLAIMED, OrderStatus.PUBLISHED)).toBe(false);
      expect(canTransition(OrderStatus.COMPLETED, OrderStatus.IN_PROGRESS)).toBe(false);
    });

    it('should block priority-based arbitrary multi-step forward progression', () => {
      expect(canTransition(OrderStatus.PUBLISHED, OrderStatus.COMPLETED)).toBe(false);
    });
  });
});

describe('OrdersService.remove Atomic Order & Chat Cleanup', () => {
  let service: OrdersService;
  let mockPrisma: any;
  let mockGateway: any;

  beforeEach(() => {
    mockPrisma = {
      order: {
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      chat: {
        findMany: jest.fn(),
      },
    };

    mockGateway = {
      broadcast: jest.fn(),
    };

    service = new OrdersService(
      mockPrisma,
      mockGateway as any,
      { setService: jest.fn(), info: jest.fn(), debug: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('should throw ForbiddenException if user is not the order employer', async () => {
    mockPrisma.order.findUnique.mockResolvedValueOnce({ id: 'order-1', employerId: 'employer-1' });

    await expect(service.remove('order-1', 'other-user')).rejects.toThrow();
    expect(mockPrisma.order.delete).not.toHaveBeenCalled();
  });

  it('should fetch associated chatIds, delete order (triggering DB cascade), and broadcast event', async () => {
    const mockOrder = { id: 'order-1', employerId: 'employer-1', executorId: 'worker-1' };
    mockPrisma.order.findUnique.mockResolvedValueOnce(mockOrder);
    mockPrisma.chat.findMany.mockResolvedValueOnce([{ id: 'chat-100' }, { id: 'chat-200' }]);
    mockPrisma.order.delete.mockResolvedValueOnce(mockOrder);

    const result = await service.remove('order-1', 'employer-1');

    expect(result).toEqual({ id: 'order-1' });
    expect(mockPrisma.chat.findMany).toHaveBeenCalledWith({
      where: { orderId: 'order-1' },
      select: { id: true },
    });
    expect(mockPrisma.order.delete).toHaveBeenCalledWith({ where: { id: 'order-1' } });
    expect(mockGateway.broadcast).toHaveBeenCalledWith(
      'order.deleted',
      expect.objectContaining({
        data: {
          id: 'order-1',
          employerId: 'employer-1',
          executorId: 'worker-1',
          chatIds: ['chat-100', 'chat-200'],
        },
        userId: 'employer-1',
      })
    );
  });
});
