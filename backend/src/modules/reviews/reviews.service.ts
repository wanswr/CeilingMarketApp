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
      include: { review: true }
    });

    if (!order) {
        console.error(`[ReviewsService] Order ${dto.orderId} not found`);
        throw new NotFoundException('Order not found');
    }

    // V11: Robust ID comparison with trimming to handle potential whitespace from different DB/Auth providers
    const orderEmployerId = String(order.employerId).trim().toLowerCase();
    const currentUserId = String(userId).trim().toLowerCase();

    if (orderEmployerId !== currentUserId) {
        console.warn(`[ReviewsService] Forbidden: Authenticated user ID ${currentUserId} does not match order employer ID ${orderEmployerId} for order ${order.id}`);
        throw new ForbiddenException('Only employer can leave a review');
    }
    if (order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.REVIEWED) {
      throw new ConflictException('Order must be completed to leave a review');
    }
    if (order.review) throw new ConflictException('Review already exists for this order');
    if (!order.executorId) throw new ConflictException('Order has no executor');

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create review
      const review = await tx.review.create({
        data: {
          orderId: dto.orderId,
          authorId: userId,
          targetUserId: order.executorId!,
          rating: dto.rating,
          comment: dto.comment,
        }
      });

      // 2. Update order status
      const updatedOrder = await tx.order.update({
        where: { id: dto.orderId },
        data: { status: OrderStatus.REVIEWED }
      });

      // 3. Recompute user rating
      const aggregate = await tx.review.aggregate({
        where: { targetUserId: order.executorId! },
        _avg: { rating: true },
        _count: { id: true }
      });

      await tx.user.update({
        where: { id: order.executorId! },
        data: {
          rating: aggregate._avg.rating || 5.0,
          // completedOrders is already incremented in completeWork
        }
      });

      return { review, order: updatedOrder };
    });

    this.gateway.broadcast('order.status.changed', result.order);
    return result.review;
  }

  async getMasterReviews(masterId: string) {
      return this.prisma.review.findMany({
          where: { targetUserId: masterId },
          include: {
              author: { select: { id: true, name: true, avatar: true } },
              order: { select: { title: true } }
          },
          orderBy: { createdAt: 'desc' }
      });
  }
}
