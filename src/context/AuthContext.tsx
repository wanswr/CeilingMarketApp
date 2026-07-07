import React, { createContext, useState, useContext, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { mapEngine } from '../services/MapEngine'
import { socketService } from '../services/SocketService'
import { apiService } from '../services/ApiService'

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
    console.log('[AuthContext] Initializing auth check...');
    try {
      const token = await SecureStore.getItemAsync('userToken');
      console.log('[AuthContext] Token status:', token ? 'Found' : 'Not found');

      if (token) {
        console.log('[AuthContext] Attempting profile sync...');
        const profilePromise = mapEngine.syncUser();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Sync Timeout')), 5000)
        );

        try {
          const userData = await Promise.race([profilePromise, timeoutPromise]);
          console.log('[AuthContext] Profile synced successfully');
          setUser(userData);
          socketService.connect(apiService.getBaseUrl());
        } catch (syncError: any) {
          console.warn('[AuthContext] Profile sync failed or timed out:', syncError.message);

          // Task #7: If error is 404, the user record is gone, so logout
          if (syncError.response?.status === 404) {
              console.log('[AuthContext] User record not found, clearing session');
              await signOut();
              return;
          }

          // Fallback: try to use cached user if sync fails (e.g. 500 or timeout)
          const cachedUser = mapEngine.entityStore.getCurrentUser();
          if (cachedUser) {
              console.log('[AuthContext] Using cached user data');
              setUser(cachedUser);
              socketService.connect(apiService.getBaseUrl());
          } else {
              setUser({ id: 'pending', role: null });
          }
        }
      } else {
        setUser(null);
      }
    } catch (e) {
      console.error("[AuthContext] Fatal auth error:", e);
      setUser(null);
    } finally {
      console.log('[AuthContext] Auth check finished');
      setLoading(false);
    }
  };

  const signIn = async (token: string, userData: any) => {
    await SecureStore.setItemAsync('userToken', token);
    setUser(userData);
    socketService.connect(apiService.getBaseUrl());
  };

  const signOut = async () => {
    await SecureStore.deleteItemAsync('userToken');
    setUser(null);
    socketService.disconnect();
    mapEngine.entityStore.clear(); // Clear cache on logout
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
