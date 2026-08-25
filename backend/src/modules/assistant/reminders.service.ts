import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';
import { AssistantReminderStatus } from '@prisma/client';

@Injectable()
export class RemindersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setContext('RemindersService');
  }

  async create(userId: string, dto: CreateReminderDto) {
    const scheduledDate = new Date(dto.scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      throw new BadRequestException('Invalid scheduledAt date format');
    }

    if (scheduledDate.getTime() <= Date.now()) {
      throw new BadRequestException('Reminder time must be in the future.');
    }

    // Verify note ownership if noteId provided
    if (dto.noteId) {
      const note = await this.prisma.assistantNote.findUnique({
        where: { id: dto.noteId },
      });
      if (!note) {
        throw new NotFoundException('Linked note not found');
      }
      if (note.userId !== userId) {
        throw new ForbiddenException('You do not own the linked note');
      }
    }

    // Idempotency check via idempotencyKey
    if (dto.idempotencyKey) {
      const existingKey = await this.prisma.assistantReminder.findFirst({
        where: { userId, idempotencyKey: dto.idempotencyKey },
      });
      if (existingKey) {
        this.logger.info('REMINDER_IDEMPOTENCY_MATCH', `Matched idempotency key ${dto.idempotencyKey}`);
        return existingKey;
      }
    }

    // Duplicate check for active SCHEDULED reminder on same noteId & sourceTaskId
    if (dto.noteId && dto.sourceTaskId) {
      const existingActive = await this.prisma.assistantReminder.findFirst({
        where: {
          userId,
          noteId: dto.noteId,
          sourceTaskId: dto.sourceTaskId,
          status: AssistantReminderStatus.SCHEDULED,
        },
      });
      if (existingActive) {
        throw new ConflictException(
          'An active scheduled reminder already exists for this task.',
        );
      }
    }

    try {
      const reminder = await this.prisma.assistantReminder.create({
        data: {
          userId,
          noteId: dto.noteId || null,
          title: dto.title,
          description: dto.description || null,
          scheduledAt: scheduledDate,
          status: AssistantReminderStatus.SCHEDULED,
          sourceTaskId: dto.sourceTaskId || null,
          sourceDateId: dto.sourceDateId || null,
          notificationId: dto.notificationId || null,
          idempotencyKey: dto.idempotencyKey || null,
        },
      });

      this.logger.info('REMINDER_CREATED', `Created reminder ${reminder.id}`, { userId });
      return reminder;
    } catch (error: any) {
      if (error?.code === 'P2002' && dto.idempotencyKey) {
        const existingKey = await this.prisma.assistantReminder.findFirst({
          where: { userId, idempotencyKey: dto.idempotencyKey },
        });
        if (existingKey) {
          this.logger.info('REMINDER_IDEMPOTENCY_CONCURRENT_MATCH', `Caught duplicate unique index for key ${dto.idempotencyKey}`);
          return existingKey;
        }
      }
      throw error;
    }

    this.logger.info('REMINDER_CREATED', `Created reminder ${reminder.id}`, { userId });
    return reminder;
  }

  async findAll(userId: string, noteId?: string) {
    const where: any = { userId };
    if (noteId) where.noteId = noteId;

    return this.prisma.assistantReminder.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async findOne(userId: string, id: string) {
    const reminder = await this.prisma.assistantReminder.findUnique({
      where: { id },
    });

    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    if (reminder.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this reminder');
    }

    return reminder;
  }

  async update(userId: string, id: string, dto: UpdateReminderDto) {
    await this.findOne(userId, id);

    const updateData: any = {};
    if (dto.title !== undefined) updateData.title = dto.title;
    if (dto.description !== undefined) updateData.description = dto.description;
    if (dto.notificationId !== undefined) updateData.notificationId = dto.notificationId;

    if (dto.scheduledAt !== undefined) {
      const scheduledDate = new Date(dto.scheduledAt);
      if (isNaN(scheduledDate.getTime())) {
        throw new BadRequestException('Invalid scheduledAt date format');
      }
      if (scheduledDate.getTime() <= Date.now()) {
        throw new BadRequestException('Reminder time must be in the future.');
      }
      updateData.scheduledAt = scheduledDate;
    }

    const updated = await this.prisma.assistantReminder.update({
      where: { id },
      data: updateData,
    });

    this.logger.info('REMINDER_UPDATED', `Updated reminder ${id}`, { userId });
    return updated;
  }

  async complete(userId: string, id: string) {
    await this.findOne(userId, id);

    const completed = await this.prisma.assistantReminder.update({
      where: { id },
      data: {
        status: AssistantReminderStatus.COMPLETED,
        completedAt: new Date(),
      },
    });

    this.logger.info('REMINDER_COMPLETED', `Completed reminder ${id}`, { userId });
    return completed;
  }

  async cancel(userId: string, id: string) {
    await this.findOne(userId, id);

    const cancelled = await this.prisma.assistantReminder.update({
      where: { id },
      data: {
        status: AssistantReminderStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    this.logger.info('REMINDER_CANCELLED', `Cancelled reminder ${id}`, { userId });
    return cancelled;
  }
}
