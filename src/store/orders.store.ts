import { create } from 'zustand';

interface OrdersState {
  orders: any[];
  setOrders: (orders: any[]) => void;
  addOrder: (order: any) => void;
  clearOrders: () => void;
}

export const useOrdersStore = create<OrdersState>((set) => ({
  orders: [],
  setOrders: (orders) => set({ orders }),
  addOrder: (order) => set((state) => ({ orders: [...state.orders, order] })),
  clearOrders: () => set({ orders: [] }),
}));
