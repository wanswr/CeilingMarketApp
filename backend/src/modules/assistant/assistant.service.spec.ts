import { Test, TestingModule } from '@nestjs/testing';
import { AssistantService } from './assistant.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { AssistantNoteStatus, AssistantNoteRevisionSource } from '@prisma/client';

describe('AssistantService Foundation & IDOR Security', () => {
  let service: AssistantService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      assistantNote: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    const mockLogger = {
      setService: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistantService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<AssistantService>(AssistantService);
  });

  describe('create', () => {
    it('creates note and initial revision for active user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', deletedAt: null });
      const mockCreated = {
        id: 'note-1',
        userId: 'user-1',
        title: 'Ceiling Measurements',
        rawText: '20 sq. meters, 4 corners',
        status: AssistantNoteStatus.DRAFT,
        revisions: [{ id: 'rev-1' }],
      };
      mockPrisma.assistantNote.create.mockResolvedValue(mockCreated);

      const result = await service.create('user-1', {
        title: 'Ceiling Measurements',
        rawText: '20 sq. meters, 4 corners',
      });

      expect(result.id).toBe('note-1');
      expect(mockPrisma.assistantNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            title: 'Ceiling Measurements',
            status: AssistantNoteStatus.DRAFT,
          }),
        })
      );
    });

    it('sets status to STRUCTURED when structuredData is provided', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'user-1', deletedAt: null });
      mockPrisma.assistantNote.create.mockImplementation(async ({ data }) => ({
        id: 'note-2',
        ...data,
      }));

      await service.create('user-1', {
        title: 'Estimate Note',
        structuredData: { area: 20, perimeter: 18 },
      });

      expect(mockPrisma.assistantNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AssistantNoteStatus.STRUCTURED,
            structuredData: { area: 20, perimeter: 18 },
          }),
        })
      );
    });
  });

  describe('findAll', () => {
    it('returns only notes belonging to current user and excludes archived by default', async () => {
      mockPrisma.assistantNote.findMany.mockResolvedValue([
        { id: 'note-1', userId: 'user-1', status: AssistantNoteStatus.DRAFT },
      ]);

      const notes = await service.findAll('user-1', {});

      expect(notes).toHaveLength(1);
      expect(mockPrisma.assistantNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            status: { not: AssistantNoteStatus.ARCHIVED },
          },
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('includes archived notes when includeArchived flag is true', async () => {
      mockPrisma.assistantNote.findMany.mockResolvedValue([]);

      await service.findAll('user-1', { includeArchived: true });

      expect(mockPrisma.assistantNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
        })
      );
    });
  });

  describe('findOne & IDOR Authorization', () => {
    it('returns note when user reads their own note', async () => {
      const mockNote = { id: 'note-1', userId: 'user-1', title: 'Own Note' };
      mockPrisma.assistantNote.findUnique.mockResolvedValue(mockNote);

      const result = await service.findOne('user-1', 'note-1');
      expect(result).toEqual(mockNote);
    });

    it('throws ForbiddenException when user attempts to read another user note (IDOR block)', async () => {
      const mockNote = { id: 'note-1', userId: 'user-1', title: 'Victim Note' };
      mockPrisma.assistantNote.findUnique.mockResolvedValue(mockNote);

      await expect(service.findOne('attacker-2', 'note-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when note does not exist', async () => {
      mockPrisma.assistantNote.findUnique.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update & Revision History', () => {
    it('updates note and creates a new revision recording previousData and newData', async () => {
      const originalNote = {
        id: 'note-1',
        userId: 'user-1',
        title: 'Original Title',
        rawText: 'Original Text',
        structuredData: null,
        status: AssistantNoteStatus.DRAFT,
      };

      mockPrisma.assistantNote.findUnique.mockResolvedValue(originalNote);

      const updatedNote = {
        ...originalNote,
        title: 'Updated Title',
        rawText: 'Updated Text',
      };
      mockPrisma.assistantNote.update.mockResolvedValue(updatedNote);

      const result = await service.update('user-1', 'note-1', {
        title: 'Updated Title',
        rawText: 'Updated Text',
      });

      expect(result.title).toBe('Updated Title');
      expect(mockPrisma.assistantNote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'note-1' },
          data: expect.objectContaining({
            title: 'Updated Title',
            rawText: 'Updated Text',
            revisions: {
              create: expect.objectContaining({
                source: AssistantNoteRevisionSource.MANUAL,
                previousData: {
                  title: 'Original Title',
                  rawText: 'Original Text',
                  structuredData: null,
                },
                newData: {
                  title: 'Updated Title',
                  rawText: 'Updated Text',
                  structuredData: null,
                },
              }),
            },
          }),
        })
      );
    });

    it('throws ForbiddenException when user attempts to update another user note', async () => {
      const mockNote = { id: 'note-1', userId: 'user-1', title: 'User 1 Note' };
      mockPrisma.assistantNote.findUnique.mockResolvedValue(mockNote);

      await expect(
        service.update('attacker-2', 'note-1', { title: 'Hacked Title' })
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('archive', () => {
    it('sets status to ARCHIVED and records archivedAt without physical delete', async () => {
      const mockNote = {
        id: 'note-1',
        userId: 'user-1',
        status: AssistantNoteStatus.DRAFT,
      };
      mockPrisma.assistantNote.findUnique.mockResolvedValue(mockNote);

      const archivedNote = {
        ...mockNote,
        status: AssistantNoteStatus.ARCHIVED,
        archivedAt: new Date(),
      };
      mockPrisma.assistantNote.update.mockResolvedValue(archivedNote);

      const result = await service.archive('user-1', 'note-1');

      expect(result.status).toBe(AssistantNoteStatus.ARCHIVED);
      expect(mockPrisma.assistantNote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'note-1' },
          data: expect.objectContaining({
            status: AssistantNoteStatus.ARCHIVED,
            archivedAt: expect.any(Date),
          }),
        })
      );
    });
  });
});
