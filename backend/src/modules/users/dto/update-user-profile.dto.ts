import { IsString, IsOptional, IsEnum, IsInt, Min } from 'class-validator';

export enum RoleDto {
  WORKER = 'WORKER',
  EMPLOYER = 'EMPLOYER',
}

export class UpdateUserProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  experience?: number;

  @IsString()
  @IsOptional()
  telegram?: string;

  @IsString()
  @IsOptional()
  instagram?: string;

  @IsEnum(RoleDto)
  @IsOptional()
  role?: RoleDto;
}
