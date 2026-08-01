import { IsString, MaxLength } from 'class-validator';

export class ParseOrderTextDto {
  @IsString()
  @MaxLength(5000)
  text: string;
}
