import { AppGateway } from '../gateway/app.gateway';
import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderParserService } from './order-parser.service';
import { OrderSpatialService } from './order-spatial.service';
import { LoggerService } from '../logger/logger.service';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';

describe('OrdersService Assistant Note Linkage & Duplicate Protection', () => {
  let service: OrdersService;
  let prismaMock: any;

  beforeEach(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          role: Role.EMPLOYER,
          isBlocked: false,
          deletedAt: null,
        }),
      },
      assistantNote: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      order: {
        create: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(prismaMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: AppGateway, useValue: { server: { emit: jest.fn() } } },
        { provide: PrismaService, useValue: prismaMock },
        { provide: OrderParserService, useValue: {} },
        { provide: OrderSpatialService, useValue: {} },
        {
          provide: LoggerService,
          useValue: { setContext: jest.fn(), log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  describe('Order Creation with sourceNoteId', () => {
    const validDto = {
      title: 'Заказ из заметки',
      details: 'Спальня 20 м²',
      price: 15000,
      address: 'Ленина 15',
      latitude: 55.75,
      longitude: 37.61,
      date: '2026-09-01',
      categoryId: 'cat-1',
      sourceNoteId: 'note-1',
    };

    it('successfully creates order and links convertedOrderId on AssistantNote in a single transaction', async () => {
      const mockNote = { id: 'note-1', userId: 'user-1', convertedOrderId: null };
      const mockOrder = { id: 'order-100', ...validDto, employerId: 'user-1', status: OrderStatus.PUBLISHED };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);
      prismaMock.order.create.mockResolvedValue(mockOrder);
      prismaMock.assistantNote.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.create(validDto, 'user-1');

      expect(result).toEqual(mockOrder);
      expect(prismaMock.assistantNote.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'note-1',
          userId: 'user-1',
          convertedOrderId: null,
        },
        data: {
          convertedOrderId: 'order-100',
        },
      });
    });

    it('throws ForbiddenException when attempting to convert another user assistant note', async () => {
      const mockNote = { id: 'note-1', userId: 'user-2', convertedOrderId: null };
      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);

      await expect(service.create(validDto, 'user-1')).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException if note is already linked to another order', async () => {
      const mockNote = { id: 'note-1', userId: 'user-1', convertedOrderId: 'existing-order' };
      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);

      await expect(service.create(validDto, 'user-1')).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException on concurrent duplicate conversion attempt', async () => {
      const mockNote = { id: 'note-1', userId: 'user-1', convertedOrderId: null };
      const mockOrder = { id: 'order-100', ...validDto, employerId: 'user-1', status: OrderStatus.PUBLISHED };

      prismaMock.assistantNote.findUnique.mockResolvedValue(mockNote);
      prismaMock.order.create.mockResolvedValue(mockOrder);
      prismaMock.assistantNote.updateMany.mockResolvedValue({ count: 0 }); // Concurrent update modified record first

      await expect(service.create(validDto, 'user-1')).rejects.toThrow(ConflictException);
    });
  });
});
