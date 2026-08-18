import { Test, TestingModule } from '@nestjs/testing';
import { NotificationDeliveryService } from './notification-delivery.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';

describe('NotificationDeliveryService', () => {
  let service: NotificationDeliveryService;
  let prisma: any;
  let originalFetch: any;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockLoggerService = {
    setService: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    originalFetch = global.fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDeliveryService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<NotificationDeliveryService>(NotificationDeliveryService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should skip push delivery gracefully when user has no pushToken', async () => {
    mockPrismaService.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      pushToken: null,
      deletedAt: null,
    });

    const result = await service.sendPushNotification('user-1', { title: 'Test', body: 'Hello' });

    expect(result).toEqual({ success: false, reason: 'NO_PUSH_TOKEN' });
    expect(mockLoggerService.debug).toHaveBeenCalledWith(
      'PUSH_SKIPPED',
      expect.any(String),
      expect.objectContaining({ userId: 'user-1' })
    );
  });

  it('should deliver push notification when user has valid Expo push token', async () => {
    const validToken = 'ExponentPushToken[mock-token-123]';
    mockPrismaService.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      pushToken: validToken,
      deletedAt: null,
    });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ status: 'ok', id: 'ticket-123' }],
      }),
    } as any);

    const result = await service.sendPushNotification('user-1', {
      title: 'New Response',
      body: 'Worker applied to your order',
      data: { orderId: 'order-100' },
    });

    expect(result).toEqual({ success: true });
    expect(global.fetch).toHaveBeenCalledWith('https://exp.host/--/api/v2/push/send', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    }));
  });

  it('should clear invalid token when Expo returns DeviceNotRegistered', async () => {
    const validToken = 'ExponentPushToken[expired-token]';
    mockPrismaService.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      pushToken: validToken,
      deletedAt: null,
    });

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ status: 'error', message: 'DeviceNotRegistered', details: { error: 'DeviceNotRegistered' } }],
      }),
    } as any);

    mockPrismaService.user.update.mockResolvedValueOnce({ id: 'user-1', pushToken: null });

    const result = await service.sendPushNotification('user-1', { title: 'Test', body: 'Body' });

    expect(result).toEqual({ success: false, reason: 'DEVICE_NOT_REGISTERED' });
    expect(mockPrismaService.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { pushToken: null },
    });
  });

  it('should retry up to maxRetries on HTTP 5xx server errors', async () => {
    const validToken = 'ExponentPushToken[mock-token]';
    mockPrismaService.user.findUnique.mockResolvedValueOnce({
      id: 'user-1',
      pushToken: validToken,
      deletedAt: null,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    } as any);

    const result = await service.sendPushNotification('user-1', { title: 'Test', body: 'Body' });

    expect(result).toEqual({ success: false, reason: 'MAX_RETRIES_EXCEEDED' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
