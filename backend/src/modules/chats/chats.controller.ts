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

  @Post()
  async initChat(@Body() body: { orderId: string, executorId: string }, @Req() req) {
    // Note: in a real app, you'd fetch employerId from the Order
    // For simplicity, we assume the one calling is either employer or executor
    const order = await (this.chatsService as any).prisma.order.findUnique({ where: { id: body.orderId } });
    return this.chatsService.getOrCreateChat(body.orderId, body.executorId, order.employerId);
  }

  @Get(':id/messages')
  async getMessages(@Param('id') id: string, @Req() req) {
    return this.chatsService.getMessages(id, req.user.id);
  }

  @Post(':id/messages')
  async sendMessage(@Param('id') id: string, @Body() body: { text: string }, @Req() req) {
    return this.chatsService.sendMessage(id, req.user.id, body.text);
  }
}
