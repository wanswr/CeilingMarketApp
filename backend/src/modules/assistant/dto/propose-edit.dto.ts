import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class ProposeEditDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsUUID()
  attachmentId?: string;
}
