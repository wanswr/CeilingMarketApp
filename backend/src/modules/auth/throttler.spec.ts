import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

describe('Throttler Module & Per-Route Limits', () => {
  let authController: AuthController;

  const mockAuthService = {
    requestOtp: jest.fn().mockResolvedValue({ success: true }),
    verifyOtp: jest.fn().mockResolvedValue({ accessToken: 'mock-jwt' }),
    register: jest.fn().mockResolvedValue({ success: true }),
    logout: jest.fn().mockResolvedValue({ success: true }),
    logoutAll: jest.fn().mockResolvedValue({ success: true }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{
          ttl: 60000,
          limit: 30,
        }]),
      ],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    authController = module.get<AuthController>(AuthController);
  });

  it('should configure route-specific limit of 2 requests/min on requestOtp', () => {
    expect(authController).toBeDefined();
    const limit = Reflect.getMetadata('THROTTLER:LIMITdefault', AuthController.prototype.requestOtp);
    const ttl = Reflect.getMetadata('THROTTLER:TTLdefault', AuthController.prototype.requestOtp);

    expect(limit).toBe(2);
    expect(ttl).toBe(60000);
  });
});
