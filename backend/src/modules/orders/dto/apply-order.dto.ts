import { IsOptional, IsNumber, Min, IsString } from 'class-validator';

export class ApplyOrderDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
