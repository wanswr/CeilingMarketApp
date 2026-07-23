import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus, Prisma, Role } from '@prisma/client';
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
    if (to === OrderStatus.CANCELLED) {
        // Block cancellation if work has already started, completed, or is in dispute
        if (from === OrderStatus.IN_PROGRESS ||
            from === OrderStatus.COMPLETED ||
            from === OrderStatus.REVIEWED ||
            from === OrderStatus.DISPUTE) {
            return false;
        }
        return true;
    }

    // Strict forward progression only
    return priorities[to] > priorities[from];
  }

  private async broadcast(event: string, payload: any, userId?: string) {
      let activeRole = 'none';
      if (userId) {
          try {
              const user = await this.prisma.user.findUnique({ where: { id: userId } });
              if (user) {
                  activeRole = user.role || 'none';
              }
          } catch (e) {}
      }

      this.gateway.broadcast(event, {
          event,
          eventType: event,
          eventId: randomUUID(),
          userId: userId || 'system',
          activeRole,
          data: payload
      });
  }

  async create(dto: any, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw new ForbiddenException('User is inactive or deleted');
    }

    let categoryId = dto.categoryId;
    if (!categoryId) {
      const ceilingCategory = await this.prisma.category.findUnique({
        where: { slug: 'ceiling' }
      });
      if (ceilingCategory) {
        categoryId = ceilingCategory.id;
      }
    }

    const { idempotencyKey, ...orderData } = dto;

    if (idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: { idempotencyKey }
      });
      if (existing) {
        this.logger.info('ORDER_CREATE_IDEMPOTENT_HIT', 'Order already created, returning existing', { orderId: existing.id, idempotencyKey });
        return existing;
      }

      try {
        const order = await this.prisma.order.create({
          data: {
            ...orderData,
            idempotencyKey,
            categoryId,
            employerId: userId,
            status: OrderStatus.PUBLISHED,
          },
        });
        this.logger.info('ORDER_CREATED', `Order created successfully with idempotencyKey`, { userId, orderId: order.id, idempotencyKey });
        await this.broadcast('order.created', order, userId);
        return order;
      } catch (error: any) {
        if (error.code === 'P2002') {
          const duplicate = await this.prisma.order.findUnique({
            where: { idempotencyKey }
          });
          if (duplicate) {
            this.logger.info('ORDER_CREATE_IDEMPOTENT_RACE_HIT', 'Order already created by parallel request, returning existing', { orderId: duplicate.id, idempotencyKey });
            return duplicate;
          }
        }
        throw error;
      }
    }

    const order = await this.prisma.order.create({
      data: {
        ...dto,
        categoryId,
        employerId: userId,
        status: OrderStatus.PUBLISHED,
      },
    });
    this.logger.info('ORDER_CREATED', `Order created successfully`, { userId, orderId: order.id });
    await this.broadcast('order.created', order, userId);
    return order;
  }

  async findAll(params: { lat?: number; lng?: number; radius?: number; status?: OrderStatus; categoryId?: string }) {
    const { lat, lng, radius, status, categoryId } = params;
    const where: Prisma.OrderWhereInput = {};
    if (status) where.status = status;
    if (categoryId) where.categoryId = categoryId;

    if (lat && lng && radius) {
      const dLat = radius / 111.32;
      const dLng = radius / (111.32 * Math.cos(lat * Math.PI / 180));
      where.latitude = { gte: lat - dLat, lte: lat + dLat };
      where.longitude = { gte: lng - dLng, lte: lng + dLng };
    }

    return this.prisma.order.findMany({
      where,
      take: 200,
      include: {
        employer: { select: { id: true, name: true, rating: true, avatar: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findOne(id: string, requesterId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        employer: { select: { id: true, name: true, avatar: true, rating: true, completedOrders: true } },
        executor: { select: { id: true, name: true, avatar: true, rating: true, completedOrders: true } },
        reviews: true
      }
    });
    if (!order) throw new NotFoundException();

    if (requesterId && requesterId === order.employerId) {
      const applications = await this.prisma.application.findMany({
        where: { orderId: id },
        include: {
          executor: { select: { id: true, name: true, avatar: true, rating: true, completedOrders: true } }
        }
      });
      return { ...order, applications };
    }
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

    await this.broadcast('order.status.changed', result, userId);
    return result;
  }

  async remove(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order || order.employerId !== userId) throw new ForbiddenException();

    // Fetch chat IDs before deleting
    const chats = await this.prisma.chat.findMany({
        where: { orderId: id },
        select: { id: true }
    });
    const chatIds = chats.map(c => c.id);

    await this.prisma.order.delete({ where: { id } });

    await this.broadcast('order.deleted', {
        id,
        employerId: order.employerId,
        executorId: order.executorId,
        chatIds
    }, userId);

    return { id };
  }

  async apply(orderId: string, executorId: string, price?: number, idempotencyKey?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException();

    // Validate executor role (must be WORKER to apply)
    const executor = await this.prisma.user.findUnique({ where: { id: executorId } });
    if (!executor || executor.role !== Role.WORKER || executor.deletedAt) {
        throw new ForbiddenException('Only workers are allowed to apply to orders');
    }

    // Safety check: cannot apply to already taken or completed orders
    if (order.status !== OrderStatus.PUBLISHED && order.status !== OrderStatus.HAS_RESPONSES) {
        throw new ConflictException('Order is no longer open for applications');
    }

    if (idempotencyKey) {
      const existingApp = await this.prisma.application.findUnique({
        where: { idempotencyKey }
      });
      if (existingApp) {
        this.logger.info('ORDER_APPLY_IDEMPOTENT_HIT', 'Application already exists with this idempotencyKey', { idempotencyKey });
        const currentOrder = await this.prisma.order.findUnique({ where: { id: orderId } });
        return { app: existingApp, order: currentOrder };
      }
    }

    const existing = await this.prisma.application.findUnique({
      where: { orderId_executorId: { orderId, executorId } }
    });
    if (existing) throw new ConflictException('Already applied');

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const app = await tx.application.create({
          data: { orderId, executorId, price, status: 'PENDING', idempotencyKey }
        });

        const updatedOrder = await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.HAS_RESPONSES }
        });

        return { app, order: updatedOrder };
      });

      this.logger.info('ORDER_APPLIED', `New application for order ${result.order.id}`, { orderId: result.order.id, userId: executorId });
      await this.broadcast('application.new', result.app, executorId);
      await this.broadcast('order.status.changed', result.order, executorId);
      return result.app;
    } catch (error: any) {
      if (idempotencyKey && error.code === 'P2002') {
        const duplicateApp = await this.prisma.application.findUnique({
          where: { idempotencyKey }
        });
        if (duplicateApp) {
          this.logger.info('ORDER_APPLY_IDEMPOTENT_RACE_HIT', 'Application created by parallel request, returning existing', { idempotencyKey });
          const currentOrder = await this.prisma.order.findUnique({ where: { id: orderId } });
          return { app: duplicateApp, order: currentOrder };
        }
      }
      throw error;
    }
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
         include: { order: true, executor: true }
     });
     if (!app || app.order.employerId !== userId) throw new ForbiddenException();
     if (app.executor.deletedAt) {
         throw new ForbiddenException('Executor account is deleted or inactive');
     }

     // Conflict Check: Is order already claimed or in progress?
     if (app.order.status !== OrderStatus.HAS_RESPONSES && app.order.status !== OrderStatus.PUBLISHED) {
         throw new ConflictException(`Cannot accept application. Order status is already ${app.order.status}`);
     }

     const result = await this.prisma.$transaction(async (tx) => {
         const updatedCount = await tx.order.updateMany({
             where: {
                 id: app.orderId,
                 status: { in: [OrderStatus.PUBLISHED, OrderStatus.HAS_RESPONSES] }
             },
             data: {
                 status: OrderStatus.CLAIMED,
                 executorId: app.executorId,
                 claimedAt: new Date()
             }
         });

         if (updatedCount.count === 0) {
             throw new ConflictException('Cannot accept application. Order has already been claimed or status has changed.');
         }

         const updatedOrder = await tx.order.findUnique({
             where: { id: app.orderId }
         });

         if (!updatedOrder) {
             throw new NotFoundException('Order not found');
         }

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
     await this.broadcast('order.status.changed', result, userId);
     await this.broadcast('application.accepted', { orderId: result.id, executorId: app.executorId }, userId);
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
      await this.broadcast('order.status.changed', result, userId);
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
      await this.broadcast('order.status.changed', result, userId);
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

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      try {
        await tx.application.delete({
          where: { id: app.id }
        });
      } catch (err: any) {
        // Already deleted by a parallel process
        return null;
      }

      const remainingApps = await tx.application.count({
        where: { orderId }
      });

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
      await this.broadcast('order.status.changed', updatedOrder, executorId);
    }

    return { success: true };
  }

  async findSpatial(params: {
    lat?: number; lng?: number; radius?: number;
    minLat?: number; maxLat?: number; minLng?: number; maxLng?: number;
    updatedAfter?: Date;
    categoryId?: string;
    requesterId?: string;
    cursorId?: string;
    limit?: number;
  }) {
    const startTime = Date.now();
    const { lat, lng, radius, minLat, maxLat, minLng, maxLng, updatedAfter, categoryId, requesterId, cursorId, limit } = params;

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
        take: limit !== undefined ? Number(limit) : 250,
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

  async openDispute(orderId: string, userId: string, reason: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    if (order.employerId !== userId && order.executorId !== userId) {
        throw new ForbiddenException('Only order participants can open a dispute');
    }

    const result = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.DISPUTE }
    });

    this.logger.info('ORDER_DISPUTED', `Dispute opened by user ${userId} for reason: ${reason}`, { orderId, userId });
    await this.broadcast('order.status.changed', result, userId);
    return result;
  }

  async findStuckOrders(hours: number) {
    const threshold = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.prisma.order.findMany({
      where: {
        status: { in: [OrderStatus.CLAIMED, OrderStatus.IN_PROGRESS] },
        updatedAt: { lt: threshold }
      },
      include: {
        employer: { select: { id: true, name: true, rating: true, avatar: true } },
        executor: { select: { id: true, name: true, avatar: true } }
      }
    });
  }
}
