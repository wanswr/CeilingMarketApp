import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('update', () => {
    it('should successfully update name and avatar without changing role', async () => {
      const userId = 'user-1';
      const dto = { name: 'New Name', avatar: 'new-avatar.png' };
      const updatedUser = { id: userId, name: 'New Name', avatar: 'new-avatar.png', role: null };

      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.update(userId, dto);

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { name: 'New Name', avatar: 'new-avatar.png' },
      });
      expect(result).toEqual(updatedUser);
    });

    it('should allow setting role if current role is null', async () => {
      const userId = 'user-2';
      const dto = { role: 'WORKER' };
      const currentUser = { id: userId, role: null };
      const updatedUser = { id: userId, role: 'WORKER' };

      mockPrismaService.user.findUnique.mockResolvedValue(currentUser);
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.update(userId, dto);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { role: 'WORKER' },
      });
      expect(result).toEqual(updatedUser);
    });

    it('should reject changing role if role is already set', async () => {
      const userId = 'user-3';
      const dto = { role: 'EMPLOYER' };
      const currentUser = { id: userId, role: 'WORKER' };

      mockPrismaService.user.findUnique.mockResolvedValue(currentUser);

      await expect(service.update(userId, dto)).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({ where: { id: userId } });
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });
  });
});
