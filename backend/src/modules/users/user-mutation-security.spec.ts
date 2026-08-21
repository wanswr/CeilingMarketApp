import { UsersService } from './users.service';
import { ForbiddenException } from '@nestjs/common';

describe('UsersService.assertUserCanMutate', () => {
  let service: UsersService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
    };
    service = new UsersService(mockPrisma as any, null as any);
  });

  it('allows active non-blocked user to mutate', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      isBlocked: false,
      deletedAt: null,
    });

    const user = await service.assertUserCanMutate('user-1');
    expect(user.id).toBe('user-1');
  });

  it('blocks user if isBlocked is true', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-blocked',
      isBlocked: true,
      deletedAt: null,
    });

    await expect(service.assertUserCanMutate('user-blocked')).rejects.toThrow(
      new ForbiddenException('Blocked users cannot perform this action')
    );
  });

  it('blocks user if deletedAt is set', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-deleted',
      isBlocked: false,
      deletedAt: new Date(),
    });

    await expect(service.assertUserCanMutate('user-deleted')).rejects.toThrow(
      new ForbiddenException('User account is deleted or non-existent')
    );
  });

  it('blocks non-existent user', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(service.assertUserCanMutate('non-existent')).rejects.toThrow(
      new ForbiddenException('User account is deleted or non-existent')
    );
  });
});
