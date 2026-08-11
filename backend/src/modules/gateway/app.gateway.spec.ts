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
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'user-deleted', deletedAt: new Date() }); // Soft-deleted

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-deleted' } });
    });

    it('should reject connection if token is passed only in query string', async () => {
      const mockSocket = {
        id: 'socket-2',
        handshake: {
          auth: null,
          query: { token: 'query-token' },
        },
        disconnect: jest.fn(),
      } as any;

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
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
