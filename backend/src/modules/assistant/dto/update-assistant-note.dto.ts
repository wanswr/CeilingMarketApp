import { IsString, IsOptional, MaxLength, IsObject } from 'class-validator';

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
}
