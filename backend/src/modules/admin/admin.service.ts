import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReportStatus, DisputeStatus, ResolutionType, OrderStatus } from '@prisma/client';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setService('AdminService');
  }

  private async logAudit(adminId: string, action: string, targetType: string, targetId: string, reason?: string, metadata?: any) {
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        reason,
        metadata,
      },
    });
  }

  async blockUser(adminId: string, userId: string, reason: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException(`User with ID ${userId} not found`);

    if (user.isBlocked) {
      throw new ConflictException('User is already blocked');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isBlocked: true,
        blockedAt: new Date(),
        blockedReason: reason,
        blockedById: adminId,
      },
    });

    await this.logAudit(adminId, 'BLOCK_USER', 'User', userId, reason);
    this.logger.info('ADMIN_BLOCK_USER', `Admin ${adminId} blocked user ${userId}`, { adminId, userId, reason });
    return updated;
  }

  async unblockUser(adminId: string, userId: string, reason?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw new NotFoundException(`User with ID ${userId} not found`);

    if (!user.isBlocked) {
      throw new ConflictException('User is not blocked');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        isBlocked: false,
        blockedAt: null,
        blockedReason: null,
        blockedById: null,
      },
    });

    await this.logAudit(adminId, 'UNBLOCK_USER', 'User', userId, reason);
    this.logger.info('ADMIN_UNBLOCK_USER', `Admin ${adminId} unblocked user ${userId}`, { adminId, userId, reason });
    return updated;
  }

  async freezeOrder(adminId: string, orderId: string, reason: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order with ID ${orderId} not found`);

    if (order.isFrozen || order.status === OrderStatus.FROZEN) {
      throw new ConflictException('Order is already frozen');
    }

    const oldStatus = order.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id: orderId },
        data: {
          isFrozen: true,
          frozenAt: new Date(),
          frozenReason: reason,
          status: OrderStatus.FROZEN,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus,
          newStatus: OrderStatus.FROZEN,
          changedById: adminId,
        },
      });

      return result;
    });

    await this.logAudit(adminId, 'FREEZE_ORDER', 'Order', orderId, reason, { previousStatus: oldStatus });
    this.logger.info('ADMIN_FREEZE_ORDER', `Admin ${adminId} froze order ${orderId}`, { adminId, orderId, reason });
    return updated;
  }

  async unfreezeOrder(adminId: string, orderId: string, restoreStatus?: OrderStatus, reason?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order with ID ${orderId} not found`);

    if (!order.isFrozen && order.status !== OrderStatus.FROZEN) {
      throw new ConflictException('Order is not frozen');
    }

    const targetStatus = restoreStatus || OrderStatus.PUBLISHED;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id: orderId },
        data: {
          isFrozen: false,
          frozenAt: null,
          frozenReason: null,
          status: targetStatus,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          oldStatus: OrderStatus.FROZEN,
          newStatus: targetStatus,
          changedById: adminId,
        },
      });

      return result;
    });

    await this.logAudit(adminId, 'UNFREEZE_ORDER', 'Order', orderId, reason, { restoredStatus: targetStatus });
    this.logger.info('ADMIN_UNFREEZE_ORDER', `Admin ${adminId} unfroze order ${orderId}`, { adminId, orderId, restoredStatus: targetStatus });
    return updated;
  }

  async createReport(reporterId: string, dto: { targetUserId?: string; targetOrderId?: string; reason: string; description?: string }) {
    if (!dto.targetUserId && !dto.targetOrderId) {
      throw new ConflictException('Report must target either a user or an order');
    }

    return this.prisma.report.create({
      data: {
        reporterId,
        targetUserId: dto.targetUserId,
        targetOrderId: dto.targetOrderId,
        reason: dto.reason,
        description: dto.description,
        status: ReportStatus.OPEN,
      },
    });
  }

  async reviewReport(adminId: string, reportId: string, dto: { status: ReportStatus; resolution?: string }) {
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException(`Report with ID ${reportId} not found`);

    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: dto.status,
        resolvedById: adminId,
        resolution: dto.resolution,
      },
    });

    await this.logAudit(adminId, 'REVIEW_REPORT', 'Report', reportId, dto.resolution, { newStatus: dto.status });
    return updated;
  }

  async openDispute(openedById: string, dto: { orderId: string; reason: string; description?: string }) {
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
    if (!order) throw new NotFoundException(`Order with ID ${dto.orderId} not found`);

    if (order.employerId !== openedById && order.executorId !== openedById) {
      throw new ForbiddenException('Only order participants can open a dispute');
    }

    const respondentId = order.employerId === openedById ? order.executorId : order.employerId;
    if (!respondentId) {
      throw new ConflictException('Cannot open dispute on order without assigned executor');
    }

    const existingDispute = await this.prisma.dispute.findFirst({
      where: {
        orderId: dto.orderId,
        status: { in: [DisputeStatus.OPEN, DisputeStatus.IN_REVIEW, DisputeStatus.WAITING_FOR_PARTY] },
      },
    });

    if (existingDispute) {
      throw new ConflictException('An active dispute already exists for this order');
    }

    return this.prisma.dispute.create({
      data: {
        orderId: dto.orderId,
        openedById,
        respondentId,
        reason: dto.reason,
        description: dto.description,
        status: DisputeStatus.OPEN,
      },
    });
  }

  async resolveDispute(adminId: string, disputeId: string, dto: { resolutionType: ResolutionType; resolution: string; status?: DisputeStatus }) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { order: true },
    });
    if (!dispute) throw new NotFoundException(`Dispute with ID ${disputeId} not found`);

    const nextStatus = dto.status || DisputeStatus.RESOLVED;

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: nextStatus,
          assignedAdminId: adminId,
          resolutionType: dto.resolutionType,
          resolution: dto.resolution,
          resolvedAt: new Date(),
        },
      });

      if (dto.resolutionType === ResolutionType.USER_BLOCK && dispute.respondentId) {
        await tx.user.update({
          where: { id: dispute.respondentId },
          data: {
            isBlocked: true,
            blockedAt: new Date(),
            blockedReason: `Blocked due to dispute resolution ${disputeId}`,
            blockedById: adminId,
          },
        });
      } else if (dto.resolutionType === ResolutionType.ORDER_FREEZE) {
        await tx.order.update({
          where: { id: dispute.orderId },
          data: {
            isFrozen: true,
            frozenAt: new Date(),
            frozenReason: `Frozen due to dispute resolution ${disputeId}`,
            status: OrderStatus.FROZEN,
          },
        });
      }

      return res;
    });

    await this.logAudit(adminId, 'RESOLVE_DISPUTE', 'Dispute', disputeId, dto.resolution, {
      resolutionType: dto.resolutionType,
      status: nextStatus,
    });

    return updated;
  }

  async appealDispute(userId: string, disputeId: string, reason: string) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException(`Dispute with ID ${disputeId} not found`);

    if (dispute.openedById !== userId && dispute.respondentId !== userId) {
      throw new ForbiddenException('Only dispute participants can appeal');
    }

    if (dispute.status !== DisputeStatus.RESOLVED && dispute.status !== DisputeStatus.REJECTED) {
      throw new ConflictException('Can only appeal a resolved or rejected dispute');
    }

    return this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: DisputeStatus.APPEALED,
        appealReason: reason,
        appealedById: userId,
        appealedAt: new Date(),
      },
    });
  }

  async reviewAppeal(adminId: string, disputeId: string, dto: { appealResult: string; finalStatus: DisputeStatus }) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException(`Dispute with ID ${disputeId} not found`);

    if (dispute.status !== DisputeStatus.APPEALED) {
      throw new ConflictException('Dispute is not under appeal');
    }

    const updated = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: dto.finalStatus,
        appealResolvedById: adminId,
        appealResult: dto.appealResult,
      },
    });

    await this.logAudit(adminId, 'REVIEW_APPEAL', 'Dispute', disputeId, dto.appealResult, { finalStatus: dto.finalStatus });
    return updated;
  }

  async getAuditLogs(adminId: string, params?: { skip?: number; take?: number }) {
    const skip = params?.skip !== undefined ? Number(params.skip) : undefined;
    const take = Math.min(params?.take !== undefined ? Number(params.take) : 50, 100);

    return this.prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: {
        admin: { select: { id: true, name: true, phone: true } },
      },
    });
  }
}
