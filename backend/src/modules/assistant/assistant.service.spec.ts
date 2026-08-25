import { Test, TestingModule } from '@nestjs/testing';
import { AssistantService } from './assistant.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { AiService } from '../ai/ai.service';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';

describe('AssistantService', () => {
  let service: AssistantService;
  let prismaMock: any;
  let loggerMock: any;
  let aiServiceMock: any;

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', deletedAt: null }),
      },
      assistantNote: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      assistantNoteRevision: {
        create: jest.fn(),
      },
      assistantNoteAttachment: {
        create: jest.fn(),
      },
    };

    loggerMock = {
      setContext: jest.fn(),
      setService: jest.fn(),
      info: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    aiServiceMock = {
      transcribeAudio: jest.fn(),
      analyzeAssistantNote: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistantService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: LoggerService,
          useValue: loggerMock,
        },
        {
          provide: AiService,
          useValue: aiServiceMock,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AssistantService>(AssistantService);
  });

  describe('create', () => {
    it('creates note and initial revision for active user', async () => {
      const dto = { title: 'Test Note', rawText: 'Raw text' };
      const createdNote = { id: 'note-1', userId: 'user-1', title: 'Test Note', rawText: 'Raw text', status: 'DRAFT' };

      prismaMock.assistantNote.create.mockResolvedValue(createdNote);

      const result = await service.create('user-1', dto);

      expect(result).toEqual(createdNote);
      expect(prismaMock.assistantNote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          title: 'Test Note',
          status: 'DRAFT',
        }),
        include: expect.any(Object),
      });
    });

    it('sets status to STRUCTURED when structuredData is provided', async () => {
      const dto = { title: 'Structured Note', structuredData: { key: 'value' } };
      const createdNote = { id: 'note-2', userId: 'user-1', title: 'Structured Note', status: 'STRUCTURED' };

      prismaMock.assistantNote.create.mockResolvedValue(createdNote);

      await service.create('user-1', dto);

      expect(prismaMock.assistantNote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'STRUCTURED',
        }),
        include: expect.any(Object),
      });
    });
  });

  describe('findAll', () => {
    it('returns only notes belonging to current user and excludes archived by default', async () => {
      const notes = [{ id: 'note-1', userId: 'user-1' }];
      prismaMock.assistantNote.findMany.mockResolvedValue(notes);

      const result = await service.findAll('user-1', {});

      expect(result).toEqual(notes);
      expect(prismaMock.assistantNote.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          status: { not: 'ARCHIVED' },
        },
        orderBy: { createdAt: 'desc' },
        skip: undefined,
        take: 50,
        include: {
          attachments: { orderBy: { createdAt: 'asc' } },
          revisions: { take: 1, orderBy: { createdAt: 'desc' } },
        },
      });
    });

    it('includes archived notes when includeArchived flag is true', async () => {
      prismaMock.assistantNote.findMany.mockResolvedValue([]);

      await service.findAll('user-1', { includeArchived: true });

      expect(prismaMock.assistantNote.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
        skip: undefined,
        take: 50,
        include: {
          attachments: { orderBy: { createdAt: 'asc' } },
          revisions: { take: 1, orderBy: { createdAt: 'desc' } },
        },
      });
    });
  });

  describe('findOne & IDOR Authorization', () => {
    it('returns note when user reads their own note', async () => {
      const mockNote = { id: 'note-1', userId: 'user-1' };
      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);

      const result = await service.findOne('user-1', 'note-1');

      expect(result).toEqual(mockNote);
    });

    it('throws ForbiddenException when user attempts to read another user note (IDOR block)', async () => {
      const mockNote = { id: 'note-1', userId: 'user-2' };
      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);

      await expect(service.findOne('user-1', 'note-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when note does not exist', async () => {
      prismaMock.assistantNote.findUnique.mockResolvedValue(null);

      await expect(service.findOne('user-1', 'nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update & Revision History', () => {
    it('updates note and creates a new revision recording previousData and newData', async () => {
      const existingNote = { id: 'note-1', userId: 'user-1', title: 'Old Title', rawText: 'Old' };
      const updateDto = { title: 'New Title' };
      const updatedNote = { ...existingNote, title: 'New Title' };

      prismaMock.assistantNote.findUnique.mockResolvedValue(existingNote);
      prismaMock.assistantNote.update.mockResolvedValue(updatedNote);

      const result = await service.update('user-1', 'note-1', updateDto);

      expect(result).toEqual(updatedNote);
      expect(prismaMock.assistantNote.update).toHaveBeenCalledWith({
        where: { id: 'note-1' },
        data: expect.objectContaining({
          title: 'New Title',
          revisions: expect.any(Object),
        }),
        include: expect.any(Object),
      });
    });

    it('throws ForbiddenException when user attempts to update another user note', async () => {
      const existingNote = { id: 'note-1', userId: 'user-2' };
      prismaMock.assistantNote.findUnique.mockResolvedValue(existingNote);

      await expect(service.update('user-1', 'note-1', { title: 'Hacked' })).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('archive', () => {
    it('sets status to ARCHIVED and records archivedAt without physical delete', async () => {
      const existingNote = { id: 'note-1', userId: 'user-1' };
      const archivedNote = { ...existingNote, status: 'ARCHIVED', archivedAt: new Date() };

      prismaMock.assistantNote.findUnique.mockResolvedValue(existingNote);
      prismaMock.assistantNote.update.mockResolvedValue(archivedNote);

      const result = await service.archive('user-1', 'note-1');

      expect(result).toEqual(archivedNote);
      expect(prismaMock.assistantNote.update).toHaveBeenCalledWith({
        where: { id: 'note-1' },
        data: expect.objectContaining({
          status: 'ARCHIVED',
          archivedAt: expect.any(Date),
        }),
        include: expect.any(Object),
      });
    });
  });

  describe('addAudioAttachment', () => {
    it('throws ForbiddenException when user attempts to attach audio to another user note', async () => {
      const mockNote = { id: 'note-2', userId: 'user-2' };
      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);

      await expect(
        service.addAudioAttachment('user-1', 'note-2', {
          mimetype: 'audio/m4a',
          size: 1024,
          path: '/tmp/test.m4a',
          filename: 'test.m4a',
          originalname: 'voice.m4a',
        } as any, 5000),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when file MIME type is invalid', async () => {
      const mockNote = { id: 'note-1', userId: 'user-1' };
      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);

      await expect(
        service.addAudioAttachment('user-1', 'note-1', {
          mimetype: 'video/mp4',
          size: 1024,
          path: '/tmp/test.mp4',
          filename: 'test.mp4',
        } as any, 5000),
      ).rejects.toThrow(BadRequestException);
    });

    it('successfully creates audio attachment and revision', async () => {
      const mockNote = { id: 'note-1', userId: 'user-1' };
      const mockAttachment = { id: 'att-1', noteId: 'note-1', type: 'AUDIO', durationMs: 5000 };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);
      prismaMock.assistantNoteAttachment.create.mockResolvedValue(mockAttachment);

      const result = await service.addAudioAttachment('user-1', 'note-1', {
        mimetype: 'audio/m4a',
        size: 2048,
        path: '/tmp/test.m4a',
        filename: 'test.m4a',
        originalname: 'test.m4a',
      } as any, 5000);

      expect(result).toEqual(mockNote);
      expect(prismaMock.assistantNoteAttachment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          noteId: 'note-1',
          type: 'AUDIO',
          durationMs: 5000,
          mimeType: 'audio/m4a',
        }),
      });
      expect(prismaMock.assistantNoteRevision.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          noteId: 'note-1',
          source: 'VOICE',
        }),
      });
    });
  });
});
