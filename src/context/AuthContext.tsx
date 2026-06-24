import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { mapEngine } from '../services/MapEngine';
import { socketService } from '../services/SocketService';
import { apiService } from '../services/ApiService';

interface AuthContextType {
  user: any;
  loading: boolean;
  signIn: (token: string, userData: any) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (userData: any) => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await SecureStore.getItemAsync('userToken');
      if (token) {
        try {
          const userData = await mapEngine.syncUser();
          setUser(userData);
          socketService.connect(apiService.getBaseUrl());
          const userId = userData.uid || userData.id;
          if (userId) socketService.identifyUser(userId);
        } catch (e: any) {
          // If profile fetch fails with 404, it means the user was deleted from DB
          // or the token is definitely invalid/stale.
          if (e.response?.status === 404 || e.response?.status === 401) {
            await signOut();
          } else {
            throw e; // Retry on next cycle if it's just a network error
          }
        }
      } else {
        setUser(null);
      }
    } catch (e) {
      console.error("Auth check failed:", e);
      // Don't auto-delete token on general network errors (timeout),
      // only on specific auth/existence errors handled above.
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (token: string, userData: any) => {
    await SecureStore.setItemAsync('userToken', token);
    setUser(userData);
    socketService.connect(apiService.getBaseUrl());
    const userId = userData.uid || userData.id;
    if (userId) socketService.identifyUser(userId);
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync('userToken');
    setUser(null);
    socketService.disconnect();
  };

  const updateUser = (userData: any) => {
    setUser(userData);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, updateUser, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
