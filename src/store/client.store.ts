import { create } from 'zustand';

interface ClientState {
  activeRole: 'WORKER' | 'EMPLOYER' | null;
  setActiveRole: (role: 'WORKER' | 'EMPLOYER') => void;

  filters: {
    radius: number;
    categoryId: string | null;
    statuses: string[];
  };
  setFilters: (filters: Partial<ClientState['filters']>) => void;
  resetFilters: () => void;

  selectedOrderId: string | null;
  setSelectedOrderId: (id: string | null) => void;

  pushEnabled: boolean;
  setPushEnabled: (enabled: boolean) => void;

  offlineCacheEnabled: boolean;
  setOfflineCacheEnabled: (enabled: boolean) => void;
}

export const useClientStore = create<ClientState>((set) => ({
  activeRole: null,
  setActiveRole: (role) => set({ activeRole: role }),

  filters: {
    radius: 50,
    categoryId: null,
    statuses: [],
  },
  setFilters: (newFilters) => set((state) => ({
    filters: { ...state.filters, ...newFilters }
  })),
  resetFilters: () => set({
    filters: { radius: 50, categoryId: null, statuses: [] }
  }),

  selectedOrderId: null,
  setSelectedOrderId: (id) => set({ selectedOrderId: id }),

  pushEnabled: true,
  setPushEnabled: (enabled) => set({ pushEnabled: enabled }),

  offlineCacheEnabled: true,
  setOfflineCacheEnabled: (enabled) => set({ offlineCacheEnabled: enabled }),
}));
