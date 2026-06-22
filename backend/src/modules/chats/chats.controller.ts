import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChatsService } from './chats.service';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  async getMyChats(@Req() req) {
    return this.chatsService.getMyChats(req.user.id);
  }

  @Post('init')
  async initChat(@Body() body: { orderId: string, executorId: string, employerId: string }) {
    return this.chatsService.getOrCreateChat(body.orderId, body.executorId, body.employerId);
  }

  @Post(':id/messages')
  async sendMessage(@Param('id') id: string, @Body() body: { text: string }, @Req() req) {
    return this.chatsService.sendMessage(id, req.user.id, body.text);
  }
}
