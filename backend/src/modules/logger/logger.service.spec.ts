import { LoggerService, loggerStore, SENSITIVE_LOG_FIELDS } from './logger.service';

describe('LoggerService', () => {
  let service: LoggerService;

  beforeEach(() => {
    service = new LoggerService();
  });

  describe('SENSITIVE_LOG_FIELDS definition', () => {
    it('should export SENSITIVE_LOG_FIELDS containing all required sensitive field keys', () => {
      expect(SENSITIVE_LOG_FIELDS).toContain('password');
      expect(SENSITIVE_LOG_FIELDS).toContain('passwordhash');
      expect(SENSITIVE_LOG_FIELDS).toContain('hash');
      expect(SENSITIVE_LOG_FIELDS).toContain('token');
      expect(SENSITIVE_LOG_FIELDS).toContain('accesstoken');
      expect(SENSITIVE_LOG_FIELDS).toContain('refreshtoken');
      expect(SENSITIVE_LOG_FIELDS).toContain('jwt');
      expect(SENSITIVE_LOG_FIELDS).toContain('authorization');
      expect(SENSITIVE_LOG_FIELDS).toContain('cookie');
      expect(SENSITIVE_LOG_FIELDS).toContain('pushtoken');
      expect(SENSITIVE_LOG_FIELDS).toContain('sessionversion');
      expect(SENSITIVE_LOG_FIELDS).toContain('phone');
      expect(SENSITIVE_LOG_FIELDS).toContain('secret');
      expect(SENSITIVE_LOG_FIELDS).toContain('apikey');
      expect(SENSITIVE_LOG_FIELDS).toContain('payment_token');
      expect(SENSITIVE_LOG_FIELDS).toContain('provider_secret');
    });
  });

  describe('sanitizeForLog', () => {
    it('should exclude all sensitive fields regardless of key casing', () => {
      const testData = {
        Password: 'pass',
        passwordHash: '$2b$10$',
        HASH: 'hash123',
        Token: 'tok',
        AccessToken: 'acc',
        RefreshToken: 'ref',
        JWT: 'jwt.val',
        Authorization: 'Bearer xyz',
        Cookie: 'sess=123',
        PushToken: 'push123',
        SessionVersion: 1,
        Secret: 'sec',
        ApiKey: 'api123',
        payment_token: 'pay123',
        provider_secret: 'prov123',
        external_api_key: 'ext123',
      };

      const result = service.sanitizeForLog(testData);

      expect(Object.keys(result).length).toBe(0);
    });

    it('should mask phone numbers regardless of casing', () => {
      const testData = {
        PHONE: '+79998887766',
        Telephone: '12345',
        Instagram: '@insta',
      };

      const result = service.sanitizeForLog(testData);

      expect(result.PHONE).toBe('********7766');
      expect(result.Telephone).toBe('*2345');
      expect(result.Instagram).toBe('********');
    });

    it('should recursively sanitize nested objects and arrays', () => {
      const testData = {
        user: {
          auth: {
            AccessToken: 'SECRET_TOKEN',
            payment_token: 'PAY_SECRET',
          }
        },
        items: [
          { provider_secret: 'PROV_SECRET', status: 'OK' }
        ],
      };

      const result = service.sanitizeForLog(testData);

      expect(result.user.auth.AccessToken).toBeUndefined();
      expect(result.user.auth.payment_token).toBeUndefined();
      expect(result.items[0].provider_secret).toBeUndefined();
      expect(result.items[0].status).toBe('OK');
    });

    it('should preserve normal fields (orderId, status, amount, createdAt)', () => {
      const normalData = {
        orderId: 'order-123',
        status: 'PUBLISHED',
        amount: 5000,
        createdAt: '2026-08-18T00:00:00Z',
      };

      const result = service.sanitizeForLog(normalData);

      expect(result).toEqual(normalData);
    });

    it('should not mutate original input object', () => {
      const original = {
        password: 'my-password',
        user: { phone: '+79998887766' }
      };

      const result = service.sanitizeForLog(original);

      expect(original.password).toBe('my-password');
      expect(original.user.phone).toBe('+79998887766');
      expect(result.password).toBeUndefined();
      expect(result.user.phone).toBe('********7766');
    });
  });

  describe('AsyncLocalStorage Distributed Tracing', () => {
    it('should automatically inject requestId from active loggerStore context', () => {
      const logSpy = jest.spyOn(console, 'info').mockImplementation();

      const store = new Map<string, any>();
      store.set('requestId', 'test-trace-id-123');
      store.set('userId', 'user-abc');

      loggerStore.run(store, () => {
        service.info('ACTION_TEST', 'My test message');
      });

      expect(logSpy).toHaveBeenCalled();
      const outputLog = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(outputLog.requestId).toBe('test-trace-id-123');
      expect(outputLog.userId).toBe('user-abc');
      expect(outputLog.message).toBe('My test message');

      logSpy.mockRestore();
    });
  });
});
