import { Test, TestingModule } from '@nestjs/testing';
import { AssistantService } from './assistant.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { AiService } from '../ai/ai.service';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import {
  AssistantNoteStatus,
  AssistantNoteEditProposalStatus,
  AssistantNoteRevisionSource,
} from '@prisma/client';

describe('Assistant Notes AI-Assisted Editing Unit & Integration Tests', () => {
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
      assistantNoteEditProposal: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      assistantNoteRevision: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    aiServiceMock = {
      proposeNoteEdit: jest.fn(),
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

  describe('1. IDOR & Ownership Protection', () => {
    it('throws ForbiddenException when user attempts to propose edit for another user note', async () => {
      prismaMock.assistantNote.findUnique.mockResolvedValue({
        id: 'note-1',
        userId: 'user-2',
      });

      await expect(
        service.proposeEdit('user-1', 'note-1', { text: 'Change items' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when user attempts to apply proposal belonging to another user', async () => {
      prismaMock.assistantNote.findUnique.mockResolvedValue({
        id: 'note-1',
        userId: 'user-1',
      });
      prismaMock.assistantNoteEditProposal.findUnique.mockResolvedValue({
        id: 'prop-1',
        noteId: 'note-1',
        userId: 'user-2',
      });

      await expect(
        service.applyEdit('user-1', 'note-1', 'prop-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('2. Proposal Generation without Immediate Mutation', () => {
    it('generates proposal with delta operations and preserves note state until apply', async () => {
      const mockNote = {
        id: 'note-1',
        userId: 'user-1',
        version: 2,
        structuredData: {
          sections: [
            {
              id: 'sec-1',
              name: 'Спальня',
              items: [{ id: 'item-1', name: 'Светильники', quantity: 15, unit: 'pcs' }],
            },
          ],
        },
      };

      const mockProposalOutput = {
        summary: 'Изменение светильников с 15 на 12',
        operations: [
          {
            operation: 'UPDATE_ITEM',
            targetId: 'item-1',
            field: 'quantity',
            oldValue: 15,
            newValue: 12,
            reason: 'Пользователь указал: светильников 12',
          },
        ],
        uncertainties: [],
      };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);
      aiServiceMock.proposeNoteEdit.mockResolvedValue(mockProposalOutput);
      prismaMock.assistantNoteEditProposal.create.mockResolvedValue({
        id: 'prop-1',
        noteId: 'note-1',
        userId: 'user-1',
        baseVersion: 2,
        operations: mockProposalOutput.operations,
        summary: mockProposalOutput.summary,
        status: AssistantNoteEditProposalStatus.PENDING,
      });

      const proposal = await service.proposeEdit('user-1', 'note-1', {
        text: 'Светильников теперь 12',
      });

      expect(proposal.id).toBe('prop-1');
      expect(prismaMock.assistantNote.update).not.toHaveBeenCalled();
    });
  });

  describe('3. Optimistic Concurrency & Transactional Apply', () => {
    it('throws 409 ConflictException when proposal baseVersion does not match current note version', async () => {
      const mockNote = {
        id: 'note-1',
        userId: 'user-1',
        version: 3, // Version updated since proposal
      };

      const staleProposal = {
        id: 'prop-1',
        noteId: 'note-1',
        userId: 'user-1',
        baseVersion: 2, // Created against version 2
        status: AssistantNoteEditProposalStatus.PENDING,
      };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);
      prismaMock.assistantNoteEditProposal.findUnique.mockResolvedValue(staleProposal);

      await expect(service.applyEdit('user-1', 'note-1', 'prop-1')).rejects.toThrow(
        ConflictException,
      );

      // Proposal marked STALE
      expect(prismaMock.assistantNoteEditProposal.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data: { status: AssistantNoteEditProposalStatus.STALE },
      });
    });

    it('successfully applies proposal delta, increments version, updates status to APPLIED, and creates AI_PATCH revision', async () => {
      const mockNote = {
        id: 'note-1',
        userId: 'user-1',
        version: 2,
        structuredData: {
          sections: [
            {
              id: 'sec-1',
              name: 'Спальня',
              items: [{ id: 'item-1', name: 'Светильники', quantity: 15, unit: 'pcs' }],
            },
          ],
        },
      };

      const pendingProposal = {
        id: 'prop-1',
        noteId: 'note-1',
        userId: 'user-1',
        baseVersion: 2,
        rawInput: 'Светильников 12',
        status: AssistantNoteEditProposalStatus.PENDING,
        operations: [
          {
            operation: 'UPDATE_ITEM',
            targetId: 'item-1',
            field: 'quantity',
            newValue: 12,
            reason: 'Обновлено пользователем',
          },
        ],
      };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);
      prismaMock.assistantNoteEditProposal.findUnique.mockResolvedValue(pendingProposal);
      prismaMock.assistantNote.update.mockResolvedValue({
        ...mockNote,
        version: 3,
        status: AssistantNoteStatus.STRUCTURED,
      });

      await service.applyEdit('user-1', 'note-1', 'prop-1');

      // Note updated with new structuredData and version = 3
      expect(prismaMock.assistantNote.update).toHaveBeenCalledWith({
        where: { id: 'note-1' },
        data: expect.objectContaining({
          version: 3,
          status: AssistantNoteStatus.STRUCTURED,
        }),
        include: expect.any(Object),
      });

      // Proposal updated to APPLIED
      expect(prismaMock.assistantNoteEditProposal.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data: expect.objectContaining({
          status: AssistantNoteEditProposalStatus.APPLIED,
          appliedAt: expect.any(Date),
        }),
      });

      // AI_PATCH revision created
      expect(prismaMock.assistantNoteRevision.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          noteId: 'note-1',
          source: AssistantNoteRevisionSource.AI_PATCH,
          rawInput: 'Светильников 12',
        }),
      });
    });
  });
});
