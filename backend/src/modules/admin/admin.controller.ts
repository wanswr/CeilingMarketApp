import { Controller, Post, Patch, Get, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, ReportStatus, DisputeStatus, ResolutionType, OrderStatus } from '@prisma/client';
import { AdminService } from './admin.service';

@Controller()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // USER MODERATION (Admin only)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/users/:id/block')
  async blockUser(@Req() req: any, @Param('id') id: string, @Body('reason') reason: string) {
    return this.adminService.blockUser(req.user.id, id, reason);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/users/:id/unblock')
  async unblockUser(@Req() req: any, @Param('id') id: string, @Body('reason') reason?: string) {
    return this.adminService.unblockUser(req.user.id, id, reason);
  }

  // ORDER FREEZE (Admin only)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/orders/:id/freeze')
  async freezeOrder(@Req() req: any, @Param('id') id: string, @Body('reason') reason: string) {
    return this.adminService.freezeOrder(req.user.id, id, reason);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('admin/orders/:id/unfreeze')
  async unfreezeOrder(
    @Req() req: any,
    @Param('id') id: string,
    @Body('restoreStatus') restoreStatus?: OrderStatus,
    @Body('reason') reason?: string,
  ) {
    return this.adminService.unfreezeOrder(req.user.id, id, restoreStatus, reason);
  }

  // REPORTS (User creates, Admin reviews)
  @UseGuards(JwtAuthGuard)
  @Post('reports')
  async createReport(
    @Req() req: any,
    @Body() dto: { targetUserId?: string; targetOrderId?: string; reason: string; description?: string },
  ) {
    return this.adminService.createReport(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/reports/:id')
  async reviewReport(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { status: ReportStatus; resolution?: string },
  ) {
    return this.adminService.reviewReport(req.user.id, id, dto);
  }

  // DISPUTES (User opens/appeals, Admin resolves/reviews appeal)
  @UseGuards(JwtAuthGuard)
  @Post('disputes')
  async openDispute(
    @Req() req: any,
    @Body() dto: { orderId: string; reason: string; description?: string },
  ) {
    return this.adminService.openDispute(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/disputes/:id/resolve')
  async resolveDispute(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { resolutionType: ResolutionType; resolution: string; status?: DisputeStatus },
  ) {
    return this.adminService.resolveDispute(req.user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('disputes/:id/appeal')
  async appealDispute(@Req() req: any, @Param('id') id: string, @Body('reason') reason: string) {
    return this.adminService.appealDispute(req.user.id, id, reason);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Patch('admin/disputes/:id/appeal')
  async reviewAppeal(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { appealResult: string; finalStatus: DisputeStatus },
  ) {
    return this.adminService.reviewAppeal(req.user.id, id, dto);
  }

  // AUDIT LOGS (Admin only)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Get('admin/audit-logs')
  async getAuditLogs(@Req() req: any, @Query('skip') skip?: string, @Query('take') take?: string) {
    return this.adminService.getAuditLogs(req.user.id, {
      skip: skip !== undefined ? Number(skip) : undefined,
      take: take !== undefined ? Number(take) : undefined,
    });
  }
}
