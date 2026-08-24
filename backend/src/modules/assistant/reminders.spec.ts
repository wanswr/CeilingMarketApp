import { Test, TestingModule } from '@nestjs/testing';
import { RemindersService } from './reminders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { AssistantReminderStatus } from '@prisma/client';

describe('Assistant Reminders Unit & Integration Tests', () => {
  let service: RemindersService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      assistantNote: {
        findUnique: jest.fn(),
      },
      assistantReminder: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemindersService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: LoggerService,
          useValue: {
            setContext: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RemindersService>(RemindersService);
  });

  describe('1. Creation & Future Time Validation', () => {
    it('throws BadRequestException if scheduledAt is in the past', async () => {
      const pastDateIso = new Date(Date.now() - 3600000).toISOString();

      await expect(
        service.create('user-1', {
          title: 'Заказать полотно',
          scheduledAt: pastDateIso,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully creates reminder when scheduledAt is in the future', async () => {
      const futureDateIso = new Date(Date.now() + 86400000).toISOString();
      const mockReminder = {
        id: 'rem-1',
        userId: 'user-1',
        title: 'Заказать полотно',
        scheduledAt: new Date(futureDateIso),
        status: AssistantReminderStatus.SCHEDULED,
      };

      prismaMock.assistantReminder.create.mockResolvedValue(mockReminder);

      const result = await service.create('user-1', {
        title: 'Заказать полотно',
        scheduledAt: futureDateIso,
      });

      expect(result).toEqual(mockReminder);
      expect(prismaMock.assistantReminder.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          title: 'Заказать полотно',
          status: AssistantReminderStatus.SCHEDULED,
        }),
      });
    });
  });

  describe('2. Idempotency & Duplicate Prevention', () => {
    it('returns existing reminder if idempotencyKey matches', async () => {
      const futureDateIso = new Date(Date.now() + 86400000).toISOString();
      const existing = { id: 'rem-1', userId: 'user-1', idempotencyKey: 'key-123' };

      prismaMock.assistantReminder.findFirst.mockResolvedValue(existing);

      const result = await service.create('user-1', {
        title: 'Заказать полотно',
        scheduledAt: futureDateIso,
        idempotencyKey: 'key-123',
      });

      expect(result).toEqual(existing);
      expect(prismaMock.assistantReminder.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException if an active SCHEDULED reminder already exists for the same noteId and sourceTaskId', async () => {
      const futureDateIso = new Date(Date.now() + 86400000).toISOString();

      prismaMock.assistantReminder.findFirst.mockResolvedValue({
        id: 'existing-rem',
        status: AssistantReminderStatus.SCHEDULED,
      });

      await expect(
        service.create('user-1', {
          title: 'Заказать полотно',
          scheduledAt: futureDateIso,
          noteId: 'note-1',
          sourceTaskId: 'task-1',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('3. Authorization & IDOR Protection', () => {
    it('throws ForbiddenException when accessing another user reminder', async () => {
      prismaMock.assistantReminder.findUnique.mockResolvedValue({
        id: 'rem-1',
        userId: 'user-2',
      });

      await expect(service.findOne('user-1', 'rem-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException if reminder does not exist', async () => {
      prismaMock.assistantReminder.findUnique.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('4. Complete & Cancel Transitions', () => {
    it('successfully completes scheduled reminder', async () => {
      const mockReminder = { id: 'rem-1', userId: 'user-1', status: AssistantReminderStatus.SCHEDULED };
      prismaMock.assistantReminder.findUnique.mockResolvedValue(mockReminder);
      prismaMock.assistantReminder.update.mockResolvedValue({
        ...mockReminder,
        status: AssistantReminderStatus.COMPLETED,
        completedAt: new Date(),
      });

      const result = await service.complete('user-1', 'rem-1');

      expect(result.status).toBe(AssistantReminderStatus.COMPLETED);
      expect(prismaMock.assistantReminder.update).toHaveBeenCalledWith({
        where: { id: 'rem-1' },
        data: expect.objectContaining({
          status: AssistantReminderStatus.COMPLETED,
        }),
      });
    });

    it('successfully cancels scheduled reminder', async () => {
      const mockReminder = { id: 'rem-1', userId: 'user-1', status: AssistantReminderStatus.SCHEDULED };
      prismaMock.assistantReminder.findUnique.mockResolvedValue(mockReminder);
      prismaMock.assistantReminder.update.mockResolvedValue({
        ...mockReminder,
        status: AssistantReminderStatus.CANCELLED,
        cancelledAt: new Date(),
      });

      const result = await service.cancel('user-1', 'rem-1');

      expect(result.status).toBe(AssistantReminderStatus.CANCELLED);
    });
  });
});
