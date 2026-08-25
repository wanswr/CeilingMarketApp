import { DISPUTE_STATE_MACHINE, validateDisputeTransition } from "./dispute-state-machine";
import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Role, ReportStatus, DisputeStatus, ResolutionType, OrderStatus } from '@prisma/client';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private logger: LoggerService,
  ) {
    this.logger.setService('AdminService');
  }

  private async verifyAdmin(adminId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: adminId } });
    if (!user || user.deletedAt) throw new NotFoundException(`User with ID ${adminId} not found`);
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Admin privileges required');
    }
    return user;
  }

  private async logAudit(adminId: string, action: string, targetType: string, targetId: string, reason?: string, metadata?: any) {
    return this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        reason,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
  }

  // USER MANAGEMENT
  async blockUser(adminId: string, userId: string, reason: string) {
    await this.verifyAdmin(adminId);
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
    this.logger.info('USER_BLOCKED', `User ${userId} blocked by admin ${adminId}`, { userId, adminId, reason });
    return updated;
  }

  async unblockUser(adminId: string, userId: string, reason: string) {
    await this.verifyAdmin(adminId);
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
    this.logger.info('USER_UNBLOCKED', `User ${userId} unblocked by admin ${adminId}`, { userId, adminId, reason });
    return updated;
  }

  // ORDER FREEZE
  async freezeOrder(adminId: string, orderId: string, reason: string) {
    await this.verifyAdmin(adminId);
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

    await this.logAudit(adminId, 'FREEZE_ORDER', 'Order', orderId, reason, { oldStatus });
    this.logger.info('ORDER_FROZEN', `Order ${orderId} frozen by admin ${adminId}`, { orderId, adminId, reason });
    return updated;
  }

  async unfreezeOrder(adminId: string, orderId: string, restoreStatus?: OrderStatus, reason?: string) {
    await this.verifyAdmin(adminId);
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order with ID ${orderId} not found`);

    if (!order.isFrozen && order.status !== OrderStatus.FROZEN) {
      throw new ConflictException('Order is not frozen');
    }

    let targetStatus = restoreStatus;
    if (!targetStatus) {
      const lastHistory = await this.prisma.orderStatusHistory.findFirst({
        where: { orderId, newStatus: OrderStatus.FROZEN },
        orderBy: { createdAt: 'desc' },
      });
      targetStatus = (lastHistory?.oldStatus as OrderStatus) || OrderStatus.PUBLISHED;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id: orderId },
        data: {
          isFrozen: false,
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

    await this.logAudit(adminId, 'UNFREEZE_ORDER', 'Order', orderId, reason, { restoredToStatus: targetStatus });
    this.logger.info('ORDER_UNFROZEN', `Order ${orderId} unfrozen by admin ${adminId}`, { orderId, adminId, targetStatus });
    return updated;
  }

  // REPORTS
  async createReport(reporterId: string, dto: { targetUserId?: string; targetOrderId?: string; reason: string; description?: string }) {
    if (!dto.targetUserId && !dto.targetOrderId) {
      throw new ConflictException('Report must specify either a target user or target order');
    }

    if (dto.targetUserId) {
      if (dto.targetUserId === reporterId) {
        throw new ForbiddenException('Cannot report yourself');
      }
      const targetUser = await this.prisma.user.findUnique({ where: { id: dto.targetUserId } });
      if (!targetUser || targetUser.deletedAt) {
        throw new NotFoundException(`Target user with ID ${dto.targetUserId} not found`);
      }
    }

    if (dto.targetOrderId) {
      const targetOrder = await this.prisma.order.findUnique({ where: { id: dto.targetOrderId } });
      if (!targetOrder) {
        throw new NotFoundException(`Target order with ID ${dto.targetOrderId} not found`);
      }
      if (targetOrder.employerId !== reporterId && targetOrder.executorId !== reporterId) {
        throw new ForbiddenException('Only order participants can report an order');
      }
    }

    const report = await this.prisma.report.create({
      data: {
        reporterId,
        targetUserId: dto.targetUserId,
        targetOrderId: dto.targetOrderId,
        reason: dto.reason,
        description: dto.description,
        status: ReportStatus.OPEN,
      },
    });

    this.logger.info('REPORT_CREATED', `Report ${report.id} created by user ${reporterId}`, { reporterId, reportId: report.id });
    return report;
  }

  async reviewReport(adminId: string, reportId: string, dto: { status: ReportStatus; resolution?: string }) {
    await this.verifyAdmin(adminId);
    const report = await this.prisma.report.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException(`Report with ID ${reportId} not found`);

    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        status: dto.status,
        resolution: dto.resolution,
        resolvedById: adminId,
      },
    });

    await this.logAudit(adminId, 'REVIEW_REPORT', 'Report', reportId, dto.resolution, { status: dto.status });
    return updated;
  }

  // DISPUTES
  async openDispute(userId: string, dto: { orderId: string; reason: string; description?: string }) {
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
    if (!order) throw new NotFoundException(`Order with ID ${dto.orderId} not found`);

    if (order.isFrozen || order.status === OrderStatus.FROZEN) {
      throw new ConflictException('Cannot open dispute on a frozen order');
    }

    if (order.employerId !== userId && order.executorId !== userId) {
      throw new ForbiddenException('Only order participants can open a dispute');
    }

    const disputableStatuses: OrderStatus[] = [OrderStatus.CLAIMED, OrderStatus.IN_PROGRESS, OrderStatus.COMPLETED];
    if (!disputableStatuses.includes(order.status)) {
      throw new ConflictException(`Cannot open dispute on order with status ${order.status}`);
    }

    const respondentId = order.employerId === userId ? order.executorId : order.employerId;
    if (!respondentId) {
      throw new ConflictException('Cannot open dispute on order without assigned respondent');
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

    const dispute = await this.prisma.$transaction(async (tx) => {
      const createdDispute = await tx.dispute.create({
        data: {
          orderId: dto.orderId,
          openedById: userId,
          respondentId: respondentId,
          reason: dto.reason,
          description: dto.description,
          status: DisputeStatus.OPEN,
        },
      });

      await tx.order.update({
        where: { id: dto.orderId },
        data: { status: OrderStatus.DISPUTE },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: dto.orderId,
          oldStatus: order.status,
          newStatus: OrderStatus.DISPUTE,
          changedById: userId,
        },
      });

      return createdDispute;
    });

    this.logger.info('DISPUTE_OPENED', `Dispute ${dispute.id} opened for order ${dto.orderId}`, { disputeId: dispute.id, orderId: dto.orderId, userId });
    return dispute;
  }

  async resolveDispute(
    adminId: string,
    disputeId: string,
    dto: { resolutionType: ResolutionType; resolution: string; status?: DisputeStatus },
  ) {
    await this.verifyAdmin(adminId);
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: { order: true },
    });
    if (!dispute) throw new NotFoundException(`Dispute with ID ${disputeId} not found`);

    const nextStatus = dto.status || DisputeStatus.RESOLVED;

    try {
      validateDisputeTransition(dispute.status, nextStatus, Role.ADMIN);
    } catch (err: any) {
      throw new ConflictException(err.message);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.dispute.update({
        where: { id: disputeId },
        data: {
          status: nextStatus,
          resolutionType: dto.resolutionType,
          resolution: dto.resolution,
          assignedAdminId: adminId,
          resolvedAt: new Date(),
        },
      });

      // Update trust/reputation signal upon confirmed violation/resolution
      if (dto.resolutionType === ResolutionType.WARNING || dto.resolutionType === ResolutionType.USER_BLOCK) {
        if (dispute.respondentId) {
          const respondent = await tx.user.findUnique({ where: { id: dispute.respondentId } });
          if (respondent) {
            await tx.user.update({
              where: { id: dispute.respondentId },
              data: {
                rating: Math.max(0, (respondent.rating || 5) - 0.5),
              },
            });
          }
        }
      }

      return res;
    });

    const actionName = dto.resolutionType === ResolutionType.DISPUTE_REJECTED ? 'REJECT_DISPUTE' : 'RESOLVE_DISPUTE';
    await this.logAudit(adminId, actionName, 'Dispute', disputeId, dto.resolution, {
      resolutionType: dto.resolutionType,
      status: nextStatus,
    });

    this.logger.info('DISPUTE_RESOLVED', `Dispute ${disputeId} resolved by admin ${adminId}`, {
      disputeId,
      adminId,
      resolutionType: dto.resolutionType,
    });

    return updated;
  }

  async appealDispute(userId: string, disputeId: string, reason: string) {
    const dispute = await this.prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException(`Dispute with ID ${disputeId} not found`);

    if (dispute.openedById !== userId && dispute.respondentId !== userId) {
      throw new ForbiddenException('Only dispute participants can file an appeal');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const userRole = user?.role || Role.WORKER;

    if (dispute.appealedAt) {
      throw new ConflictException("Dispute has already been appealed once");
    }

    try {
      validateDisputeTransition(dispute.status, DisputeStatus.APPEALED, userRole);
    } catch (err: any) {
      throw new ConflictException(err.message);
    }

    const updated = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: DisputeStatus.APPEALED,
        appealedById: userId,
        appealReason: reason,
        appealedAt: new Date(),
      },
    });

    this.logger.info('DISPUTE_APPEALED', `Dispute ${disputeId} appealed by user ${userId}`, { disputeId, userId, reason });
    return updated;
  }

  async reviewAppeal(adminId: string, disputeId: string, dto: { appealResult: string; finalStatus: DisputeStatus }) {
    await this.verifyAdmin(adminId);
    const dispute = await this.prisma.dispute.findUnique({ where: { id: disputeId } });
    if (!dispute) throw new NotFoundException(`Dispute with ID ${disputeId} not found`);

    try {
      validateDisputeTransition(dispute.status, dto.finalStatus, Role.ADMIN);
    } catch (err: any) {
      throw new ConflictException(err.message);
    }

    const updated = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: dto.finalStatus,
        appealResult: dto.appealResult,
        assignedAdminId: adminId,
        resolvedAt: new Date(),
      },
    });

    await this.logAudit(adminId, 'REVIEW_APPEAL', 'Dispute', disputeId, dto.appealResult, { finalStatus: dto.finalStatus });
    this.logger.info('APPEAL_REVIEWED', `Appeal for dispute ${disputeId} reviewed by admin ${adminId}`, { disputeId, adminId });
    return updated;
  }

  // AUDIT LOGS
  async getAuditLogs(adminId: string, options: { skip?: number; take?: number }) {
    await this.verifyAdmin(adminId);
    return this.prisma.adminAuditLog.findMany({
      skip: options.skip || 0,
      take: options.take || 50,
      orderBy: { createdAt: 'desc' },
    });
  }
}
