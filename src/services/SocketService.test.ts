jest.mock('react-native', () => {
  (global as any).__DEV__ = true;
  return {
    Platform: {
      OS: 'ios',
      select: jest.fn().mockImplementation((obj) => obj.ios || obj.default),
    }
  };
}, { virtual: true });

jest.mock('@env', () => ({
  __esModule: true,
  SOCKET_URL: 'http://127.0.0.1:3000'
}), { virtual: true });

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue('fake-token'),
  setItemAsync: jest.fn().mockResolvedValue(true),
  deleteItemAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('socket.io-client', () => {
  const mockSocket = {
    id: 'mock-socket-id',
    connected: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    removeAllListeners: jest.fn(),
    io: { on: jest.fn() }
  };
  return {
    io: jest.fn().mockReturnValue(mockSocket)
  };
});

import { SOCKET_URL, resolveSocketUrl } from '../constants/config';
import { socketService } from './SocketService';

describe('SocketService & SOCKET_URL Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    socketService.disconnect();
  });

  it('should resolve SOCKET_URL directly from configuration without string replacement', () => {
    const url = resolveSocketUrl();
    expect(typeof url).toBe('string');
    expect(url).not.toContain('/api/');
  });

  it('should use explicit custom SOCKET_URL when provided', async () => {
    const customSocketUrl = 'https://staging-api.ceilingsapp.com';
    const connectSpy = jest.spyOn(socketService, 'connect');

    await socketService.connect(customSocketUrl, 'test_source');

    expect(connectSpy).toHaveBeenCalledWith(customSocketUrl, 'test_source');
  });
});
