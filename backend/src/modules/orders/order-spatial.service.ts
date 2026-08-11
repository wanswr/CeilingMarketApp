import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class OrderSpatialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setService('OrderSpatialService');
  }

  async findSpatial(params: {
    lat?: number; lng?: number; radius?: number;
    minLat?: number; maxLat?: number; minLng?: number; maxLng?: number;
    updatedAfter?: Date;
    categoryId?: string;
    requesterId?: string;
    cursorId?: string;
    limit?: number;
    dateFilter?: string;
  }) {
    const startTime = Date.now();
    const { lat, lng, radius: rawRadius, minLat, maxLat, minLng, maxLng, updatedAfter, categoryId, requesterId, cursorId, limit, dateFilter } = params;
    const radius = rawRadius !== undefined ? Math.min(rawRadius, 100) : undefined;

    let searchBounds: { minLat: number, maxLat: number, minLng: number, maxLng: number } | null = null;

    if (lat !== undefined && lng !== undefined && radius !== undefined) {
      const R = 6371;
      const deltaLat = (radius / R) * (180 / Math.PI);
      const deltaLng = (radius / R) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);

      searchBounds = {
        minLat: lat - deltaLat,
        maxLat: lat + deltaLat,
        minLng: lng - deltaLng,
        maxLng: lng + deltaLng,
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
          // Strictly current calendar day
          dateQuery = {
            gte: startOfToday,
            lte: endOfToday
          };
        } else if (dateFilter === '3days') {
          const threeDaysLater = new Date(startOfToday.getTime() + 3 * 24 * 60 * 60 * 1000);
          dateQuery = {
            gte: startOfToday,
            lte: threeDaysLater
          };
        } else if (dateFilter === 'week') {
          const weekLater = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
          dateQuery = {
            gte: startOfToday,
            lte: weekLater
          };
        }
      }

      const orders = await this.prisma.order.findMany({
        where: {
          status: { in: [OrderStatus.PUBLISHED, OrderStatus.HAS_RESPONSES, OrderStatus.CLAIMED, OrderStatus.IN_PROGRESS] },
          latitude: { gte: searchBounds.minLat, lte: searchBounds.maxLat },
          longitude: { gte: searchBounds.minLng, lte: searchBounds.maxLng },
          updatedAt: updatedAfter ? { gt: updatedAfter } : undefined,
          categoryId: categoryId || undefined,
          date: dateQuery,
        },
        take: Math.min(limit !== undefined ? Number(limit) : 250, 250),
        skip: cursorId ? 1 : undefined,
        cursor: cursorId ? { id: cursorId } : undefined,
        orderBy: { id: 'asc' },
        // V12 Lightweight Map DTO optimization:
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
