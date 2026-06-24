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
        const userData = await mapEngine.syncUser();
        setUser(userData);
        socketService.connect(apiService.getBaseUrl());
        const userId = userData.uid || userData.id;
        if (userId) socketService.identifyUser(userId);
      } else {
        setUser(null);
      }
    } catch (e) {
      console.error("Auth check failed:", e);
      await SecureStore.deleteItemAsync('userToken');
      setUser(null);
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
