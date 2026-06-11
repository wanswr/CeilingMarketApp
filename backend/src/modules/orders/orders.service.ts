import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class OrdersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Status transitions map: defines legal state changes.
   */
  private readonly transitions: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.PENDING]: [OrderStatus.PUBLISHED, OrderStatus.CANCELLED],
    [OrderStatus.PUBLISHED]: [OrderStatus.CLAIMED, OrderStatus.CANCELLED],
    [OrderStatus.CLAIMED]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
    [OrderStatus.IN_PROGRESS]: [OrderStatus.COMPLETED, OrderStatus.DISPUTE],
    [OrderStatus.COMPLETED]: [],
    [OrderStatus.CANCELLED]: [],
    [OrderStatus.DISPUTE]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  };

  /**
   * CREATE: Implements idempotency and sets initial status.
   */
  async create(dto: CreateOrderDto, employerId: string) {
    if (dto.idempotencyKey) {
      const existing = await this.prisma.order.findUnique({
        where: { idempotencyKey: dto.idempotencyKey }
      });
      if (existing) return existing;
    }

    console.log(`[OrdersService] Creating order for employer: ${employerId}`);
    return this.prisma.order.create({
      data: {
        title: dto.title,
        address: dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        price: dto.price,
        details: dto.details,
        date: new Date(dto.date),
        images: dto.images || [],
        employerId,
        idempotencyKey: dto.idempotencyKey,
        status: OrderStatus.PUBLISHED, // Target status for new orders
      },
    });
  }

  /**
   * ATOMIC CLAIM: Postgres Transaction + row-level locking
   */
  async claim(orderId: string, workerId: string) {
    return this.prisma.$transaction(async (tx) => {
      // 1. SELECT FOR UPDATE to lock the row and prevent concurrent claims
      const orderArray = await tx.$queryRaw<any[]>`
        SELECT * FROM "Order"
        WHERE "id" = ${orderId}
        FOR UPDATE
      `;
      const order = orderArray[0];

      if (!order) throw new NotFoundException('Order not found');

      // 2. State machine guard
      if (order.status !== OrderStatus.PUBLISHED) {
        throw new ConflictException(`Cannot claim order in ${order.status} state`);
      }

      // 3. Subscription check
      const sub = await tx.subscription.findUnique({ where: { userId: workerId } });
      if (!sub || !sub.isActive || new Date(sub.activeUntil) < new Date()) {
        throw new ForbiddenException('Active subscription required');
      }

      // 4. Atomic update
      return tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.CLAIMED,
          workerId,
          claimedAt: new Date(),
        },
      });
    });
  }

  /**
   * TRANSITION: Guarded status changes using centralized transition map
   */
  async transitionStatus(orderId: string, newStatus: OrderStatus, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException();

    // Permissions check
    const isEmployer = order.employerId === userId;
    const isWorker = order.workerId === userId;
    if (!isEmployer && !isWorker) throw new ForbiddenException();

    // State Machine Rules
    if (!this.canTransition(order.status, newStatus)) {
      throw new ConflictException(`Transition ${order.status} -> ${newStatus} not allowed`);
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: newStatus }
    });
  }

  private canTransition(from: OrderStatus, to: OrderStatus): boolean {
    return this.transitions[from]?.includes(to) || false;
  }

  async findAll(filters: { lat?: number; lng?: number; radius?: number; minPrice?: number; status?: string }) {
    const { lat, lng, radius, minPrice, status } = filters;
    const where: any = {};
    if (minPrice) where.price = { gte: minPrice };
    if (status) where.status = status as OrderStatus;

    const orders = await this.prisma.order.findMany({
      where,
      include: {
        employer: { select: { id: true, name: true, rating: true, avatar: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    if (lat && lng && radius) {
      return orders.filter(order => {
        const d = this.calculateDistance(lat, lng, order.latitude, order.longitude);
        (order as any).distance = d;
        return d <= radius;
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
        applications: { include: { worker: true } }
      }
    });
    if (!order) throw new NotFoundException();
    return order;
  }

  async update(id: string, dto: any, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException();
    if (order.employerId !== userId) throw new ForbiddenException();

    // If status is being changed, validate transition
    if (dto.status && dto.status !== order.status) {
      if (!this.canTransition(order.status, dto.status)) {
        throw new ConflictException(`Transition ${order.status} -> ${dto.status} not allowed`);
      }
    }

    return this.prisma.order.update({
      where: { id },
      data: dto
    });
  }

  async remove(id: string, userId: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order || order.employerId !== userId) throw new ForbiddenException();
    return this.prisma.order.delete({ where: { id } });
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
}
