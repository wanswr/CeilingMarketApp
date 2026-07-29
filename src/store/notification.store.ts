import { create } from 'zustand';

interface NotificationState {
  notifications: any[];
  setNotifications: (notifications: any[]) => void;
  clearNotifications: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  setNotifications: (notifications) => set({ notifications }),
  clearNotifications: () => set({ notifications: [] }),
}));
