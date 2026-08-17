import { OrderStatus } from '@prisma/client';

export interface TransitionRule {
  requiresParticipant: 'employer' | 'executor' | 'any' | 'system';
  description: string;
}

export const ORDER_STATE_MACHINE: Record<OrderStatus, Partial<Record<OrderStatus, TransitionRule>>> = {
  [OrderStatus.PENDING]: {
    [OrderStatus.PUBLISHED]: {
      requiresParticipant: 'employer',
      description: 'Publishing a pending draft order',
    },
    [OrderStatus.CANCELLED]: {
      requiresParticipant: 'employer',
      description: 'Cancelling a pending draft order',
    },
  },
  [OrderStatus.PUBLISHED]: {
    [OrderStatus.HAS_RESPONSES]: {
      requiresParticipant: 'system',
      description: 'System transition when first application is submitted',
    },
    [OrderStatus.CLAIMED]: {
      requiresParticipant: 'system',
      description: 'System transition when application is accepted',
    },
    [OrderStatus.CANCELLED]: {
      requiresParticipant: 'employer',
      description: 'Employer cancels the published order',
    },
  },
  [OrderStatus.HAS_RESPONSES]: {
    [OrderStatus.PUBLISHED]: {
      requiresParticipant: 'system',
      description: 'System transition when last application is removed',
    },
    [OrderStatus.CLAIMED]: {
      requiresParticipant: 'system',
      description: 'System transition when application is accepted',
    },
    [OrderStatus.CANCELLED]: {
      requiresParticipant: 'employer',
      description: 'Employer cancels the order with responses',
    },
  },
  [OrderStatus.CLAIMED]: {
    [OrderStatus.IN_PROGRESS]: {
      requiresParticipant: 'executor',
      description: 'Executor starts the work',
    },
    [OrderStatus.CANCELLED]: {
      requiresParticipant: 'employer',
      description: 'Employer cancels the order before work starts',
    },
    [OrderStatus.DISPUTE]: {
      requiresParticipant: 'any',
      description: 'Dispute is opened on the claimed order',
    },
  },
  [OrderStatus.IN_PROGRESS]: {
    [OrderStatus.COMPLETED]: {
      requiresParticipant: 'executor',
      description: 'Executor completes the work',
    },
    [OrderStatus.DISPUTE]: {
      requiresParticipant: 'any',
      description: 'Dispute is opened on the in-progress order',
    },
  },
  [OrderStatus.COMPLETED]: {
    [OrderStatus.REVIEWED]: {
      requiresParticipant: 'system',
      description: 'Mutual reviews are completed',
    },
    [OrderStatus.DISPUTE]: {
      requiresParticipant: 'any',
      description: 'Dispute is opened on the completed order',
    },
  },
  [OrderStatus.CANCELLED]: {},
  [OrderStatus.DISPUTE]: {},
  [OrderStatus.REVIEWED]: {},
};
