import { IsString, IsNotEmpty, MaxLength, IsOptional, IsUUID } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text: string;

  @IsOptional()
  @IsUUID()
  clientMessageId?: string;
}
