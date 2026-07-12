import { LoggerModule } from '../logger/logger.module';
import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { GatewayModule } from '../gateway/gateway.module';
import { ChatsModule } from '../chats/chats.module';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [LoggerModule, GatewayModule, ChatsModule, SubscriptionModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
