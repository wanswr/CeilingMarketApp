import { QueryClient } from '@tanstack/react-query';
import { logger } from './logger/LoggerService';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        const status = error?.response?.status;
        logger.warn('[QueryClient] Query failed, checking retry conditions:', {
            failureCount,
            status,
            message: error?.message
        });

        // 1. Do not retry client errors (400, 401, 403, 404) or throttling (429)
        if (status && [400, 401, 403, 404, 429].includes(status)) {
          logger.info('[QueryClient] Client error status detected. Retries disabled.');
          return false;
        }

        // 2. Retry server errors (5xx) up to 3 times
        if (status && status >= 500) {
          return failureCount < 3;
        }

        // 3. For generic network/timeout errors, retry up to 2 times
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => {
        const delay = Math.min(1000 * Math.pow(2, attemptIndex), 30000);
        logger.info(`[QueryClient] Scheduling retry attempt ${attemptIndex + 1} with delay ${delay}ms`);
        return delay;
      },
      refetchOnWindowFocus: false,
    },
  },
});