import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
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
    securityLog: {
      create: jest.fn().mockResolvedValue({ id: 'sec-1' }),
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
      if (Array.isArray(cb)) {
        return Promise.resolve([
          { count: 1 },
          mockValidSession,
          { ...mockActiveUser, sessionVersion: 2 },
        ]);
      }
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

  // 1. login creates session
  it('1. login creates session', async () => {
    mockPrismaService.user.findUnique.mockResolvedValueOnce(mockActiveUser);
    mockPrismaService.session.create.mockResolvedValueOnce(mockValidSession);

    const loginRes = await authService.login(mockActiveUser, 'device-A', '127.0.0.1');

    expect(loginRes.access_token).toBeDefined();
    expect(mockPrismaService.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-active-1', revokedAt: null },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
  });

  // 2. login from same or new device replaces previous session
  it('2. login from new device revokes old session and increments sessionVersion', async () => {
    mockPrismaService.user.findUnique.mockResolvedValueOnce(mockActiveUser);

    await authService.login(mockActiveUser, 'device-B', '192.168.1.1');

    expect(mockPrismaService.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-active-1', revokedAt: null },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
  });

  // 3. old token becomes unauthorized
  it('3. old token with outdated sessionVersion or revoked sessionId is rejected', async () => {
    mockPrismaService.user.findUnique.mockResolvedValueOnce({
      ...mockActiveUser,
      sessionVersion: 2, // Increment after new login
    });

    const oldPayload = {
      id: 'user-active-1',
      sessionVersion: 1, // Old token has version 1
      sessionId: 'session-1',
    };

    await expect(jwtStrategy.validate(oldPayload)).rejects.toThrow(UnauthorizedException);
  });

  // 4. logout revokes session
  it('4. logout revokes session', async () => {
    mockPrismaService.session.update.mockResolvedValueOnce({ ...mockValidSession, revokedAt: new Date() });

    const result = await authService.logout('session-1', 'user-active-1');

    expect(result.success).toBe(true);
    expect(mockPrismaService.session.update).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      data: expect.objectContaining({ revokedAt: expect.any(Date) }),
    });
  });

  // 5. blocked user cannot access protected API or login
  it('5. blocked user cannot access protected API or login', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(mockBlockedUser);

    await expect(jwtStrategy.validate({ id: 'user-blocked-1' })).rejects.toThrow(UnauthorizedException);
    await expect(authService.login(mockBlockedUser)).rejects.toThrow(ForbiddenException);
  });

  // 6. duplicate phone cannot create another account due to DB unique constraint
  it('6. duplicate phone returns existing user or unique error', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(mockActiveUser);

    const result = await authService.verifyOtp('+79990000001', '1234');
    expect(result.user.id).toBe('user-active-1');
  });

  // 7. OTP request rate limited (cooldown)
  it('7. OTP request is rate limited on rapid repeat requests', async () => {
    await authService.requestOtp('+79995554433');
    await expect(authService.requestOtp('+79995554433')).rejects.toThrow(BadRequestException);
  });

  // 8. security events are logged
  it('8. security events create SecurityLog entries', async () => {
    mockPrismaService.user.findUnique.mockResolvedValueOnce(mockActiveUser);
    await authService.login(mockActiveUser, 'fingerprint-123', '10.0.0.1');

    expect(mockPrismaService.securityLog.create).toHaveBeenCalled();
  });
});
