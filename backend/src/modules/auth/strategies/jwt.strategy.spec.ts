import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy } from './jwt.strategy';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('your-super-secret-key'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  describe('validate', () => {
    it('should successfully validate payload if user exists and is not deleted', async () => {
      const payload = { id: 'user-123', phone: '+79998887766', role: 'WORKER' };
      const user = { id: 'user-123', phone: '+79998887766', role: 'WORKER', deletedAt: null };

      mockPrismaService.user.findUnique.mockResolvedValue(user);

      const result = await strategy.validate(payload);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: payload.id },
      });
      expect(result).toEqual({
        id: payload.id,
        phone: payload.phone,
        role: payload.role,
      });
    });

    it('should throw UnauthorizedException if user does not exist in the database', async () => {
      const payload = { id: 'user-non-existent', phone: '+79998887766', role: 'WORKER' };

      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: payload.id },
      });
    });

    it('should throw UnauthorizedException if user has deletedAt date set', async () => {
      const payload = { id: 'user-deleted', phone: '+79998887766', role: 'WORKER' };
      const user = { id: 'user-deleted', phone: `deleted_user-deleted`, role: 'WORKER', deletedAt: new Date() };

      mockPrismaService.user.findUnique.mockResolvedValue(user);

      await expect(strategy.validate(payload)).rejects.toThrow(UnauthorizedException);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: payload.id },
      });
    });
  });
});
