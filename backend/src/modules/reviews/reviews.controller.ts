import { Controller, Post, Body, UseGuards, Req, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ReviewsService } from './reviews.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateReviewDto } from './dto/create-review.dto';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post()
  async create(@Req() req: any, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('pending')
  async getPending(@Req() req: any) {
    return this.reviewsService.getPendingReviews(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  async getMy(@Req() req: any) {
    return this.reviewsService.getMyReviews(req.user.id);
  }

  @Get('master/:id')
  async getMasterReviews(@Param('id') id: string) {
    return this.reviewsService.getMasterReviews(id);
  }
}
