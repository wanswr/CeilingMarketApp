import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { AiService } from '../ai/ai.service';
import { CreateAssistantNoteDto } from './dto/create-assistant-note.dto';
import { UpdateAssistantNoteDto } from './dto/update-assistant-note.dto';
import { AssistantNotesQueryDto } from './dto/assistant-notes-query.dto';
import { ProposeEditDto } from './dto/propose-edit.dto';
import { ConfigService } from '@nestjs/config';
import {
  AssistantNoteStatus,
  AssistantNoteRevisionSource,
  AssistantNoteAttachmentType,
  AssistantNoteTranscriptionStatus,
  AssistantNoteAnalysisStatus,
  AssistantNoteEditProposalStatus,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

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

  private ensureStableIds(structuredData: any): any {
    if (!structuredData) return {};
    const copy = JSON.parse(JSON.stringify(structuredData));

    if (Array.isArray(copy.sections)) {
      copy.sections.forEach((sec: any) => {
        if (!sec.id) sec.id = uuidv4();
        if (Array.isArray(sec.items)) {
          sec.items.forEach((item: any) => {
            if (!item.id) item.id = uuidv4();
          });
        }
      });
    }

    if (Array.isArray(copy.items)) {
      copy.items.forEach((item: any) => {
        if (!item.id) item.id = uuidv4();
      });
    }

    if (Array.isArray(copy.tasks)) {
      copy.tasks.forEach((task: any) => {
        if (!task.id) task.id = uuidv4();
      });
    }

    if (Array.isArray(copy.dates)) {
      copy.dates.forEach((date: any) => {
        if (!date.id) date.id = uuidv4();
      });
    }

    if (Array.isArray(copy.uncertainties)) {
      copy.uncertainties.forEach((unc: any) => {
        if (!unc.id) unc.id = uuidv4();
      });
    }

    return copy;
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
        structuredData: dto.structuredData ? this.ensureStableIds(dto.structuredData) : null,
        status: initialStatus,
        version: 1,
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
      updatedData.structuredData = this.ensureStableIds(dto.structuredData);
      if (!existingNote.status || existingNote.status === AssistantNoteStatus.DRAFT) {
        updatedData.status = AssistantNoteStatus.STRUCTURED;
      }
      isContentChanged = true;
    }
    if (dto.status !== undefined) updatedData.status = dto.status;

    if (isContentChanged) {
      updatedData.analysisStatus = this.markAnalysisStaleIfCompleted(
        existingNote.analysisStatus,
      );
      updatedData.version = existingNote.version + 1;
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

    await this.prisma.assistantNote.update({
      where: { id },
      data: {
        version: note.version + 1,
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
      await this.prisma.assistantNote.update({
        where: { id: noteId },
        data: {
          analysisStatus: nextAnalysisStatus,
          version: note.version + 1,
        },
      });

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
      const safeErrorCode = error.message === 'OPENAI_NOT_CONFIGURED' ? 'OPENAI_NOT_CONFIGURED' : 'TRANSCRIPTION_FAILED';
      this.logger.error(
        'ASSISTANT_TRANSCRIPTION_FAILED',
        `Transcription failed for attachment ${attachmentId}: ${error.message}`,
      );

      await this.prisma.assistantNoteAttachment.update({
        where: { id: attachmentId },
        data: {
          transcriptionStatus: AssistantNoteTranscriptionStatus.FAILED,
          transcriptionError: safeErrorCode,
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

    if (note.analysisStatus === AssistantNoteAnalysisStatus.PROCESSING) {
      this.logger.warn(
        'ASSISTANT_ANALYSIS_CONCURRENT_BLOCKED',
        `Note ${noteId} is currently being analyzed`,
        { userId, noteId },
      );
      return note;
    }

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

      const structuredWithIds = this.ensureStableIds(structuredOutput);

      const updatedNote = await this.prisma.assistantNote.update({
        where: { id: noteId },
        data: {
          structuredData: structuredWithIds,
          status: AssistantNoteStatus.STRUCTURED,
          analysisStatus: AssistantNoteAnalysisStatus.COMPLETED,
          analysisInputHash: currentHash,
          analyzedAt: new Date(),
          analysisModel: modelName,
          analysisError: null,
          version: note.version + 1,
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
          newData: structuredWithIds,
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

  async proposeEdit(userId: string, noteId: string, dto: ProposeEditDto) {
    const note = await this.findOne(userId, noteId);

    const currentStructured = this.ensureStableIds(note.structuredData || {});

    const proposalOutput = await this.aiService.proposeNoteEdit(
      currentStructured,
      dto.text,
    );

    const proposal = await this.prisma.assistantNoteEditProposal.create({
      data: {
        noteId,
        userId,
        baseVersion: note.version,
        inputType: dto.attachmentId ? 'VOICE' : 'TEXT',
        rawInput: dto.text,
        operations: proposalOutput.operations as any,
        uncertainties: proposalOutput.uncertainties as any,
        summary: proposalOutput.summary,
        status: AssistantNoteEditProposalStatus.PENDING,
      },
    });

    this.logger.info('ASSISTANT_PROPOSAL_CREATED', `Created edit proposal ${proposal.id}`, {
      userId,
      noteId,
    });
    return proposal;
  }

  async applyEdit(userId: string, noteId: string, proposalId: string) {
    const note = await this.findOne(userId, noteId);

    const proposal = await this.prisma.assistantNoteEditProposal.findUnique({
      where: { id: proposalId },
    });

    if (!proposal || proposal.noteId !== noteId) {
      throw new NotFoundException('Edit proposal not found for this note');
    }

    if (proposal.userId !== userId) {
      throw new ForbiddenException('You do not have permission to apply this proposal');
    }

    if (proposal.status !== AssistantNoteEditProposalStatus.PENDING) {
      throw new ConflictException('Proposal has already been applied or invalidated');
    }

    // Optimistic concurrency check: verify baseVersion matches current note version
    if (proposal.baseVersion !== note.version) {
      await this.prisma.assistantNoteEditProposal.update({
        where: { id: proposalId },
        data: { status: AssistantNoteEditProposalStatus.STALE },
      });
      throw new ConflictException(
        'Note content has changed. Please refresh and retry editing.',
      );
    }

    const currentStructured = this.ensureStableIds(note.structuredData || {});
    const operations: any[] = (proposal.operations as any[]) || [];

    // Hardened operation allowlist & field validation
    const ALLOWED_OPERATIONS = new Set([
      'UPDATE_ITEM',
      'ADD_ITEM',
      'REMOVE_ITEM',
      'ADD_TASK',
      'UPDATE_TASK',
      'REMOVE_TASK',
      'ADD_DATE',
      'UPDATE_DATE',
      'UPDATE_TITLE',
    ]);

    const ALLOWED_ITEM_FIELDS = new Set([
      'name',
      'quantity',
      'unit',
      'category',
      'comment',
      'confidence',
    ]);

    const FORBIDDEN_FIELDS = new Set(['id', 'sourceText', '__proto__', 'constructor', 'prototype']);

    operations.forEach((op: any, index: number) => {
      if (!op || typeof op !== 'object' || !ALLOWED_OPERATIONS.has(op.operation)) {
        throw new BadRequestException(`UNSUPPORTED_OPERATION: Operation at index ${index} is invalid or not allowed`);
      }

      if (op.operation === 'UPDATE_ITEM') {
        if (!op.targetId || typeof op.targetId !== 'string') {
          throw new BadRequestException(`INVALID_TARGET_ID: Target ID required for UPDATE_ITEM at index ${index}`);
        }

        let itemFound = false;
        if (Array.isArray(currentStructured.sections)) {
          currentStructured.sections.forEach((sec: any) => {
            if (Array.isArray(sec.items)) {
              sec.items.forEach((item: any) => {
                if (item.id === op.targetId) {
                  itemFound = true;
                  if (op.field) {
                    if (FORBIDDEN_FIELDS.has(op.field) || !ALLOWED_ITEM_FIELDS.has(op.field)) {
                      throw new BadRequestException(`FORBIDDEN_FIELD: Field '${op.field}' is not editable`);
                    }
                    if (op.field === 'quantity') {
                      const qty = op.newValue;
                      if (qty !== null && (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 0)) {
                        throw new BadRequestException(`INVALID_QUANTITY: Invalid quantity value for ${op.field}`);
                      }
                    }
                    item[op.field] = op.newValue;
                  } else if (op.item && typeof op.item === 'object') {
                    Object.keys(op.item).forEach((key) => {
                      if (ALLOWED_ITEM_FIELDS.has(key) && !FORBIDDEN_FIELDS.has(key)) {
                        item[key] = op.item[key];
                      }
                    });
                  }
                }
              });
            }
          });
        }

        if (!itemFound) {
          throw new BadRequestException(`TARGET_ITEM_NOT_FOUND: Item with ID '${op.targetId}' not found`);
        }
      } else if (op.operation === 'ADD_ITEM') {
        const rawItem = op.item || {};
        if (typeof rawItem.name !== 'string' || !rawItem.name.trim()) {
          throw new BadRequestException(`INVALID_ITEM_NAME: Item name required for ADD_ITEM at index ${index}`);
        }

        const newItem: any = {
          id: uuidv4(),
          name: rawItem.name.trim(),
          quantity: typeof rawItem.quantity === 'number' && Number.isFinite(rawItem.quantity) ? rawItem.quantity : null,
          unit: typeof rawItem.unit === 'string' ? rawItem.unit.trim() : null,
          category: typeof rawItem.category === 'string' ? rawItem.category.trim() : null,
          confidence: typeof rawItem.confidence === 'number' && Number.isFinite(rawItem.confidence) ? rawItem.confidence : null,
        };

        if (!currentStructured.sections) currentStructured.sections = [];
        const targetSecName = typeof op.section === 'string' && op.section.trim() ? op.section.trim() : 'Общее';
        let section = currentStructured.sections.find((s: any) => s.name === targetSecName);
        if (!section) {
          section = { id: uuidv4(), name: targetSecName, items: [] };
          currentStructured.sections.push(section);
        }
        if (!Array.isArray(section.items)) section.items = [];
        section.items.push(newItem);
      } else if (op.operation === 'REMOVE_ITEM') {
        if (!op.targetId || typeof op.targetId !== 'string') {
          throw new BadRequestException(`INVALID_TARGET_ID: Target ID required for REMOVE_ITEM at index ${index}`);
        }
        if (Array.isArray(currentStructured.sections)) {
          currentStructured.sections.forEach((sec: any) => {
            if (Array.isArray(sec.items)) {
              sec.items = sec.items.filter((item: any) => item.id !== op.targetId);
            }
          });
        }
      } else if (op.operation === 'ADD_TASK') {
        const rawTask = op.task || {};
        if (typeof rawTask.text !== 'string' || !rawTask.text.trim()) {
          throw new BadRequestException(`INVALID_TASK_TEXT: Task text required at index ${index}`);
        }
        if (!currentStructured.tasks) currentStructured.tasks = [];
        currentStructured.tasks.push({
          id: uuidv4(),
          text: rawTask.text.trim(),
          dateText: typeof rawTask.dateText === 'string' ? rawTask.dateText.trim() : null,
        });
      } else if (op.operation === 'UPDATE_TITLE') {
        if (typeof op.title === 'string' && op.title.trim()) {
          currentStructured.titleSuggestion = op.title.trim();
        }
      }
    });

    const updatedNote = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.assistantNote.update({
        where: { id: noteId },
        data: {
          structuredData: currentStructured,
          status: AssistantNoteStatus.STRUCTURED,
          version: note.version + 1,
        },
        include: {
          attachments: { orderBy: { createdAt: 'asc' } },
          revisions: { orderBy: { createdAt: 'desc' } },
        },
      });

      await tx.assistantNoteEditProposal.update({
        where: { id: proposalId },
        data: {
          status: AssistantNoteEditProposalStatus.APPLIED,
          appliedAt: new Date(),
        },
      });

      await tx.assistantNoteRevision.create({
        data: {
          noteId,
          source: AssistantNoteRevisionSource.AI_PATCH,
          rawInput: proposal.rawInput,
          newData: currentStructured,
        },
      });

      return updated;
    });

    this.logger.info('ASSISTANT_PROPOSAL_APPLIED', `Applied edit proposal ${proposalId}`, {
      userId,
      noteId,
    });

    return updatedNote;
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
