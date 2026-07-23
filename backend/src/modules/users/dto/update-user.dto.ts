import { IsString, IsOptional, IsInt } from 'class-validator';

export class UpdateUserDto {
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
}
