import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { apiService } from '../services/ApiService';
import { mapEngine } from '../services/MapEngine';
import { requestRouter } from '../services/RequestRouter';
import { UserProfile } from '../types';
import { logger } from '../services/logger/LoggerService';

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  loading: boolean;
  login: (phone: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updatedUser: UserProfile) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    logger.info('[AuthContext] Initializing auth check...');
    try {
      const storedToken = await SecureStore.getItemAsync('userToken');
      logger.debug('[AuthContext] Token status', { found: !!storedToken });

      if (storedToken) {
        setToken(storedToken);
        logger.debug('[AuthContext] Attempting profile sync...');
        try {
          // Attempt to fetch fresh profile
          const profile = await mapEngine.syncUser(true);
          if (profile) {
            setUser(profile);
            logger.info('[AuthContext] Profile synced successfully');
          }
        } catch (syncError: any) {
          logger.warn('[AuthContext] Profile sync failed', { error: syncError.message });

          if (syncError.response?.status === 404) {
              logger.error('[AuthContext] User record not found, clearing session');
              await logout();
          } else {
              // Try to use cached data from EntityStore
              const cachedUser = mapEngine.getCurrentUser();
              if (cachedUser) {
                setUser(cachedUser);
                logger.info('[AuthContext] Using cached user data');
              }
          }
        }
      }
    } catch (e: any) {
      logger.error("[AuthContext] Fatal auth error", { error: e.message });
    } finally {
      setLoading(false);
      logger.info('[AuthContext] Auth check finished');
    }
  };

  const login = async (phone: string, code: string) => {
    const aid = logger.startAction('AUTH_LOGIN', { phone });
    try {
      const res = await apiService.verifyOtp(phone, code);
      const { token, user } = res.data;

      await SecureStore.setItemAsync('userToken', token);
      setToken(token);
      setUser(user);

      // Initialize systems with new user
      mapEngine.entityStore.setUser({ ...user, isMe: true });
      logger.endAction('AUTH_LOGIN', { aid, userId: user.id });
    } catch (error: any) {
      logger.logNetworkError(aid, error);
      throw error;
    }
  };

  const logout = async () => {
    logger.info('AUTH_LOGOUT', { userId: user?.id });
    await SecureStore.deleteItemAsync('userToken');
    setToken(null);
    setUser(null);
    mapEngine.entityStore.clear();
    requestRouter.clear();
  };

  const updateUser = (updatedUser: UserProfile) => {
    setUser(updatedUser);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser }}>
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
