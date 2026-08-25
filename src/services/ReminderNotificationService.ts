import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

class ReminderNotificationService {
  async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      return finalStatus === 'granted';
    } catch (error) {
      console.error('[ReminderNotificationService] Error requesting permissions:', error);
      return false;
    }
  }

  async scheduleNotification(
    title: string,
    body: string,
    scheduledAt: Date,
  ): Promise<string | null> {
    try {
      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        console.warn('[ReminderNotificationService] Notification permission not granted');
        return null;
      }

      const triggerDate = new Date(scheduledAt);
      if (triggerDate.getTime() <= Date.now()) {
        console.warn('[ReminderNotificationService] Trigger date is in the past');
        return null;
      }

      const identifier = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: true,
        },
        trigger: triggerDate as any,
      });

      return identifier;
    } catch (error) {
      console.error('[ReminderNotificationService] Error scheduling notification:', error);
      return null;
    }
  }

  async cancelNotification(notificationId?: string | null): Promise<void> {
    if (!notificationId) return;
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.error('[ReminderNotificationService] Error cancelling notification:', error);
    }
  }
}

export const reminderNotificationService = new ReminderNotificationService();
