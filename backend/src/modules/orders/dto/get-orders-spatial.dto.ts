import { IsNumber, IsOptional, IsPositive, Max, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class GetOrdersSpatialDto {
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  lng?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  radius?: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  minLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  @Type(() => Number)
  maxLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  minLng?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  @Type(() => Number)
  maxLng?: number;

  @IsOptional()
  @IsString()
  updatedAfter?: string;
}
