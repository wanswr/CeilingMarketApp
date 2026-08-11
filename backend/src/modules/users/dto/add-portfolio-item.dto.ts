import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { WorkType } from '@prisma/client';

export class AddPortfolioItemDto {
  @IsString()
  @IsNotEmpty()
  imageUrl: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  @IsEnum(WorkType)
  workType?: WorkType;
}
