import { IsString, IsNotEmpty, IsNumber, IsOptional, IsArray } from 'class-validator';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsNumber()
  latitude: number;

  @IsNumber()
  longitude: number;

  @IsString()
  date: string;

  @IsNumber()
  price: number;

  @IsString()
  @IsOptional()
  details?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];
}
