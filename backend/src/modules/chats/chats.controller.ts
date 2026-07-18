import { Controller, Get, Post, Body, Param, UseGuards, Req, Patch } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ChatsService } from './chats.service';
import { GetOrCreateChatDto } from './dto/get-or-create-chat.dto';
import { SendMessageDto } from './dto/send-message.dto';
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
  async getOrCreateChat(@Body() body: GetOrCreateChatDto, @Req() req: any) {
    return this.chatsService.getOrCreateChat(body.orderId, body.executorId, req.user.id);
  }

  @Get(':id/messages')
  async getMessages(@Param('id') id: string, @Req() req: any) {
    return this.chatsService.getMessages(id, req.user.id);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':id/messages')
  async sendMessage(@Param('id') id: string, @Body() body: SendMessageDto, @Req() req: any) {
    return this.chatsService.sendMessage(id, req.user.id, body.text);
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Req() req: any) {
    return this.chatsService.markAsRead(id, req.user.id);
  }
}
