import { validate } from 'class-validator';
import { GetOrCreateChatDto } from './get-or-create-chat.dto';

describe('GetOrCreateChatDto Validation', () => {
  it('should pass validation with valid UUIDs', async () => {
    const dto = new GetOrCreateChatDto();
    dto.orderId = '123e4567-e89b-12d3-a456-426614174000';
    dto.executorId = '987e6543-e21b-12d3-a456-426614174111';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation with invalid UUID orderId ("abc")', async () => {
    const dto = new GetOrCreateChatDto();
    dto.orderId = 'abc';
    dto.executorId = '987e6543-e21b-12d3-a456-426614174111';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('orderId');
  });

  it('should fail validation with invalid UUID executorId ("abc")', async () => {
    const dto = new GetOrCreateChatDto();
    dto.orderId = '123e4567-e89b-12d3-a456-426614174000';
    dto.executorId = 'abc';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('executorId');
  });

  it('should fail validation with empty string IDs', async () => {
    const dto = new GetOrCreateChatDto();
    dto.orderId = '';
    dto.executorId = '';

    const errors = await validate(dto);
    expect(errors.length).toBe(2);
  });

  it('should fail validation with malformed or too long ID', async () => {
    const dto = new GetOrCreateChatDto();
    dto.orderId = '123e4567-e89b-12d3-a456-426614174000-extra-long-malformed-string';
    dto.executorId = '123e4567-e89b-12d3-a456-426614174000';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('orderId');
  });
});
