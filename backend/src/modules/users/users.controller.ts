import { Controller, Get, Patch, Post, Body, UseGuards, Req, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Req() req) {
    return this.usersService.findOne(req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(@Body() updateDto: any, @Req() req) {
    return this.usersService.update(req.user.id, updateDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/reviews')
  async createReview(@Param('id') id: string, @Body() body: { rating: number, text: string, orderId: string }, @Req() req) {
    // V9: Simple review implementation - update user rating
    const user = await this.usersService.findOne(id);
    const newRating = (user.rating + body.rating) / 2; // Very simple average logic for MVP
    return this.usersService.update(id, {
        rating: newRating,
        completedOrders: user.completedOrders + 1
    });
  }
}
