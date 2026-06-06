import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateOrderDto, employerId: string) {
    return this.prisma.order.create({
      data: {
        ...dto,
        employerId,
        date: new DateTime(dto.date),
      },
    });
  }

  async findAll(filters: { lat?: number; lng?: number; radius?: number; minPrice?: number; status?: string }) {
    const { lat, lng, radius, minPrice, status } = filters;

    // Use raw query for Haversine or filter in application logic if dataset is small
    // Here we use Prisma findMany with basic filters and then filter by distance
    const orders = await this.prisma.order.findMany({
      where: {
        price: { gte: minPrice || 0 },
        status: (status as any) || 'PENDING',
      },
      include: {
        employer: {
          select: { id: true, name: true, rating: true, avatar: true }
        }
      }
    });

    if (lat && lng && radius) {
      return orders.filter(order => {
        const distance = this.calculateDistance(lat, lng, order.latitude, order.longitude);
        (order as any).distance = distance;
        return distance <= radius;
      });
    }

    return orders;
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        employer: true,
        worker: true,
        applications: {
          include: { worker: true }
        }
      }
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async apply(orderId: string, workerId: string) {
    // Check subscription
    const sub = await this.prisma.subscription.findUnique({ where: { userId: workerId } });
    if (!sub || !sub.isActive || new Date(sub.activeUntil) < new Date()) {
      throw new ForbiddenException('Active subscription required to apply');
    }

    return this.prisma.application.create({
      data: { orderId, workerId }
    });
  }

  async updateStatus(id: string, status: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException();

    // Logic for status transitions and permissions (employer vs worker)
    // ...

    return this.prisma.order.update({
      where: { id },
      data: { status: status as any }
    });
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
}
