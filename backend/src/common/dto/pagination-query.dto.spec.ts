import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { PaginationQueryDto, MAX_PAGE_SIZE } from './pagination-query.dto';

describe('PaginationQueryDto Validation Rules', () => {
  it('A: take = 20 -> valid', async () => {
    const dto = plainToInstance(PaginationQueryDto, { take: '20', skip: '0' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.take).toBe(20);
    expect(dto.skip).toBe(0);
  });

  it('B: take = MAX_PAGE_SIZE (100) -> valid', async () => {
    const dto = plainToInstance(PaginationQueryDto, { take: '100' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
    expect(dto.take).toBe(MAX_PAGE_SIZE);
  });

  it('C: take = MAX_PAGE_SIZE + 1 (101) -> validation error', async () => {
    const dto = plainToInstance(PaginationQueryDto, { take: '101' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('D: take = 0 -> validation error', async () => {
    const dto = plainToInstance(PaginationQueryDto, { take: '0' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('E: take = -1 -> validation error', async () => {
    const dto = plainToInstance(PaginationQueryDto, { take: '-1' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('F: skip = -1 -> validation error', async () => {
    const dto = plainToInstance(PaginationQueryDto, { skip: '-1' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('G: take = NaN or skip = NaN -> validation error', async () => {
    const dtoNaN = plainToInstance(PaginationQueryDto, { take: 'NaN', skip: 'NaN' });
    const errors = await validate(dtoNaN);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('H: take = Infinity or skip = Infinity -> validation error', async () => {
    const dtoInf = plainToInstance(PaginationQueryDto, { take: 'Infinity', skip: 'Infinity' });
    const errors = await validate(dtoInf);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('I: take = "abc" or skip = "abc" -> validation error', async () => {
    const dtoAbc = plainToInstance(PaginationQueryDto, { take: 'abc', skip: 'abc' });
    const errors = await validate(dtoAbc);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('J: missing parameters -> defaults (skip = 0, take = 20)', async () => {
    const dtoEmpty = plainToInstance(PaginationQueryDto, {});
    const errors = await validate(dtoEmpty);
    expect(errors.length).toBe(0);
    expect(dtoEmpty.skip).toBe(0);
    expect(dtoEmpty.take).toBe(20);
  });
});
