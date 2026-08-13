import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mapEngine } from '../services/MapEngine';
import { useAuth } from '../context/AuthContext';

export function useUserProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      return await mapEngine.syncUser(true);
    },
    staleTime: 1000 * 30, // 30 seconds stale time
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { updateUser } = useAuth();

  return useMutation({
    mutationFn: async (data: any) => {
      return await mapEngine.updateProfile(data);
    },
    onSuccess: (updatedUser) => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      updateUser(updatedUser);
    },
  });
}

export function useSetRole() {
  const queryClient = useQueryClient();
  const { updateUser } = useAuth();

  return useMutation({
    mutationFn: async (role: 'WORKER' | 'EMPLOYER') => {
      return await mapEngine.setRole(role);
    },
    onSuccess: (updatedUser) => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      updateUser(updatedUser);
    },
  });
}
