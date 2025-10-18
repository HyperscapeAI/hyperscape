/**
 * Rate Limiting Middleware (Fastify)
 *
 * Protects authentication endpoints from brute force attacks and abuse.
 * Implements sliding window rate limiting with configurable limits.
 *
 * Security Features:
 * - IP-based rate limiting
 * - Configurable time windows
 * - Standard headers (RateLimit-*)
 * - Custom error messages
 *
 * Configuration:
 * Set these environment variables to customize rate limits:
 * - AUTH_RATE_LIMIT_WINDOW_MS: Time window in milliseconds (default: 15 minutes)
 * - AUTH_RATE_LIMIT_MAX_REQUESTS: Max requests per window (default: 5)
 *
 * Usage:
 * ```typescript
 * import { registerRateLimiting } from './middleware/rate-limit';
 *
 * // Register rate limiting plugin
 * await app.register(registerRateLimiting);
 * ```
 *
 * @see https://github.com/fastify/fastify-rate-limit
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';

/**
 * Rate limit configuration for authentication endpoints
 */
export const AUTH_RATE_LIMIT_CONFIG = {
  // Time window in milliseconds (default: 15 minutes)
  timeWindow: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,

  // Maximum requests per window (default: 5)
  max: Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 5,

  // Use IP address as key
  keyGenerator: (request: FastifyRequest) => request.ip ?? 'unknown',

  // Error response when limit exceeded
  errorResponseBuilder: () => ({
    error: 'Too Many Requests',
    message: 'Too many authentication attempts from this IP. Please try again later.',
    statusCode: 429,
  }),
};

/**
 * Rate limit configuration for general API endpoints
 */
export const API_RATE_LIMIT_CONFIG = {
  timeWindow: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  keyGenerator: (request: FastifyRequest) => request.ip ?? 'unknown',
  errorResponseBuilder: () => ({
    error: 'Too Many Requests',
    message: 'You have exceeded the rate limit. Please slow down.',
    statusCode: 429,
  }),
};

/**
 * Rate limit configuration for strict/sensitive operations
 */
export const STRICT_RATE_LIMIT_CONFIG = {
  timeWindow: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 requests per hour
  keyGenerator: (request: FastifyRequest) => request.ip ?? 'unknown',
  errorResponseBuilder: () => ({
    error: 'Too Many Requests',
    message: 'This operation is rate limited. Please try again later.',
    statusCode: 429,
  }),
};

/**
 * Register rate limiting middleware with Fastify
 *
 * This sets up global rate limiting for the entire server.
 * Individual routes can override with route-specific limits.
 *
 * @param app - Fastify instance
 */
export async function registerRateLimiting(app: FastifyInstance): Promise<void> {
  await app.register(fastifyRateLimit, {
    global: false, // Don't apply globally, let routes opt-in
    max: API_RATE_LIMIT_CONFIG.max,
    timeWindow: API_RATE_LIMIT_CONFIG.timeWindow,
    errorResponseBuilder: API_RATE_LIMIT_CONFIG.errorResponseBuilder,
    keyGenerator: (request: FastifyRequest) => request.ip ?? 'unknown',
  });

  console.log('[RateLimit] Rate limiting registered:', {
    timeWindow: API_RATE_LIMIT_CONFIG.timeWindow / 1000 / 60 + ' minutes',
    max: API_RATE_LIMIT_CONFIG.max,
  });
}

/**
 * Helper to create rate limit options for a route
 *
 * @param type - 'auth', 'api', or 'strict'
 * @returns Rate limit configuration object
 */
export function getRateLimitConfig(type: 'auth' | 'api' | 'strict') {
  switch (type) {
    case 'auth':
      return AUTH_RATE_LIMIT_CONFIG;
    case 'strict':
      return STRICT_RATE_LIMIT_CONFIG;
    case 'api':
    default:
      return API_RATE_LIMIT_CONFIG;
  }
}
