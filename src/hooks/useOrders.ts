import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/ApiService';
import { mapEngine } from '../services/MapEngine';

export function useMyOrdersQuery(params?: { skip?: number; take?: number }) {
  return useQuery({
    queryKey: ['orders', 'my', params],
    queryFn: async () => {
      const res = await apiService.getMyOrders(params);
      return res.data;
    },
    staleTime: 1000 * 15, // 15 seconds stale time
  });
}

export function useOrderDetailQuery(id: string) {
  return useQuery({
    queryKey: ['orders', 'detail', id],
    queryFn: async () => {
      const res = await apiService.getOrderDetails(id);
      return res.data;
    },
    enabled: !!id,
    staleTime: 1000 * 30, // 30 seconds stale time
  });
}

export function useCreateOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: any) => {
      return await mapEngine.createOrder(data);
    },
    onSuccess: (newOrder) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useApplyForOrderMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, price, idempotencyKey }: { id: string; price?: number; idempotencyKey?: string }) => {
      return await mapEngine.applyForOrder(id, price, idempotencyKey);
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orders', 'detail', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['orders', 'my'] });
    },
  });
}

export function useMapSpatialQuery(params: {
  lat?: number;
  lng?: number;
  radius?: number;
  minLat?: number;
  maxLat?: number;
  minLng?: number;
  maxLng?: number;
  zoom?: number;
  categoryId?: string | null;
}) {
  return useQuery({
    queryKey: ['map', 'spatial', params],
    queryFn: async () => {
      const res = await apiService.getOrdersSpatial(params);
      return res.data;
    },
    enabled: !!((params.lat && params.lng) || (params.minLat && params.maxLat)),
    staleTime: 1000 * 10, // 10 seconds cache validity
  });
}
