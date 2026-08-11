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
