import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../logger/logger.service';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, any>;
}

@Injectable()
export class NotificationDeliveryService {
  private readonly maxRetries = 3;
  private readonly expoPushUrl = 'https://exp.host/--/api/v2/push/send';

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {
    this.logger.setService('NotificationDeliveryService');
  }

  async sendPushNotification(userId: string, payload: PushPayload): Promise<{ success: boolean; reason?: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, pushToken: true, deletedAt: true },
    });

    if (!user || user.deletedAt || !user.pushToken || user.pushToken.trim() === '') {
      this.logger.debug('PUSH_SKIPPED', 'Target user has no active push token or is deleted', { userId });
      return { success: false, reason: 'NO_PUSH_TOKEN' };
    }

    const token = user.pushToken.trim();

    // Check that token is an Expo Push Token format (ExponentPushToken[...] or ExpoPushToken[...])
    if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
      this.logger.warn('PUSH_INVALID_FORMAT', 'User token is not a valid Expo push token format', { userId });
      await this.clearInvalidToken(userId);
      return { success: false, reason: 'INVALID_TOKEN_FORMAT' };
    }

    const expoBody = {
      to: token,
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      sound: 'default',
    };

    let attempt = 0;
    while (attempt < this.maxRetries) {
      attempt++;
      try {
        const response = await fetch(this.expoPushUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
          },
          body: JSON.stringify(expoBody),
        });

        if (response.ok) {
          const result = await response.json();
          const ticket = result.data?.[0];

          if (ticket?.status === 'ok') {
            this.logger.info('PUSH_DELIVERED', 'Push notification delivered successfully', { userId });
            return { success: true };
          }

          if (ticket?.status === 'error') {
            const errorDetails = ticket.details?.error;
            this.logger.warn('PUSH_EXPO_TICKET_ERROR', 'Expo ticket returned error status', {
              userId,
              error: ticket.message,
              details: errorDetails,
            });

            if (errorDetails === 'DeviceNotRegistered' || errorDetails === 'InvalidCredentials') {
              await this.clearInvalidToken(userId);
              return { success: false, reason: 'DEVICE_NOT_REGISTERED' };
            }
            return { success: false, reason: ticket.message || 'EXPO_TICKET_ERROR' };
          }

          return { success: true };
        }

        const status = response.status;
        if (status >= 400 && status < 500) {
          // Client error (e.g. invalid payload/auth) -> clear token if invalid credentials and do not retry
          this.logger.warn('PUSH_HTTP_CLIENT_ERROR', `Expo API returned HTTP ${status}`, { userId });
          if (status === 400) {
            await this.clearInvalidToken(userId);
          }
          return { success: false, reason: `HTTP_${status}` };
        }

        // HTTP 5xx -> Retry with exponential backoff
        this.logger.warn('PUSH_HTTP_SERVER_ERROR', `Expo API returned HTTP ${status}, retrying...`, { userId, attempt });
        if (attempt < this.maxRetries) {
          await this.delay(100 * Math.pow(2, attempt));
        }
      } catch (err: any) {
        this.logger.warn('PUSH_NETWORK_ERROR', `Network error sending push: ${err.message}`, { userId, attempt });
        if (attempt < this.maxRetries) {
          await this.delay(100 * Math.pow(2, attempt));
        }
      }
    }

    this.logger.error('PUSH_DELIVERY_FAILED', 'Exceeded maximum retries for push delivery', { userId });
    return { success: false, reason: 'MAX_RETRIES_EXCEEDED' };
  }

  private async clearInvalidToken(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { pushToken: null },
      });
      this.logger.info('PUSH_TOKEN_CLEARED', 'Cleared invalid push token for user', { userId });
    } catch (err: any) {
      this.logger.error('PUSH_TOKEN_CLEAR_FAILED', 'Failed to clear invalid push token', { userId, error: err.message });
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
