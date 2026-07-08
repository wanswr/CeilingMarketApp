import { logger } from './LoggerService';

// Handle unhandled promise rejections
const originalHandler = (global as any).PromiseRejectionTrackingOptions;
(global as any).PromiseRejectionTrackingOptions = {
    ...originalHandler,
    onUnhandled: (id: string, rejection: any) => {
        logger.error('PROMISE_REJECTION', {
            id,
            error: rejection?.message || rejection,
            stack: rejection?.stack
        });
    }
};

// ErrorUtils is used by React Native for global JS error handling
const ErrorUtils = (global as any).ErrorUtils;
if (ErrorUtils) {
    const originalHandler = ErrorUtils.getGlobalHandler();
    ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
        logger.error('APP_CRASH', {
            isFatal,
            error: error.message,
            stack: error.stack
        });
        if (originalHandler) {
            originalHandler(error, isFatal);
        }
    });
}
