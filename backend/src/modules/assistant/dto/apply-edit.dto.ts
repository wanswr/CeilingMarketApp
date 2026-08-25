import { IsUUID, IsNotEmpty } from 'class-validator';

export class ApplyEditDto {
  @IsUUID()
  @IsNotEmpty()
  proposalId: string;
}
