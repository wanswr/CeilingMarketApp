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

    if (lat && lng && radius) {
      return this.findNearby(lat, lng, radius);
    }

    const where: any = {};
    if (minPrice) where.price = { gte: minPrice };
    if (status) where.status = status as OrderStatus;

    return this.prisma.order.findMany({
      where,
      include: {
        employer: { select: { id: true, name: true, rating: true, avatar: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  /**
   * PostGIS Nearby Search: Finds orders in a radius using spatial index.
   */
  async findNearby(lat: number, lng: number, radiusKm: number = 100) {
    return this.prisma.$queryRaw<any[]>`
      SELECT o.*,
             u.name as "employerName", u.rating as "employerRating", u.avatar as "employerAvatar"
      FROM "Order" o
      LEFT JOIN "User" u ON o."employerId" = u.id
      WHERE o.status = 'PUBLISHED'
      AND ST_DWithin(
        ST_SetSRID(ST_MakePoint(o.longitude, o.latitude), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        ${radiusKm * 1000}
      )
      ORDER BY ST_Distance(
        ST_SetSRID(ST_MakePoint(o.longitude, o.latitude), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )
      LIMIT 500;
    `;
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
   * SPATIAL ENGINE V6: Universal spatial search supporting Radius and BBOX modes via PostGIS.
   */
  async findSpatial(params: {
    lat?: number; lng?: number; radius?: number;
    minLat?: number; maxLat?: number; minLng?: number; maxLng?: number;
    updatedAfter?: Date;
  }) {
    const { lat, lng, radius, minLat, maxLat, minLng, maxLng, updatedAfter } = params;

    // Mode A: True Radius Search via findNearby
    if (lat !== undefined && lng !== undefined && radius !== undefined) {
        const rawOrders = await this.findNearby(lat, lng, radius);

        // Map raw SQL rows to the expected Prisma-like Order structure with nested employer
        const mappedOrders = rawOrders.map(o => ({
            ...o,
            employer: {
                id: o.employerId,
                name: o.employerName,
                rating: o.employerRating,
                avatar: o.employerAvatar
            }
        }));

        // Filter by updatedAfter if provided
        const filtered = updatedAfter
            ? mappedOrders.filter(o => new Date(o.updatedAt) > updatedAfter)
            : mappedOrders;

        return { created: filtered, updated: [], deleted: [] };
    }

    // Mode B: BBOX Search (Keep using findMany for BBOX as it's efficient with standard indices)
    if (minLat !== undefined && maxLat !== undefined && minLng !== undefined && maxLng !== undefined) {
        const orders = await this.prisma.order.findMany({
            where: {
              status: OrderStatus.PUBLISHED,
              latitude: { gte: minLat, lte: maxLat },
              longitude: { gte: minLng, lte: maxLng },
              updatedAt: updatedAfter ? { gt: updatedAfter } : undefined,
            },
            take: 2000,
            include: { employer: { select: { id: true, name: true, rating: true, avatar: true } } },
          });
          return { created: orders, updated: [], deleted: [] };
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
