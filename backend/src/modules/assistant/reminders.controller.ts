import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RemindersService } from './reminders.service';
import { CreateReminderDto } from './dto/create-reminder.dto';
import { UpdateReminderDto } from './dto/update-reminder.dto';

@Controller('assistant/reminders')
@UseGuards(JwtAuthGuard)
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  create(@Body() dto: CreateReminderDto, @Req() req: any) {
    return this.remindersService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Req() req: any, @Query('noteId') noteId?: string) {
    return this.remindersService.findAll(req.user.id, noteId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.remindersService.findOne(req.user.id, id);
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReminderDto,
    @Req() req: any,
  ) {
    return this.remindersService.update(req.user.id, id, dto);
  }

  @Post(':id/complete')
  complete(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.remindersService.complete(req.user.id, id);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.remindersService.cancel(req.user.id, id);
  }
}
