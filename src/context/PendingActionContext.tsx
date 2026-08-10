import React, { createContext, useContext, useRef } from 'react';
import { useAuth } from './AuthContext';
import { useNavigation } from '@react-navigation/native';
import { useClientStore } from '../store/client.store';

interface PendingActionContextType {
  requireRoleAndCategory: (action: () => void | Promise<void>) => void;
  resumePendingAction: () => void;
  hasPendingAction: () => boolean;
}

const PendingActionContext = createContext<PendingActionContextType | undefined>(undefined);

export const PendingActionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const pendingActionRef = useRef<(() => void | Promise<void>) | null>(null);

  const requireRoleAndCategory = (action: () => void | Promise<void>) => {
    const activeRole = useClientStore.getState().activeRole;
    if (user && activeRole && (activeRole !== 'WORKER' || (user as any).activeCategoryId)) {
      action();
    } else {
      pendingActionRef.current = action;
      if (!activeRole) {
        navigation.navigate('RoleSelection', { pendingAction: true });
      } else if (activeRole === 'WORKER' && !(user as any).activeCategoryId) {
        navigation.navigate('CategorySelection', { pendingAction: true });
      }
    }
  };

  const resumePendingAction = () => {
    if (pendingActionRef.current) {
      pendingActionRef.current();
      pendingActionRef.current = null;
    }
  };

  const hasPendingAction = () => {
    return pendingActionRef.current !== null;
  };

  return (
    <PendingActionContext.Provider value={{ requireRoleAndCategory, resumePendingAction, hasPendingAction }}>
      {children}
    </PendingActionContext.Provider>
  );
};

export const usePendingAction = () => {
  const context = useContext(PendingActionContext);
  if (!context) {
    throw new Error('usePendingAction must be used within a PendingActionProvider');
  }
  return context;
};
