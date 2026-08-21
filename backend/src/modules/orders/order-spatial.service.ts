import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import { LoggerService } from '../logger/logger.service';

export const MAX_SEARCH_RADIUS_KM = 100;

@Injectable()
export class OrderSpatialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setService('OrderSpatialService');
  }

  async findSpatial(params: {
    lat?: number; lng?: number; radius?: number; units?: string;
    minLat?: number; maxLat?: number; minLng?: number; maxLng?: number;
    updatedAfter?: Date;
    categoryId?: string;
    requesterId?: string;
    cursorId?: string;
    limit?: number;
    dateFilter?: string;
  }) {
    if (params.units !== undefined && params.units !== 'km') {
      throw new BadRequestException('Invalid unit: only "km" is supported');
    }

    if (params.lat !== undefined) {
      if (typeof params.lat !== 'number' || !Number.isFinite(params.lat) || params.lat < -90 || params.lat > 90) {
        throw new BadRequestException('Invalid latitude');
      }
    }

    if (params.lng !== undefined) {
      if (typeof params.lng !== 'number' || !Number.isFinite(params.lng) || params.lng < -180 || params.lng > 180) {
        throw new BadRequestException('Invalid longitude');
      }
    }

    if (params.radius !== undefined) {
      if (typeof params.radius !== 'number' || !Number.isFinite(params.radius) || params.radius <= 0) {
        throw new BadRequestException('Invalid radius');
      }
      if (params.radius > MAX_SEARCH_RADIUS_KM) {
        throw new BadRequestException(`Invalid radius: exceeds maximum search radius of ${MAX_SEARCH_RADIUS_KM} km`);
      }
    }

    if (params.minLat !== undefined) {
      if (typeof params.minLat !== 'number' || !Number.isFinite(params.minLat) || params.minLat < -90 || params.minLat > 90) {
        throw new BadRequestException('Invalid latitude');
      }
    }

    if (params.maxLat !== undefined) {
      if (typeof params.maxLat !== 'number' || !Number.isFinite(params.maxLat) || params.maxLat < -90 || params.maxLat > 90) {
        throw new BadRequestException('Invalid latitude');
      }
    }

    if (params.minLat !== undefined && params.maxLat !== undefined) {
      if (params.minLat > params.maxLat) {
        throw new BadRequestException('Invalid latitude bounds: minLat cannot exceed maxLat');
      }
    }

    if (params.minLng !== undefined) {
      if (typeof params.minLng !== 'number' || !Number.isFinite(params.minLng) || params.minLng < -180 || params.minLng > 180) {
        throw new BadRequestException('Invalid longitude');
      }
    }

    if (params.maxLng !== undefined) {
      if (typeof params.maxLng !== 'number' || !Number.isFinite(params.maxLng) || params.maxLng < -180 || params.maxLng > 180) {
        throw new BadRequestException('Invalid longitude');
      }
    }

    const startTime = Date.now();
    const { lat, lng, radius, minLat, maxLat, minLng, maxLng, updatedAfter, categoryId, requesterId, cursorId, limit, dateFilter } = params;

    let searchBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null = null;

    if (lat !== undefined && lng !== undefined && radius !== undefined) {
      const R = 6371;
      const deltaLat = (radius / R) * (180 / Math.PI);

      const latRad = (lat * Math.PI) / 180;
      const cosLat = Math.cos(latRad);

      // Safe calculation near poles
      let deltaLng = 180;
      if (Math.abs(cosLat) > 0.00001) {
        deltaLng = (radius / R) * (180 / Math.PI) / Math.abs(cosLat);
      }

      let calculatedMinLng = lng - deltaLng;
      let calculatedMaxLng = lng + deltaLng;

      if (calculatedMinLng < -180) calculatedMinLng += 360;
      if (calculatedMaxLng > 180) calculatedMaxLng -= 360;

      searchBounds = {
        minLat: Math.max(-90, lat - deltaLat),
        maxLat: Math.min(90, lat + deltaLat),
        minLng: calculatedMinLng,
        maxLng: calculatedMaxLng,
      };
    } else if (minLat !== undefined && maxLat !== undefined && minLng !== undefined && maxLng !== undefined) {
      searchBounds = { minLat, maxLat, minLng, maxLng };
    }

    if (!searchBounds) return { created: [], updated: [], deleted: [] };

    try {
      let dateQuery: any = undefined;
      if (dateFilter && dateFilter !== 'all') {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        if (dateFilter === 'today') {
          dateQuery = { gte: startOfToday, lte: endOfToday };
        } else if (dateFilter === '3days') {
          const threeDaysLater = new Date(startOfToday.getTime() + 3 * 24 * 60 * 60 * 1000);
          dateQuery = { gte: startOfToday, lte: threeDaysLater };
        } else if (dateFilter === 'week') {
          const weekLater = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
          dateQuery = { gte: startOfToday, lte: weekLater };
        }
      }

      // Build longitude condition (handling antimeridian crossing if minLng > maxLng)
      let longitudeWhere: any;
      if (searchBounds.minLng <= searchBounds.maxLng) {
        longitudeWhere = { gte: searchBounds.minLng, lte: searchBounds.maxLng };
      } else {
        // Antimeridian crossing: e.g. minLng = 170, maxLng = -170
        longitudeWhere = {
          OR: [
            { gte: searchBounds.minLng },
            { lte: searchBounds.maxLng },
          ],
        };
      }

      const orders = await this.prisma.order.findMany({
        where: {
          status: { in: [OrderStatus.PUBLISHED, OrderStatus.HAS_RESPONSES, OrderStatus.CLAIMED, OrderStatus.IN_PROGRESS] },
          latitude: { gte: searchBounds.minLat, lte: searchBounds.maxLat },
          longitude: longitudeWhere.OR ? undefined : longitudeWhere,
          OR: longitudeWhere.OR
            ? [
                { longitude: { gte: searchBounds.minLng } },
                { longitude: { lte: searchBounds.maxLng } },
              ]
            : undefined,
          updatedAt: updatedAfter ? { gt: updatedAfter } : undefined,
          categoryId: categoryId || undefined,
          date: dateQuery,
        },
        take: Math.min(limit !== undefined ? Number(limit) : 250, 250),
        skip: cursorId ? 1 : undefined,
        cursor: cursorId ? { id: cursorId } : undefined,
        orderBy: { id: 'asc' },
        select: {
          id: true,
          latitude: true,
          longitude: true,
          price: true,
          status: true,
          title: true,
          workType: true,
          updatedAt: true,
          employer: { select: { id: true, name: true, rating: true, avatar: true } },
          _count: { select: { applications: true } }
        }
      });

      const duration = Date.now() - startTime;
      if (duration > 500) {
        this.logger.warn('SPATIAL_SEARCH_SLOW', 'Map spatial search took too long', {
          metadata: { duration, lat, lng, radius, count: orders.length }
        });
      }

      return { created: orders, updated: [], deleted: [] };
    } catch (error) {
      this.logger.error('SPATIAL_SEARCH_ERROR', 'Map spatial search failed', {
        metadata: { error: (error as any).message, lat, lng, radius }
      });
      throw error;
    }
  }
}
