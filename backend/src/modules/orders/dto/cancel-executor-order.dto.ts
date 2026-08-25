import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CancelExecutorOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
