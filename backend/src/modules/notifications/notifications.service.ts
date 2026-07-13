import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100
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
    return this.prisma.notification.create({
      data: {
        userId,
        ...data
      }
    });
  }
}
