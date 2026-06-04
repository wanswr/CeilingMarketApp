import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { db, auth } from './firebase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

class NotificationService {
  private token: string | null = null;

  async registerForPushNotificationsAsync() {
    if (!auth.currentUser) return;

    let token;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Failed to get push token for push notification!');
      return;
    }

    const pushTokenData = await Notifications.getExpoPushTokenAsync({
        projectId: "8078330b-0649-43c2-a9b0-96695eb0746f"
    });
    token = pushTokenData.data as string;

    this.token = token;

    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    // Save token to user profile
    await db.collection("users").doc(auth.currentUser.uid).set({
      pushToken: token,
    }, { merge: true });

    return token;
  }

  async sendPushNotification(expoPushToken: string, title: string, body: string, data: any = {}) {
    const message = {
      to: expoPushToken,
      sound: 'default',
      title: title,
      body: body,
      data: data,
    };

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
  }

  async notifyStatusChange(orderId: string, recipientId: string, status: string) {
    try {
        const userDoc = await db.collection("users").doc(recipientId).get();
        const userData = userDoc.data();

        if (userData?.pushToken) {
            let title = "Обновление заказа";
            let body = `Статус заказа изменился на: ${status}`;

            if (status === 'accepted') {
                body = "Ваш заказ принят исполнителем!";
            } else if (status === 'in_work') {
                body = "Исполнитель приступил к работе!";
            } else if (status === 'completed') {
                body = "Заказ успешно завершен!";
            }

            await this.sendPushNotification(userData.pushToken, title, body, { orderId });
        }
    } catch (error) {
        console.error("Error sending status notification:", error);
    }
  }

  async notifyNewOrder(employerName: string, budget: number) {
      // In a real app, you would probably trigger this from a Cloud Function
      // but for this demo/task we can implement a logic to find matching workers
      // and send them notifications.
  }
}

export const notificationService = new NotificationService();
