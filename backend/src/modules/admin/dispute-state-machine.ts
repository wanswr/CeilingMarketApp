import { DisputeStatus, Role } from '@prisma/client';

export interface DisputeTransitionRule {
  allowedRoles: Role[];
  description: string;
}

export const DISPUTE_STATE_MACHINE: Record<
  DisputeStatus,
  Partial<Record<DisputeStatus, DisputeTransitionRule>>
> = {
  [DisputeStatus.OPEN]: {
    [DisputeStatus.IN_REVIEW]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin picks up dispute for review',
    },
    [DisputeStatus.UNDER_REVIEW]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin puts dispute under active review',
    },
    [DisputeStatus.WAITING_FOR_PARTY]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin waits for additional information from participant',
    },
    [DisputeStatus.RESOLVED]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin resolves dispute directly',
    },
    [DisputeStatus.REJECTED]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin rejects dispute directly',
    },
  },
  [DisputeStatus.IN_REVIEW]: {
    [DisputeStatus.UNDER_REVIEW]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin puts dispute under active review',
    },
    [DisputeStatus.WAITING_FOR_PARTY]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin waits for party input',
    },
    [DisputeStatus.RESOLVED]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin resolves dispute',
    },
    [DisputeStatus.REJECTED]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin rejects dispute',
    },
  },
  [DisputeStatus.UNDER_REVIEW]: {
    [DisputeStatus.WAITING_FOR_PARTY]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin waits for party input',
    },
    [DisputeStatus.RESOLVED]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin resolves dispute',
    },
    [DisputeStatus.REJECTED]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin rejects dispute',
    },
  },
  [DisputeStatus.WAITING_FOR_PARTY]: {
    [DisputeStatus.IN_REVIEW]: {
      allowedRoles: [Role.ADMIN],
      description: 'Party responds, admin resumes review',
    },
    [DisputeStatus.UNDER_REVIEW]: {
      allowedRoles: [Role.ADMIN],
      description: 'Party responds, admin resumes review',
    },
    [DisputeStatus.RESOLVED]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin resolves dispute',
    },
    [DisputeStatus.REJECTED]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin rejects dispute',
    },
  },
  [DisputeStatus.RESOLVED]: {
    [DisputeStatus.APPEALED]: {
      allowedRoles: [Role.EMPLOYER, Role.WORKER],
      description: 'Participant appeals resolved dispute',
    },
    [DisputeStatus.CLOSED]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin closes resolved dispute',
    },
  },
  [DisputeStatus.REJECTED]: {
    [DisputeStatus.APPEALED]: {
      allowedRoles: [Role.EMPLOYER, Role.WORKER],
      description: 'Participant appeals rejected dispute',
    },
    [DisputeStatus.CLOSED]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin closes rejected dispute',
    },
  },
  [DisputeStatus.APPEALED]: {
    [DisputeStatus.RESOLVED]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin resolves appeal',
    },
    [DisputeStatus.REJECTED]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin rejects appeal',
    },
    [DisputeStatus.CLOSED]: {
      allowedRoles: [Role.ADMIN],
      description: 'Admin closes appealed dispute',
    },
  },
  [DisputeStatus.CLOSED]: {},
};

export function validateDisputeTransition(
  fromStatus: DisputeStatus,
  toStatus: DisputeStatus,
  userRole: Role
): void {
  if (fromStatus === toStatus) {
    throw new Error(`Dispute is already in status ${fromStatus}`);
  }

  const currentTransitions = DISPUTE_STATE_MACHINE[fromStatus];
  if (!currentTransitions) {
    throw new Error(`Cannot transition dispute from ${fromStatus} to ${toStatus}`);
  }

  const rule = currentTransitions[toStatus];
  if (!rule) {
    throw new Error(`Cannot transition dispute from ${fromStatus} to ${toStatus}`);
  }

  if (!rule.allowedRoles.includes(userRole)) {
    throw new Error(`Role ${userRole} is not authorized to transition dispute from ${fromStatus} to ${toStatus}`);
  }
}
