import { Controller, Post, UseGuards, Req, Body } from '@nestjs/common';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('subscriptions')
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @UseGuards(JwtAuthGuard)
  @Post('activate')
  // TODO(payments): гейт перед релизом, сейчас open для MVP
  activate(@Req() req, @Body() body: { days: number }) {
    return this.subscriptionService.activate(req.user.id, body.days || 30);
  }
}
