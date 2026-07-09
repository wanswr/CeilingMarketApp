import { LoggerModule } from '../logger/logger.module';
import { Module } from '@nestjs/common';
import { AppGateway } from './app.gateway';

@Module({
  imports: [LoggerModule],
  providers: [AppGateway],
  exports: [AppGateway],
})
export class GatewayModule {}
