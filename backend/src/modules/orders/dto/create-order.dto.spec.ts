import { validate } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';

describe('CreateOrderDto Validation', () => {
  const buildValidDto = (): CreateOrderDto => {
    const dto = new CreateOrderDto();
    dto.title = 'Монтаж потолка';
    dto.address = 'Москва, Тверская 1';
    dto.latitude = 55.75;
    dto.longitude = 37.61;
    dto.date = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
    dto.price = 5000;
    return dto;
  };

  describe('Geolocation Bounds', () => {
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

  describe('Date Validation & Past Date Guards', () => {
    it('should pass validation with future ISO datetime string', async () => {
      const dto = buildValidDto();
      dto.date = new Date(Date.now() + 86400000 * 3).toISOString();
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass validation with current/today date', async () => {
      const dto = buildValidDto();
      dto.date = new Date().toISOString();
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation with yesterday ISO date string', async () => {
      const dto = buildValidDto();
      const yesterday = new Date(Date.now() - 86400000 * 2);
      dto.date = yesterday.toISOString();
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.property === 'date')).toBe(true);
    });

    it('should fail validation with date far in the past (2020-01-01)', async () => {
      const dto = buildValidDto();
      dto.date = '2020-01-01T00:00:00.000Z';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.property === 'date')).toBe(true);
    });

    it('should fail validation with invalid date string ("abc")', async () => {
      const dto = buildValidDto();
      dto.date = 'abc';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.property === 'date')).toBe(true);
    });

    it('should fail validation with empty date string ("")', async () => {
      const dto = buildValidDto();
      dto.date = '';
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.property === 'date')).toBe(true);
    });
  });
});
