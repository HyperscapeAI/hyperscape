/**
 * Centralized logging configuration
 * Controls what gets logged based on environment and settings
 */

export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
  TRACE = 5
}

export interface LogConfig {
  level: LogLevel;
  enabledSystems: string[];
  disabledSystems: string[];
  enableStackTraces: boolean;
  enableTimestamps: boolean;
}

// Default configuration
const defaultConfig: LogConfig = {
  level: process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.WARN,
  enabledSystems: ['*'], // All systems by default
  disabledSystems: [], // Specific systems to disable
  enableStackTraces: process.env.NODE_ENV === 'development',
  enableTimestamps: true
};

// Global configuration (can be modified at runtime)
let globalConfig: LogConfig = { ...defaultConfig };

/**
 * Update logging configuration
 */
export function configureLogging(config: Partial<LogConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

/**
 * Check if logging is enabled for a system at a level
 */
export function isLoggingEnabled(systemName: string, level: LogLevel): boolean {
  // Check if level is enabled
  if (level > globalConfig.level) {
    return false;
  }
  
  // Check if system is disabled
  if (globalConfig.disabledSystems.includes(systemName)) {
    return false;
  }
  
  // Check if system is enabled (or all systems are enabled)
  return globalConfig.enabledSystems.includes('*') || 
         globalConfig.enabledSystems.includes(systemName);
}

/**
 * Format log message with optional timestamp
 */
export function formatLogMessage(
  systemName: string, 
  level: string, 
  message: string
): string {
  const parts: string[] = [];
  
  if (globalConfig.enableTimestamps) {
    parts.push(new Date().toISOString());
  }
  
  parts.push(`[${systemName}]`);
  parts.push(`${level}:`);
  parts.push(message);
  
  return parts.join(' ');
}

/**
 * Create a no-op logger for production
 */
export const noOpLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  trace: () => {}
};

/**
 * Create a conditional logger that checks if logging is enabled
 */
export function createConditionalLogger(systemName: string) {
  return {
    debug: (message: string, data?: unknown) => {
      if (isLoggingEnabled(systemName, LogLevel.DEBUG)) {
        console.debug(formatLogMessage(systemName, 'DEBUG', message), data);
      }
    },
    info: (message: string, data?: unknown) => {
      if (isLoggingEnabled(systemName, LogLevel.INFO)) {
        console.info(formatLogMessage(systemName, 'INFO', message), data);
      }
    },
    warn: (message: string, data?: unknown) => {
      if (isLoggingEnabled(systemName, LogLevel.WARN)) {
        console.warn(formatLogMessage(systemName, 'WARN', message), data);
      }
    },
    error: (message: string, error?: unknown, data?: unknown) => {
      if (isLoggingEnabled(systemName, LogLevel.ERROR)) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const fullMessage = `${message} - ${errorMessage}`;
        console.error(formatLogMessage(systemName, 'ERROR', fullMessage), data);
        
        if (globalConfig.enableStackTraces && error instanceof Error) {
          console.error(error.stack);
        }
      }
    },
    trace: (message: string, data?: unknown) => {
      if (isLoggingEnabled(systemName, LogLevel.TRACE)) {
        console.trace(formatLogMessage(systemName, 'TRACE', message), data);
      }
    }
  };
}

/**
 * Example usage:
 * 
 * // Disable debug logs in production
 * configureLogging({ level: LogLevel.WARN });
 * 
 * // Disable specific noisy systems
 * configureLogging({ disabledSystems: ['rpg-movement', 'rpg-pathfinding'] });
 * 
 * // Enable only specific systems
 * configureLogging({ enabledSystems: ['rpg-combat', 'rpg-loot'] });
 */