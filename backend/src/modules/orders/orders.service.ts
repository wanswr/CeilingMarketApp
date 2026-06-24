import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus, WorkType } from '@prisma/client';
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
    [OrderStatus.PENDING]: [OrderStatus.PUBLISHED],
    [OrderStatus.PUBLISHED]: [OrderStatus.HAS_RESPONSES, OrderStatus.CANCELLED],
    [OrderStatus.HAS_RESPONSES]: [OrderStatus.CLAIMED, OrderStatus.CANCELLED],
    [OrderStatus.CLAIMED]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
    [OrderStatus.IN_PROGRESS]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
    [OrderStatus.COMPLETED]: [],
    [OrderStatus.CANCELLED]: [],
    [OrderStatus.DISPUTE]: [],
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
        workType: dto.workType as WorkType,
        date: new Date(dto.date),
        images: dto.images || [],
        employerId,
        idempotencyKey: dto.idempotencyKey,
        status: OrderStatus.PUBLISHED, // Target status for new orders
      },
    });

    this.gateway.broadcast('order.created', { order, orderId: order.id, employerId: order.employerId });
    return order;
  }

  /**
   * APPLY for order: Creates an Application and updates order status if needed.
   */
  async apply(orderId: string, executorId: string, price?: number) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('Order not found');

      if (order.status !== OrderStatus.PUBLISHED && order.status !== OrderStatus.HAS_RESPONSES) {
        throw new ConflictException('Order is no longer available for applications');
      }

      // 2. Check for existing application (idempotency)
      const existingApp = await tx.application.findUnique({
        where: { orderId_executorId: { orderId, executorId } },
        include: {
          executor: { select: { id: true, name: true, rating: true, avatar: true, completedOrders: true } }
        }
      });

      if (existingApp) return { application: existingApp, order };

      // 3. Create application
      const application = await tx.application.create({
        data: {
          orderId,
          executorId,
          price: price || order.price,
        },
        include: {
          executor: { select: { id: true, name: true, rating: true, avatar: true, completedOrders: true } }
        }
      });

      // Update order status if first application
      let updatedOrder = order;
      if (order.status === OrderStatus.PUBLISHED) {
        updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.HAS_RESPONSES }
        });
      }

      return { application, order: updatedOrder };
    });

    this.gateway.broadcast('application.new', result.application);
    this.gateway.broadcast('order.status.changed', result.order);
    return result;
  }

  /**
   * ACCEPT APPLICATION: Employer selects an executor.
   */
  async acceptApplication(applicationId: string, employerId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const application = await tx.application.findUnique({
        where: { id: applicationId },
        include: { order: true }
      });

      if (!application) throw new NotFoundException('Application not found');
      if (application.order.employerId !== employerId) throw new ForbiddenException();

      // Update application status
      await tx.application.update({
        where: { id: applicationId },
        data: { status: 'ACCEPTED' }
      });

      // Reject other applications
      const otherApplications = await tx.application.findMany({
        where: { orderId: application.orderId, id: { not: applicationId } },
        select: { id: true, executorId: true }
      });

      await tx.application.updateMany({
        where: { orderId: application.orderId, id: { not: applicationId } },
        data: { status: 'REJECTED' }
      });

      // Update order
      const updatedOrder = await tx.order.update({
        where: { id: application.orderId },
        data: {
          status: OrderStatus.CLAIMED,
          executorId: application.executorId,
          claimedAt: new Date(),
        },
        include: {
          employer: { select: { id: true, name: true, rating: true, avatar: true } },
          executor: { select: { id: true, name: true, avatar: true } }
        }
      });

      return {
        order: updatedOrder,
        acceptedApplicationId: applicationId,
        rejectedApplicationIds: otherApplications.map(a => a.id)
      };
    });

    this.gateway.broadcast('order.status.changed', result.order);
    this.gateway.broadcast('application.accepted', { id: result.acceptedApplicationId });
    result.rejectedApplicationIds.forEach(id => {
      this.gateway.broadcast('application.rejected', { id });
    });
    return result;
  }

  async startWork(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException();
    if (order.executorId !== userId) throw new ForbiddenException();

    if (order.status !== OrderStatus.CLAIMED) {
      throw new ConflictException('Order must be in CLAIMED status to start work');
    }

    const result = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.IN_PROGRESS },
      include: {
        employer: { select: { id: true, name: true, rating: true, avatar: true } },
        executor: { select: { id: true, name: true, avatar: true } }
      }
    });

    this.gateway.broadcast('order.status.changed', result);
    return result;
  }

  async completeWork(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException();

    // Only executor can complete
    if (order.executorId !== userId) throw new ForbiddenException();

    if (order.status !== OrderStatus.IN_PROGRESS) {
      throw new ConflictException('Order must be IN_PROGRESS to be completed');
    }

    const result = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.COMPLETED },
      include: {
        employer: { select: { id: true, name: true, rating: true, avatar: true } },
        executor: { select: { id: true, name: true, avatar: true } }
      }
    });

    this.gateway.broadcast('order.status.changed', result);
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
    const isExecutor = order.executorId === userId;
    if (!isEmployer && !isExecutor) throw new ForbiddenException();

    // State Machine Rules
    if (!this.canTransition(order.status, newStatus)) {
      throw new ConflictException(`Transition ${order.status} -> ${newStatus} not allowed`);
    }

    const result = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: newStatus }
    });

    this.gateway.broadcast('order.status.changed', result);
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

    if (lat && lng && radius) {
      const R = 6371;
      const dLat = (radius / R) * (180 / Math.PI);
      const dLng = (radius / R) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);

      where.latitude = { gte: lat - dLat, lte: lat + dLat };
      where.longitude = { gte: lng - dLng, lte: lng + dLng };
    }

    return this.prisma.order.findMany({
      where,
      include: {
        employer: { select: { id: true, name: true, rating: true, avatar: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        employer: true,
        executor: true,
        applications: {
          include: {
            executor: { select: { id: true, name: true, avatar: true, rating: true, completedOrders: true } }
          }
        }
      }
    });
    if (!order) throw new NotFoundException();
    return order;
  }

  async findMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: {
        OR: [
          { employerId: userId },
          { executorId: userId },
          { applications: { some: { executorId: userId } } }
        ]
      },
      include: {
        employer: { select: { id: true, name: true, rating: true, avatar: true } },
        executor: { select: { id: true, name: true, avatar: true } },
        applications: {
          where: { executorId: userId },
          select: { id: true, status: true, price: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
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

    this.gateway.broadcast('order.status.changed', result);
    return result;
  }

  async remove(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order || order.employerId !== userId) throw new ForbiddenException();
    await this.prisma.order.delete({ where: { id } });
    this.gateway.broadcast('order.deleted', { id });
    return { id };
  }

  async cancelApplication(orderId: string, executorId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const app = await this.prisma.application.findUnique({
      where: { orderId_executorId: { orderId, executorId } }
    });
    if (!app) throw new NotFoundException('Application not found');

    // Rule: Cannot cancel if less than 24h before монтаж
    const now = new Date();
    const orderDate = new Date(order.date);
    const diffHours = (orderDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (diffHours < 24) {
      throw new ForbiddenException('Cannot cancel application less than 24 hours before order date');
    }

    await this.prisma.application.delete({
      where: { id: app.id }
    });

    // Check if HAS_RESPONSES status should be reverted
    const remainingApps = await this.prisma.application.count({
      where: { orderId }
    });

    if (remainingApps === 0 && order.status === OrderStatus.HAS_RESPONSES) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PUBLISHED }
      });
    }

    return { success: true };
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

    let searchBounds: { minLat: number, maxLat: number, minLng: number, maxLng: number } | null = null;

    // Mode A: Radius Search (approximate via bounding box for performance)
    if (lat !== undefined && lng !== undefined && radius !== undefined) {
      const R = 6371; // Earth radius in km
      const deltaLat = (radius / R) * (180 / Math.PI);
      const deltaLng = (radius / R) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);

      searchBounds = {
        minLat: lat - deltaLat,
        maxLat: lat + deltaLat,
        minLng: lng - deltaLng,
        maxLng: lng + deltaLng,
      };
    } else if (minLat !== undefined && maxLat !== undefined && minLng !== undefined && maxLng !== undefined) {
      // Mode B: BBOX Search
      searchBounds = { minLat, maxLat, minLng, maxLng };
    }

    if (!searchBounds) return { created: [], updated: [], deleted: [] };

    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.PUBLISHED, OrderStatus.HAS_RESPONSES] },
        latitude: { gte: searchBounds.minLat, lte: searchBounds.maxLat },
        longitude: { gte: searchBounds.minLng, lte: searchBounds.maxLng },
        // If updatedAfter is provided, we only want those changed.
        // If not, we are doing a full region sync, so we rely on the pruning logic on frontend.
        updatedAt: updatedAfter ? { gt: updatedAfter } : undefined,
      },
      take: 1000,
      include: {
        employer: { select: { id: true, name: true, rating: true, avatar: true } },
        applications: { select: { id: true, executorId: true, status: true } }
      },
    });

    return { created: orders, updated: [], deleted: [] };
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
