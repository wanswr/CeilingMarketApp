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
        workType: dto.workType,
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

  async findMyOrders(userId: string, skip: number = 0, take: number = 20) {
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
        },
        chats: {
            where: {
                OR: [{ employerId: userId }, { executorId: userId }]
            },
            select: {
                id: true,
                messages: {
                    where: { senderId: { not: userId }, isRead: false },
                    select: { id: true }
                }
            }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
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
   * SMART PARSER V3: Advanced NLP for order aggregation with Moscow context.
   */
  parseOrderText(text: string) {
    const cleanText = text.replace(/\[\d{2}\.\d{2}\.\d{4}\s\d{2}:\d{2}\].*?:/g, '').trim();
    const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);

    const result: any = {
      title: '',
      details: text,
      price: 0,
      address: '',
      date: new Date(),
    };

    // 1. IMPROVED PRICE PARSING (Patterns: 15к, 15.000, ЗП: 20 000 руб)
    const pricePatterns = [
        /(?:зп|зарплата|цена|стоимость|выплата|бюджет)[:\s-]*(\d[\d\s.,]*)(?:к|k|₽|р|руб|рублей)/i,
        /(?:зп|зарплата|цена|стоимость|выплата|бюджет)[:\s-]*(\d[\d\s.,]*)/i,
        /(\d[\d\s.,]*)(?:₽|р|руб|рублей|к|k)/i,
    ];

    for (const pattern of pricePatterns) {
        const match = cleanText.match(pattern);
        if (match) {
            let rawStr = match[1].replace(/[\s.,]/g, '').toLowerCase();
            let isKilo = match[0].toLowerCase().includes('к') || match[0].toLowerCase().includes('k');
            let val = parseInt(rawStr, 10);
            if (isNaN(val)) continue;
            if (isKilo && val < 1000) val *= 1000;
            if (val > 0) {
                result.price = val;
                break;
            }
        }
    }

    // 2. DATE PARSING (Includes Weekdays)
    const today = new Date();
    const weekDays: Record<string, number> = {
        'понед': 1, 'вторн': 2, 'среду': 3, 'четверг': 4, 'пятниц': 5, 'суббот': 6, 'воскр': 0,
        'пн': 1, 'вт': 2, 'ср': 3, 'чт': 4, 'пт': 5, 'сб': 6, 'вс': 0
    };

    if (/завтра/i.test(cleanText)) {
        result.date = new Date(today.getTime() + 86400000);
    } else if (/послезавтра/i.test(cleanText)) {
        result.date = new Date(today.getTime() + 172800000);
    } else {
        let weekdayFound = false;
        for (const [day, dayIdx] of Object.entries(weekDays)) {
            if (new RegExp(day, 'i').test(cleanText)) {
                let targetDate = new Date(today);
                let currentDay = today.getDay();
                let diff = (dayIdx + 7 - currentDay) % 7;
                if (diff === 0) diff = 7; // Next week if today
                targetDate.setDate(today.getDate() + diff);
                result.date = targetDate;
                weekdayFound = true;
                break;
            }
        }

        if (!weekdayFound) {
            const dateMatch = cleanText.match(/(\d{1,2})[\.\/](\d{1,2})(?:[\.\/](\d{2,4}))?/);
            if (dateMatch) {
                const d = parseInt(dateMatch[1]);
                const m = parseInt(dateMatch[2]) - 1;
                const y = dateMatch[3] ? (dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3]) : parseInt(dateMatch[3])) : today.getFullYear();
                result.date = new Date(y, m, d);
                if (result.date < today && !dateMatch[3]) result.date.setFullYear(y + 1);
            }
        }
    }

    // 3. IMPROVED ADDRESS HEURISTIC (Priority: Street + House)
    const knownLocations = [
        'Авиамоторная', 'Раменки', 'Юго-запад', 'Люберцы', 'Химки', 'Мытищи', 'Балашиха',
        'Одинцово', 'Красногорск', 'Видное', 'Реутов', 'Зеленоград', 'Королев', 'Домодедово',
        'Подольск', 'Щелково', 'Серпухов', 'Коломна', 'Электросталь', 'Железнодорожный',
        'Перово', 'Выхино', 'Новогиреево', 'Митино', 'Строгино', 'Бутово', 'Солнцево',
        'Текстильщики', 'Кузьминки', 'Марьино', 'Люблино', 'Братиславская', 'Пражская',
        'Отрадное', 'Бибирево', 'Алтуфьево', 'Медведково', 'Бабушкинская', 'Свиблово'
    ];

    const addressPatterns = [
        /(?:адрес|место|объект)[:\s-]*(.+?)(?:\n|$)/i,
        /(?:ул|улица|пр-т|проспект|бульвар|б-р|пер|переулок|шоссе|ш|наб|набережная)[\.\s]+[А-Яа-яA-Za-z\s-]+,?\s?(?:д|дом)?\.?\s?\d+[а-яА-Я]?/i,
    ];

    for (const pattern of addressPatterns) {
        const match = cleanText.match(pattern);
        if (match) {
            result.address = (match[1] || match[0]).replace(/[!]{2,}/g, '').trim();
            break;
        }
    }

    if (!result.address) {
        // Search for known locations (with fuzzy end for declensions like Люберцы/Люберцах)
        for (const loc of knownLocations) {
            const stem = loc.length > 5 ? loc.substring(0, loc.length - 2) : loc.substring(0, loc.length - 1);
            if (new RegExp(stem, 'i').test(cleanText)) {
                result.address = loc;
                break;
            }
        }
    }

    if (!result.address) {
        for (const line of lines) {
            const l = line.toLowerCase();
            // Avoid picking price, date, or common title words as address
            if (l.includes('зп') || l.includes('цена') || l.includes('бюджет') || l.includes('выплата')) continue;
            if (l.includes('₽') || l.includes(' руб') || l.includes(' р.')) continue;
            if (/\d{1,2}\.\d{1,2}/.test(line)) continue;
            if (l.includes('завтра') || l.includes('сегодня') || l.includes('монтаж') || l.includes('замер')) continue;

            if (/\d+$/.test(line) || line.length > 5) {
                result.address = line;
                break;
            }
        }
    }

    // 4. SMART TITLE
    const serviceKeywords = ['Монтаж', 'Замер', 'Ремонт', 'Сервис', 'Слив', 'Потолок', 'Установка'];
    let bestTitle = '';
    for (const line of lines) {
        const cleanLine = line.replace(/[!?.]{2,}/g, '').trim();
        if (serviceKeywords.some(k => new RegExp(k, 'i').test(cleanLine))) {
            bestTitle = cleanLine;
            break;
        }
    }

    if (bestTitle) {
        result.title = bestTitle;
    } else {
        // Priority to non-address, non-price lines
        for (const line of lines) {
            const cleanLine = line.replace(/[!?.]{2,}/g, '').trim();
            const l = cleanLine.toLowerCase();
            if (l === 'завтра' || l === 'сегодня' || l === 'срочно') continue;
            if (result.address && cleanLine.includes(result.address) && lines.length > 1) continue; // Skip address if there are other lines
            if (result.price > 0 && cleanLine.includes(result.price.toString()) && lines.length > 1) continue;
            if (cleanLine.length >= 3 && cleanLine.length < 50) {
                result.title = cleanLine;
                break;
            }
        }
    }

    if (!result.title) result.title = "Монтаж натяжного потолка";
    // Final cleanup
    result.title = result.title.replace(/[!]{2,}/g, '!').trim();
    if (result.address) result.address = result.address.replace(/[!]{2,}/g, '').trim();

    return result;
  }
}
