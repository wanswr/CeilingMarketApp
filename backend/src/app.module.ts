import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrdersModule } from './modules/orders/orders.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { ChatsModule } from './modules/chats/chats.module';
import { ReviewsModule } from './modules/reviews/reviews.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    OrdersModule,
    SubscriptionModule,
    GatewayModule,
    ChatsModule,
    ReviewsModule,
  ],
})
export class AppModule {}
