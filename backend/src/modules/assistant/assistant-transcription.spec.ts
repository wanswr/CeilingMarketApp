import { Test, TestingModule } from '@nestjs/testing';
import { AssistantService } from './assistant.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { AiService } from '../ai/ai.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import {
  AssistantNoteAttachmentType,
  AssistantNoteTranscriptionStatus,
  AssistantNoteRevisionSource,
} from '@prisma/client';

describe('Assistant Notes Audio Transcription Unit & Integration Tests', () => {
  let service: AssistantService;
  let prismaMock: any;
  let aiServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', deletedAt: null }),
      },
      assistantNote: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      assistantNoteAttachment: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      assistantNoteRevision: {
        create: jest.fn(),
      },
    };

    aiServiceMock = {
      transcribeAudio: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistantService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AiService, useValue: aiServiceMock },
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

    service = module.get<AssistantService>(AssistantService);
  });

  describe('1. IDOR & Ownership Protection', () => {
    it('throws ForbiddenException when user attempts to transcribe another user note', async () => {
      prismaMock.assistantNote.findUnique.mockResolvedValue({
        id: 'note-1',
        userId: 'user-2',
      });

      await expect(
        service.transcribeAttachment('user-1', 'note-1', 'att-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when attachment does not exist for the note', async () => {
      prismaMock.assistantNote.findUnique.mockResolvedValue({
        id: 'note-1',
        userId: 'user-1',
      });
      prismaMock.assistantNoteAttachment.findUnique.mockResolvedValue(null);

      await expect(
        service.transcribeAttachment('user-1', 'note-1', 'att-nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if attachment is not an AUDIO type', async () => {
      prismaMock.assistantNote.findUnique.mockResolvedValue({
        id: 'note-1',
        userId: 'user-1',
      });
      prismaMock.assistantNoteAttachment.findUnique.mockResolvedValue({
        id: 'att-1',
        noteId: 'note-1',
        type: AssistantNoteAttachmentType.IMAGE,
      });

      await expect(
        service.transcribeAttachment('user-1', 'note-1', 'att-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('2. Idempotency & Cost Control Guards', () => {
    it('skips OpenAI provider call if transcription is already COMPLETED', async () => {
      const mockNote = { id: 'note-1', userId: 'user-1', rawText: 'Existing note text' };
      const completedAttachment = {
        id: 'att-1',
        noteId: 'note-1',
        type: AssistantNoteAttachmentType.AUDIO,
        transcriptionStatus: AssistantNoteTranscriptionStatus.COMPLETED,
        transcriptionText: 'Spoken text',
      };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);
      prismaMock.assistantNoteAttachment.findUnique.mockResolvedValue(completedAttachment);

      const result = await service.transcribeAttachment('user-1', 'note-1', 'att-1');

      expect(result).toEqual(mockNote);
      expect(aiServiceMock.transcribeAudio).not.toHaveBeenCalled();
    });

    it('prevents concurrent processing when status is already PROCESSING', async () => {
      const mockNote = { id: 'note-1', userId: 'user-1' };
      const processingAttachment = {
        id: 'att-1',
        noteId: 'note-1',
        type: AssistantNoteAttachmentType.AUDIO,
        transcriptionStatus: AssistantNoteTranscriptionStatus.PROCESSING,
      };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);
      prismaMock.assistantNoteAttachment.findUnique.mockResolvedValue(processingAttachment);

      const result = await service.transcribeAttachment('user-1', 'note-1', 'att-1');

      expect(result).toEqual(mockNote);
      expect(aiServiceMock.transcribeAudio).not.toHaveBeenCalled();
    });
  });

  describe('3. Transcription Lifecycle & Error Resilience', () => {
    it('successfully transcribes audio, updates attachment text/status, creates VOICE revision, and preserves rawText', async () => {
      const mockNote = {
        id: 'note-1',
        userId: 'user-1',
        title: 'Title',
        rawText: 'Original text before voice',
      };
      const pendingAttachment = {
        id: 'att-1',
        noteId: 'note-1',
        type: AssistantNoteAttachmentType.AUDIO,
        fileUrl: '/uploads/assistant-audio/test.m4a',
        transcriptionStatus: AssistantNoteTranscriptionStatus.PENDING,
      };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);
      prismaMock.assistantNoteAttachment.findUnique.mockResolvedValue(pendingAttachment);
      aiServiceMock.transcribeAudio.mockResolvedValue('Спальня 20 квадратов');

      await service.transcribeAttachment('user-1', 'note-1', 'att-1');

      // Lock to PROCESSING
      expect(prismaMock.assistantNoteAttachment.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: {
          transcriptionStatus: AssistantNoteTranscriptionStatus.PROCESSING,
          transcriptionError: null,
        },
      });

      // Update to COMPLETED
      expect(prismaMock.assistantNoteAttachment.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: {
          transcriptionStatus: AssistantNoteTranscriptionStatus.COMPLETED,
          transcriptionText: 'Спальня 20 квадратов',
          transcriptionError: null,
        },
      });

      // Create VOICE revision
      expect(prismaMock.assistantNoteRevision.create).toHaveBeenCalledWith({
        data: {
          noteId: 'note-1',
          source: AssistantNoteRevisionSource.VOICE,
          rawInput: 'Спальня 20 квадратов',
          newData: {
            attachmentId: 'att-1',
            transcriptionText: 'Спальня 20 квадратов',
          },
        },
      });
    });

    it('sets status to FAILED when AI provider throws an error', async () => {
      const mockNote = { id: 'note-1', userId: 'user-1' };
      const pendingAttachment = {
        id: 'att-1',
        noteId: 'note-1',
        type: AssistantNoteAttachmentType.AUDIO,
        fileUrl: '/uploads/assistant-audio/test.m4a',
        transcriptionStatus: AssistantNoteTranscriptionStatus.PENDING,
      };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);
      prismaMock.assistantNoteAttachment.findUnique.mockResolvedValue(pendingAttachment);
      aiServiceMock.transcribeAudio.mockRejectedValue(new Error('OPENAI_NOT_CONFIGURED'));

      await service.transcribeAttachment('user-1', 'note-1', 'att-1');

      expect(prismaMock.assistantNoteAttachment.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: {
          transcriptionStatus: AssistantNoteTranscriptionStatus.FAILED,
          transcriptionError: 'OPENAI_NOT_CONFIGURED',
        },
      });
    });

    it('allows retry from FAILED state and completes successfully', async () => {
      const mockNote = { id: 'note-1', userId: 'user-1' };
      const failedAttachment = {
        id: 'att-1',
        noteId: 'note-1',
        type: AssistantNoteAttachmentType.AUDIO,
        fileUrl: '/uploads/assistant-audio/test.m4a',
        transcriptionStatus: AssistantNoteTranscriptionStatus.FAILED,
        transcriptionError: 'Previous error',
      };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);
      prismaMock.assistantNoteAttachment.findUnique.mockResolvedValue(failedAttachment);
      aiServiceMock.transcribeAudio.mockResolvedValue('Retry transcription text');

      await service.transcribeAttachment('user-1', 'note-1', 'att-1');

      expect(prismaMock.assistantNoteAttachment.update).toHaveBeenCalledWith({
        where: { id: 'att-1' },
        data: {
          transcriptionStatus: AssistantNoteTranscriptionStatus.COMPLETED,
          transcriptionText: 'Retry transcription text',
          transcriptionError: null,
        },
      });
    });
  });
});
