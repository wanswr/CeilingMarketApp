import { IsOptional, IsString, IsNumber, IsDateString, IsArray, Min, IsEnum } from 'class-validator';
import { OrderStatus, WorkType } from '@prisma/client';

export class UpdateOrderDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() details?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsArray() images?: string[];
  @IsOptional() @IsEnum(WorkType) workType?: WorkType;
  @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus; // переход валидируется в OrdersService.canTransition()
}
