import { logger } from './LoggerService';
import { apiService } from '../ApiService';

/**
 * Utility to periodically check and log connection status.
 */
export const startConnectionWatchdog = () => {
    setInterval(async () => {
        try {
            const start = Date.now();
            await apiService.getProfile();
            const duration = Date.now() - start;
            logger.debug('CONNECTION_HEALTH_CHECK', { duration, status: 'OK' });
        } catch (e: any) {
            logger.warn('CONNECTION_HEALTH_CHECK_FAILED', {
                error: e.message,
                host: apiService.getBaseUrl()
            });
        }
    }, 60000 * 5); // Every 5 minutes
};
