import { IsString, IsNotEmpty, MaxLength, IsOptional, IsObject } from 'class-validator';

export class CreateAssistantNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  rawText?: string;

  @IsOptional()
  @IsObject()
  structuredData?: Record<string, any>;
}
