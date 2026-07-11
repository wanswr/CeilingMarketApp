import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus, Prisma } from '@prisma/client';
import { AppGateway } from '../gateway/app.gateway';
import { LoggerService } from '../logger/logger.service';
import { ChatsService } from '../chats/chats.service';
import { randomUUID } from 'crypto';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private gateway: AppGateway,
    private logger: LoggerService,
    private chats: ChatsService,
  ) {
    this.logger.setService('OrdersService');
  }

  private canTransition(from: OrderStatus, to: OrderStatus): boolean {
    const priorities: Record<OrderStatus, number> = {
      [OrderStatus.PENDING]: -1,
      [OrderStatus.PUBLISHED]: 0,
      [OrderStatus.HAS_RESPONSES]: 1,
      [OrderStatus.CLAIMED]: 2,
      [OrderStatus.IN_PROGRESS]: 3,
      [OrderStatus.COMPLETED]: 4,
      [OrderStatus.CANCELLED]: 5,
      [OrderStatus.DISPUTE]: 6,
      [OrderStatus.REVIEWED]: 7,
    };

    // V12 Hardened rules:
    if (from === OrderStatus.CANCELLED) return false; // Terminal
    if (from === OrderStatus.COMPLETED && to !== OrderStatus.REVIEWED) return false;
    if (to === OrderStatus.CANCELLED) return true; // Allowed from anywhere except terminal

    // Strict forward progression only
    return priorities[to] > priorities[from];
  }

  private broadcast(event: string, payload: any) {
      this.gateway.broadcast(event, {
          event,
          eventId: randomUUID(),
          data: payload
      });
  }

  async create(dto: any, userId: string) {
    const order = await this.prisma.order.create({
      data: {
        ...dto,
        employerId: userId,
        status: OrderStatus.PUBLISHED,
      },
    });
    this.logger.info('ORDER_CREATED', `Order created successfully`, { userId, orderId: order.id });
    this.broadcast('order.created', order);
    return order;
  }

  async findAll(params: { lat?: number; lng?: number; radius?: number; status?: OrderStatus }) {
    const { lat, lng, radius, status } = params;
    const where: Prisma.OrderWhereInput = {};
    if (status) where.status = status;

    if (lat && lng && radius) {
      const dLat = radius / 111.32;
      const dLng = radius / (111.32 * Math.cos(lat * Math.PI / 180));
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
        reviews: true
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
        },
        reviews: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async update(id: string, dto: any, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException();
    if (order.employerId !== userId) throw new ForbiddenException();

    if (dto.status && dto.status !== order.status) {
      if (!this.canTransition(order.status, dto.status)) {
        throw new ConflictException(`Transition ${order.status} -> ${dto.status} not allowed`);
      }
    }

    const result = await this.prisma.order.update({
      where: { id },
      data: dto
    });

    this.broadcast('order.status.changed', result);
    return result;
  }

  async remove(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order || order.employerId !== userId) throw new ForbiddenException();
    await this.prisma.order.delete({ where: { id } });
    this.broadcast('order.deleted', { id });
    return { id };
  }

  async apply(orderId: string, executorId: string, price?: number) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException();

    // Safety check: cannot apply to already taken or completed orders
    if (order.status !== OrderStatus.PUBLISHED && order.status !== OrderStatus.HAS_RESPONSES) {
        throw new ConflictException('Order is no longer open for applications');
    }

    const existing = await this.prisma.application.findUnique({
      where: { orderId_executorId: { orderId, executorId } }
    });
    if (existing) throw new ConflictException('Already applied');

    const result = await this.prisma.$transaction(async (tx) => {
      const app = await tx.application.create({
        data: { orderId, executorId, price, status: 'PENDING' }
      });

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.HAS_RESPONSES }
      });

      return { app, order: updatedOrder };
    });

    this.logger.info('ORDER_APPLIED', `New application for order ${result.order.id}`, { orderId: result.order.id, userId: executorId });
    this.broadcast('application.new', result.app);
    this.broadcast('order.status.changed', result.order);
    return result.app;
  }

  async markApplicationViewed(applicationId: string, userId: string) {
     const app = await this.prisma.application.findUnique({
         where: { id: applicationId },
         include: { order: true }
     });
     if (!app || app.order.employerId !== userId) throw new ForbiddenException();
     return this.prisma.application.update({
         where: { id: applicationId },
         data: { status: 'VIEWED' }
     });
  }

  async acceptApplication(applicationId: string, userId: string) {
     const app = await this.prisma.application.findUnique({
         where: { id: applicationId },
         include: { order: true }
     });
     if (!app || app.order.employerId !== userId) throw new ForbiddenException();

     // Conflict Check: Is order already claimed or in progress?
     if (app.order.status !== OrderStatus.HAS_RESPONSES && app.order.status !== OrderStatus.PUBLISHED) {
         throw new ConflictException(`Cannot accept application. Order status is already ${app.order.status}`);
     }

     const result = await this.prisma.$transaction(async (tx) => {
         const updatedOrder = await tx.order.update({
             where: { id: app.orderId },
             data: {
                 status: OrderStatus.CLAIMED,
                 executorId: app.executorId,
                 claimedAt: new Date()
             }
         });

         await tx.application.update({
             where: { id: applicationId },
             data: { status: 'ACCEPTED' }
         });

         // V12: Auto-reject all other applications for this order
         await tx.application.updateMany({
             where: {
                 orderId: app.orderId,
                 id: { not: applicationId }
             },
             data: { status: 'REJECTED' }
         });

         // Auto-create chat
         await this.chats.getOrCreateChat(app.orderId, app.executorId, app.order.employerId);

         return updatedOrder;
     });

     this.logger.info('ORDER_ACCEPTED', `Application accepted for order ${result.id}`, { orderId: result.id, userId });
     this.broadcast('order.status.changed', result);
     this.broadcast('application.accepted', { orderId: result.id, executorId: app.executorId });
     return result;
  }

  async startWork(id: string, userId: string) {
      const order = await this.prisma.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException();
      if (order.executorId !== userId) throw new ForbiddenException();

      // Production Guard: must be CLAIMED
      if (order.status !== OrderStatus.CLAIMED) {
          throw new ConflictException(`Cannot start work. Expected status CLAIMED, found ${order.status}`);
      }

      const result = await this.prisma.order.update({
          where: { id },
          data: { status: OrderStatus.IN_PROGRESS }
      });

      this.logger.info('ORDER_STARTED', `Order started by executor`, { orderId: result.id, userId });
      this.broadcast('order.status.changed', result);
      return result;
  }

  async completeWork(id: string, userId: string) {
      const order = await this.prisma.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException();
      if (order.executorId !== userId) throw new ForbiddenException();

      // Production Guard: must be IN_PROGRESS
      if (order.status !== OrderStatus.IN_PROGRESS) {
          throw new ConflictException(`Cannot complete work. Expected status IN_PROGRESS, found ${order.status}`);
      }

      const result = await this.prisma.order.update({
          where: { id },
          data: { status: OrderStatus.COMPLETED }
      });

      this.logger.info('ORDER_COMPLETED', `Order completed by executor`, { orderId: result.id, userId });
      this.broadcast('order.status.changed', result);
      return result;
  }

  async transitionStatus(id: string, status: OrderStatus, userId: string) {
      const order = await this.prisma.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException();

      if (!this.canTransition(order.status, status)) {
          throw new ConflictException(`Transition ${order.status} -> ${status} not allowed`);
      }

      return this.update(id, { status }, userId);
  }

  async cancelApplication(orderId: string, executorId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const app = await this.prisma.application.findUnique({
      where: { orderId_executorId: { orderId, executorId } }
    });
    if (!app) {
        // Idempotent: already cancelled or not found
        return { success: true };
    }

    const now = new Date();
    const orderDate = new Date(order.date);
    const diffHours = (orderDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (diffHours < 24) {
      throw new ForbiddenException('Cannot cancel application less than 24 hours before order date');
    }

    await this.prisma.application.delete({
      where: { id: app.id }
    });

    const remainingApps = await this.prisma.application.count({
      where: { orderId }
    });

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      if (remainingApps === 0 && order.status === OrderStatus.HAS_RESPONSES) {
        return tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.PUBLISHED },
          include: {
            employer: { select: { id: true, name: true, rating: true, avatar: true } },
            executor: { select: { id: true, name: true, avatar: true } },
            applications: {
              include: {
                executor: { select: { id: true, name: true, avatar: true, rating: true, completedOrders: true } }
              }
            },
            reviews: true
          }
        });
      }

      return tx.order.findUnique({
        where: { id: orderId },
        include: {
          employer: { select: { id: true, name: true, rating: true, avatar: true } },
          executor: { select: { id: true, name: true, avatar: true } },
          applications: {
            include: {
              executor: { select: { id: true, name: true, avatar: true, rating: true, completedOrders: true } }
            }
          },
          reviews: true
        }
      });
    });

    if (updatedOrder) {
      this.broadcast('order.status.changed', updatedOrder);
    }

    return { success: true };
  }

  async findSpatial(params: {
    lat?: number; lng?: number; radius?: number;
    minLat?: number; maxLat?: number; minLng?: number; maxLng?: number;
    updatedAfter?: Date;
  }) {
    const startTime = Date.now();
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

    try {
      const orders = await this.prisma.order.findMany({
        where: {
          status: { in: [OrderStatus.PUBLISHED, OrderStatus.HAS_RESPONSES, OrderStatus.CLAIMED, OrderStatus.IN_PROGRESS] },
          latitude: { gte: searchBounds.minLat, lte: searchBounds.maxLat },
          longitude: { gte: searchBounds.minLng, lte: searchBounds.maxLng },
          updatedAt: updatedAfter ? { gt: updatedAfter } : undefined,
        },
        take: 1000,
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
            applications: { select: { id: true, executorId: true, status: true, price: true } }
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
    }

    const addressKeywords = ['улица', 'ул', 'шоссе', 'ш', 'проспект', 'пр', 'бульвар', 'б-р', 'переулок', 'пер', 'набережная', 'наб', 'корпус', 'корп', 'дом', 'д', 'жк'];
    const cities = ['москва', 'котельники', 'истра', 'химки', 'балашиха', 'красногорск', 'люберцы', 'мытищи', 'одинцово', 'подольск', 'ясенево', 'коммунарка', 'видное', 'варшавское', 'римского', 'корсако', 'судостроительная'];

    for (const line of lines) {
       const lowerLine = line.toLowerCase();
       const isPriceLine = /зп|зарплата|цена|руб|₽/i.test(lowerLine);
       const isDateLine = /завтра|сегодня|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|\\d{1,2}\\.\\d{1,2}/i.test(lowerLine);

       const hasCity = cities.some(c => lowerLine.includes(c));
       const hasKeyword = addressKeywords.some(k => lowerLine.includes(k + '.') || lowerLine.includes(k + ' ') || lowerLine.includes(' ' + k) || lowerLine === k);
       const hasHouseNum = /\\d+[а-я]?/.test(lowerLine) && !isPriceLine && !isDateLine && (lowerLine.includes(' ') || lowerLine.length < 10 || lowerLine.match(/\\d+к\\d+/));

       if ((hasCity || hasKeyword || hasHouseNum) && !isPriceLine && !isDateLine) {
         result.address = line;
         const idx = lines.indexOf(line);
         if (idx !== -1 && idx < lines.length - 1) {
             const nextLine = lines[idx+1];
             if (nextLine.length < 40 && !/зп|цена|руб|завтра|сегодня/i.test(nextLine)) {
                 if (nextLine.match(/\\d+/) || line.length < 25 || nextLine.toLowerCase().includes('жк') || cities.some(c => nextLine.toLowerCase().includes(c))) {
                    result.address += ', ' + nextLine;
                 }
             }
         }
         break;
       }
    }

    for (const line of lines) {
        if (result.address && result.address.includes(line)) continue;
        const lowerLine = line.toLowerCase();
        if (/завтра|сегодня|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|\\d{1,2}\\.\\d{1,2}/i.test(line)) continue;
        if (/зп|зарплата|цена|руб|₽/i.test(line)) continue;

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
