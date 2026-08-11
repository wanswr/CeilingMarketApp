import { IsEnum, IsNotEmpty } from 'class-validator';

export class SetRoleDto {
  @IsNotEmpty()
  @IsEnum(['WORKER', 'EMPLOYER'])
  role: 'WORKER' | 'EMPLOYER';
}
