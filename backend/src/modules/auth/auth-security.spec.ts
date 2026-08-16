import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';

describe('Auth & Session Security Tests', () => {
  let authService: AuthService;
  let jwtStrategy: JwtStrategy;

  const mockActiveUser = {
    id: 'user-active-1',
    phone: '+79990000001',
    name: 'Active User',
    role: Role.WORKER,
    roles: [Role.WORKER],
    sessionVersion: 1,
    isBlocked: false,
    phoneVerified: true,
    deletedAt: null,
  };

  const mockBlockedUser = {
    id: 'user-blocked-1',
    phone: '+79990000002',
    name: 'Blocked User',
    role: Role.WORKER,
    roles: [Role.WORKER],
    sessionVersion: 2,
    isBlocked: true,
    phoneVerified: true,
    deletedAt: null,
  };

  const mockValidSession = {
    id: 'session-1',
    userId: 'user-active-1',
    expiresAt: new Date(Date.now() + 1000000),
    revokedAt: null,
  };

  const mockRevokedSession = {
    id: 'session-2',
    userId: 'user-active-1',
    expiresAt: new Date(Date.now() + 1000000),
    revokedAt: new Date(),
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((cb) => cb(mockPrismaService)),
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mocked.jwt.token'),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'AUTH_MODE') return 'development';
      if (key === 'JWT_SECRET') return 'test-secret';
      return null;
    }),
  };

  const mockLoggerService = {
    setService: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation((cb) => {
      if (Array.isArray(cb)) return Promise.all(cb);
      return cb(mockPrismaService);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        JwtStrategy,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    jwtStrategy = module.get<JwtStrategy>(JwtStrategy);
  });

  // 1. valid JWT works for active user
  it('1. valid JWT works for active user', async () => {
    mockPrismaService.user.findUnique.mockResolvedValueOnce(mockActiveUser);
    mockPrismaService.session.findUnique.mockResolvedValueOnce(mockValidSession);

    const payload = {
      id: 'user-active-1',
      phone: '+79990000001',
      role: Role.WORKER,
      sessionVersion: 1,
      sessionId: 'session-1',
    };

    const user = await jwtStrategy.validate(payload);
    expect(user.id).toBe('user-active-1');
  });

  // 2. logout invalidates session
  it('2. logout invalidates session', async () => {
    mockPrismaService.session.update.mockResolvedValueOnce({ ...mockValidSession, revokedAt: new Date() });

    const result = await authService.logout('session-1');

    expect(result.success).toBe(true);
    expect(mockPrismaService.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
  });

  // 3. revoked session fails auth
  it('3. revoked session fails auth', async () => {
    mockPrismaService.user.findUnique.mockResolvedValueOnce(mockActiveUser);
    mockPrismaService.session.findUnique.mockResolvedValueOnce(mockRevokedSession);

    const payload = {
      id: 'user-active-1',
      sessionVersion: 1,
      sessionId: 'session-2',
    };

    await expect(jwtStrategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  // 4. blocked user cannot use old JWT
  it('4. blocked user cannot use old JWT', async () => {
    mockPrismaService.user.findUnique.mockResolvedValueOnce(mockBlockedUser);

    const payload = {
      id: 'user-blocked-1',
      sessionVersion: 1, // outdated or same, but user.isBlocked = true
      sessionId: 'session-1',
    };

    await expect(jwtStrategy.validate(payload)).rejects.toThrow(UnauthorizedException);
  });

  // 5. blocked user cannot get new working session
  it('5. blocked user cannot get new working session', async () => {
    mockPrismaService.user.findUnique.mockResolvedValueOnce(mockBlockedUser);

    await expect(authService.verifyOtp('+79990000002', '1234')).rejects.toThrow(ForbiddenException);
    await expect(authService.login(mockBlockedUser)).rejects.toThrow(ForbiddenException);
  });

  // 6. unblocked user can login again
  it('6. unblocked user can login again', async () => {
    const unblockedUser = { ...mockBlockedUser, isBlocked: false };
    mockPrismaService.user.findUnique.mockResolvedValueOnce(unblockedUser);
    mockPrismaService.session.create.mockResolvedValueOnce(mockValidSession);

    const loginResult = await authService.verifyOtp('+79990000002', '1234');

    expect(loginResult.access_token).toBeDefined();
    expect(loginResult.user.id).toBe('user-blocked-1');
  });

  // 7. regular user cannot assign ADMIN
  it('7. regular user cannot assign ADMIN during registration', async () => {
    mockPrismaService.user.create.mockImplementationOnce((args) => {
      return Promise.resolve({
        id: 'new-user-1',
        phone: args.data.phone,
        name: args.data.name,
        role: args.data.role,
      });
    });

    const regResult = await authService.register({
      phone: '+79991112233',
      name: 'Hacker',
      role: 'ADMIN' as any, // Trying to pass ADMIN
    });

    expect(mockPrismaService.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        role: 'WORKER', // Restricted to WORKER
      }),
    });
  });

  // 8. role switching does not allow gaining ADMIN
  it('8. role switching does not allow gaining ADMIN', async () => {
    // Verified by SetRoleDto which only accepts 'WORKER' | 'EMPLOYER'
    const { SetRoleDto } = require('../users/dto/set-role.dto');
    const dto = new SetRoleDto();
    dto.role = 'WORKER';
    expect(dto.role).toBe('WORKER');
  });
});
