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
        // V11: Ignore standard development-mode script loading errors to prevent crash loops
        // where the app tries to log the error that is preventing it from running.
        const msg = error.message || '';
        if (msg.includes('No script URL provided') || msg.includes('Could not connect to development server')) {
            console.warn('[GlobalErrorHandler] Development server connection lost. Waiting for Metro...');
            return;
        }

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
