import { OrderStatus } from '@prisma/client';

export type StateMachineInitiator = 'employer' | 'executor' | 'system' | 'any';

export interface AllowedTransition {
  to: OrderStatus;
  initiator: StateMachineInitiator;
}

export const ORDER_STATE_MACHINE: Record<OrderStatus, AllowedTransition[]> = {
  [OrderStatus.DRAFT]: [
    { to: OrderStatus.PUBLISHED, initiator: 'employer' },
    { to: OrderStatus.CANCELLED, initiator: 'employer' },
  ],
  [OrderStatus.PUBLISHED]: [
    { to: OrderStatus.FROZEN, initiator: 'system' },
    { to: OrderStatus.HAS_RESPONSES, initiator: 'system' },
    { to: OrderStatus.CLAIMED, initiator: 'employer' },
    { to: OrderStatus.CANCELLED, initiator: 'employer' },
  ],
  [OrderStatus.HAS_RESPONSES]: [
    { to: OrderStatus.FROZEN, initiator: 'system' },
    { to: OrderStatus.CLAIMED, initiator: 'employer' },
    { to: OrderStatus.CANCELLED, initiator: 'employer' },
  ],
  [OrderStatus.CLAIMED]: [
    { to: OrderStatus.FROZEN, initiator: 'system' },
    { to: OrderStatus.IN_PROGRESS, initiator: 'executor' },
    { to: OrderStatus.DISPUTE, initiator: 'any' },
    { to: OrderStatus.CANCELLED, initiator: 'employer' },
  ],
  [OrderStatus.IN_PROGRESS]: [
    { to: OrderStatus.FROZEN, initiator: 'system' },
    { to: OrderStatus.COMPLETED, initiator: 'executor' },
    { to: OrderStatus.DISPUTE, initiator: 'any' },
    { to: OrderStatus.CANCELLED, initiator: 'employer' },
  ],
  [OrderStatus.COMPLETED]: [
    { to: OrderStatus.REVIEWED, initiator: 'system' },
    { to: OrderStatus.DISPUTE, initiator: 'any' },
  ],
  [OrderStatus.REVIEWED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.DISPUTE]: [
    { to: OrderStatus.FROZEN, initiator: 'system' },
  ],
  [OrderStatus.FROZEN]: [
    { to: OrderStatus.PUBLISHED, initiator: 'system' },
    { to: OrderStatus.HAS_RESPONSES, initiator: 'system' },
    { to: OrderStatus.CLAIMED, initiator: 'system' },
    { to: OrderStatus.IN_PROGRESS, initiator: 'system' },
    { to: OrderStatus.DISPUTE, initiator: 'system' },
  ],
};
