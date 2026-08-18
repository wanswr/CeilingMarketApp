import { LoggerModule } from '../logger/logger.module';
import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationDeliveryService } from './notification-delivery.service';

@Module({
  imports: [LoggerModule],
  providers: [NotificationsService, NotificationDeliveryService],
  controllers: [NotificationsController],
  exports: [NotificationsService, NotificationDeliveryService],
})
export class NotificationsModule {}
