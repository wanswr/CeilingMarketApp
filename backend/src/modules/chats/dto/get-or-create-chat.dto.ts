import { IsString, IsNotEmpty } from 'class-validator';

export class GetOrCreateChatDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsString()
  @IsNotEmpty()
  executorId: string;
}
