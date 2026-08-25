import { LoggerService } from './logger.service';

describe('LoggerService - Recursive Sanitization & PII Masking', () => {
  let service: LoggerService;

  beforeEach(() => {
    service = new LoggerService();
  });

  it('A: phone is masked to last 4 digits', () => {
    const input = { phone: '+79991234567' };
    const sanitized = service.sanitizeForLog(input);
    expect(sanitized.phone).toBe('********4567');
  });

  it('B: address is masked', () => {
    const input = { address: 'Moscow, Tverskaya 10' };
    const sanitized = service.sanitizeForLog(input);
    expect(sanitized.address).toBe('********');
  });

  it('C: accessToken is excluded', () => {
    const input = { accessToken: 'secret-jwt-access-token-xyz' };
    const sanitized = service.sanitizeForLog(input);
    expect(sanitized.accessToken).toBeUndefined();
  });

  it('D: refreshToken is excluded', () => {
    const input = { refreshToken: 'secret-jwt-refresh-token-xyz' };
    const sanitized = service.sanitizeForLog(input);
    expect(sanitized.refreshToken).toBeUndefined();
  });

  it('E: authorization header is excluded', () => {
    const input = { authorization: 'Bearer eyJhbGciOiJIUzI1Ni...' };
    const sanitized = service.sanitizeForLog(input);
    expect(sanitized.authorization).toBeUndefined();
  });

  it('F: otp and code are excluded', () => {
    const input = { otp: '1234', code: '5678' };
    const sanitized = service.sanitizeForLog(input);
    expect(sanitized.otp).toBeUndefined();
    expect(sanitized.code).toBeUndefined();
  });

  it('G: pushToken is excluded', () => {
    const input = { pushToken: 'ExponentPushToken[xxxx]' };
    const sanitized = service.sanitizeForLog(input);
    expect(sanitized.pushToken).toBeUndefined();
  });

  it('H: message, content, and messageContent are excluded', () => {
    const input = {
      message: 'Private chat message text',
      content: 'Confidential payload',
      messageContent: 'Secret content',
    };
    const sanitized = service.sanitizeForLog(input);
    expect(sanitized.message).toBeUndefined();
    expect(sanitized.content).toBeUndefined();
    expect(sanitized.messageContent).toBeUndefined();
  });

  it('I: Deep nested object - all sensitive fields are recursively redacted', () => {
    const input = {
      user: {
        phone: '+79001112233',
        profile: {
          address: 'Main Street 1',
          tokens: {
            accessToken: 'token-123',
            otp: '9999',
          },
        },
      },
    };

    const sanitized = service.sanitizeForLog(input);

    expect(sanitized.user.phone).toBe('********2233');
    expect(sanitized.user.profile.address).toBe('********');
    expect(sanitized.user.profile.tokens.accessToken).toBeUndefined();
    expect(sanitized.user.profile.tokens.otp).toBeUndefined();
  });

  it('J: Array of objects - all sensitive fields inside arrays are redacted', () => {
    const input = [
      { phone: '+79001112233', password: 'pass' },
      { address: 'Street 2', code: '1234' },
    ];

    const sanitized = service.sanitizeForLog(input);

    expect(sanitized[0].phone).toBe('********2233');
    expect(sanitized[0].password).toBeUndefined();
    expect(sanitized[1].address).toBe('********');
    expect(sanitized[1].code).toBeUndefined();
  });

  it('K: sanitizeForLog does NOT mutate the original input object', () => {
    const input = {
      phone: '+79001112233',
      password: 'my-secret-password',
      profile: { address: 'Moscow 10' },
    };

    const cloneInput = JSON.parse(JSON.stringify(input));
    service.sanitizeForLog(input);

    expect(input).toEqual(cloneInput);
  });
});
