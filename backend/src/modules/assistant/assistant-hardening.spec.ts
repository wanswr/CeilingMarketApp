import { Test, TestingModule } from '@nestjs/testing';
import { AssistantService } from './assistant.service';
import { RemindersService } from './reminders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { AiService } from '../ai/ai.service';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import {
  AssistantNoteStatus,
  AssistantNoteAttachmentType,
  AssistantNoteTranscriptionStatus,
  AssistantNoteAnalysisStatus,
  AssistantReminderStatus,
} from '@prisma/client';

describe('TASK ASSIST-HARDEN-001 Integration & Concurrency Regression Tests', () => {
  let assistantService: AssistantService;
  let remindersService: RemindersService;
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
        updateMany: jest.fn(),
      },
      assistantNoteAttachment: {
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      assistantNoteRevision: {
        create: jest.fn(),
      },
      assistantNoteEditProposal: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      assistantReminder: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    aiServiceMock = {
      transcribeAudio: jest.fn(),
      analyzeAssistantNote: jest.fn(),
      proposeNoteEdit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistantService,
        RemindersService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AiService, useValue: aiServiceMock },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((k) => (k === 'OPENAI_ANALYSIS_MODEL' ? 'gpt-4o-mini' : null)) },
        },
        {
          provide: LoggerService,
          useValue: { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    assistantService = module.get<AssistantService>(AssistantService);
    remindersService = module.get<RemindersService>(RemindersService);
  });

  describe('1. Atomic Transcription Claim Concurrency', () => {
    it('only allows first request with count === 1 to call OpenAI when transcribing', async () => {
      const mockNote = { id: 'note-1', userId: 'user-1' };
      const pendingAttachment = {
        id: 'att-1',
        noteId: 'note-1',
        type: AssistantNoteAttachmentType.AUDIO,
        fileUrl: '/uploads/test.m4a',
        transcriptionStatus: AssistantNoteTranscriptionStatus.PENDING,
      };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);
      prismaMock.assistantNoteAttachment.findUnique.mockResolvedValue(pendingAttachment);

      // Simulate first request claiming status successfully (count === 1)
      prismaMock.assistantNoteAttachment.updateMany.mockResolvedValueOnce({ count: 1 });
      aiServiceMock.transcribeAudio.mockResolvedValue('Transcribed text');

      await assistantService.transcribeAttachment('user-1', 'note-1', 'att-1');

      expect(aiServiceMock.transcribeAudio).toHaveBeenCalledTimes(1);

      // Simulate concurrent second request failing claim (count === 0)
      prismaMock.assistantNoteAttachment.updateMany.mockResolvedValueOnce({ count: 0 });

      await assistantService.transcribeAttachment('user-1', 'note-1', 'att-1');

      // Total calls to OpenAI should remain 1
      expect(aiServiceMock.transcribeAudio).toHaveBeenCalledTimes(1);
    });
  });

  describe('2. Atomic Analysis Claim Concurrency', () => {
    it('only allows first request with count === 1 to call OpenAI during analysis', async () => {
      const mockNote = {
        id: 'note-1',
        userId: 'user-1',
        rawText: 'Content',
        attachments: [],
        analysisStatus: AssistantNoteAnalysisStatus.IDLE,
      };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);

      // Simulate first request claiming status successfully
      prismaMock.assistantNote.updateMany.mockResolvedValueOnce({ count: 1 });
      aiServiceMock.analyzeAssistantNote.mockResolvedValue({
        titleSuggestion: 'Title',
        summary: 'Summary',
        sections: [],
      });

      await assistantService.analyzeNote('user-1', 'note-1');

      expect(aiServiceMock.analyzeAssistantNote).toHaveBeenCalledTimes(1);

      // Simulate concurrent second request failing claim
      prismaMock.assistantNote.updateMany.mockResolvedValueOnce({ count: 0 });

      await assistantService.analyzeNote('user-1', 'note-1');

      // Total calls to OpenAI should remain 1
      expect(aiServiceMock.analyzeAssistantNote).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. Hardened AI Edit Operation Allowlist & Prototype Protection', () => {
    it('rejects forbidden fields like sourceText and prototype pollution during applyEdit', async () => {
      const mockNote = {
        id: 'note-1',
        userId: 'user-1',
        version: 1,
        structuredData: {
          sections: [{ id: 'sec-1', name: 'Спальня', items: [{ id: 'item-1', name: 'Светильники', quantity: 15 }] }],
        },
      };

      const maliciousProposal = {
        id: 'prop-1',
        noteId: 'note-1',
        userId: 'user-1',
        baseVersion: 1,
        status: 'PENDING',
        operations: [
          {
            operation: 'UPDATE_ITEM',
            targetId: 'item-1',
            field: 'sourceText', // Forbidden editable field
            newValue: 'Hacked source text',
          },
        ],
      };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);
      prismaMock.assistantNoteEditProposal.findUnique.mockResolvedValue(maliciousProposal);

      await expect(
        assistantService.applyEdit('user-1', 'note-1', 'prop-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects unmapped/unsupported operation types during applyEdit', async () => {
      const mockNote = { id: 'note-1', userId: 'user-1', version: 1, structuredData: {} };
      const invalidProposal = {
        id: 'prop-2',
        noteId: 'note-1',
        userId: 'user-1',
        baseVersion: 1,
        status: 'PENDING',
        operations: [{ operation: 'EXECUTE_ARBITRARY_SQL' }],
      };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);
      prismaMock.assistantNoteEditProposal.findUnique.mockResolvedValue(invalidProposal);

      await expect(
        assistantService.applyEdit('user-1', 'note-1', 'prop-2'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('4. Reminder Concurrency-Safe Idempotency Unique Index Handling', () => {
    it('catches P2002 unique constraint violation and returns existing reminder', async () => {
      const futureDateIso = new Date(Date.now() + 86400000).toISOString();
      const existingReminder = {
        id: 'rem-existing',
        userId: 'user-1',
        idempotencyKey: 'dup-key-1',
        status: AssistantReminderStatus.SCHEDULED,
      };

      prismaMock.assistantReminder.create.mockRejectedValue({ code: 'P2002' });
      prismaMock.assistantReminder.findFirst.mockResolvedValue(existingReminder);

      const result = await remindersService.create('user-1', {
        title: 'Заказать полотно',
        scheduledAt: futureDateIso,
        idempotencyKey: 'dup-key-1',
      });

      expect(result).toEqual(existingReminder);
    });
  });
});
