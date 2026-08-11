import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './src/context/AuthContext';
import Navigation from './src/navigation';
import { PendingActionProvider } from './src/context/PendingActionContext';
import ErrorBoundary from './src/components/common/ErrorBoundary';
import { startConnectionWatchdog } from './src/services/logger/ConnectionLogger';
import { logger } from './src/services/logger/LoggerService';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './src/services/QueryClient';

export default function App() {
  useEffect(() => {
    logger.info('[App] Starting application sequence...');
    startConnectionWatchdog();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <AuthProvider>
          <NavigationContainer>
            <PendingActionProvider>
              <Navigation />
              <StatusBar style="auto" />
            </PendingActionProvider>
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
