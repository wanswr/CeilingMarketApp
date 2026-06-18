import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionService {
  constructor(private prisma: PrismaService) {}

  async checkActiveSubscription(userId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({
      where: { userId },
    });
    if (!sub) return false;
    return sub.isActive && new Date(sub.activeUntil) > new Date();
  }

  async activate(userId: string, days: number) {
    const until = new Date();
    until.setDate(until.getDate() + days);

    return this.prisma.subscription.upsert({
      where: { userId },
      update: {
        isActive: true,
        activeUntil: until,
      },
      create: {
        userId,
        isActive: true,
        activeUntil: until,
      },
    });
  }
}
