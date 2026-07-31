import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus, Prisma } from '@prisma/client';
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

    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { reviews: true }
    });

    if (!order) {
        throw new NotFoundException('Order not found');
    }

    const currentUserId = String(userId).trim().toLowerCase();
    const employerId = String(order.employerId).trim().toLowerCase();
    const executorId = order.executorId ? String(order.executorId).trim().toLowerCase() : null;

    const isEmployer = currentUserId === employerId;
    const isExecutor = currentUserId === executorId;

    if (!isEmployer && !isExecutor) {
        throw new ForbiddenException('Only order participants can leave a review');
    }

    if (order.status !== OrderStatus.COMPLETED) {
      throw new ConflictException('Order must be completed to leave a review');
    }

    if (!executorId) {
        throw new ConflictException('Order has no executor');
    }

    const alreadyReviewed = order.reviews.some(r => r.authorId === userId);
    if (alreadyReviewed) {
        throw new ConflictException('You have already left a review for this order');
    }

    const targetId = isEmployer ? order.executorId! : order.employerId;

    let result;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const review = await tx.review.create({
          data: {
            orderId: dto.orderId,
            authorId: userId,
            targetId: targetId,
            rating: dto.rating,
            comment: dto.comment,
          }
        });

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

        const reviewCount = await tx.review.count({
          where: { orderId: dto.orderId }
        });

        let finalOrder = order;
        if (reviewCount === 2) {
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

            finalOrder = await tx.order.findUnique({
              where: { id: dto.orderId }
            }) || order;
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
