import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiService } from '../services/ApiService';
import { mapEngine } from '../services/MapEngine';
import { requestRouter } from '../services/RequestRouter';
import { socketService } from '../services/SocketService';
import { UserProfile } from '../types';
import { logger } from '../services/logger/LoggerService';
import { useClientStore } from '../store/client.store';

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
    if (user?.role) {
      const activeRole = user.role.toUpperCase() as 'WORKER' | 'EMPLOYER';
      useClientStore.getState().setActiveRole(activeRole);
      socketService.connect(apiService.getBaseUrl(), 'auth_user_change');
    } else {
      useClientStore.setState({ activeRole: null });
      socketService.disconnect();
    }
  }, [user]);

  useEffect(() => {
    apiService.setOnUnauthorizedCallback(async () => {
      logger.info("[AuthContext] Global 401 interceptor triggered logout");
      await logout();
    });

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
        apiService.setOnUnauthorizedCallback(null);
    };
  }, []);

  const checkAuth = async () => {
    logger.info('[AuthContext] Initializing auth check...');
    try {
      const storedToken = await SecureStore.getItemAsync('userToken');

      if (storedToken) {
        mapEngine.setCachedToken(storedToken);
        setToken(storedToken);
        try {
          // Attempt to fetch fresh profile
          const profile = await mapEngine.syncUser(true);
          if (profile) {
            setUser(profile);
            logger.info('[AuthContext] Profile synced successfully');
            // Connect handled by useEffect
          }
        } catch (syncError: any) {
          logger.warn('[AuthContext] Profile sync failed', { error: syncError.message });

          if (syncError.response?.status === 404 || syncError.response?.status === 401) {
              logger.error(`[AuthContext] Session invalid (status: ${syncError.response.status}), clearing session`);
              await logout();
          } else {
              const cachedUser = mapEngine.getCurrentUser();
              if (cachedUser) {
                setUser(cachedUser);
                logger.info('[AuthContext] Using cached user data');
                // Connect handled by useEffect
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
    apiService.reset401Guard();
    // 1. disconnect websocket
    socketService.disconnect();

    // 2. clear auth state
    setToken(null);
    setUser(null);

    // 3. clear user cache & clear entity store
    mapEngine.entityStore.clear();
    requestRouter.clear();

    const maskedPhone = phone.replace(/^(\+?\d{4})\d{4}(\d{3})$/, '$1****$2');
    const aid = logger.startAction('AUTH_LOGIN', { phone: maskedPhone });
    try {
      const res = await apiService.verifyOtp(phone, code);
      const { access_token, user } = res.data;

      if (!access_token) {
          throw new Error('No access_token returned from server');
      }

      // 4. save new token
      await SecureStore.setItemAsync('userToken', access_token);
      mapEngine.setCachedToken(access_token);
      setToken(access_token);

      // 5. save user state (including entityStore first so that connect can query it)
      mapEngine.entityStore.setUser({ ...user, isMe: true });
      setUser(user);

      // Connect handled by useEffect

      logger.endAction('AUTH_LOGIN', { aid, userId: (user as any).id });
    } catch (error: any) {
      logger.logNetworkError(aid, error);
      throw error;
    }
  };

  const logout = async () => {
    logger.info('AUTH_LOGOUT', { userId: (user as any)?.id });
    try {
      await apiService.logout();
    } catch (e: any) {
      logger.warn('[AuthContext] Remote logout notification failed', { error: e.message });
    }
    await SecureStore.deleteItemAsync('userToken');
    mapEngine.setCachedToken(null);
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
