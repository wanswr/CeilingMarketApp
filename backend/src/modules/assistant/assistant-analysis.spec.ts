import { Test, TestingModule } from '@nestjs/testing';
import { AssistantService } from './assistant.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { AiService } from '../ai/ai.service';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import {
  AssistantNoteStatus,
  AssistantNoteAttachmentType,
  AssistantNoteTranscriptionStatus,
  AssistantNoteAnalysisStatus,
  AssistantNoteRevisionSource,
} from '@prisma/client';

describe('Assistant Notes Structured AI Analysis Unit & Integration Tests', () => {
  let service: AssistantService;
  let prismaMock: any;
  let aiServiceMock: any;
  let configServiceMock: any;

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
      analyzeAssistantNote: jest.fn(),
    };

    configServiceMock = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_ANALYSIS_MODEL') return 'gpt-4o-mini';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistantService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AiService, useValue: aiServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
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

  describe('1. Authorization & IDOR Protection', () => {
    it('throws ForbiddenException when user attempts to analyze another user note', async () => {
      prismaMock.assistantNote.findUnique.mockResolvedValue({
        id: 'note-1',
        userId: 'user-2',
      });

      await expect(service.analyzeNote('user-1', 'note-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when note does not exist', async () => {
      prismaMock.assistantNote.findUnique.mockResolvedValue(null);

      await expect(service.analyzeNote('user-1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('2. Input Hash & Idempotency / Cost Control', () => {
    it('skips OpenAI call if note content hash matches and analysis status is COMPLETED', async () => {
      const rawText = 'Замер спальни 20м2';
      const inputHash = service.computeAnalysisInputHash(rawText, []);

      const mockNote = {
        id: 'note-1',
        userId: 'user-1',
        rawText,
        attachments: [],
        analysisInputHash: inputHash,
        analysisStatus: AssistantNoteAnalysisStatus.COMPLETED,
        structuredData: { summary: 'Existing summary' },
      };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);

      const result = await service.analyzeNote('user-1', 'note-1');

      expect(result).toEqual(mockNote);
      expect(aiServiceMock.analyzeAssistantNote).not.toHaveBeenCalled();
    });

    it('prevents concurrent analysis when analysisStatus is already PROCESSING', async () => {
      const mockNote = {
        id: 'note-1',
        userId: 'user-1',
        rawText: 'Some text',
        attachments: [],
        analysisStatus: AssistantNoteAnalysisStatus.PROCESSING,
      };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);

      const result = await service.analyzeNote('user-1', 'note-1');

      expect(result).toEqual(mockNote);
      expect(aiServiceMock.analyzeAssistantNote).not.toHaveBeenCalled();
    });
  });

  describe('3. Analysis Lifecycle & Revision Tracking', () => {
    it('successfully analyzes note combining rawText and completed transcriptions, updates structuredData, and creates AI_PATCH revision', async () => {
      const mockNote = {
        id: 'note-1',
        userId: 'user-1',
        title: 'Draft',
        rawText: 'Спальня 20 квадратов матового.',
        status: AssistantNoteStatus.DRAFT,
        analysisStatus: AssistantNoteAnalysisStatus.IDLE,
        attachments: [
          {
            id: 'att-1',
            type: AssistantNoteAttachmentType.AUDIO,
            transcriptionStatus: AssistantNoteTranscriptionStatus.COMPLETED,
            transcriptionText: '15 двойных светильников. Заказать полотно.',
          },
        ],
      };

      const mockAiOutput = {
        titleSuggestion: 'Замер спальни',
        summary: 'Замер спальни 20м2 и светильники',
        sections: [
          {
            name: 'Спальня',
            items: [
              { name: 'Матовый потолок', quantity: 20, unit: 'm2', category: 'потолок' },
              { name: 'Двойные светильники', quantity: 15, unit: 'pcs', category: 'освещение' },
            ],
          },
        ],
        tasks: [{ text: 'Заказать полотно' }],
        uncertainties: [],
        suggestedActions: [{ type: 'CREATE_TABLE', reason: 'Найдено 2 позиции' }],
      };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);
      aiServiceMock.analyzeAssistantNote.mockResolvedValue(mockAiOutput);

      await service.analyzeNote('user-1', 'note-1');

      // Lock to PROCESSING
      expect(prismaMock.assistantNote.update).toHaveBeenCalledWith({
        where: { id: 'note-1' },
        data: {
          analysisStatus: AssistantNoteAnalysisStatus.PROCESSING,
          analysisError: null,
        },
      });

      // Update to COMPLETED with structuredData and status STRUCTURED
      expect(prismaMock.assistantNote.update).toHaveBeenCalledWith({
        where: { id: 'note-1' },
        data: expect.objectContaining({
          structuredData: mockAiOutput,
          status: AssistantNoteStatus.STRUCTURED,
          analysisStatus: AssistantNoteAnalysisStatus.COMPLETED,
          analysisModel: 'gpt-4o-mini',
          analysisError: null,
        }),
        include: expect.any(Object),
      });

      // Create AI_PATCH revision
      expect(prismaMock.assistantNoteRevision.create).toHaveBeenCalledWith({
        data: {
          noteId: 'note-1',
          source: AssistantNoteRevisionSource.AI_PATCH,
          newData: mockAiOutput,
        },
      });
    });

    it('sets analysisStatus to FAILED when AI analysis fails, preserving existing note state', async () => {
      const mockNote = {
        id: 'note-1',
        userId: 'user-1',
        rawText: 'Some content',
        attachments: [],
        analysisStatus: AssistantNoteAnalysisStatus.IDLE,
        structuredData: { previous: 'data' },
      };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);
      aiServiceMock.analyzeAssistantNote.mockRejectedValue(new Error('OPENAI_NOT_CONFIGURED'));

      await service.analyzeNote('user-1', 'note-1');

      expect(prismaMock.assistantNote.update).toHaveBeenCalledWith({
        where: { id: 'note-1' },
        data: {
          analysisStatus: AssistantNoteAnalysisStatus.FAILED,
          analysisError: 'OPENAI_NOT_CONFIGURED',
        },
      });
    });
  });

  describe('4. STALE Status Transitions on Content Mutation', () => {
    it('transitions analysisStatus to STALE when rawText is modified on a COMPLETED analysis', async () => {
      const existingNote = {
        id: 'note-1',
        userId: 'user-1',
        rawText: 'Old text',
        analysisStatus: AssistantNoteAnalysisStatus.COMPLETED,
      };

      prismaMock.assistantNote.findUnique.mockResolvedValue(existingNote);
      prismaMock.assistantNote.update.mockResolvedValue({
        ...existingNote,
        rawText: 'New text',
        analysisStatus: AssistantNoteAnalysisStatus.STALE,
      });

      await service.update('user-1', 'note-1', { rawText: 'New text' });

      expect(prismaMock.assistantNote.update).toHaveBeenCalledWith({
        where: { id: 'note-1' },
        data: expect.objectContaining({
          rawText: 'New text',
          analysisStatus: AssistantNoteAnalysisStatus.STALE,
        }),
        include: expect.any(Object),
      });
    });
  });
});
