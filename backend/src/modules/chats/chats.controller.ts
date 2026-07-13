import { Controller, Get, Post, Body, Param, UseGuards, Req, Patch } from '@nestjs/common';
import { ChatsService } from './chats.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private readonly chatsService: ChatsService) {}

  @Get()
  async getMyChats(@Req() req: any) {
    return this.chatsService.getMyChats(req.user.id);
  }

  @Post()
  async getOrCreateChat(@Body() body: { orderId: string; executorId: string }, @Req() req: any) {
    return this.chatsService.getOrCreateChat(body.orderId, body.executorId, req.user.id);
  }

  @Get(':id/messages')
  async getMessages(@Param('id') id: string, @Req() req: any) {
    return this.chatsService.getMessages(id, req.user.id);
  }

  @Post(':id/messages')
  async sendMessage(@Param('id') id: string, @Body() body: { text: string }, @Req() req: any) {
    return this.chatsService.sendMessage(id, req.user.id, body.text);
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Req() req: any) {
    return this.chatsService.markAsRead(id, req.user.id);
  }
}
