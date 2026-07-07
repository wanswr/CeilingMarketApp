import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { GatewayModule } from '../gateway/gateway.module';
import { ChatsModule } from '../chats/chats.module';

@Module({
  imports: [GatewayModule, ChatsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
