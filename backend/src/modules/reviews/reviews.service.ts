import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import { AppGateway } from '../gateway/app.gateway';

@Injectable()
export class ReviewsService {
  constructor(
    private prisma: PrismaService,
    private gateway: AppGateway,
  ) {}

  async create(userId: string, dto: { orderId: string; rating: number; comment?: string }) {
    console.log(`[ReviewsService] Create review request from user ${userId} for order ${dto.orderId}`);

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

    // Check if this author already left a review for this order
    const alreadyReviewed = order.reviews.some(r => r.authorId === userId);
    if (alreadyReviewed) {
        throw new ConflictException('You have already left a review for this order');
    }

    const targetId = isEmployer ? order.executorId! : order.employerId;

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create review
      const review = await tx.review.create({
        data: {
          orderId: dto.orderId,
          authorId: userId,
          targetId: targetId,
          rating: dto.rating,
          comment: dto.comment,
        }
      });

      // 2. Recompute target user rating
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

      return { review, order };
    });

    // Notify about status (broadcast order update to refresh UI)
    this.gateway.broadcast('order.status.changed', result.order);
    return result.review;
  }

  async getPendingReviews(userId: string) {
      // Get COMPLETED orders where user is participant and has not left a review
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

  async getMyReviews(userId: string) {
      const authored = await this.prisma.review.findMany({
          where: { authorId: userId },
          include: {
              target: { select: { id: true, name: true, avatar: true } },
              order: { select: { id: true, title: true } }
          },
          orderBy: { createdAt: 'desc' }
      });

      const received = await this.prisma.review.findMany({
          where: { targetId: userId },
          include: {
              author: { select: { id: true, name: true, avatar: true } },
              order: { select: { id: true, title: true } }
          },
          orderBy: { createdAt: 'desc' }
      });

      return { authored, received };
  }

  async getMasterReviews(masterId: string) {
      return this.prisma.review.findMany({
          where: { targetId: masterId },
          include: {
              author: { select: { id: true, name: true, avatar: true } },
              order: { select: { title: true } }
          },
          orderBy: { createdAt: 'desc' }
      });
  }
}
