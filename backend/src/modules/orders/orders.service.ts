import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { AppGateway } from '../gateway/app.gateway';
import { v4 as uuidv4 } from 'uuid';
import { OrderStatus, WorkType, ApplicationStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private gateway: AppGateway,
  ) {}

  /**
   * Helper to log events and emit via WebSocket with eventId.
   */
  private async logAndEmit(orderId: string, type: string, payload: any, options: { userId?: string | string[], geo?: { lat: number, lng: number }, broadcast?: boolean } = {}) {
    const eventId = uuidv4();
    const eventPayload = { ...payload, eventId, type };

    // 1. Log to Database
    try {
        await this.prisma.orderEvent.create({
            data: {
                orderId,
                type,
                payload: eventPayload,
            }
        });
    } catch (e) {
        console.error(`[OrderEvent] Failed to log ${type}:`, (e as any).message);
    }

    // 2. Emit via WebSocket
    if (options.userId) {
        const userIds = Array.isArray(options.userId) ? options.userId : [options.userId];
        userIds.filter(Boolean).forEach(id => this.gateway.emitToUser(id, type, eventPayload));
    }

    if (options.geo) {
      this.gateway.emitToGeo(options.geo.lat, options.geo.lng, type, eventPayload);
    }

    if (options.broadcast || (!options.userId && !options.geo)) {
      this.gateway.broadcast(type, eventPayload);
    }

    return eventId;
  }

  private readonly transitions: Record<string, OrderStatus[]> = {
    'PENDING': [OrderStatus.PUBLISHED],
    'PUBLISHED': [OrderStatus.HAS_RESPONSES, OrderStatus.CANCELLED],
    'HAS_RESPONSES': [OrderStatus.CLAIMED, OrderStatus.CANCELLED],
    'CLAIMED': [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
    'IN_PROGRESS': [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
    'COMPLETED': [],
    'CANCELLED': [],
    'DISPUTE': [],
  };

  async create(dto: CreateOrderDto, employerId: string) {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: { idempotencyKey: dto.idempotencyKey }
      });
      if (existing) return existing;
    }

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
        status: OrderStatus.PUBLISHED,
      },
    });

    await this.logAndEmit(order.id, 'order.created', order, {
        userId: employerId,
        geo: { lat: order.latitude, lng: order.longitude }
    });
    return order;
  }

  async apply(orderId: string, executorId: string, price?: number) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('Order not found');

      if (order.status !== OrderStatus.PUBLISHED && order.status !== OrderStatus.HAS_RESPONSES) {
        throw new ConflictException('Order is no longer available for applications');
      }

      const existingApp = await tx.application.findUnique({
        where: { orderId_executorId: { orderId, executorId } },
        include: {
          executor: { select: { id: true, name: true, rating: true, avatar: true, completedOrders: true } }
        }
      });

      if (existingApp) return { application: existingApp, order };

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

      let updatedOrder = order;
      if (order.status === OrderStatus.PUBLISHED) {
        updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.HAS_RESPONSES }
        });
      }

      return { application, order: updatedOrder };
    });

    await this.logAndEmit(orderId, 'application.new', result.application, { userId: [result.order.employerId, executorId] });

    if (result.order.status === OrderStatus.HAS_RESPONSES) {
        await this.logAndEmit(orderId, 'order.status.changed', result.order, {
            userId: [result.order.employerId, executorId],
            geo: { lat: result.order.latitude, lng: result.order.longitude }
        });
    }

    return result;
  }

  async acceptApplication(applicationId: string, employerId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const application = await tx.application.findUnique({
        where: { id: applicationId },
        include: { order: true }
      });

      if (!application) throw new NotFoundException('Application not found');
      if (application.order.employerId !== employerId) throw new ForbiddenException();

      await tx.application.update({
        where: { id: applicationId },
        data: { status: ApplicationStatus.ACCEPTED }
      });

      const otherApplications = await tx.application.findMany({
        where: { orderId: application.orderId, id: { not: applicationId } },
        select: { id: true, executorId: true }
      });

      await tx.application.updateMany({
        where: { orderId: application.orderId, id: { not: applicationId } },
        data: { status: ApplicationStatus.REJECTED }
      });

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
        rejectedApplicationIds: otherApplications.map(a => a.id),
        executorId: application.executorId
      };
    });

    // Notify involved parties and the map
    await this.logAndEmit(result.order.id, 'order.status.changed', result.order, {
        userId: [result.order.employerId, result.executorId],
        geo: { lat: result.order.latitude, lng: result.order.longitude }
    });

    await this.logAndEmit(result.order.id, 'application.accepted', { id: result.acceptedApplicationId, orderId: result.order.id }, { userId: result.executorId });

    for (const id of result.rejectedApplicationIds) {
        const app = await this.prisma.application.findUnique({ where: { id } });
        if (app) {
            await this.logAndEmit(result.order.id, 'application.rejected', { id, orderId: result.order.id }, { userId: app.executorId });
        }
    }

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

    await this.logAndEmit(orderId, 'order.status.changed', result, { userId: [result.employerId, result.executorId] });
    return result;
  }

  async completeWork(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException();

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

    await this.logAndEmit(orderId, 'order.status.changed', result, { userId: [result.employerId, result.executorId] });
    return result;
  }

  async transitionStatus(orderId: string, newStatus: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException();

    const isEmployer = order.employerId === userId;
    const isExecutor = order.executorId === userId;
    if (!isEmployer && !isExecutor) throw new ForbiddenException();

    const currentStatus: OrderStatus = order.status;
    if (!this.transitions[currentStatus]?.includes(newStatus as OrderStatus)) {
      throw new ConflictException(`Transition ${currentStatus} -> ${newStatus} not allowed`);
    }

    const result = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: newStatus as OrderStatus }
    });

    await this.logAndEmit(orderId, 'order.status.changed', result, {
        userId: [order.employerId, order.executorId].filter(Boolean) as string[],
        geo: { lat: order.latitude, lng: order.longitude }
    });
    return result;
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

    const currentStatus: OrderStatus = order.status;
    if (dto.status && dto.status !== currentStatus) {
      if (!this.transitions[currentStatus]?.includes(dto.status as OrderStatus)) {
        throw new ConflictException(`Transition ${currentStatus} -> ${dto.status} not allowed`);
      }
    }

    const result = await this.prisma.order.update({
      where: { id },
      data: dto
    });

    await this.logAndEmit(id, 'order.updated', result, {
        userId: [result.employerId, result.executorId].filter(Boolean) as string[],
        geo: { lat: result.latitude, lng: result.longitude }
    });
    return result;
  }

  async remove(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order || order.employerId !== userId) throw new ForbiddenException();

    await this.logAndEmit(id, 'order.deleted', { id }, { geo: { lat: order.latitude, lng: order.longitude } });
    await this.prisma.order.delete({ where: { id } });

    return { id };
  }

  async cancelApplication(orderId: string, executorId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const app = await this.prisma.application.findUnique({
      where: { orderId_executorId: { orderId, executorId } }
    });
    if (!app) throw new NotFoundException('Application not found');

    const now = new Date();
    const orderDate = new Date(order.date);
    const diffHours = (orderDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (diffHours < 24) {
      throw new ForbiddenException('Cannot cancel application less than 24 hours before order date');
    }

    await this.prisma.application.delete({
      where: { id: app.id }
    });

    await this.logAndEmit(orderId, 'application.deleted', { id: app.id, orderId }, { userId: [order.employerId, executorId] });

    const remainingApps = await this.prisma.application.count({
      where: { orderId }
    });

    if (remainingApps === 0 && order.status === OrderStatus.HAS_RESPONSES) {
      const updated = await this.prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PUBLISHED }
      });
      await this.logAndEmit(orderId, 'order.status.changed', updated, { geo: { lat: updated.latitude, lng: updated.longitude } });
    }

    return { success: true };
  }

  async findSpatial(params: {
    lat?: number; lng?: number; radius?: number;
    minLat?: number; maxLat?: number; minLng?: number; maxLng?: number;
    updatedAfter?: Date;
  }) {
    const { lat, lng, radius, minLat, maxLat, minLng, maxLng, updatedAfter } = params;

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

    const orders = await this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.PUBLISHED, OrderStatus.HAS_RESPONSES] },
        latitude: { gte: searchBounds.minLat, lte: searchBounds.maxLat },
        longitude: { gte: searchBounds.minLng, lte: searchBounds.maxLng },
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

  async syncEvents(orderId: string, since: Date) {
      const db = this.prisma as any;
      if (!db.orderEvent) return [];
      return db.orderEvent.findMany({
          where: {
              orderId,
              createdAt: { gt: since }
          },
          orderBy: { createdAt: 'asc' }
      });
  }

  async syncGlobal(since: Date, userId: string) {
      const db = this.prisma as any;
      if (!db.orderEvent) return [];
      return db.orderEvent.findMany({
          where: {
              createdAt: { gt: since },
              order: {
                  OR: [
                      { employerId: userId },
                      { executorId: userId },
                      { applications: { some: { executorId: userId } } }
                  ]
              }
          },
          orderBy: { createdAt: 'asc' }
      });
  }

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

    const pricePatterns = [
        /(?:зп|зарплата|цена|стоимость|выплата|бюджет)[:\s-]*(\d[\d\s.,]*)(?:к|k|₽|р|руб|рублей)/i,
        /(?:зп|зарплата|цена|стоимость|выплата|бюджет)[:\s-]*(\d[\d\s.,]*)/i,
        /(\d[\d\s.,]*)(?:₽|р|руб|рублей|к|k)/i,
        /(\d[\d\s.,]{3,})/i,
    ];

    for (const pattern of pricePatterns) {
        const match = cleanText.match(pattern);
        if (match) {
            let rawStr = match[1].replace(/[\s.,]/g, '').toLowerCase();
            let isKilo = match[0].toLowerCase().includes('к') || match[0].toLowerCase().includes('k');
            let val = parseInt(rawStr, 10);
            if (isNaN(val)) continue;
            if (isKilo && val < 1000) val *= 1000;
            if (val >= 500) {
                result.price = val;
                break;
            }
        }
    }

    const today = new Date();
    today.setHours(12, 0, 0, 0);

    const weekDays: Record<string, number> = {
        'понед': 1, 'вторн': 2, 'среду': 3, 'четверг': 4, 'пятниц': 5, 'суббот': 6, 'воскр': 0,
        'пн': 1, 'вт': 2, 'ср': 3, 'чт': 4, 'пт': 5, 'сб': 6, 'вс': 0
    };

    if (/завтра/i.test(cleanText)) {
        result.date = new Date(today.getTime() + 86400000);
    } else if (/послезавтра/i.test(cleanText)) {
        result.date = new Date(today.getTime() + 172800000);
    } else if (/сегодня/i.test(cleanText)) {
        result.date = new Date(today);
    } else {
        let weekdayFound = false;
        const weekdayMatch = cleanText.match(/(?:в|на|во)?\s*(понед[а-я]*|вторн[а-я]*|сред[а-я]*|четверг[а-я]*|пятниц[а-я]*|суббот[а-я]*|воскр[а-я]*|пн|вт|ср|чт|пт|сб|вс)/i);
        if (weekdayMatch) {
            const foundDay = weekdayMatch[1].toLowerCase();
            for (const [day, dayIdx] of Object.entries(weekDays)) {
                if (foundDay.startsWith(day)) {
                    let targetDate = new Date(today);
                    let currentDay = today.getDay();
                    let diff = (dayIdx + 7 - currentDay) % 7;
                    if (diff === 0) diff = 7;
                    targetDate.setDate(today.getDate() + diff);
                    result.date = targetDate;
                    weekdayFound = true;
                    break;
                }
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

    const knownLocations = [
        'Авиамоторная', 'Раменки', 'Юго-Запад', 'Люберцы', 'Химки', 'Мытищи', 'Балашиха',
        'Одинцово', 'Красногорск', 'Видное', 'Реутов', 'Зеленоград', 'Королев', 'Домодедово',
        'Подольск', 'Щелково', 'Серпухов', 'Коломна', 'Электросталь', 'Железнодорожный',
        'Перово', 'Выхино', 'Новогиреево', 'Митино', 'Строгино', 'Бутово', 'Солнцево',
        'Текстильщики', 'Кузьминки', 'Марьино', 'Люблино', 'Братиславская', 'Пражская',
        'Отрадное', 'Бибирево', 'Алтуфьево', 'Медведково', 'Бабушкинская', 'Свиблово',
        'Царицыно', 'Орехово', 'Домодедовская', 'Красногвардейская', 'Алма-Атинская',
        'Варшавская', 'Каширская', 'Кантемировская', 'Коломенская', 'Технопарк', 'Автозаводская',
        'Павелецкая', 'Новокузнецкая', 'Театральная', 'Тверская', 'Маяковская', 'Белорусская',
        'Динамо', 'Аэропорт', 'Сокол', 'Войковская', 'Водный стадион', 'Речной вокзал',
        'Ховрино', 'Беломорская', 'Селигерская', 'Верхние Лихоборы', 'Окружная', 'Петровско-Разумовская',
        'Тимирязевская', 'Дмитровская', 'Савеловская', 'Новослободская', 'Менделеевская', 'Чеховская',
        'Боровицкая', 'Полянка', 'Серпуховская', 'Тульская', 'Нагатинская', 'Нагорная', 'Нахимовский',
        'Севастопольская', 'Чертановская', 'Южная', 'Аннино', 'Янгеля', 'Бульвар Дмитрия Донского',
        'Щербинка', 'Коммунарка', 'Рассказовка', 'Говорово', 'Боровское', 'Новопеределкино',
        'Лобня', 'Долгопрудный', 'Ивантеевка', 'Пушкино', 'Фрязино', 'Монино', 'Старая Купавна',
        'Электроугли', 'Бронницы', 'Раменское', 'Жуковский', 'Лыткарино', 'Котельники', 'Дзержинский',
        'Чехов', 'Ступино', 'Кашира', 'Наро-Фоминск', 'Голицыно', 'Кубинка', 'Можайск', 'Волоколамск',
        'Истра', 'Дедовск', 'Солнечногорск', 'Клин', 'Талдом', 'Дубна', 'Дмитров', 'Яхрома'
    ];

    const addressPatterns = [
        /(?:адрес|место|объект)[:\s-]*([А-Яа-я0-9\s\.,-]+)(?:\n|$|\.|\s(?:цена|зп|бюджет|выплата))/i,
        /(?:ул|улица|пр-т|проспект|бульвар|б-р|пер|переулок|шоссе|ш|наб|набережная|метро|м\b\.?\s+)[\.\s]*([А-Яа-я0-9\s-]{2,}),?\s?(?:д|дом)?\.?\s?\d*[а-яА-Я]?/i,
    ];

    for (const pattern of addressPatterns) {
        const match = cleanText.match(pattern);
        if (match) {
            let addr = (match[1] || match[0]).replace(/[!]{2,}/g, '').trim();
            addr = addr.split(/(?:сегодня|завтра|послезавтра|срочно|зп|цена|бюджет|выплата|руб|рублей)/i)[0].trim();
            result.address = addr.replace(/[,\.\s]+$/, '').trim();
            break;
        }
    }

    if (!result.address) {
        for (const loc of knownLocations) {
            const stem = loc.length > 4 ? loc.substring(0, loc.length - 2) : loc;
            if (new RegExp(stem, 'i').test(cleanText)) {
                result.address = loc;
                break;
            }
        }
    }

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
        for (const line of lines) {
            const cleanLine = line.replace(/[!?.]{2,}/g, '').trim();
            const l = cleanLine.toLowerCase();
            if (l === 'завтра' || l === 'сегодня' || l === 'срочно' || l === 'послезавтра') continue;
            if (result.address && cleanLine.includes(result.address) && lines.length > 1) continue;
            if (result.price > 0 && cleanLine.includes(result.price.toString()) && lines.length > 1) continue;
            if (cleanLine.length >= 3 && cleanLine.length < 50) {
                result.title = cleanLine;
                break;
            }
        }
    }

    if (!result.title) result.title = "Монтаж натяжного потолка";

    return result;
  }
}
