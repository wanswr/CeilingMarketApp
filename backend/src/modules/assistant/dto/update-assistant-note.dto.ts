import { AssistantNoteStatus } from '@prisma/client';
import { AssistantNoteStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';
import { AssistantNoteStatus } from '@prisma/client';
import { IsString, IsOptional, MaxLength, IsObject, IsEnum } from 'class-validator';
import { AssistantNoteStatus } from '@prisma/client';

export class UpdateAssistantNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  rawText?: string;

  @IsOptional()
  @IsObject()
  structuredData?: Record<string, any>;

  @IsOptional()
  @IsEnum(AssistantNoteStatus)
  status?: AssistantNoteStatus;

  @IsOptional()
  @IsEnum(AssistantNoteStatus)
  status?: AssistantNoteStatus;

  @IsOptional()
  @IsEnum(AssistantNoteStatus)
  status?: AssistantNoteStatus;

  @IsOptional()
  @IsEnum(AssistantNoteStatus)
  status?: AssistantNoteStatus;

  @IsOptional()
  @IsEnum(AssistantNoteStatus)
  status?: AssistantNoteStatus;
}
