import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { AiService } from '../ai/ai.service';
import { CreateAssistantNoteDto } from './dto/create-assistant-note.dto';
import { UpdateAssistantNoteDto } from './dto/update-assistant-note.dto';
import { AssistantNotesQueryDto } from './dto/assistant-notes-query.dto';
import { ConfigService } from '@nestjs/config';
import {
  AssistantNoteStatus,
  AssistantNoteRevisionSource,
  AssistantNoteAttachmentType,
  AssistantNoteTranscriptionStatus,
  AssistantNoteAnalysisStatus,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const ALLOWED_AUDIO_MIME_TYPES = [
  'audio/m4a',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/webm',
  'audio/ogg',
  'audio/3gpp',
];

const MAX_AUDIO_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

@Injectable()
export class AssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
    private readonly aiService: AiService,
    private readonly configService: ConfigService,
  ) {
    this.logger.setContext('AssistantService');
  }

  computeAnalysisInputHash(rawText?: string | null, transcriptions: string[] = []): string {
    const normalizedRaw = (rawText || '').trim();
    const normalizedTranscriptions = transcriptions.map((t) => t.trim()).filter(Boolean);

    const combinedPayload = JSON.stringify({
      rawText: normalizedRaw,
      transcriptions: normalizedTranscriptions,
    });

    return crypto.createHash('sha256').update(combinedPayload).digest('hex');
  }

  private markAnalysisStaleIfCompleted(existingStatus: AssistantNoteAnalysisStatus): AssistantNoteAnalysisStatus {
    if (
      existingStatus === AssistantNoteAnalysisStatus.COMPLETED ||
      existingStatus === AssistantNoteAnalysisStatus.STALE
    ) {
      return AssistantNoteAnalysisStatus.STALE;
    }
    return existingStatus;
  }

  async create(userId: string, dto: CreateAssistantNoteDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new ForbiddenException('User account is deleted');
    }

    const initialStatus = dto.structuredData
      ? AssistantNoteStatus.STRUCTURED
      : AssistantNoteStatus.DRAFT;

    const note = await this.prisma.assistantNote.create({
      data: {
        userId,
        title: dto.title,
        rawText: dto.rawText,
        structuredData: dto.structuredData,
        status: initialStatus,
        analysisStatus: dto.structuredData
          ? AssistantNoteAnalysisStatus.COMPLETED
          : AssistantNoteAnalysisStatus.IDLE,
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
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    this.logger.info('ASSISTANT_NOTE_CREATED', `Created assistant note ${note.id}`, {
      userId,
      noteId: note.id,
    });
    return note;
  }

  async findAll(userId: string, query: AssistantNotesQueryDto) {
    const where: any = { userId };
    if (!query.includeArchived) {
      where.status = { not: AssistantNoteStatus.ARCHIVED };
    }

    return this.prisma.assistantNote.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.skip,
      take: query.take || 50,
      include: {
        attachments: { orderBy: { createdAt: 'asc' } },
        revisions: {
          take: 1,
          orderBy: { createdAt: 'desc' },
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
    const existingNote = await this.findOne(userId, id);

    const updatedData: any = {};
    let isContentChanged = false;

    if (dto.title !== undefined) updatedData.title = dto.title;
    if (dto.rawText !== undefined) {
      updatedData.rawText = dto.rawText;
      if (dto.rawText !== existingNote.rawText) {
        isContentChanged = true;
      }
    }
    if (dto.structuredData !== undefined) {
      updatedData.structuredData = dto.structuredData;
      if (!existingNote.status || existingNote.status === AssistantNoteStatus.DRAFT) {
        updatedData.status = AssistantNoteStatus.STRUCTURED;
      }
    }
    if (dto.status !== undefined) updatedData.status = dto.status;

    if (isContentChanged) {
      updatedData.analysisStatus = this.markAnalysisStaleIfCompleted(
        existingNote.analysisStatus,
      );
    }

    const updatedNote = await this.prisma.assistantNote.update({
      where: { id },
      data: {
        ...updatedData,
        revisions: {
          create: {
            source: AssistantNoteRevisionSource.MANUAL,
            rawInput: dto.rawText,
            previousData: {
              title: existingNote.title,
              rawText: existingNote.rawText,
              structuredData: existingNote.structuredData,
            },
            newData: updatedData,
          },
        },
      },
      include: {
        attachments: true,
        revisions: {
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    this.logger.info('ASSISTANT_NOTE_UPDATED', `Updated assistant note ${id}`, {
      userId,
      noteId: id,
    });
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

    if (file.size > MAX_AUDIO_SIZE_BYTES) {
      throw new BadRequestException('Audio file exceeds maximum allowed size of 25MB');
    }

    if (file.mimetype && !ALLOWED_AUDIO_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid audio file format. Allowed formats: ${ALLOWED_AUDIO_MIME_TYPES.join(', ')}`,
      );
    }

    const uploadDir = path.join(process.cwd(), 'uploads', 'assistant-audio');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const ext = path.extname(file.originalname) || '.m4a';
    const filename = `note-${id}_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
    const destinationPath = path.join(uploadDir, filename);

    if (file.path && fs.existsSync(file.path)) {
      fs.copyFileSync(file.path, destinationPath);
    } else if (file.buffer) {
      fs.writeFileSync(destinationPath, file.buffer);
    } else {
      throw new BadRequestException('Audio file content is empty');
    }

    const relativeUrl = `/uploads/assistant-audio/${filename}`;

    const attachment = await this.prisma.assistantNoteAttachment.create({
      data: {
        noteId: id,
        type: AssistantNoteAttachmentType.AUDIO,
        fileUrl: relativeUrl,
        fileName: file.originalname || filename,
        fileSize: file.size,
        mimeType: file.mimetype || 'audio/m4a',
        durationMs: durationMs ? Number(durationMs) : null,
        transcriptionStatus: AssistantNoteTranscriptionStatus.PENDING,
      },
    });

    await this.prisma.assistantNoteRevision.create({
      data: {
        noteId: id,
        source: AssistantNoteRevisionSource.VOICE,
        newData: {
          attachmentId: attachment.id,
          url: relativeUrl,
          durationMs,
          mimeType: file.mimetype,
        },
      },
    });

    this.logger.info(
      'ASSISTANT_NOTE_AUDIO_ADDED',
      `Added audio attachment ${attachment.id} to note ${id}`,
      { userId, noteId: id },
    );

    return this.findOne(userId, id);
  }

  async transcribeAttachment(userId: string, noteId: string, attachmentId: string) {
    const note = await this.findOne(userId, noteId);

    const attachment = await this.prisma.assistantNoteAttachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment || attachment.noteId !== noteId) {
      throw new NotFoundException('Audio attachment not found for this note');
    }

    if (attachment.type !== AssistantNoteAttachmentType.AUDIO) {
      throw new BadRequestException('Attachment is not an audio file');
    }

    if (attachment.transcriptionStatus === AssistantNoteTranscriptionStatus.COMPLETED) {
      this.logger.info(
        'ASSISTANT_TRANSCRIPTION_SKIPPED',
        `Attachment ${attachmentId} already transcribed`,
        { userId, noteId, attachmentId },
      );
      return this.findOne(userId, noteId);
    }

    if (attachment.transcriptionStatus === AssistantNoteTranscriptionStatus.PROCESSING) {
      this.logger.warn(
        'ASSISTANT_TRANSCRIPTION_CONCURRENT_BLOCKED',
        `Attachment ${attachmentId} is currently being processed`,
        { userId, noteId, attachmentId },
      );
      return this.findOne(userId, noteId);
    }

    await this.prisma.assistantNoteAttachment.update({
      where: { id: attachmentId },
      data: {
        transcriptionStatus: AssistantNoteTranscriptionStatus.PROCESSING,
        transcriptionError: null,
      },
    });

    try {
      const transcriptionText = await this.aiService.transcribeAudio(attachment.fileUrl);

      await this.prisma.assistantNoteAttachment.update({
        where: { id: attachmentId },
        data: {
          transcriptionStatus: AssistantNoteTranscriptionStatus.COMPLETED,
          transcriptionText,
          transcriptionError: null,
        },
      });

      const nextAnalysisStatus = this.markAnalysisStaleIfCompleted(note.analysisStatus);
      if (nextAnalysisStatus !== note.analysisStatus) {
        await this.prisma.assistantNote.update({
          where: { id: noteId },
          data: { analysisStatus: nextAnalysisStatus },
        });
      }

      await this.prisma.assistantNoteRevision.create({
        data: {
          noteId,
          source: AssistantNoteRevisionSource.VOICE,
          rawInput: transcriptionText,
          newData: {
            attachmentId,
            transcriptionText,
          },
        },
      });

      this.logger.info(
        'ASSISTANT_TRANSCRIPTION_SUCCESS',
        `Transcribed attachment ${attachmentId} for note ${noteId}`,
        { userId, noteId, attachmentId },
      );
    } catch (error: any) {
      const safeError = error.message || 'Transcription failed';
      this.logger.error(
        'ASSISTANT_TRANSCRIPTION_FAILED',
        `Transcription failed for attachment ${attachmentId}: ${safeError}`,
      );

      await this.prisma.assistantNoteAttachment.update({
        where: { id: attachmentId },
        data: {
          transcriptionStatus: AssistantNoteTranscriptionStatus.FAILED,
          transcriptionError: safeError,
        },
      });
    }

    return this.findOne(userId, noteId);
  }

  async analyzeNote(userId: string, noteId: string) {
    const note = await this.findOne(userId, noteId);

    const completedTranscriptions = (note.attachments || [])
      .filter(
        (att) =>
          att.type === AssistantNoteAttachmentType.AUDIO &&
          att.transcriptionStatus === AssistantNoteTranscriptionStatus.COMPLETED &&
          att.transcriptionText,
      )
      .map((att) => att.transcriptionText as string);

    const currentHash = this.computeAnalysisInputHash(
      note.rawText,
      completedTranscriptions,
    );

    // Cost & Idempotency guard: Skip OpenAI call if input hash matches completed analysis
    if (
      note.analysisInputHash === currentHash &&
      note.analysisStatus === AssistantNoteAnalysisStatus.COMPLETED
    ) {
      this.logger.info('ASSISTANT_ANALYSIS_SKIPPED', `Note ${noteId} analysis up-to-date`, {
        userId,
        noteId,
      });
      return note;
    }

    // Concurrency lock guard: Prevent concurrent analysis requests
    if (note.analysisStatus === AssistantNoteAnalysisStatus.PROCESSING) {
      this.logger.warn(
        'ASSISTANT_ANALYSIS_CONCURRENT_BLOCKED',
        `Note ${noteId} is currently being analyzed`,
        { userId, noteId },
      );
      return note;
    }

    // Atomically transition to PROCESSING
    await this.prisma.assistantNote.update({
      where: { id: noteId },
      data: {
        analysisStatus: AssistantNoteAnalysisStatus.PROCESSING,
        analysisError: null,
      },
    });

    const modelName =
      this.configService.get<string>('OPENAI_ANALYSIS_MODEL') || 'gpt-4o-mini';

    try {
      const structuredOutput = await this.aiService.analyzeAssistantNote({
        rawText: note.rawText || undefined,
        transcriptions: completedTranscriptions,
      });

      const updatedNote = await this.prisma.assistantNote.update({
        where: { id: noteId },
        data: {
          structuredData: structuredOutput as any,
          status: AssistantNoteStatus.STRUCTURED,
          analysisStatus: AssistantNoteAnalysisStatus.COMPLETED,
          analysisInputHash: currentHash,
          analyzedAt: new Date(),
          analysisModel: modelName,
          analysisError: null,
        },
        include: {
          attachments: { orderBy: { createdAt: 'asc' } },
          revisions: { orderBy: { createdAt: 'desc' } },
        },
      });

      await this.prisma.assistantNoteRevision.create({
        data: {
          noteId,
          source: AssistantNoteRevisionSource.AI_PATCH,
          newData: structuredOutput as any,
        },
      });

      this.logger.info('ASSISTANT_ANALYSIS_SUCCESS', `Analyzed note ${noteId}`, {
        userId,
        noteId,
      });
      return updatedNote;
    } catch (error: any) {
      const safeError = error.message || 'Analysis failed';
      this.logger.error(
        'ASSISTANT_ANALYSIS_FAILED',
        `Analysis failed for note ${noteId}: ${safeError}`,
      );

      // Transition to FAILED while preserving existing structuredData
      await this.prisma.assistantNote.update({
        where: { id: noteId },
        data: {
          analysisStatus: AssistantNoteAnalysisStatus.FAILED,
          analysisError: safeError,
        },
      });

      return this.findOne(userId, noteId);
    }
  }

  async archive(userId: string, id: string) {
    await this.findOne(userId, id);

    const archivedNote = await this.prisma.assistantNote.update({
      where: { id },
      data: {
        status: AssistantNoteStatus.ARCHIVED,
        archivedAt: new Date(),
      },
      include: {
        attachments: { orderBy: { createdAt: 'asc' } },
        revisions: { orderBy: { createdAt: 'desc' } },
      },
    });

    this.logger.info('ASSISTANT_NOTE_ARCHIVED', `Archived assistant note ${id}`, {
      userId,
      noteId: id,
    });
    return archivedNote;
  }
}
