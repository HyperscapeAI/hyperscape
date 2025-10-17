/**
 * Frontend Error Reporting Service
 * 
 * This service captures and reports frontend errors to the backend for logging.
 * It handles JavaScript errors and unhandled promise rejections.
 */

import type { ErrorReport } from '@hyperscape/shared'

/**
 * ErrorReportingService - Frontend error tracking and reporting
 * 
 * Captures and reports frontend errors to the backend for centralized logging.
 * Automatically hooks into global error handlers to catch uncaught exceptions
 * and unhandled promise rejections.
 * 
 * @remarks
 * Errors are sent to the backend via POST /api/errors/frontend for logging.
 * The service generates a unique session ID on instantiation to track errors
 * across a single browser session.
 * 
 * @public
 */
class ErrorReportingService {
  /** Backend endpoint for error reporting */
  private endpoint = '/errors/frontend';
  
  /** Unique session ID for tracking errors in this browser session */
  private sessionId: string;
  
  /** User ID (set after authentication) */
  private userId: string;

  /**
   * Constructs the error reporting service
   * 
   * Automatically sets up global error handlers for window.error and
   * window.unhandledrejection events.
   */
  constructor() {
    this.sessionId = this.generateSessionId();
    this.userId = '';
    this.setupGlobalErrorHandlers();
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sets the user ID for error attribution
   * 
   * Call this after user authentication to associate errors with specific users.
   * 
   * @param userId - The authenticated user's ID
   * 
   * @public
   */
  public setUserId(userId: string) {
    this.userId = userId;
  }

  /**
   * Sets up global error handlers for uncaught errors
   * 
   * Registers listeners for window.error and window.unhandledrejection
   * to automatically report any uncaught exceptions or promise rejections.
   * 
   * @private
   */
  private setupGlobalErrorHandlers() {
    window.addEventListener('error', (event) => {
      const errorData: ErrorReport = {
        message: event.error?.message || event.message || 'Unknown error',
        stack: event.error?.stack || 'No stack trace available',
        url: event.filename,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        context: {
          line: event.lineno,
          column: event.colno,
          type: 'uncaught-error'
        },
        componentStack: '',
        userId: this.userId,
        sessionId: this.sessionId
      };
      
      this.reportError(errorData);
    });

    window.addEventListener('unhandledrejection', (event) => {
      const errorData: ErrorReport = {
        message: event.reason?.toString() || String(event.reason) || 'Unhandled promise rejection',
        stack: event.reason?.stack || 'No stack trace available',
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        context: {
          type: 'unhandled-rejection',
          promise: event.promise
        },
        componentStack: '',
        userId: this.userId,
        sessionId: this.sessionId
      };
      
      this.reportError(errorData);
    });
  }

  /**
   * Reports an error to the backend for logging
   * 
   * Sends error data to the backend via POST request. Includes user ID,
   * session ID, and timestamp for tracking and debugging.
   * 
   * @param errorData - Complete error information to report
   * @returns Promise resolving to the backend response
   * @throws {Error} If the backend request fails
   * 
   * @example
   * ```typescript
   * await errorReporting.reportError({
   *   message: 'Failed to load asset',
   *   stack: error.stack,
   *   url: window.location.href,
   *   userAgent: navigator.userAgent,
   *   timestamp: new Date().toISOString(),
   *   context: { assetId: '123' },
   *   componentStack: '',
   *   userId: user.id,
   *   sessionId: session.id
   * });
   * ```
   * 
   * @public
   */
  public async reportError(errorData: ErrorReport) {
    try {
      // Construct URL - use PUBLIC_API_URL if set, otherwise default to localhost:5555 in dev
      const baseUrl = import.meta.env.PUBLIC_API_URL || 'http://localhost:5555';
      const endpoint = `${baseUrl}/api${this.endpoint}`;

      const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...errorData,
        userId: this.userId,
        sessionId: this.sessionId,
        timestamp: new Date().toISOString()
      })
    });

      if (!response.ok) {
        throw new Error(`Failed to report error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      // Silently fail - don't report errors about error reporting (prevents infinite loops)
      console.warn('[ErrorReporting] Failed to report error to server:', error);
    }
  }

  /**
   * Reports a React error with component stack trace
   * 
   * Specialized error reporting for React component errors caught by
   * Error Boundaries. Includes component stack for easier debugging.
   * 
   * @param error - The error object thrown by React
   * @param errorInfo - React error info with component stack
   * 
   * @example
   * ```typescript
   * class ErrorBoundary extends React.Component {
   *   componentDidCatch(error, errorInfo) {
   *     errorReporting.reportReactError(error, errorInfo);
   *   }
   * }
   * ```
   * 
   * @public
   */
  public reportReactError(error: Error, errorInfo: { componentStack: string }) {
    const errorData: ErrorReport = {
      message: error.message,
      stack: error.stack!,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      context: {
        type: 'react-error'
      },
      componentStack: errorInfo.componentStack,
      userId: this.userId,
      sessionId: this.sessionId
    };

    this.reportError(errorData);
  }

  /**
   * Reports a custom error with additional context
   * 
   * Allows manual error reporting with custom context data.
   * Useful for reporting non-Error conditions or adding custom metadata.
   * 
   * @param message - Error message describing what went wrong
   * @param context - Additional context data (arbitrary object)
   * 
   * @example
   * ```typescript
   * errorReporting.reportCustomError('Failed to connect to server', {
   *   attemptNumber: 3,
   *   serverUrl: wsUrl,
   *   lastError: previousError.message
   * });
   * ```
   * 
   * @public
   */
  public reportCustomError(message: string, context: unknown) {
    const error = new Error(message);
    const errorData: ErrorReport = {
      message: message,
      stack: error.stack!,
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      context: context,
      componentStack: '',
      userId: this.userId,
      sessionId: this.sessionId
    };

    this.reportError(errorData);
  }
}

/**
 * Singleton instance of ErrorReportingService
 * 
 * Use this instance throughout the application for error reporting.
 * Global error handlers are automatically set up on instantiation.
 * 
 * @public
 */
export const errorReportingService = new ErrorReportingService();

/**
 * Alias for errorReportingService (backward compatibility)
 * 
 * @public
 */
export const errorReporting = errorReportingService;