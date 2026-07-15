import { IsOptional, IsString, IsNumber, IsDateString, IsArray, Min } from 'class-validator';

export class UpdateOrderDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() details?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsArray() images?: string[];
}
