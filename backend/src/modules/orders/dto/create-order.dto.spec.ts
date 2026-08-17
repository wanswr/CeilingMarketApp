import { validate } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';

describe('CreateOrderDto Geolocation Validation', () => {
  const buildValidDto = (): CreateOrderDto => {
    const dto = new CreateOrderDto();
    dto.title = 'Монтаж потолка';
    dto.address = 'Москва, Тверская 1';
    dto.latitude = 55.75;
    dto.longitude = 37.61;
    dto.date = new Date().toISOString();
    dto.price = 5000;
    return dto;
  };

  it('should pass validation with valid coordinates (55.75, 37.61)', async () => {
    const dto = buildValidDto();
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation when latitude is out of range (> 90)', async () => {
    const dto = buildValidDto();
    dto.latitude = 91;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.property === 'latitude')).toBe(true);
  });

  it('should fail validation when latitude is out of range (< -90)', async () => {
    const dto = buildValidDto();
    dto.latitude = -91;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.property === 'latitude')).toBe(true);
  });

  it('should fail validation when longitude is out of range (> 180)', async () => {
    const dto = buildValidDto();
    dto.longitude = 181;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.property === 'longitude')).toBe(true);
  });

  it('should fail validation when longitude is out of range (< -180)', async () => {
    const dto = buildValidDto();
    dto.longitude = -181;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some(e => e.property === 'longitude')).toBe(true);
  });

  it('should fail validation when latitude is NaN or Infinity', async () => {
    const dto = buildValidDto();
    dto.latitude = NaN;
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);

    const dtoInf = buildValidDto();
    dtoInf.latitude = Infinity;
    const errorsInf = await validate(dtoInf);
    expect(errorsInf.length).toBeGreaterThan(0);
  });
});
