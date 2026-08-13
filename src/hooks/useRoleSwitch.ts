import { useState } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { mapEngine } from '../services/MapEngine';
import { useClientStore } from '../store/client.store';

export const useRoleSwitch = () => {
  const [isSwitching, setIsSwitching] = useState(false);
  const { user, updateUser } = useAuth();

  const switchRole = async (targetRole?: 'WORKER' | 'EMPLOYER', onSuccess?: () => void) => {
    if (!user || isSwitching) return;
    const activeRole = useClientStore.getState().activeRole;
    const newRole = targetRole || (activeRole === 'EMPLOYER' ? 'WORKER' : 'EMPLOYER');
    setIsSwitching(true);
    try {
        const updatedUser = await mapEngine.setRole(newRole);
        updateUser(updatedUser);
        useClientStore.getState().setActiveRole(newRole);
        if (onSuccess) {
            onSuccess();
        }
        Alert.alert("Роль изменена", `Теперь вы ${newRole === 'EMPLOYER' ? 'Заказчик' : 'Мастер'}`);
        return updatedUser;
    } catch (e: any) {
        if (e.response?.status === 403) {
            Alert.alert("Ошибка", "Нельзя сменить режим при наличии активных заказов в работе (со статусом Принят или В процессе)");
        } else {
            Alert.alert("Ошибка", "Не удалось сменить роль");
        }
        throw e;
    } finally {
        setIsSwitching(false);
    }
  };

  return { switchRole, isSwitching };
};
