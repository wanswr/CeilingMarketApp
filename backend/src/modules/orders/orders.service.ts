import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus, ApplicationStatus, Prisma, Role } from '@prisma/client';
import { ORDER_STATE_MACHINE } from './order-state-machine';
import { AppGateway } from '../gateway/app.gateway';
import { LoggerService } from '../logger/logger.service';
import { ChatsService } from '../chats/chats.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrderParserService } from './order-parser.service';
import { OrderSpatialService } from './order-spatial.service';
import { randomUUID } from 'crypto';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private gateway: AppGateway,
    private logger: LoggerService,
    private chats: ChatsService,
    private notificationsService: NotificationsService,
    private orderParserService: OrderParserService,
    private orderSpatialService: OrderSpatialService,
  ) {
    this.logger.setService('OrdersService');
  }

  private sanitizeOrderForPublic(order: any) {
    if (!order) return null;
    return {
      id: order.id,
      title: order.title,
      price: order.price,
      status: order.status,
      workType: order.workType,
      categoryId: order.categoryId,
      createdAt: order.createdAt,
      employer: order.employer ? {
        id: order.employer.id,
        name: order.employer.name,
        avatar: order.employer.avatar,
        rating: order.employer.rating,
      } : null,
      statusHistory: order.statusHistory || []
    };
  }

  private async logStatusHistory(tx: any, orderId: string, oldStatus: OrderStatus, newStatus: OrderStatus, changedById?: string) {
    const targetStatuses: OrderStatus[] = [OrderStatus.CLAIMED, OrderStatus.IN_PROGRESS, OrderStatus.COMPLETED, OrderStatus.PUBLISHED, OrderStatus.HAS_RESPONSES];
    if (targetStatuses.includes(newStatus)) {
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus,
          newStatus,
          changedById
        }
      });
    }
  }

  private canTransition(from: OrderStatus, to: OrderStatus): boolean {
    const currentTransitions = ORDER_STATE_MACHINE[from];
    if (!currentTransitions) return false;
    return !!currentTransitions[to];
  }

  private validateTransition(
    order: any,
    toStatus: OrderStatus,
    userId: string,
    isSystem = false
  ): void {
    if (order.isFrozen || order.status === OrderStatus.FROZEN) {
      throw new ForbiddenException('Order is frozen and cannot be modified');
    }
    const fromStatus = order.status;

    if (fromStatus === toStatus) {
      throw new ConflictException(`Cannot transition from ${fromStatus} to ${toStatus}`);
    }

    const currentTransitions = ORDER_STATE_MACHINE[fromStatus];
    if (!currentTransitions) {
      throw new ConflictException(`Cannot transition from ${fromStatus} to ${toStatus}`);
    }

    const rule = currentTransitions[toStatus];
    if (!rule) {
      throw new ConflictException(`Cannot transition from ${fromStatus} to ${toStatus}`);
    }

    if (rule.requiresParticipant === 'system' && !isSystem) {
      throw new ConflictException(`Cannot transition from ${fromStatus} to ${toStatus}`);
    }

    if (isSystem) {
      return;
    }

    if (rule.requiresParticipant === 'employer') {
      if (order.employerId !== userId) {
        throw new ForbiddenException(`Only the employer can transition this order to ${toStatus}`);
      }
    } else if (rule.requiresParticipant === 'executor') {
      if (order.executorId !== userId) {
        throw new ForbiddenException(`Only the executor can transition this order to ${toStatus}`);
      }
    } else if (rule.requiresParticipant === 'any') {
      if (order.employerId !== userId && order.executorId !== userId) {
        throw new ForbiddenException(`Only order participants can transition this order to ${toStatus}`);
      }
    }
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

      let dataPayload = payload;
      if ((event === 'order.created' || event === 'order.status.changed') && payload?.id) {
          try {
              const lightweightOrder = await this.prisma.order.findUnique({
                  where: { id: payload.id },
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
              if (lightweightOrder) {
                  dataPayload = lightweightOrder;
              }
          } catch (err) {}
      }

      this.gateway.broadcast(event, {
          event,
          eventType: event,
          eventId: randomUUID(),
          userId: userId || 'system',
          activeRole,
          data: dataPayload
      });
  }

  async create(dto: any, userId: string) {
    const creator = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!creator || creator.deletedAt) {
      throw new ForbiddenException('User account is deleted');
    }
    if (creator.isBlocked) {
      throw new ForbiddenException('Blocked user cannot perform this action');
    }
    const creatorRoles = creator.roles && creator.roles.length > 0 ? creator.roles : [creator.role].filter(Boolean);
    if (!creatorRoles.includes('EMPLOYER') || creator.role !== 'EMPLOYER') {
      throw new ForbiddenException('Только заказчик может публиковать заказы');
    }

    let categoryId = dto.categoryId;
    if (!categoryId) {
      const ceilingCategory = await this.prisma.category.findUnique({
        where: { slug: 'ceilings' }
      });
      if (ceilingCategory) {
        categoryId = ceilingCategory.id;
      }
    }

    const { idempotencyKey } = dto;

    const whitelist: any = {
      title: dto.title,
      address: dto.address,
      latitude: dto.latitude !== undefined ? Number(dto.latitude) : undefined,
      longitude: dto.longitude !== undefined ? Number(dto.longitude) : undefined,
      date: dto.date ? new Date(dto.date) : undefined,
      price: dto.price !== undefined ? Number(dto.price) : undefined,
      details: dto.details,
      workType: dto.workType,
      images: dto.images,
      categoryId,
    };

    Object.keys(whitelist).forEach(key => {
      if (whitelist[key] === undefined) {
        delete whitelist[key];
      }
    });

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
            ...whitelist,
            idempotencyKey,
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
        ...whitelist,
        employerId: userId,
        status: OrderStatus.PUBLISHED,
      },
    });
    this.logger.info('ORDER_CREATED', `Order created successfully`, { userId, orderId: order.id });
    await this.broadcast('order.created', order, userId);
    return order;
  }

  async findOne(id: string, requesterId?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        employer: { select: { id: true, name: true, avatar: true, rating: true, completedOrders: true } },
        executor: { select: { id: true, name: true, avatar: true, rating: true, completedOrders: true } },
        reviews: true,
        statusHistory: { orderBy: { createdAt: 'asc' } }
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

    if (requesterId && requesterId === order.executorId) {
      return order;
    }

    return this.sanitizeOrderForPublic(order);
  }

  async findMyOrders(userId: string, params?: { skip?: number; take?: number }) {
    const skip = params?.skip !== undefined ? Number(params.skip) : undefined;
    const take = params?.take !== undefined ? Number(params.take) : 50;

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
      orderBy: { createdAt: 'desc' },
      skip,
      take
    });
  }

  async update(id: string, dto: any, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.employerId !== userId) throw new ForbiddenException('Only the employer can modify this order');

    if (order.isFrozen || order.status === OrderStatus.FROZEN) {
      throw new ForbiddenException('Order is frozen and cannot be modified');
    }

    const currentStatus: any = order.status;

    if ([OrderStatus.COMPLETED, OrderStatus.REVIEWED, OrderStatus.CANCELLED].includes(currentStatus)) {
      throw new ConflictException(`Cannot edit order in ${order.status} status`);
    }

    if (currentStatus === OrderStatus.CLAIMED) {
      const isCriticalFieldUpdated =
        dto.price !== undefined ||
        dto.address !== undefined ||
        dto.latitude !== undefined ||
        dto.longitude !== undefined ||
        dto.date !== undefined ||
        dto.categoryId !== undefined ||
        dto.workType !== undefined;

      if (isCriticalFieldUpdated) {
        throw new ConflictException('Cannot modify critical terms (price, address, date, category, workType) after worker is assigned');
      }
    }

    if (currentStatus === OrderStatus.IN_PROGRESS) {
      const isAnyFieldUpdated =
        dto.price !== undefined ||
        dto.address !== undefined ||
        dto.latitude !== undefined ||
        dto.longitude !== undefined ||
        dto.date !== undefined ||
        dto.categoryId !== undefined ||
        dto.workType !== undefined ||
        dto.title !== undefined ||
        dto.details !== undefined ||
        dto.images !== undefined;

      if (isAnyFieldUpdated) {
        throw new ConflictException('Cannot modify order terms or content while work is in progress');
      }
    }

    if (dto.status && dto.status !== order.status) {
      this.validateTransition(order, dto.status, userId, false);
    }

    const whitelist: any = {};
    if (dto.title !== undefined) whitelist.title = dto.title;
    if (dto.details !== undefined) whitelist.details = dto.details;
    if (dto.address !== undefined) whitelist.address = dto.address;
    if (dto.price !== undefined) whitelist.price = Number(dto.price);
    if (dto.date !== undefined) whitelist.date = new Date(dto.date);
    if (dto.images !== undefined) whitelist.images = dto.images;
    if (dto.status !== undefined && dto.status !== order.status) {
      whitelist.status = dto.status;
    }

    const result = await this.prisma.order.update({
      where: { id },
      data: whitelist
    });

    await this.broadcast('order.status.changed', result, userId);
    return result;
  }

  async cancelByExecutor(orderId: string, executorId: string, reason: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        executor: { select: { id: true, name: true } },
        employer: { select: { id: true, name: true } },
      },
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.executorId !== executorId) {
      throw new ForbiddenException('Only the assigned executor can cancel participation for this order');
    }

    if (order.status !== OrderStatus.CLAIMED) {
      throw new ConflictException(`Cannot cancel participation when order is in ${order.status} status`);
    }

    const remainingActiveAppsCount = await this.prisma.application.count({
      where: {
        orderId,
        executorId: { not: executorId },
        status: { in: [ApplicationStatus.PENDING, ApplicationStatus.VIEWED] },
      },
    });

    const targetStatus = remainingActiveAppsCount > 0 ? OrderStatus.HAS_RESPONSES : OrderStatus.PUBLISHED;

    this.validateTransition(order, targetStatus, executorId, false);

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      await tx.application.updateMany({
        where: {
          orderId,
          executorId,
          status: ApplicationStatus.ACCEPTED,
        },
        data: {
          status: ApplicationStatus.CANCELLED_BY_EXECUTOR,
        },
      });

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: targetStatus,
          executorId: null,
          claimedAt: null,
        },
        include: {
          employer: { select: { id: true, name: true, rating: true, avatar: true } },
        },
      });

      await this.logStatusHistory(tx, orderId, OrderStatus.CLAIMED, targetStatus, executorId);

      return updated;
    });

    const executorName = order.executor?.name || 'Исполнитель';
    await this.notificationsService.create(order.employerId, {
      type: 'EXECUTOR_CANCELLED',
      title: 'Исполнитель отказался от заказа',
      message: `Исполнитель ${executorName} отказался от выполнения заказа "${order.title}". Причина: ${reason}`
    });

    this.logger.info('ORDER_EXECUTOR_CANCELLED', `Executor ${executorId} cancelled participation for order ${orderId}. Reason: ${reason}`, { orderId, executorId, reason });
    await this.broadcast('order.status.changed', updatedOrder, executorId);

    return updatedOrder;
  }

  async remove(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        disputes: {
          where: {
            status: { in: ["OPEN", "IN_REVIEW", "WAITING_FOR_PARTY", "APPEALED"] }
          }
        },
        payments: {
          where: { status: "COMPLETED" }
        }
      }
    });

    if (!order) throw new NotFoundException("Order not found");
    if (order.employerId !== userId) throw new ForbiddenException("Only employer can remove order");

    if (order.status === OrderStatus.CANCELLED) {
      return { id, status: OrderStatus.CANCELLED };
    }

    if (order.disputes && order.disputes.length > 0) {
      throw new ConflictException("Cannot cancel order with an active dispute");
    }

    if (order.payments && order.payments.length > 0) {
      throw new ConflictException("Cannot cancel order with completed payment obligation");
    }

    this.validateTransition(order, OrderStatus.CANCELLED, userId, false);

    const chats = await this.prisma.chat.findMany({
      where: { orderId: id },
      select: { id: true }
    });
    const chatIds = chats.map(c => c.id);

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id },
        data: { status: OrderStatus.CANCELLED }
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          oldStatus: order.status,
          newStatus: OrderStatus.CANCELLED,
          changedById: userId
        }
      });

      return result;
    });

    await this.broadcast("order.status.changed", updatedOrder, userId);
    await this.broadcast("order.deleted", {
      id,
      employerId: order.employerId,
      executorId: order.executorId,
      chatIds
    }, userId);

    return { id, status: OrderStatus.CANCELLED };
  }

  async apply(orderId: string, executorId: string, price?: number, idempotencyKey?: string) {
    const executor = await this.prisma.user.findUnique({ where: { id: executorId } });
    if (!executor || executor.deletedAt) {
        throw new ForbiddenException('Only workers are allowed to apply to orders');
    }
    if (executor.isBlocked) {
        throw new ForbiddenException('Blocked user cannot perform this action');
    }
    const executorRoles = executor.roles && executor.roles.length > 0 ? executor.roles : [executor.role].filter(Boolean);
    if (!executorRoles.includes(Role.WORKER) || executor.role !== Role.WORKER) {
        throw new ForbiddenException('Only workers are allowed to apply to orders');
    }

    const targetOrder = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!targetOrder) throw new NotFoundException('Order not found');

    const orderCategoryId = targetOrder.categoryId || executor.activeCategoryId;
    if (orderCategoryId) {
      const sub = await this.prisma.subscription.findUnique({
        where: {
          userId_categoryId: {
            userId: executorId,
            categoryId: orderCategoryId,
          },
        },
      });

      const isSubActive = sub && sub.isActive && new Date(sub.activeUntil) > new Date();

      if (!isSubActive) {
        if (!executor.freeCategoryUsed) {
          const until = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await this.prisma.$transaction(async (tx) => {
            await tx.user.update({
              where: { id: executorId },
              data: { freeCategoryUsed: true },
            });
            await tx.subscription.upsert({
              where: {
                userId_categoryId: {
                  userId: executorId,
                  categoryId: orderCategoryId,
                },
              },
              update: {
                isActive: true,
                activeUntil: until,
              },
              create: {
                userId: executorId,
                categoryId: orderCategoryId,
                isActive: true,
                activeUntil: until,
              },
            });
          });
        } else {
          throw new ForbiddenException('Требуется активная подписка на категорию заказа для отклика');
        }
      }
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
        const order = await tx.order.findUnique({ where: { id: orderId } });
        if (!order) throw new NotFoundException('Order not found');

        if (order.status !== OrderStatus.PUBLISHED && order.status !== OrderStatus.HAS_RESPONSES) {
            throw new ConflictException('Order is no longer open for applications');
        }

        await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;

        const appCount = await tx.application.count({
          where: { orderId }
        });
        if (appCount >= 10) {
          throw new ConflictException('Maximum application limit reached');
        }

        const app = await tx.application.create({
          data: { orderId, executorId, price, status: 'PENDING', idempotencyKey }
        });

        let updatedOrder = order;
        if (order.status === OrderStatus.PUBLISHED) {
          updatedOrder = await tx.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.HAS_RESPONSES }
          });
        }

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
      if (error.code === 'P2002') {
        throw new ConflictException('Already applied');
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
     if (app.executor?.deletedAt) {
         throw new ConflictException('Executor account is deleted');
     }

     this.validateTransition(app.order, OrderStatus.CLAIMED, userId, true);

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
             where: { id: app.orderId },
             include: {
                 employer: { select: { id: true, name: true, rating: true, avatar: true } },
                 executor: { select: { id: true, name: true, rating: true, avatar: true } },
             }
         });

         if (!updatedOrder) {
             throw new NotFoundException('Order not found');
         }

         await this.logStatusHistory(tx, app.orderId, app.order.status, OrderStatus.CLAIMED, userId);

         await tx.application.update({
             where: { id: applicationId },
             data: { status: 'ACCEPTED' }
         });

         await tx.application.updateMany({
             where: {
                 orderId: app.orderId,
                 id: { not: applicationId }
             },
             data: { status: 'REJECTED' }
         });

         const chat = await this.chats.getOrCreateChat(app.orderId, app.executorId, app.order.employerId, tx);

         return { order: updatedOrder, chat };
     });

     this.logger.info('ORDER_ACCEPTED', `Application accepted for order ${result.order.id}`, { orderId: result.order.id, userId });
     await this.broadcast('order.status.changed', result.order, userId);
     await this.broadcast('application.accepted', { orderId: result.order.id, executorId: app.executorId }, userId);
     return result;
  }

  async startWork(id: string, userId: string) {
      const order = await this.prisma.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException();

      this.validateTransition(order, OrderStatus.IN_PROGRESS, userId, false);

      const updateResult = await this.prisma.order.updateMany({
          where: {
              id,
              status: OrderStatus.CLAIMED,
              executorId: userId
          },
          data: { status: OrderStatus.IN_PROGRESS }
      });

      if (updateResult.count === 0) {
          throw new ConflictException('Cannot start work. Status changed or executor mismatch.');
      }

      await this.logStatusHistory(this.prisma, id, order.status, OrderStatus.IN_PROGRESS, userId);

      const result = await this.prisma.order.findUnique({
          where: { id },
          include: {
              employer: { select: { id: true, name: true, avatar: true, rating: true, completedOrders: true } },
              executor: { select: { id: true, name: true, avatar: true, rating: true, completedOrders: true } },
              reviews: true,
              statusHistory: true
          }
      });

      this.logger.info('ORDER_STARTED', `Order started by executor`, { orderId: result!.id, userId });
      await this.broadcast('order.status.changed', result, userId);
      return result!;
  }

  async completeWork(id: string, userId: string) {
      const order = await this.prisma.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException();

      this.validateTransition(order, OrderStatus.COMPLETED, userId, false);

      const updateResult = await this.prisma.order.updateMany({
          where: {
              id,
              status: OrderStatus.IN_PROGRESS,
              executorId: userId
          },
          data: { status: OrderStatus.COMPLETED }
      });

      if (updateResult.count === 0) {
          throw new ConflictException('Cannot complete work. Status changed or executor mismatch.');
      }

      await this.logStatusHistory(this.prisma, id, order.status, OrderStatus.COMPLETED, userId);

      const result = await this.prisma.order.findUnique({
          where: { id },
          include: {
              employer: { select: { id: true, name: true, avatar: true, rating: true, completedOrders: true } },
              executor: { select: { id: true, name: true, avatar: true, rating: true, completedOrders: true } },
              reviews: true,
              statusHistory: true
          }
      });

      this.logger.info('ORDER_COMPLETED', `Order completed by executor`, { orderId: result!.id, userId });
      await this.broadcast('order.status.changed', result, userId);
      return result!;
  }

  async transitionStatus(id: string, status: OrderStatus, userId: string) {
      const order = await this.prisma.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException();

      this.validateTransition(order, status, userId, false);

      return this.update(id, { status }, userId);
  }

  async cancelApplication(orderId: string, executorId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const app = await this.prisma.application.findUnique({
      where: { orderId_executorId: { orderId, executorId } }
    });
    if (!app) {
        return { success: true };
    }

    if (app.status === 'ACCEPTED') {
      throw new ForbiddenException('Нельзя отменить уже принятую заявку — используйте отмену заказа');
    }
    if (app.status === 'REJECTED') {
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
        return null;
      }

      const remainingApps = await tx.application.count({
        where: { orderId }
      });

      if (remainingApps === 0 && order.status === OrderStatus.HAS_RESPONSES) {
        this.validateTransition(order, OrderStatus.PUBLISHED, executorId, true);
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
    return this.orderSpatialService.findSpatial(params);
  }

  parseOrderText(text: string) {
    return this.orderParserService.parseOrderText(text);
  }

  async openDispute(orderId: string, userId: string, reason: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    this.validateTransition(order, OrderStatus.DISPUTE, userId, false);

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.DISPUTE }
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus: order.status,
          newStatus: OrderStatus.DISPUTE,
          changedById: userId
        }
      });

      return updated;
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
