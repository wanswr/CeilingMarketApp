import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AssistantNoteStatus, AssistantNoteRevisionSource } from '@prisma/client';
import { CreateAssistantNoteDto } from './dto/create-assistant-note.dto';
import { UpdateAssistantNoteDto } from './dto/update-assistant-note.dto';
import { AssistantNotesQueryDto } from './dto/assistant-notes-query.dto';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class AssistantService {
  constructor(
    private prisma: PrismaService,
    private logger: LoggerService,
  ) {
    this.logger.setService('AssistantService');
  }

  async create(userId: string, dto: CreateAssistantNoteDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new ForbiddenException('User account is deleted');
    }

    const initialStatus = dto.structuredData ? AssistantNoteStatus.STRUCTURED : AssistantNoteStatus.DRAFT;

    const note = await this.prisma.assistantNote.create({
      data: {
        userId,
        title: dto.title,
        rawText: dto.rawText,
        structuredData: dto.structuredData ?? undefined,
        status: initialStatus,
        revisions: {
          create: {
            source: AssistantNoteRevisionSource.MANUAL,
            rawInput: dto.rawText,
            newData: {
              title: dto.title,
              rawText: dto.rawText,
              structuredData: dto.structuredData,
            },
          },
        },
      },
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    this.logger.info('ASSISTANT_NOTE_CREATED', `Created assistant note ${note.id}`, { userId, noteId: note.id });
    return note;
  }

  async findAll(userId: string, query: AssistantNotesQueryDto) {
    const skip = query.skip !== undefined ? Number(query.skip) : undefined;
    const take = query.take !== undefined ? Number(query.take) : 50;

    const whereCondition: any = {
      userId,
    };

    if (!query.includeArchived) {
      whereCondition.status = { not: AssistantNoteStatus.ARCHIVED };
    }

    return this.prisma.assistantNote.findMany({
      where: whereCondition,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async findOne(userId: string, id: string) {
    const note = await this.prisma.assistantNote.findUnique({
      where: { id },
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!note) {
      throw new NotFoundException('Assistant note not found');
    }

    if (note.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this note');
    }

    return note;
  }

  async update(userId: string, id: string, dto: UpdateAssistantNoteDto) {
    const note = await this.findOne(userId, id);

    const titleChanged = dto.title !== undefined && dto.title !== note.title;
    const rawTextChanged = dto.rawText !== undefined && dto.rawText !== note.rawText;
    const structuredDataChanged =
      dto.structuredData !== undefined &&
      JSON.stringify(dto.structuredData) !== JSON.stringify(note.structuredData);

    const isContentModified = titleChanged || rawTextChanged || structuredDataChanged;

    if (!isContentModified) {
      return note;
    }

    const previousData = {
      title: note.title,
      rawText: note.rawText,
      structuredData: note.structuredData,
    };

    const newTitle = dto.title !== undefined ? dto.title : note.title;
    const newRawText = dto.rawText !== undefined ? dto.rawText : note.rawText;
    const newStructuredData =
      dto.structuredData !== undefined ? dto.structuredData : note.structuredData;

    const newData = {
      title: newTitle,
      rawText: newRawText,
      structuredData: newStructuredData,
    };

    const newStatus = newStructuredData ? AssistantNoteStatus.STRUCTURED : AssistantNoteStatus.DRAFT;

    const updatedNote = await this.prisma.assistantNote.update({
      where: { id },
      data: {
        title: newTitle,
        rawText: newRawText,
        structuredData: newStructuredData ?? undefined,
        status: note.status === AssistantNoteStatus.ARCHIVED ? AssistantNoteStatus.ARCHIVED : newStatus,
        revisions: {
          create: {
            source: AssistantNoteRevisionSource.MANUAL,
            rawInput: dto.rawText,
            previousData,
            newData,
          },
        },
      },
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    this.logger.info('ASSISTANT_NOTE_UPDATED', `Updated assistant note ${id}`, { userId, noteId: id });
    return updatedNote;
  }

  async archive(userId: string, id: string) {
    const note = await this.findOne(userId, id);

    if (note.status === AssistantNoteStatus.ARCHIVED) {
      return note;
    }

    const archivedNote = await this.prisma.assistantNote.update({
      where: { id },
      data: {
        status: AssistantNoteStatus.ARCHIVED,
        archivedAt: new Date(),
      },
      include: {
        revisions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    this.logger.info('ASSISTANT_NOTE_ARCHIVED', `Archived assistant note ${id}`, { userId, noteId: id });
    return archivedNote;
  }
}
