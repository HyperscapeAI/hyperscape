/**
 * Centralized error handling utilities
 */

export enum ErrorSeverity {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  FATAL = 'FATAL'
}

export interface ErrorContext {
  system: string;
  method?: string;
  playerId?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}

/**
 * Log error with consistent format and context
 */
export function logError(
  message: string, 
  error: Error | string, 
  context: ErrorContext,
  severity: ErrorSeverity = ErrorSeverity.ERROR
): void {
  const prefix = `[${context.system}]${context.method ? ` ${context.method}` : ''}`;
  // Assume error is Error if it has message property, otherwise treat as string
  const errorMessage = typeof error === 'string' ? error : (error as Error).message;
  const stack = typeof error === 'string' ? undefined : (error as Error).stack;
  
  const fullMessage = `${prefix} ${severity}: ${message} - ${errorMessage}`;
  
  switch (severity) {
    case ErrorSeverity.DEBUG:
      if (process.env.NODE_ENV === 'development') {
        console.debug(fullMessage, context.details);
      }
      break;
    case ErrorSeverity.INFO:
      console.info(fullMessage, context.details);
      break;
    case ErrorSeverity.WARNING:
      console.warn(fullMessage, context.details, stack);
      break;
    case ErrorSeverity.ERROR:
      console.error(fullMessage, context.details, stack);
      break;
    case ErrorSeverity.FATAL:
      console.error(`FATAL: ${fullMessage}`, context.details, stack);
      // In production, you might want to send this to error tracking
      break;
  }
}

/**
 * Wrap async function with error handling
 */
export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context: ErrorContext
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError('Unhandled error in async function', error as Error, {
        ...context,
        method: fn.name || context.method
      });
      throw error;
    }
  }) as T;
}

/**
 * Try-catch wrapper that logs but doesn't throw
 */
export async function tryWithLogging<T>(
  fn: () => T | Promise<T>,
  context: ErrorContext,
  defaultValue?: T
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    logError('Operation failed', error as Error, context, ErrorSeverity.WARNING);
    return defaultValue;
  }
}

/**
 * Create a system-specific logger
 */
export function createSystemLogger(systemName: string) {
  return {
    debug: (message: string, details?: Record<string, unknown>) => {
      if (process.env.NODE_ENV === 'development') {
        console.debug(`[${systemName}] ${message}`, details);
      }
    },
    info: (message: string, details?: Record<string, unknown>) => {
      console.info(`[${systemName}] ${message}`, details);
    },
    warn: (message: string, details?: Record<string, unknown>) => {
      console.warn(`[${systemName}] ${message}`, details);
    },
    error: (message: string, error?: Error | string, details?: Record<string, unknown>) => {
      logError(message, error ?? new Error(message), {
        system: systemName,
        details
      });
    }
  };
}

/**
 * Assert with better error messages
 */
export function systemAssert(
  condition: boolean, 
  message: string, 
  context: ErrorContext
): asserts condition {
  if (!condition) {
    const error = new Error(message);
    logError('Assertion failed', error, context, ErrorSeverity.FATAL);
    throw error;
  }
}