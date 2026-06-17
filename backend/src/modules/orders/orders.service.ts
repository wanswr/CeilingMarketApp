import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from '@prisma/client';
import { AppGateway } from '../gateway/app.gateway';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private gateway: AppGateway,
  ) {}

  /**
   * Status transitions map: defines legal state changes.
   */
  private readonly transitions: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.PENDING]: [OrderStatus.PUBLISHED, OrderStatus.CANCELLED],
    [OrderStatus.PUBLISHED]: [OrderStatus.CLAIMED, OrderStatus.CANCELLED],
    [OrderStatus.CLAIMED]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
    [OrderStatus.IN_PROGRESS]: [OrderStatus.COMPLETED, OrderStatus.DISPUTE],
    [OrderStatus.COMPLETED]: [],
    [OrderStatus.CANCELLED]: [],
    [OrderStatus.DISPUTE]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  };

  /**
   * CREATE: Implements idempotency and sets initial status.
   */
  async create(dto: CreateOrderDto, employerId: string) {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: { idempotencyKey: dto.idempotencyKey }
      });
      if (existing) return existing;
    }

    console.log(`[OrdersService] Creating order for employer: ${employerId}`);
    const order = await this.prisma.order.create({
      data: {
        title: dto.title,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        price: dto.price,
        details: dto.details,
        date: new Date(dto.date),
        images: dto.images || [],
        employerId,
        idempotencyKey: dto.idempotencyKey,
        status: OrderStatus.PUBLISHED, // Target status for new orders
      },
    });

    this.gateway.broadcast('order_created', order);
    return order;
  }

  /**
   * ATOMIC CLAIM: Postgres Transaction + row-level locking
   */
  async claim(orderId: string, workerId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. SELECT FOR UPDATE to lock the row and prevent concurrent claims
      const orderArray = await tx.$queryRaw<any[]>`
        SELECT * FROM "Order"
        WHERE "id" = ${orderId}
        FOR UPDATE
      `;
      const order = orderArray[0];

      if (!order) throw new NotFoundException('Order not found');

      // 2. State machine guard
      if (order.status !== OrderStatus.PUBLISHED) {
        throw new ConflictException(`Cannot claim order in ${order.status} state`);
      }

      // 3. Subscription check
      const sub = await tx.subscription.findUnique({ where: { userId: workerId } });
      if (!sub || !sub.isActive || new Date(sub.activeUntil) < new Date()) {
        throw new ForbiddenException('Active subscription required');
      }

      // 4. Atomic update
      return tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CLAIMED,
          workerId,
          claimedAt: new Date(),
        },
      });
    });

    this.gateway.broadcast('order_claimed', result);
    return result;
  }

  /**
   * TRANSITION: Guarded status changes using centralized transition map
   */
  async transitionStatus(orderId: string, newStatus: OrderStatus, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException();

    // Permissions check
    const isEmployer = order.employerId === userId;
    const isWorker = order.workerId === userId;
    if (!isEmployer && !isWorker) throw new ForbiddenException();

    // State Machine Rules
    if (!this.canTransition(order.status, newStatus)) {
      throw new ConflictException(`Transition ${order.status} -> ${newStatus} not allowed`);
    }

    const result = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: newStatus }
    });

    this.gateway.broadcast('order_updated', result);
    return result;
  }

  private canTransition(from: OrderStatus, to: OrderStatus): boolean {
    return this.transitions[from]?.includes(to) || false;
  }

  async findAll(filters: { lat?: number; lng?: number; radius?: number; minPrice?: number; status?: string }) {
    const { lat, lng, radius, minPrice, status } = filters;
    const where: any = {};
    if (minPrice) where.price = { gte: minPrice };
    if (status) where.status = status as OrderStatus;

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        employer: { select: { id: true, name: true, rating: true, avatar: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (lat && lng && radius) {
      return orders.filter(order => {
        const d = this.calculateDistance(lat, lng, order.latitude, order.longitude);
        (order as any).distance = d;
        return d <= radius;
      });
    }
    return orders;
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        employer: true,
        worker: true,
        applications: { include: { worker: true } }
      }
    });
    if (!order) throw new NotFoundException();
    return order;
  }

  async update(id: string, dto: any, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException();
    if (order.employerId !== userId) throw new ForbiddenException();

    // If status is being changed, validate transition
    if (dto.status && dto.status !== order.status) {
      if (!this.canTransition(order.status, dto.status)) {
        throw new ConflictException(`Transition ${order.status} -> ${dto.status} not allowed`);
      }
    }

    const result = await this.prisma.order.update({
      where: { id },
      data: dto
    });

    this.gateway.broadcast('order_updated', result);
    return result;
  }

  async remove(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order || order.employerId !== userId) throw new ForbiddenException();
    return this.prisma.order.delete({ where: { id } });
  }

  /**
   * SPATIAL ENGINE V4: Finds orders within a Bounding Box.
   */
  async findInBounds(bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number }, updatedAfter?: Date) {
    const { minLat, maxLat, minLng, maxLng } = bounds;

    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PUBLISHED,
        latitude: { gte: minLat, lte: maxLat },
        longitude: { gte: minLng, lte: maxLng },
        updatedAt: updatedAfter ? { gt: updatedAfter } : undefined,
      },
      take: 2000, // Reasonable cap for viewport
      include: { employer: { select: { id: true, name: true, rating: true, avatar: true } } },
    });

    // Wrapped in { created: [] } to maintain compatibility with frontend Orchestrator V2.1+
    return { created: orders, updated: [], deleted: [] };
  }

  async findIncremental(filters: { updatedAfter?: Date; status?: string }) {
    const { updatedAfter, status } = filters;

    const statusFilter = status ? (status as OrderStatus) : undefined;

    // Stage 3: Fetch only changes since last sync (with safety limit for legacy)
    const created = await this.prisma.order.findMany({
      where: {
        status: statusFilter,
        createdAt: updatedAfter ? { gt: updatedAfter } : { gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days fallback
      },
      take: 1000, // Safety cap for performance
      include: { employer: { select: { id: true, name: true, rating: true, avatar: true } } },
    });

    const updated = await this.prisma.order.findMany({
      where: {
        status: statusFilter,
        updatedAt: updatedAfter ? { gt: updatedAfter } : undefined,
        createdAt: updatedAfter ? { lte: updatedAfter } : undefined,
      },
      take: 1000,
      include: { employer: { select: { id: true, name: true, rating: true, avatar: true } } },
    });

    // Deleted tracking: Simplified to only return recently updated orders with non-PUBLISHED status
    // if statusFilter is PUBLISHED (typical case for map)
    let deleted: string[] = [];
    if (updatedAfter && statusFilter === OrderStatus.PUBLISHED) {
        const removed = await this.prisma.order.findMany({
            where: {
                status: { not: OrderStatus.PUBLISHED },
                updatedAt: { gt: updatedAfter },
            },
            select: { id: true }
        });
        deleted = removed.map(r => r.id);
    }

    return { created, updated, deleted };
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  /**
   * REGIONAL ENGINE V5: Finds orders for a specific predefined region.
   */
  async getRegionOrders(regionId: string, updatedAfter?: Date) {
    const regions: Record<string, any> = {
      'moscow': { minLat: 55.1, maxLat: 56.1, minLng: 36.5, maxLng: 38.5 },
      'spb': { minLat: 59.5, maxLat: 60.5, minLng: 29.5, maxLng: 31.0 },
      'kazan': { minLat: 55.5, maxLat: 56.0, minLng: 48.8, maxLng: 49.5 },
    };

    const bounds = regions[regionId.toLowerCase()];
    if (!bounds) {
      // Fallback: search by region string in address if bounds not predefined
      const orders = await this.prisma.order.findMany({
        where: {
          status: OrderStatus.PUBLISHED,
          address: { contains: regionId, mode: 'insensitive' },
          updatedAt: updatedAfter ? { gt: updatedAfter } : undefined,
        },
        take: 1000,
        include: { employer: { select: { id: true, name: true, rating: true, avatar: true } } },
      });
      return { region: regionId, created: orders, updated: [], deleted: [] };
    }

    const result = await this.findInBounds(bounds, updatedAfter);
    return { region: regionId, ...result };
  }

  /**
   * SPATIAL ENGINE V6: Universal spatial search supporting Radius and BBOX modes.
   */
  async findSpatial(params: {
    lat?: number; lng?: number; radius?: number;
    minLat?: number; maxLat?: number; minLng?: number; maxLng?: number;
    updatedAfter?: Date;
  }) {
    const { lat, lng, radius, minLat, maxLat, minLng, maxLng, updatedAfter } = params;

    // Mode A: Radius Search (approximate via bounding box for performance)
    if (lat !== undefined && lng !== undefined && radius !== undefined) {
      const R = 6371; // Earth radius in km
      const deltaLat = (radius / R) * (180 / Math.PI);
      const deltaLng = (radius / R) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);

      const bounds = {
        minLat: lat - deltaLat,
        maxLat: lat + deltaLat,
        minLng: lng - deltaLng,
        maxLng: lng + deltaLng,
      };

      return this.findInBounds(bounds, updatedAfter);
    }

    // Mode B: BBOX Search
    if (minLat !== undefined && maxLat !== undefined && minLng !== undefined && maxLng !== undefined) {
      return this.findInBounds({ minLat, maxLat, minLng, maxLng }, updatedAfter);
    }

    return { created: [], updated: [], deleted: [] };
  }

  /**
   * SMART PARSER: Heuristic NLP for ceiling order texts.
   */
  parseOrderText(text: string) {
    // 0. Clean text from common copy-paste metadata (timestamps like [10.06.2026 11:11])
    const cleanText = text.replace(/\[\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2}\].*?:/g, '').trim();
    const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);
    const result: any = {
      title: '',
      details: text,
      price: 0,
      address: '',
      date: new Date(),
    };

    // 1. Extract Price (Patterns: 15000, ЗП 15000, 15.000р, 15000₽)
    const priceRegex = /(?:зп|зарплата|цена|стоимость|выплата)?[:\s-]*(\d[\d\s.,]*)(?:₽|р|руб|рублей)/i;
    const priceMatch = text.match(priceRegex);
    if (priceMatch) {
      const rawPrice = priceMatch[1].replace(/[\s.,]/g, '');
      result.price = parseInt(rawPrice, 10);
    } else {
        // Simple fallback for "зп 15000" without currency symbol
        const altPriceRegex = /(?:зп|зарплата)[:\s-]*(\d[\d\s]*)/i;
        const altMatch = text.match(altPriceRegex);
        if (altMatch) {
            result.price = parseInt(altMatch[1].replace(/\s/g, ''), 10);
        }
    }

    // 2. Extract Date
    const today = new Date();
    const daysOfWeek: Record<string, number> = {
      'воскресенье': 0, 'понедельник': 1, 'вторник': 2, 'среда': 3, 'четверг': 4, 'пятница': 5, 'суббота': 6
    };

    if (/завтра/i.test(cleanText)) {
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);
      result.date = tomorrow;
    } else if (/послезавтра/i.test(cleanText)) {
      const dayAfter = new Date();
      dayAfter.setDate(today.getDate() + 2);
      result.date = dayAfter;
    } else {
      // Check for day names
      for (const [dayName, dayIndex] of Object.entries(daysOfWeek)) {
        if (new RegExp(dayName, 'i').test(cleanText)) {
          const targetDate = new Date();
          const currentDay = today.getDay();
          let daysUntil = dayIndex - currentDay;
          if (daysUntil <= 0) daysUntil += 7;
          targetDate.setDate(today.getDate() + daysUntil);
          result.date = targetDate;
          break;
        }
      }

      // Look for DD.MM (overrides day of week if both present)
      const dateRegex = /(\d{1,2})\.(\d{1,2})/;
      const dateMatch = cleanText.match(dateRegex);
      if (dateMatch) {
        const d = parseInt(dateMatch[1], 10);
        const m = parseInt(dateMatch[2], 10) - 1;
        const targetDate = new Date(today.getFullYear(), m, d);
        // If the date has already passed this year, assume next year (for late Dec -> Jan)
        if (targetDate < today && m < today.getMonth()) {
            targetDate.setFullYear(today.getFullYear() + 1);
        }
        result.date = targetDate;
      }
    }

    // 3. Extract Address (Heuristic: usually the 2nd or 3rd line, or line with "ул", "проезд", "корпус", or known cities)
    const cities = ['москва', 'котельники', 'истра', 'химки', 'балашиха', 'красногорск', 'люберцы', 'мытищи', 'одинцово', 'подольск', 'ясенево', 'коммунарка', 'видное'];
    const addressKeywords = ['ул', 'улица', 'пр-т', 'проспект', 'проезд', 'бульвар', 'корпус', 'дом', 'д.'];

    for (const line of lines) {
       const lowerLine = line.toLowerCase();
       const isDateLine = /завтра|сегодня|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|\d{1,2}\.\d{1,2}/i.test(lowerLine);
       const isPriceLine = /зп|зарплата|руб|₽/i.test(lowerLine);

       const hasCity = cities.some(c => lowerLine.includes(c));
       const hasKeyword = addressKeywords.some(k => lowerLine.includes(k + '.') || lowerLine.includes(k + ' '));

       if ((hasCity || hasKeyword) && !isPriceLine && !isDateLine) {
         result.address = line;
         break;
       }
    }

    // 4. Extract Title (First line that isn't a date or address)
    for (const line of lines) {
        if (line === result.address) continue;
        if (/завтра|сегодня|\d{1,2}\.\d{1,2}/i.test(line)) continue;
        if (line.length > 5 && line.length < 50) {
            result.title = line;
            break;
        }
    }

    if (!result.title) result.title = "Монтаж натяжных потолков";

    return result;
  }
}
