import { useQuery } from '@tanstack/react-query';
import { mapEngine } from '../services/MapEngine';
import { entityStore } from '../services/EntityStore';

/**
 * useOrders: Hybrid hook.
 * Fetches from API via React Query, but pipes results into EntityStore V11.
 */
export const useMyOrders = (options = {}) => {
  return useQuery({
    queryKey: ['my-orders'],
    queryFn: async () => {
      const orders = await mapEngine.syncMyOrders();
      // Side effect: EntityStore is already filled by syncMyOrders
      return orders;
    },
    ...options
  });
};

/**
 * useProfile: Unified profile management.
 */
export const useProfile = (options = {}) => {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const profile = await mapEngine.syncUser();
      return profile;
    },
    ...options
  });
};
