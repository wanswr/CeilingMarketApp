import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsEnum(['WORKER', 'EMPLOYER'])
  role?: 'WORKER' | 'EMPLOYER';
}
