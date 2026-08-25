import { OrderStatus } from '@prisma/client';
import { ORDER_STATE_MACHINE } from './order-state-machine';

describe('ORDER_STATE_MACHINE Complete Coverage', () => {
  it('covers all OrderStatus enum keys in ORDER_STATE_MACHINE', () => {
    const enumStatuses = Object.values(OrderStatus);
    const machineKeys = Object.keys(ORDER_STATE_MACHINE);

    enumStatuses.forEach((status) => {
      expect(machineKeys).toContain(status);
    });
  });

  it('allows system transition from PUBLISHED, HAS_RESPONSES, CLAIMED, IN_PROGRESS, DISPUTE into FROZEN', () => {
    const eligibleStatuses = [
      OrderStatus.PUBLISHED,
      OrderStatus.HAS_RESPONSES,
      OrderStatus.CLAIMED,
      OrderStatus.IN_PROGRESS,
      OrderStatus.DISPUTE,
    ];

    eligibleStatuses.forEach((status) => {
      const transitions = ORDER_STATE_MACHINE[status];
      const freezeTransition = transitions.find(
        (t) => t.to === OrderStatus.FROZEN && t.initiator === 'system',
      );
      expect(freezeTransition).toBeDefined();
    });
  });

  it('allows system transitions from FROZEN back to original active states', () => {
    const frozenTransitions = ORDER_STATE_MACHINE[OrderStatus.FROZEN];
    expect(frozenTransitions).toEqual([
      { to: OrderStatus.PUBLISHED, initiator: 'system' },
      { to: OrderStatus.HAS_RESPONSES, initiator: 'system' },
      { to: OrderStatus.CLAIMED, initiator: 'system' },
      { to: OrderStatus.IN_PROGRESS, initiator: 'system' },
      { to: OrderStatus.DISPUTE, initiator: 'system' },
    ]);
  });
});
