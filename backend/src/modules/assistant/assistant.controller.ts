import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  UsePipes,
  ValidationPipe,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssistantService } from './assistant.service';
import { CreateAssistantNoteDto } from './dto/create-assistant-note.dto';
import { UpdateAssistantNoteDto } from './dto/update-assistant-note.dto';
import { AssistantNotesQueryDto } from './dto/assistant-notes-query.dto';

@Controller('assistant/notes')
@UseGuards(JwtAuthGuard)
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  create(@Body() dto: CreateAssistantNoteDto, @Req() req: any) {
    return this.assistantService.create(req.user.id, dto);
  }

  @Get()
  findAll(@Req() req: any, @Query() query: AssistantNotesQueryDto) {
    return this.assistantService.findAll(req.user.id, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.assistantService.findOne(req.user.id, id);
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssistantNoteDto,
    @Req() req: any,
  ) {
    return this.assistantService.update(req.user.id, id, dto);
  }

  @Post(':id/audio')
  @UseInterceptors(FileInterceptor('file'))
  addAudioAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('durationMs') durationMs: string,
    @Req() req: any,
  ) {
    return this.assistantService.addAudioAttachment(
      req.user.id,
      id,
      file,
      durationMs ? Number(durationMs) : undefined,
    );
  }

  @Post(':noteId/audio/:attachmentId/transcribe')
  transcribeAttachment(
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Req() req: any,
  ) {
    return this.assistantService.transcribeAttachment(req.user.id, noteId, attachmentId);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.assistantService.archive(req.user.id, id);
  }

  @Post(':id/archive')
  archive(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    return this.assistantService.archive(req.user.id, id);
  }
}
