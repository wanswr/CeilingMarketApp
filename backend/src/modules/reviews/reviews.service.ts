import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus, Prisma, DisputeStatus } from '@prisma/client';
import { AppGateway } from '../gateway/app.gateway';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class ReviewsService {
  constructor(
    private prisma: PrismaService,
    private gateway: AppGateway,
    private logger: LoggerService,
  ) {
    this.logger.setService('ReviewsService');
  }

  async create(userId: string, dto: { orderId: string; rating: number; comment?: string }) {
    this.logger.debug('REVIEW_CREATED_REQUEST', `User ${userId} leaving review for order ${dto.orderId}`, { userId, orderId: dto.orderId });

    // 1. Author DB validation
    const author = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!author || author.deletedAt || author.isBlocked) {
      throw new ForbiddenException('Blocked or deleted user cannot leave reviews');
    }

    // 2. Order DB validation
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: {
        reviews: true,
        disputes: {
          where: {
            status: { in: [DisputeStatus.OPEN, DisputeStatus.IN_REVIEW, DisputeStatus.WAITING_FOR_PARTY, DisputeStatus.APPEALED] }
          }
        }
      }
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.isFrozen || order.status === OrderStatus.FROZEN) {
      throw new ForbiddenException('Order is frozen and cannot receive reviews');
    }

    if (order.disputes && order.disputes.length > 0) {
      throw new ConflictException('Cannot review an order with an active dispute');
    }

    if (order.status !== OrderStatus.COMPLETED) {
      throw new ConflictException('Order must be completed to leave a review');
    }

    // 3. Participant validation based on server Order record
    const isEmployer = order.employerId === userId;
    const isExecutor = order.executorId === userId;

    if (!isEmployer && !isExecutor) {
      throw new ForbiddenException('Only order participants can leave a review');
    }

    if (!order.executorId) {
      throw new ConflictException('Order has no executor');
    }

    const targetId = isEmployer ? order.executorId : order.employerId;

    if (userId === targetId) {
      throw new ForbiddenException('You cannot review yourself');
    }

    // 4. Target User DB validation
    const targetUser = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!targetUser || targetUser.deletedAt) {
      throw new NotFoundException('Target user for review not found or account is deleted');
    }

    // 5. Pre-check for duplicate review
    const alreadyReviewed = order.reviews.some(r => r.authorId === userId);
    if (alreadyReviewed) {
      throw new ConflictException('You have already left a review for this order');
    }

    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        // Lock parent Order row to ensure atomic review counting and transition
        await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${dto.orderId} FOR UPDATE`;

        const review = await tx.review.create({
          data: {
            orderId: dto.orderId,
            authorId: userId,
            targetId: targetId,
            rating: dto.rating,
            comment: dto.comment,
          }
        });

        // Recalculate target user aggregate rating
        const aggregate = await tx.review.aggregate({
          where: { targetId: targetId },
          _avg: { rating: true }
        });

        await tx.user.update({
          where: { id: targetId },
          data: {
            rating: aggregate._avg.rating || 5.0,
          }
        });

        // Check if both employer -> executor and executor -> employer reviews exist
        const allOrderReviews = await tx.review.findMany({
          where: { orderId: dto.orderId }
        });

        const hasEmployerReview = allOrderReviews.some(
          r => r.authorId === order.employerId && r.targetId === order.executorId
        );
        const hasExecutorReview = allOrderReviews.some(
          r => r.authorId === order.executorId && r.targetId === order.employerId
        );

        let finalOrder = order;
        if (hasEmployerReview && hasExecutorReview) {
          const updatedCount = await tx.order.updateMany({
            where: {
              id: dto.orderId,
              status: OrderStatus.COMPLETED
            },
            data: { status: OrderStatus.REVIEWED }
          });

          if (updatedCount.count > 0) {
            await tx.orderStatusHistory.create({
              data: {
                orderId: dto.orderId,
                oldStatus: OrderStatus.COMPLETED,
                newStatus: OrderStatus.REVIEWED,
                changedById: userId
              }
            });

            const updatedFinal = await tx.order.findUnique({
              where: { id: dto.orderId },
              include: {
                reviews: true,
                disputes: {
                  where: {
                    status: { in: [DisputeStatus.OPEN, DisputeStatus.IN_REVIEW, DisputeStatus.WAITING_FOR_PARTY, DisputeStatus.APPEALED] }
                  }
                }
              }
            });
            if (updatedFinal) {
              finalOrder = updatedFinal;
            }
          }
        }

        return { review, order: finalOrder };
      });
    } catch (error: any) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You have already left a review for this order');
      }
      throw error;
    }

    this.logger.info('REVIEW_CREATED', `Review created successfully`, {
      userId,
      orderId: dto.orderId,
      metadata: {
        reviewerId: userId,
        targetUserId: targetId,
        rating: dto.rating
      }
    });

    this.gateway.broadcast('order.status.changed', result.order);
    return result.review;
  }

  async getPendingReviews(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.COMPLETED,
        OR: [
          { employerId: userId },
          { executorId: userId }
        ],
        NOT: {
          reviews: {
            some: { authorId: userId }
          }
        }
      },
      include: {
        reviews: true,
        employer: { select: { id: true, name: true, avatar: true } },
        executor: { select: { id: true, name: true, avatar: true } }
      }
    });
    return orders;
  }

  async getMyReviews(userId: string, params?: { skip?: number; take?: number }) {
    const skip = params?.skip !== undefined ? Number(params.skip) : undefined;
    const take = params?.take !== undefined ? Number(params.take) : 50;

    const authored = await this.prisma.review.findMany({
      where: { authorId: userId },
      include: {
        target: { select: { id: true, name: true, avatar: true } },
        order: { select: { id: true, title: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    });

    const received = await this.prisma.review.findMany({
      where: { targetId: userId },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        order: { select: { id: true, title: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    });

    return { authored, received };
  }

  async getMasterReviews(masterId: string, params?: { skip?: number; take?: number }) {
    const skip = params?.skip !== undefined ? Number(params.skip) : undefined;
    const take = params?.take !== undefined ? Number(params.take) : 50;

    return this.prisma.review.findMany({
      where: { targetId: masterId },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        order: { select: { title: true } }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    });
  }
}
