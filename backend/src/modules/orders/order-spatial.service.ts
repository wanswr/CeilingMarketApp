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
    zoom?: number;
  }) {
    const startTime = Date.now();
    const { lat, lng, radius: rawRadius, minLat, maxLat, minLng, maxLng, updatedAfter, categoryId, requesterId, cursorId, limit, zoom } = params;
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
      const orders = await this.prisma.order.findMany({
        where: {
          status: { in: [OrderStatus.PUBLISHED, OrderStatus.HAS_RESPONSES, OrderStatus.CLAIMED, OrderStatus.IN_PROGRESS] },
          latitude: { gte: searchBounds.minLat, lte: searchBounds.maxLat },
          longitude: { gte: searchBounds.minLng, lte: searchBounds.maxLng },
          updatedAt: updatedAfter ? { gt: updatedAfter } : undefined,
          categoryId: categoryId || undefined,
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

      const isWideZoom = zoom !== undefined ? (zoom <= 11) : ((searchBounds.maxLat - searchBounds.minLat) > 0.4);

      if (isWideZoom && orders.length > 5) {
        const precision = zoom !== undefined ? (zoom <= 5 ? 0 : (zoom <= 8 ? 1 : 2)) : 1;
        const clusters: Record<string, any> = {};

        for (const order of orders) {
          const latVal = order.latitude;
          const lngVal = order.longitude;
          const factor = Math.pow(10, precision);
          const bucketLat = Math.floor(latVal * factor) / factor;
          const bucketLng = Math.floor(lngVal * factor) / factor;
          const key = bucketLat.toFixed(precision) + "_" + bucketLng.toFixed(precision);

          if (!clusters[key]) {
            clusters[key] = {
              id: "cluster_" + key,
              latitude: bucketLat,
              longitude: bucketLng,
              count: 0,
              isCluster: true,
              type: 'weak',
              status: 'PUBLISHED',
              price: 0,
              title: 'Кластер заказов',
            };
          }
          clusters[key].count++;
          clusters[key].price = Math.max(clusters[key].price, Number(order.price) || 0);
        }

        const resultOrders: any[] = [];
        for (const key of Object.keys(clusters)) {
          const cluster = clusters[key];
          if (cluster.count <= 3) {
            const matchedOrders = orders.filter(o => {
              const factor = Math.pow(10, precision);
              const bLat = Math.floor(o.latitude * factor) / factor;
              const bLng = Math.floor(o.longitude * factor) / factor;
              return (bLat.toFixed(precision) + "_" + bLng.toFixed(precision)) === key;
            });
            resultOrders.push(...matchedOrders);
          } else {
            cluster.type = cluster.count > 10 ? 'strong' : 'weak';
            resultOrders.push(cluster);
          }
        }
        return { created: resultOrders, updated: [], deleted: [] };
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
