import { Test, TestingModule } from '@nestjs/testing';
import { OrderSpatialService, MAX_SEARCH_RADIUS_KM } from './order-spatial.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { BadRequestException } from '@nestjs/common';

describe('OrderSpatialService Validation & Antimeridian', () => {
  let service: OrderSpatialService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      order: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderSpatialService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LoggerService, useValue: { setService: jest.fn(), warn: jest.fn(), error: jest.fn() } },
      ],
    }).compile();

    service = module.get<OrderSpatialService>(OrderSpatialService);
  });

  describe('Latitude Validation', () => {
    it('A: accepts lat = 0, 90, -90', async () => {
      await expect(service.findSpatial({ lat: 0, lng: 0, radius: 10 })).resolves.toBeDefined();
      await expect(service.findSpatial({ lat: 90, lng: 0, radius: 10 })).resolves.toBeDefined();
      await expect(service.findSpatial({ lat: -90, lng: 0, radius: 10 })).resolves.toBeDefined();
    });

    it('C/D: rejects invalid lat (>90, <-90, NaN, Infinity)', async () => {
      await expect(service.findSpatial({ lat: 90.1, lng: 0, radius: 10 })).rejects.toThrow(BadRequestException);
      await expect(service.findSpatial({ lat: -90.1, lng: 0, radius: 10 })).rejects.toThrow(BadRequestException);
      await expect(service.findSpatial({ lat: NaN, lng: 0, radius: 10 })).rejects.toThrow(BadRequestException);
      await expect(service.findSpatial({ lat: Infinity, lng: 0, radius: 10 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('Longitude Validation', () => {
    it('E/F: accepts lng = 0, 180, -180', async () => {
      await expect(service.findSpatial({ lat: 0, lng: 0, radius: 10 })).resolves.toBeDefined();
      await expect(service.findSpatial({ lat: 0, lng: 180, radius: 10 })).resolves.toBeDefined();
      await expect(service.findSpatial({ lat: 0, lng: -180, radius: 10 })).resolves.toBeDefined();
    });

    it('G/H: rejects invalid lng (>180, <-180, NaN, Infinity)', async () => {
      await expect(service.findSpatial({ lat: 0, lng: 180.1, radius: 10 })).rejects.toThrow(BadRequestException);
      await expect(service.findSpatial({ lat: 0, lng: -180.1, radius: 10 })).rejects.toThrow(BadRequestException);
      await expect(service.findSpatial({ lat: 0, lng: NaN, radius: 10 })).rejects.toThrow(BadRequestException);
      await expect(service.findSpatial({ lat: 0, lng: Infinity, radius: 10 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('Latitude Bounds (minLat / maxLat)', () => {
    it('I: minLat <= maxLat is valid', async () => {
      await expect(service.findSpatial({ minLat: 10, maxLat: 20, minLng: 10, maxLng: 20 })).resolves.toBeDefined();
    });

    it('J: minLat > maxLat -> 400 BadRequestException', async () => {
      await expect(service.findSpatial({ minLat: 20, maxLat: 10, minLng: 10, maxLng: 20 })).rejects.toThrow(
        new BadRequestException('Invalid latitude bounds: minLat cannot exceed maxLat')
      );
    });
  });

  describe('Longitude Bounds & Antimeridian Crossing', () => {
    it('K: minLng <= maxLng uses normal range query', async () => {
      await service.findSpatial({ minLat: -10, maxLat: 10, minLng: -50, maxLng: 50 });
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            longitude: { gte: -50, lte: 50 },
          }),
        })
      );
    });

    it('L: Antimeridian crossing (minLng = 170, maxLng = -170) -> uses OR query clause', async () => {
      await service.findSpatial({ minLat: -10, maxLat: 10, minLng: 170, maxLng: -170 });
      expect(mockPrisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { longitude: { gte: 170 } },
              { longitude: { lte: -170 } },
            ],
          }),
        })
      );
    });
  });

  describe('Radius & Units Contract', () => {
    it('N/O: accepts valid radius within 0..100 km', async () => {
      await expect(service.findSpatial({ lat: 0, lng: 0, radius: 0.1 })).resolves.toBeDefined();
      await expect(service.findSpatial({ lat: 0, lng: 0, radius: MAX_SEARCH_RADIUS_KM })).resolves.toBeDefined();
    });

    it('P: rejects radius <= 0, > 100, or non-finite', async () => {
      await expect(service.findSpatial({ lat: 0, lng: 0, radius: 0 })).rejects.toThrow(BadRequestException);
      await expect(service.findSpatial({ lat: 0, lng: 0, radius: -5 })).rejects.toThrow(BadRequestException);
      await expect(service.findSpatial({ lat: 0, lng: 0, radius: 101 })).rejects.toThrow(BadRequestException);
      await expect(service.findSpatial({ lat: 0, lng: 0, radius: NaN })).rejects.toThrow(BadRequestException);
    });

    it('G: rejects unsupported unit types', async () => {
      await expect(service.findSpatial({ lat: 0, lng: 0, radius: 10, units: 'miles' })).rejects.toThrow(
        new BadRequestException('Invalid unit: only "km" is supported')
      );
    });
  });

  describe('Poles Calculation Safety', () => {
    it('Q: lat near +/-90 degrees calculates bounds safely without division by zero', async () => {
      await expect(service.findSpatial({ lat: 89.999, lng: 0, radius: 10 })).resolves.toBeDefined();
      await expect(service.findSpatial({ lat: -89.999, lng: 0, radius: 10 })).resolves.toBeDefined();
      await expect(service.findSpatial({ lat: 90, lng: 0, radius: 10 })).resolves.toBeDefined();
      await expect(service.findSpatial({ lat: -90, lng: 0, radius: 10 })).resolves.toBeDefined();
    });
  });
});
