import { LoggerModule } from '../logger/logger.module';
import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { GatewayModule } from '../gateway/gateway.module';
import { ChatsModule } from '../chats/chats.module';
import { OrderParserService } from './order-parser.service';
import { OrderSpatialService } from './order-spatial.service';

@Module({
  imports: [LoggerModule, GatewayModule, ChatsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderParserService, OrderSpatialService],
})
export class OrdersModule {}
