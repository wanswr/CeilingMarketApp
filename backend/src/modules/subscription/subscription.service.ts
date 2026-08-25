import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  async checkActiveSubscription(userId: string, categoryId?: string): Promise<boolean> {
    if (categoryId) {
      const sub = await this.prisma.subscription.findUnique({
        where: {
          userId_categoryId: {
            userId,
            categoryId,
          },
        },
      });
      if (!sub) return false;
      return sub.isActive && new Date(sub.activeUntil) > new Date();
    }

    const activeSub = await this.prisma.subscription.findFirst({
      where: {
        userId,
        isActive: true,
        activeUntil: { gt: new Date() },
      },
    });

    return !!activeSub;
  }

  async activate(userId: string, categoryId: string, days: number = 30) {
    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || !category.isActive) {
      throw new NotFoundException('Category not found or inactive');
    }

    const existingSub = await this.prisma.subscription.findUnique({
      where: {
        userId_categoryId: {
          userId,
          categoryId,
        },
      },
    });

    const now = new Date();
    let baseDate = now;
    if (existingSub && existingSub.isActive && new Date(existingSub.activeUntil) > now) {
      baseDate = new Date(existingSub.activeUntil);
    }

    const until = new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);

    return this.prisma.subscription.upsert({
      where: {
        userId_categoryId: {
          userId,
          categoryId,
        },
      },
      update: {
        isActive: true,
        activeUntil: until,
      },
      create: {
        userId,
        categoryId,
        isActive: true,
        activeUntil: until,
      },
      include: {
        category: true,
      },
    });
  }

  async claimFreeCategory(userId: string, categoryId: string, days: number = 30) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException('User not found');

    if (user.freeCategoryUsed) {
      throw new ForbiddenException('Бесплатное первое направление уже было использовано');
    }

    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || !category.isActive) {
      throw new NotFoundException('Category not found or inactive');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { freeCategoryUsed: true },
      });

      const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

      return tx.subscription.upsert({
        where: {
          userId_categoryId: {
            userId,
            categoryId,
          },
        },
        update: {
          isActive: true,
          activeUntil: until,
        },
        create: {
          userId,
          categoryId,
          isActive: true,
          activeUntil: until,
        },
        include: {
          category: true,
        },
      });
    });
  }

  async getUserSubscriptions(userId: string) {
    return this.prisma.subscription.findMany({
      where: { userId },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
