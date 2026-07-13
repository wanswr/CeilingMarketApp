import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { AuthProvider } from './src/context/AuthContext';
import Navigation from './src/navigation';
import ErrorBoundary from './src/components/common/ErrorBoundary';
import { startConnectionWatchdog } from './src/services/logger/ConnectionLogger';
import { logger } from './src/services/logger/LoggerService';

export default function App() {
  useEffect(() => {
    logger.info('[App] Starting application sequence...');
    startConnectionWatchdog();
  }, []);

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <AuthProvider>
          <NavigationContainer>
            <Navigation />
            <StatusBar style="auto" />
          </NavigationContainer>
        </AuthProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
