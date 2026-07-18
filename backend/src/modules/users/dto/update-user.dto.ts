import { IsString, IsOptional, IsInt, IsArray, IsEnum } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsEnum(['WORKER', 'EMPLOYER'])
  role?: 'WORKER' | 'EMPLOYER';
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsInt()
  @IsOptional()
  experience?: number;

  @IsString()
  @IsOptional()
  telegram?: string;

  @IsString()
  @IsOptional()
  instagram?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsOptional()
  portfolio?: string[];
}
