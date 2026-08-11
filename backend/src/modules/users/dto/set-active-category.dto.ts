import { IsString, IsNotEmpty } from 'class-validator';

export class SetActiveCategoryDto {
  @IsString()
  @IsNotEmpty()
  categoryId: string;
}
