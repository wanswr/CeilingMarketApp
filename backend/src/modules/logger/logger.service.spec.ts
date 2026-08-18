import { LoggerService, loggerStore } from './logger.service';

describe('LoggerService', () => {
  let service: LoggerService;

  beforeEach(() => {
    service = new LoggerService();
  });

  describe('sanitizeForLog', () => {
    it('should completely exclude sensitive keys including passwordHash, hash, refreshToken, authorization, cookie, secret, apiKey', () => {
      const testData = {
        password: 'my-super-secret-password',
        passwordHash: '$2b$10$xyz',
        hash: 'hash-value-123',
        jwt: 'header.payload.signature',
        token: 'jwt-token-xyz',
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        pushToken: 'push-id-777',
        sessionVersion: 5,
        authorization: 'Bearer secret-jwt-token',
        cookie: 'session=xyz',
        secret: 'my-super-secret',
        apiKey: 'api-key-123',
        otp: '1234',
        safeField: 'hello-world',
      };

      const result = service.sanitizeForLog(testData);

      expect(result).toEqual({
        safeField: 'hello-world',
      });
      expect(result.password).toBeUndefined();
      expect(result.passwordHash).toBeUndefined();
      expect(result.hash).toBeUndefined();
      expect(result.jwt).toBeUndefined();
      expect(result.token).toBeUndefined();
      expect(result.accessToken).toBeUndefined();
      expect(result.refreshToken).toBeUndefined();
      expect(result.pushToken).toBeUndefined();
      expect(result.sessionVersion).toBeUndefined();
      expect(result.authorization).toBeUndefined();
      expect(result.cookie).toBeUndefined();
      expect(result.secret).toBeUndefined();
      expect(result.apiKey).toBeUndefined();
      expect(result.otp).toBeUndefined();
    });

    it('should mask phone numbers and social contacts', () => {
      const testData = {
        phone: '+79998887766',
        telephone: '12345',
        instagram: '@my-insta',
        telegram: '@my-tele',
        safeField: 'some-value',
      };

      const result = service.sanitizeForLog(testData);

      expect(result.phone).toBe('********7766');
      expect(result.telephone).toBe('*2345');
      expect(result.instagram).toBe('********');
      expect(result.telegram).toBe('********');
      expect(result.safeField).toBe('some-value');
    });

    it('should recursively sanitize nested objects and arrays', () => {
      const testData = {
        user: {
          phone: '+79998887766',
          password: 'secret-pass',
          auth: {
            token: 'SECRET_JWT',
            refreshToken: 'REFRESH_SECRET',
            sessionVersion: 2,
          }
        },
        list: [
          { token: 'abc', val: 123 }
        ],
      };

      const result = service.sanitizeForLog(testData);

      expect(result.user.phone).toBe('********7766');
      expect(result.user.password).toBeUndefined();
      expect(result.user.auth.token).toBeUndefined();
      expect(result.user.auth.refreshToken).toBeUndefined();
      expect(result.user.auth.sessionVersion).toBeUndefined();
      expect(result.list[0].token).toBeUndefined();
      expect(result.list[0].val).toBe(123);
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

  describe('LoggerMiddleware & LoggingInterceptor Integration', () => {
    it('should keep the requestId consistent and sanitize body in interceptor error output', (done) => {
      const { LoggerMiddleware } = require('./logger.middleware');
      const { LoggingInterceptor } = require('./logging.interceptor');
      const { throwError } = require('rxjs');

      const middleware = new LoggerMiddleware();
      const interceptor = new LoggingInterceptor(service);

      const req: any = {
        headers: { 'x-request-id': 'custom-interceptor-trace-id' },
        method: 'POST',
        url: '/orders',
        body: { password: 'secret123', item: 'test' }
      };
      const res: any = {};

      const errorSpy = jest.spyOn(console, 'error').mockImplementation();

      middleware.use(req, res, () => {
        expect(req.requestId).toBe('custom-interceptor-trace-id');

        const mockContext: any = {
          switchToHttp: () => ({
            getRequest: () => req
          })
        };

        const mockHandler: any = {
          handle: () => throwError(() => new Error('Db error'))
        };

        interceptor.intercept(mockContext, mockHandler).subscribe({
          error: () => {
            try {
              expect(errorSpy).toHaveBeenCalled();
              const loggedObj = JSON.parse(errorSpy.mock.calls[0][0]);

              expect(loggedObj.requestId).toBe('custom-interceptor-trace-id');
              expect(loggedObj.metadata?.body?.password).toBeUndefined();
              expect(loggedObj.metadata?.body?.item).toBe('test');

              errorSpy.mockRestore();
              done();
            } catch (err) {
              errorSpy.mockRestore();
              done(err);
            }
          }
        });
      });
    });
  });
});
