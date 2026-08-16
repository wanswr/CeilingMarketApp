import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrdersModule } from './modules/orders/orders.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { GatewayModule } from './modules/gateway/gateway.module';
import { ChatsModule } from './modules/chats/chats.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { AdminModule } from './modules/admin/admin.module';
import { NestModule, MiddlewareConsumer } from '@nestjs/common';
import { LoggerMiddleware } from './modules/logger/logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 20,
    }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    OrdersModule,
    SubscriptionModule,
    GatewayModule,
    ChatsModule,
    ReviewsModule,
    NotificationsModule,
    CategoriesModule,
    AdminModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes('*');
  }
}
