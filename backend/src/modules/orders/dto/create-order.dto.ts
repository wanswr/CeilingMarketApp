import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsArray,
  MaxLength,
  Min,
  Max,
  ArrayMaxSize,
  IsDateString,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

export function IsFutureOrTodayDate(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isFutureOrTodayDate',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'string' || value.trim() === '') return false;
          const parsed = new Date(value);
          if (isNaN(parsed.getTime())) return false;

          // 5-minute clock-skew tolerance buffer for current moment
          const bufferMs = 5 * 60 * 1000;
          const nowWithBuffer = new Date(Date.now() - bufferMs);

          // Check if calendar date (UTC or local start of day)
          const isMidnightUTC = parsed.getUTCHours() === 0 && parsed.getUTCMinutes() === 0 && parsed.getUTCSeconds() === 0;

          if (isMidnightUTC) {
            const startOfTodayUTC = new Date();
            startOfTodayUTC.setUTCHours(0, 0, 0, 0);
            return parsed.getTime() >= startOfTodayUTC.getTime();
          }

          return parsed.getTime() >= nowWithBuffer.getTime();
        },
        defaultMessage(args: ValidationArguments) {
          return 'date must be a valid future or current date in ISO format';
        },
      },
    });
  };
}

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  address: string;

  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsString()
  @IsNotEmpty()
  @IsDateString()
  @IsFutureOrTodayDate()
  date: string;

  @IsNumber()
  @Min(0)
  @Max(10000000)
  price: number;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  details?: string;

  @IsString()
  @IsOptional()
  workType?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ArrayMaxSize(20)
  images?: string[];

  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;
}
