import { Test, TestingModule } from '@nestjs/testing';
import { OrderSpatialService } from './order-spatial.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';
import { BadRequestException } from '@nestjs/common';

describe('OrderSpatialService.findSpatial Validation', () => {
  let service: OrderSpatialService;
  let prisma: any;

  const mockPrismaService = {
    order: {
      findMany: jest.fn(),
    },
  };

  const mockLoggerService = {
    setService: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderSpatialService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<OrderSpatialService>(OrderSpatialService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('Latitude Validation', () => {
    it('should throw BadRequestException when lat is NaN', async () => {
      await expect(service.findSpatial({ lat: NaN, lng: 37.61, radius: 10 }))
        .rejects.toThrow(new BadRequestException('Invalid latitude'));
      expect(mockPrismaService.order.findMany).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when lat is Infinity', async () => {
      await expect(service.findSpatial({ lat: Infinity, lng: 37.61, radius: 10 }))
        .rejects.toThrow(new BadRequestException('Invalid latitude'));
      expect(mockPrismaService.order.findMany).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when lat is -91', async () => {
      await expect(service.findSpatial({ lat: -91, lng: 37.61, radius: 10 }))
        .rejects.toThrow(new BadRequestException('Invalid latitude'));
      expect(mockPrismaService.order.findMany).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when lat is 91', async () => {
      await expect(service.findSpatial({ lat: 91, lng: 37.61, radius: 10 }))
        .rejects.toThrow(new BadRequestException('Invalid latitude'));
      expect(mockPrismaService.order.findMany).not.toHaveBeenCalled();
    });
  });

  describe('Longitude Validation', () => {
    it('should throw BadRequestException when lng is NaN', async () => {
      await expect(service.findSpatial({ lat: 55.75, lng: NaN, radius: 10 }))
        .rejects.toThrow(new BadRequestException('Invalid longitude'));
      expect(mockPrismaService.order.findMany).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when lng is Infinity', async () => {
      await expect(service.findSpatial({ lat: 55.75, lng: Infinity, radius: 10 }))
        .rejects.toThrow(new BadRequestException('Invalid longitude'));
      expect(mockPrismaService.order.findMany).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when lng is -181', async () => {
      await expect(service.findSpatial({ lat: 55.75, lng: -181, radius: 10 }))
        .rejects.toThrow(new BadRequestException('Invalid longitude'));
      expect(mockPrismaService.order.findMany).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when lng is 181', async () => {
      await expect(service.findSpatial({ lat: 55.75, lng: 181, radius: 10 }))
        .rejects.toThrow(new BadRequestException('Invalid longitude'));
      expect(mockPrismaService.order.findMany).not.toHaveBeenCalled();
    });
  });

  describe('Radius Validation', () => {
    it('should throw BadRequestException when radius is NaN', async () => {
      await expect(service.findSpatial({ lat: 55.75, lng: 37.61, radius: NaN }))
        .rejects.toThrow(new BadRequestException('Invalid radius'));
      expect(mockPrismaService.order.findMany).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when radius is Infinity', async () => {
      await expect(service.findSpatial({ lat: 55.75, lng: 37.61, radius: Infinity }))
        .rejects.toThrow(new BadRequestException('Invalid radius'));
      expect(mockPrismaService.order.findMany).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when radius <= 0', async () => {
      await expect(service.findSpatial({ lat: 55.75, lng: 37.61, radius: 0 }))
        .rejects.toThrow(new BadRequestException('Invalid radius'));
      await expect(service.findSpatial({ lat: 55.75, lng: 37.61, radius: -5 }))
        .rejects.toThrow(new BadRequestException('Invalid radius'));
      expect(mockPrismaService.order.findMany).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when radius > 100 km limit', async () => {
      await expect(service.findSpatial({ lat: 55.75, lng: 37.61, radius: 101 }))
        .rejects.toThrow(new BadRequestException('Invalid radius: exceeds maximum search radius of 100 km'));
      expect(mockPrismaService.order.findMany).not.toHaveBeenCalled();
    });
  });

  describe('Valid Coordinates', () => {
    it('should pass validation and query Prisma for valid lat, lng, radius', async () => {
      mockPrismaService.order.findMany.mockResolvedValueOnce([
        { id: 'order-1', latitude: 55.75, longitude: 37.61 }
      ]);

      const result = await service.findSpatial({ lat: 55.75, lng: 37.61, radius: 50 });

      expect(mockPrismaService.order.findMany).toHaveBeenCalled();
      expect(result.created).toHaveLength(1);
    });
  });
});
