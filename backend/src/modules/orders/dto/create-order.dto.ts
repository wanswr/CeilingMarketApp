import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray, MaxLength, Min, Max, ArrayMaxSize } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsString()
  date: string;

  @IsNumber()
  @Min(0)
  @Max(10000000)
  price: number;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  details?: string;

  @IsString()
  @IsOptional()
  workType?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ArrayMaxSize(20)
  images?: string[];

  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;
}
