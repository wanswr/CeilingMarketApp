import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { RemindersController } from './reminders.controller';
import { RemindersService } from './reminders.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { LoggerModule } from '../logger/logger.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, LoggerModule, AiModule],
  controllers: [AssistantController, RemindersController],
  providers: [AssistantService, RemindersService],
  exports: [AssistantService, RemindersService],
})
export class AssistantModule {}
