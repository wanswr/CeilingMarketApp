import { Test, TestingModule } from '@nestjs/testing';
import { AppGateway } from './app.gateway';
import { LoggerService } from '../logger/logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';

jest.mock('jsonwebtoken');

describe('AppGateway', () => {
  let gateway: AppGateway;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    session: {
      findUnique: jest.fn(),
    },
    order: {
      findUnique: jest.fn(),
    },
    chat: {
      findMany: jest.fn(),
    },
  };

  const mockLoggerService = {
    setService: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const mockServer = {
    emit: jest.fn(),
    to: jest.fn().mockReturnThis(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppGateway,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    gateway = module.get<AppGateway>(AppGateway);
    prisma = module.get<PrismaService>(PrismaService);
    gateway.server = mockServer as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('should disconnect client if user is soft-deleted or does not exist', async () => {
      const mockSocket = {
        id: 'socket-1',
        handshake: {
          auth: { token: 'Bearer valid-token' },
        },
        disconnect: jest.fn(),
      } as any;

      process.env.JWT_SECRET = 'test-secret';
      (jwt.verify as jest.Mock).mockReturnValue({ id: 'user-deleted' });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-deleted', deletedAt: new Date() });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-deleted' } });
    });

    it('should disconnect client if user is blocked', async () => {
      const mockSocket = {
        id: 'socket-blocked',
        handshake: {
          auth: { token: 'Bearer valid-token' },
        },
        disconnect: jest.fn(),
      } as any;

      process.env.JWT_SECRET = 'test-secret';
      (jwt.verify as jest.Mock).mockReturnValue({ id: 'user-blocked' });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-blocked', deletedAt: null, isBlocked: true });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should disconnect client if sessionVersion mismatch occurs', async () => {
      const mockSocket = {
        id: 'socket-mismatch',
        handshake: {
          auth: { token: 'Bearer valid-token' },
        },
        disconnect: jest.fn(),
      } as any;

      process.env.JWT_SECRET = 'test-secret';
      (jwt.verify as jest.Mock).mockReturnValue({ id: 'user-1', sessionVersion: 1 });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-1', deletedAt: null, isBlocked: false, sessionVersion: 2 });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should disconnect client if session is revoked or expired', async () => {
      const mockSocket = {
        id: 'socket-revoked',
        handshake: {
          auth: { token: 'Bearer valid-token' },
        },
        disconnect: jest.fn(),
      } as any;

      process.env.JWT_SECRET = 'test-secret';
      (jwt.verify as jest.Mock).mockReturnValue({ id: 'user-1', sessionVersion: 1, sessionId: 'sess-1' });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-1', deletedAt: null, isBlocked: false, sessionVersion: 1 });
      mockPrismaService.session.findUnique.mockResolvedValue({ id: 'sess-1', revokedAt: new Date(), expiresAt: new Date(Date.now() + 10000) });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should authenticate client successfully when user and session are valid', async () => {
      const mockSocket = {
        id: 'socket-ok',
        handshake: {
          auth: { token: 'Bearer valid-token' },
        },
        disconnect: jest.fn(),
      } as any;

      process.env.JWT_SECRET = 'test-secret';
      (jwt.verify as jest.Mock).mockReturnValue({ id: 'user-1', sessionVersion: 1, sessionId: 'sess-1' });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-1', deletedAt: null, isBlocked: false, sessionVersion: 1 });
      mockPrismaService.session.findUnique.mockResolvedValue({ id: 'sess-1', revokedAt: null, expiresAt: new Date(Date.now() + 10000) });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).not.toHaveBeenCalled();
      expect((mockSocket as any).userId).toBe('user-1');
    });
  });

  describe('broadcast', () => {
    it('should log a warning and not emit on unknown events', async () => {
      await gateway.broadcast('some.unknown.event', { foo: 'bar' });

      expect(mockServer.emit).not.toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        'WS_BROADCAST_UNKNOWN_EVENT',
        expect.any(String),
        expect.any(Object),
      );
    });
  });
});
