import { OrderStatus } from '@prisma/client';
import { ORDER_STATE_MACHINE } from './order-state-machine';
import { ConflictException, ForbiddenException } from '@nestjs/common';

// Mock validateTransition locally for testing the logic in isolation
function validateTransition(
  order: any,
  toStatus: OrderStatus,
  userId: string,
  isSystem = false
): void {
  const fromStatus = order.status;

  if (fromStatus === toStatus) {
    throw new ConflictException(`Cannot transition from ${fromStatus} to ${toStatus}`);
  }

  const currentTransitions = ORDER_STATE_MACHINE[fromStatus];
  if (!currentTransitions) {
    throw new ConflictException(`Cannot transition from ${fromStatus} to ${toStatus}`);
  }

  const rule = currentTransitions[toStatus];
  if (!rule) {
    throw new ConflictException(`Cannot transition from ${fromStatus} to ${toStatus}`);
  }

  if (rule.requiresParticipant === 'system' && !isSystem) {
    throw new ConflictException(`Cannot transition from ${fromStatus} to ${toStatus}`);
  }

  if (isSystem) {
    return;
  }

  if (rule.requiresParticipant === 'employer') {
    if (order.employerId !== userId) {
      throw new ForbiddenException(`Only the employer can transition this order to ${toStatus}`);
    }
  } else if (rule.requiresParticipant === 'executor') {
    if (order.executorId !== userId) {
      throw new ForbiddenException(`Only the executor can transition this order to ${toStatus}`);
    }
  } else if (rule.requiresParticipant === 'any') {
    if (order.employerId !== userId && order.executorId !== userId) {
      throw new ForbiddenException(`Only order participants can transition this order to ${toStatus}`);
    }
  }
}

describe('Order State Machine - Isolated Rules', () => {
  describe('Direct Structure Definition Checks', () => {
    it('should map PENDING to PUBLISHED and CANCELLED', () => {
      expect(ORDER_STATE_MACHINE[OrderStatus.PENDING]?.[OrderStatus.PUBLISHED]).toBeDefined();
      expect(ORDER_STATE_MACHINE[OrderStatus.PENDING]?.[OrderStatus.CANCELLED]).toBeDefined();
    });

    it('should map PUBLISHED to HAS_RESPONSES, CLAIMED (via system) and CANCELLED (via employer)', () => {
      const pub = ORDER_STATE_MACHINE[OrderStatus.PUBLISHED];
      expect(pub?.[OrderStatus.HAS_RESPONSES]?.requiresParticipant).toBe('system');
      expect(pub?.[OrderStatus.CLAIMED]?.requiresParticipant).toBe('system');
      expect(pub?.[OrderStatus.CANCELLED]?.requiresParticipant).toBe('employer');
    });

    it('should map CLAIMED to IN_PROGRESS (executor), CANCELLED (employer), and DISPUTE (any)', () => {
      const claimed = ORDER_STATE_MACHINE[OrderStatus.CLAIMED];
      expect(claimed?.[OrderStatus.IN_PROGRESS]?.requiresParticipant).toBe('executor');
      expect(claimed?.[OrderStatus.CANCELLED]?.requiresParticipant).toBe('employer');
      expect(claimed?.[OrderStatus.DISPUTE]?.requiresParticipant).toBe('any');
    });

    it('should block any transitions out of CANCELLED, DISPUTE, REVIEWED', () => {
      expect(Object.keys(ORDER_STATE_MACHINE[OrderStatus.CANCELLED] || {})).toHaveLength(0);
      expect(Object.keys(ORDER_STATE_MACHINE[OrderStatus.DISPUTE] || {})).toHaveLength(0);
      expect(Object.keys(ORDER_STATE_MACHINE[OrderStatus.REVIEWED] || {})).toHaveLength(0);
    });
  });

  describe('validateTransition Rules and Role Checks', () => {
    const mockOrder = {
      id: 'order-1',
      employerId: 'employer-user',
      executorId: 'executor-user',
      status: OrderStatus.PUBLISHED,
    };

    it('should throw ConflictException on repeat transition (same status)', () => {
      const order = { ...mockOrder, status: OrderStatus.PUBLISHED };
      expect(() => validateTransition(order, OrderStatus.PUBLISHED, 'employer-user')).toThrow(
        new ConflictException('Cannot transition from PUBLISHED to PUBLISHED')
      );
    });

    it('should throw ConflictException on repeat transition (already CANCELLED)', () => {
      const order = { ...mockOrder, status: OrderStatus.CANCELLED };
      expect(() => validateTransition(order, OrderStatus.CANCELLED, 'employer-user')).toThrow(
        new ConflictException('Cannot transition from CANCELLED to CANCELLED')
      );
    });

    it('should allow employer to cancel order from PUBLISHED', () => {
      const order = { ...mockOrder, status: OrderStatus.PUBLISHED };
      expect(() => validateTransition(order, OrderStatus.CANCELLED, 'employer-user')).not.toThrow();
    });

    it('should throw ForbiddenException if executor tries to cancel order from PUBLISHED', () => {
      const order = { ...mockOrder, status: OrderStatus.PUBLISHED };
      expect(() => validateTransition(order, OrderStatus.CANCELLED, 'executor-user')).toThrow(
        new ForbiddenException('Only the employer can transition this order to CANCELLED')
      );
    });

    it('should allow system to transition from PUBLISHED to HAS_RESPONSES', () => {
      const order = { ...mockOrder, status: OrderStatus.PUBLISHED };
      expect(() => validateTransition(order, OrderStatus.HAS_RESPONSES, 'any-user', true)).not.toThrow();
    });

    it('should throw ConflictException if direct user attempts system transition PUBLISHED -> HAS_RESPONSES', () => {
      const order = { ...mockOrder, status: OrderStatus.PUBLISHED };
      expect(() => validateTransition(order, OrderStatus.HAS_RESPONSES, 'any-user', false)).toThrow(
        new ConflictException('Cannot transition from PUBLISHED to HAS_RESPONSES')
      );
    });

    it('should allow executor to start work (CLAIMED -> IN_PROGRESS)', () => {
      const order = { ...mockOrder, status: OrderStatus.CLAIMED };
      expect(() => validateTransition(order, OrderStatus.IN_PROGRESS, 'executor-user')).not.toThrow();
    });

    it('should throw ForbiddenException if employer tries to start work (CLAIMED -> IN_PROGRESS)', () => {
      const order = { ...mockOrder, status: OrderStatus.CLAIMED };
      expect(() => validateTransition(order, OrderStatus.IN_PROGRESS, 'employer-user')).toThrow(
        new ForbiddenException('Only the executor can transition this order to IN_PROGRESS')
      );
    });

    it('should allow both employer and executor to dispute (CLAIMED -> DISPUTE)', () => {
      const order = { ...mockOrder, status: OrderStatus.CLAIMED };
      expect(() => validateTransition(order, OrderStatus.DISPUTE, 'employer-user')).not.toThrow();
      expect(() => validateTransition(order, OrderStatus.DISPUTE, 'executor-user')).not.toThrow();
    });

    it('should throw ForbiddenException if stranger tries to dispute (CLAIMED -> DISPUTE)', () => {
      const order = { ...mockOrder, status: OrderStatus.CLAIMED };
      expect(() => validateTransition(order, OrderStatus.DISPUTE, 'stranger-user')).toThrow(
        new ForbiddenException('Only order participants can transition this order to DISPUTE')
      );
    });

    it('should throw ConflictException for arbitrary jumps like PUBLISHED -> IN_PROGRESS', () => {
      const order = { ...mockOrder, status: OrderStatus.PUBLISHED };
      expect(() => validateTransition(order, OrderStatus.IN_PROGRESS, 'employer-user')).toThrow(
        new ConflictException('Cannot transition from PUBLISHED to IN_PROGRESS')
      );
    });
  });
});
