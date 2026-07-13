import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiService } from '../services/ApiService';
import { mapEngine } from '../services/MapEngine';
import { requestRouter } from '../services/RequestRouter';
import { socketService } from '../services/SocketService';
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
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    checkAuth();

    // V11: Handle app wakeup (foreground transition)
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
        if (
            appState.current.match(/inactive|background/) &&
            nextAppState === 'active'
        ) {
            logger.info('[AuthContext] App moved to foreground, refreshing connection...');
            // Non-blocking refresh to recover from long background periods
            checkAuth();
        }
        appState.current = nextAppState;
    });

    return () => {
        subscription.remove();
    };
  }, []);

  const checkAuth = async () => {
    logger.info('[AuthContext] Initializing auth check...');
    try {
      const storedToken = await SecureStore.getItemAsync('userToken');

      if (storedToken) {
        setToken(storedToken);
        try {
          // Attempt to fetch fresh profile
          const profile = await mapEngine.syncUser(true);
          if (profile) {
            setUser(profile);
            logger.info('[AuthContext] Profile synced successfully');
            // V11: Ensure socket is active
            socketService.connect(apiService.getBaseUrl(), 'auth_sync');
          }
        } catch (syncError: any) {
          logger.warn('[AuthContext] Profile sync failed', { error: syncError.message });

          if (syncError.response?.status === 404) {
              logger.error('[AuthContext] User record not found, clearing session');
              await logout();
          } else {
              const cachedUser = mapEngine.getCurrentUser();
              if (cachedUser) {
                setUser(cachedUser);
                logger.info('[AuthContext] Using cached user data');
                // Even if offline, try to connect socket (it will auto-retry)
                socketService.connect(apiService.getBaseUrl(), 'auth_offline_fallback');
              }
          }
        }
      } else {
          // Token lost or logged out
          if (token) {
              await logout();
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
      const { access_token, user } = res.data;

      if (!access_token) {
          throw new Error('No access_token returned from server');
      }

      await SecureStore.setItemAsync('userToken', access_token);
      setToken(access_token);
      setUser(user);

      socketService.connect(apiService.getBaseUrl(), 'auth_login');
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
    socketService.disconnect();
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
