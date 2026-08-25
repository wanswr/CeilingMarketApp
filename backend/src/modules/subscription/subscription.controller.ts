import { Controller, Post, Get, UseGuards, Req, Body } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @UseGuards(JwtAuthGuard)
  @Get('my')
  getUserSubscriptions(@Req() req: any) {
    return this.subscriptionService.getUserSubscriptions(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('activate')
  activate(@Req() req: any, @Body() body: { categoryId?: string; days?: number }) {
    const categoryId = body.categoryId || req.user.activeCategoryId;
    return this.subscriptionService.activate(req.user.id, categoryId, body.days || 30);
  }

  @UseGuards(JwtAuthGuard)
  @Post('claim-free')
  claimFree(@Req() req: any, @Body() body: { categoryId: string }) {
    return this.subscriptionService.claimFreeCategory(req.user.id, body.categoryId);
  }
}
