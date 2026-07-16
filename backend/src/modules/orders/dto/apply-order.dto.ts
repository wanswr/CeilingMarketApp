import { IsOptional, IsNumber, Min } from 'class-validator';

export class ApplyOrderDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;
}
