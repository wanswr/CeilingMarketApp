import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { GetOrdersSpatialDto } from './get-orders-spatial.dto';

describe('GetOrdersSpatialDto', () => {
  it('validates zoom levels properly', async () => {
    const validDto = plainToInstance(GetOrdersSpatialDto, { zoom: 12 });
    const validErrors = await validate(validDto);
    expect(validErrors.length).toBe(0);

    const invalidMin = plainToInstance(GetOrdersSpatialDto, { zoom: -1 });
    const errorsMin = await validate(invalidMin);
    expect(errorsMin.length).toBeGreaterThan(0);

    const invalidMax = plainToInstance(GetOrdersSpatialDto, { zoom: 25 });
    const errorsMax = await validate(invalidMax);
    expect(errorsMax.length).toBeGreaterThan(0);
  });
});
