import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AssistantNoteStatus, AssistantNoteRevisionSource, AssistantNoteAttachmentType } from '@prisma/client';
import { CreateAssistantNoteDto } from './dto/create-assistant-note.dto';
import { UpdateAssistantNoteDto } from './dto/update-assistant-note.dto';
import { AssistantNotesQueryDto } from './dto/assistant-notes-query.dto';
import { LoggerService } from '../logger/logger.service';
import * as fs from 'fs';
import * as path from 'path';

export const MAX_AUDIO_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
export const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/webm',
  'audio/aac',
  'audio/ogg',
  'audio/x-m4a',
  'application/octet-stream',
];

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
        attachments: true,
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
        attachments: { orderBy: { createdAt: 'asc' } },
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
        attachments: { orderBy: { createdAt: 'asc' } },
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
        attachments: { orderBy: { createdAt: 'asc' } },
        revisions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    this.logger.info('ASSISTANT_NOTE_UPDATED', `Updated assistant note ${id}`, { userId, noteId: id });
    return updatedNote;
  }

  async addAudioAttachment(
    userId: string,
    id: string,
    file: Express.Multer.File,
    durationMs?: number,
  ) {
    const note = await this.findOne(userId, id);

    if (!file) {
      throw new BadRequestException('Audio file is required');
    }

    if (file.size > MAX_AUDIO_FILE_SIZE_BYTES) {
      throw new BadRequestException(`File size exceeds maximum allowed limit of ${MAX_AUDIO_FILE_SIZE_BYTES / (1024 * 1024)}MB`);
    }

    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_AUDIO_MIME_TYPES.includes(mime)) {
      throw new BadRequestException(`Unsupported audio MIME type: ${file.mimetype}`);
    }

    const uploadDir = path.join(process.cwd(), 'uploads', 'assistant-audio');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const ext = path.extname(file.originalname) || '.m4a';
    const filename = `${id}_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
    const filePath = path.join(uploadDir, filename);

    if (file.buffer) {
      fs.writeFileSync(filePath, file.buffer);
    }

    const fileUrl = `/uploads/assistant-audio/${filename}`;

    const attachment = await this.prisma.assistantNoteAttachment.create({
      data: {
        noteId: id,
        type: AssistantNoteAttachmentType.AUDIO,
        url: fileUrl,
        mimeType: file.mimetype || 'audio/m4a',
        size: file.size,
        durationMs: durationMs ? Number(durationMs) : undefined,
      },
    });

    await this.prisma.assistantNoteRevision.create({
      data: {
        noteId: id,
        source: AssistantNoteRevisionSource.VOICE,
        newData: {
          attachmentId: attachment.id,
          url: fileUrl,
          durationMs: attachment.durationMs,
          mimeType: attachment.mimeType,
        },
      },
    });

    this.logger.info('ASSISTANT_NOTE_AUDIO_ADDED', `Added audio attachment ${attachment.id} to note ${id}`, { userId, noteId: id });

    return this.findOne(userId, id);
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
        attachments: { orderBy: { createdAt: 'asc' } },
        revisions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    this.logger.info('ASSISTANT_NOTE_ARCHIVED', `Archived assistant note ${id}`, { userId, noteId: id });
    return archivedNote;
  }
}
