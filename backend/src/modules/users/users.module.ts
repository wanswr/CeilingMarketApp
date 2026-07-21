import { LoggerModule } from '../logger/logger.module';
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { SubscriptionModule } from '../subscription/subscription.module';

@Module({
  imports: [LoggerModule, SubscriptionModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
