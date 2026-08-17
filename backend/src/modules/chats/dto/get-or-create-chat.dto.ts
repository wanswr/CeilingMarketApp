import { IsNotEmpty, IsUUID } from 'class-validator';

export class GetOrCreateChatDto {
  @IsUUID()
  @IsNotEmpty()
  orderId: string;

  @IsUUID()
  @IsNotEmpty()
  executorId: string;
}
