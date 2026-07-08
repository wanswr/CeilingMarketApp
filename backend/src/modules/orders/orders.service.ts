import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus, WorkType, ApplicationStatus } from '@prisma/client';
import { AppGateway } from '../gateway/app.gateway';
import { ChatsService } from '../chats/chats.service';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private gateway: AppGateway,
    private chatsService: ChatsService,
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
    [OrderStatus.COMPLETED]: [OrderStatus.REVIEWED],
    [OrderStatus.REVIEWED]: [],
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

    const room = `geo:${Math.floor(order.latitude * 10)}:${Math.floor(order.longitude * 10)}`;
    this.gateway.server.to(room).emit('order.created', order);

    // Fallback for global listeners
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
          status: ApplicationStatus.PENDING,
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

    this.gateway.server.to(`user:${result.order.employerId}`).emit('application.new', result.application);
    this.gateway.broadcast('order.status.changed', result.order);
    return result;
  }

  async markApplicationViewed(applicationId: string, userId: string) {
    const app = await this.prisma.application.findUnique({
        where: { id: applicationId },
        include: { order: true }
    });
    if (!app) throw new NotFoundException();
    if (app.order.employerId !== userId) throw new ForbiddenException();

    if (app.status === ApplicationStatus.PENDING) {
        const updated = await this.prisma.application.update({
            where: { id: applicationId },
            data: { status: ApplicationStatus.VIEWED }
        });
        this.gateway.server.to(`user:${app.executorId}`).emit('application.viewed', { id: applicationId });
        return updated;
    }
    return app;
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
        data: { status: ApplicationStatus.ACCEPTED }
      });

      // Reject other applications
      const otherApplications = await tx.application.findMany({
        where: { orderId: application.orderId, id: { not: applicationId } },
        select: { id: true, executorId: true }
      });

      await tx.application.updateMany({
        where: { orderId: application.orderId, id: { not: applicationId } },
        data: { status: ApplicationStatus.REJECTED }
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

      // Task #2: Automatically create chat
      const chat = await this.chatsService.getOrCreateChat(application.orderId, application.executorId, employerId);

      return {
        order: updatedOrder,
        chat,
        acceptedApplicationId: applicationId,
        rejectedApplicationIds: otherApplications.map(a => a.id)
      };
    });

    this.gateway.broadcast('order.status.changed', result.order);
    this.gateway.server.to(`user:${result.order.executorId}`).emit('application.accepted', { id: result.acceptedApplicationId, orderId: result.order.id });

    result.rejectedApplicationIds.forEach(id => {
      this.gateway.broadcast('application.rejected', { id });
    });

    return result;
  }

  async startWork(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException();

    if (order.executorId !== userId) {
        console.warn(`[OrdersService] Forbidden: User ${userId} is not executor ${order.executorId} for order ${order.id}`);
        throw new ForbiddenException();
    }

    if (order.status !== OrderStatus.CLAIMED) {
      console.warn(`[OrdersService] Conflict: Order ${orderId} has status ${order.status}, but CLAIMED is required to start`);
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

    // Increment completed orders for user
    await this.prisma.user.update({
        where: { id: userId },
        data: { completedOrders: { increment: 1 } }
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
        },
        review: true
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
        status: { in: [OrderStatus.PUBLISHED, OrderStatus.HAS_RESPONSES, OrderStatus.CLAIMED, OrderStatus.IN_PROGRESS] },
        latitude: { gte: searchBounds.minLat, lte: searchBounds.maxLat },
        longitude: { gte: searchBounds.minLng, lte: searchBounds.maxLng },
        // If updatedAfter is provided, we only want those changed.
        // If not, we are doing a full region sync, so we rely on the pruning logic on frontend.
        updatedAt: updatedAfter ? { gt: updatedAfter } : undefined,
      },
      take: 1000,
      include: {
        employer: { select: { id: true, name: true, rating: true, avatar: true } },
        applications: { select: { id: true, executorId: true, status: true, price: true } }
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

    // 1. Extract Price (Patterns: 15000, ЗП 15.000, 15.000р, 15000₽)
    // V11: Enhanced price regex to capture numbers with dots/spaces even without currency symbols
    const priceRegex = /(?:зп|зарплата|цена|стоимость|выплата)[:\s-]*(\d[\d\s.,]{3,})/i;
    const priceMatch = text.match(priceRegex);

    if (priceMatch) {
      const rawPrice = priceMatch[1].replace(/[\s.,]/g, '');
      result.price = parseInt(rawPrice, 10);
    } else {
        const currencyRegex = /(\d[\d\s.,]*)(?:₽|р|руб|рублей)/i;
        const currencyMatch = text.match(currencyRegex);
        if (currencyMatch) {
            result.price = parseInt(currencyMatch[1].replace(/[\s.,]/g, ''), 10);
        }
    }

    // 2. Extract Date
    const today = new Date();
    const daysOfWeek: Record<string, number> = {
      'воскресенье': 0, 'понедельник': 1, 'вторник': 2, 'среда': 3, 'четверг': 4, 'пятница': 5, 'суббота': 6
    };

    if (/сегодня/i.test(cleanText)) {
      result.date = new Date(today);
    } else if (/завтра/i.test(cleanText)) {
      const tomorrow = new Date();
      tomorrow.setDate(today.getDate() + 1);
      result.date = tomorrow;
    } else if (/послезавтра/i.test(cleanText)) {
      const dayAfter = new Date();
      dayAfter.setDate(today.getDate() + 2);
      result.date = dayAfter;
    } else {
      // Check for day names (e.g., "на пятницу", "в четверг")
      for (const [dayName, dayIndex] of Object.entries(daysOfWeek)) {
        const dayRegex = new RegExp(`(?:на|в|во)?\\s*${dayName.slice(0, -1)}`, 'i');
        if (dayRegex.test(cleanText)) {
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

    // 3. Extract Address (Heuristic: line with "ул", "мкад", or known cities)
    // V11: Expanded city list and added common landmarks like МКАД
    const cities = ['москва', 'котельники', 'истра', 'химки', 'балашиха', 'красногорск', 'люберцы', 'мытищи', 'одинцово', 'подольск', 'ясенево', 'коммунарка', 'видное', 'варшавское', 'римского', 'корсако'];
    const addressKeywords = ['ул', 'улица', 'пр-т', 'проспект', 'проезд', 'бульвар', 'корпус', 'дом', 'д.', 'шоссе', 'мкад', 'жк', 'набережная', 'тупик', 'шоссе', 'кв', 'стр'];

    for (const line of lines) {
       const lowerLine = line.toLowerCase();
       const isDateLine = /завтра|сегодня|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|\d{1,2}\.\d{1,2}/i.test(lowerLine);
       const isPriceLine = /зп|зарплата|цена|руб|₽/i.test(lowerLine);

       const hasCity = cities.some(c => lowerLine.includes(c));
       const hasKeyword = addressKeywords.some(k => lowerLine.includes(k + '.') || lowerLine.includes(k + ' ') || lowerLine.includes(' ' + k) || lowerLine === k);
       // Check for house number patterns like "11к1" or "д.5" (ensuring it's not a price or date)
       const hasHouseNum = /\d+[а-я]?/.test(lowerLine) && !isPriceLine && !isDateLine && (lowerLine.includes(' ') || lowerLine.length < 15 || lowerLine.match(/\d+к\d+/));

       if ((hasCity || hasKeyword || hasHouseNum) && !isPriceLine && !isDateLine) {
         result.address = line;
         // If it's a line like "Варшавское шоссе", check if next line adds detail (like "11к1")
         const idx = lines.indexOf(line);
         if (idx !== -1 && idx < lines.length - 1) {
             const nextLine = lines[idx+1];
             if (nextLine.length < 40 && !/зп|цена|руб|завтра|сегодня/i.test(nextLine)) {
                 // If the current address is just a street, or next line looks like a house number or JK
                 if (nextLine.match(/\d+/) || line.length < 25 || nextLine.toLowerCase().includes('жк') || cities.some(c => nextLine.toLowerCase().includes(c))) {
                    result.address += ', ' + nextLine;
                 }
             }
         }
         break;
       }
    }

    // 4. Extract Title (First line that isn't a date or address, or looks like a job description)
    for (const line of lines) {
        if (result.address && result.address.includes(line)) continue;
        const lowerLine = line.toLowerCase();
        if (/завтра|сегодня|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|\d{1,2}\.\d{1,2}/i.test(line)) continue;
        if (/зп|зарплата|цена|руб|₽/i.test(line)) continue;

        // V11: Smarter title selection - prefer lines with job keywords
        if (lowerLine.includes('потолок') || lowerLine.includes('монтаж') || lowerLine.includes('замер') || lowerLine.includes('ремонт')) {
            result.title = line;
            break;
        }

        if (!result.title && line.length > 5 && line.length < 60) {
            result.title = line;
        }
    }

    if (!result.title) result.title = "Монтаж натяжных потолков";

    return result;
  }
}
