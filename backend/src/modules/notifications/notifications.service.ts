import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationDeliveryService } from './notification-delivery.service';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private deliveryService: NotificationDeliveryService,
  ) {}

  async findAll(userId: string, params?: { skip?: number; take?: number }) {
    const skip = params?.skip !== undefined ? Number(params.skip) : undefined;
    const take = params?.take !== undefined ? Number(params.take) : 50;
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    });
  }

  async markAsRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id }
    });

    if (!notification) throw new NotFoundException();
    if (notification.userId !== userId) throw new ForbiddenException();

    return this.prisma.notification.update({
      where: { id },
      data: { read: true }
    });
  }

  async create(userId: string, data: { type: string; title: string; message: string }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        ...data
      }
    });

    this.deliveryService.sendPushNotification(userId, {
      title: data.title,
      body: data.message,
      data: { notificationId: notification.id, type: data.type },
    }).catch(() => {});

    return notification;
  }
}
