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
 * Key generator function that throws when IP is missing
 * This ensures rate limiting cannot be bypassed by clients without IP addresses
 */
function safeKeyGenerator(request: FastifyRequest): string {
  if (!request.ip) {
    throw new Error('Rate limiting requires IP address - request.ip is missing');
  }
  return request.ip;
}

/**
 * Rate limit configuration for authentication endpoints
 */
export const AUTH_RATE_LIMIT_CONFIG = {
  // Time window in milliseconds (default: 15 minutes)
  timeWindow: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,

  // Maximum requests per window (default: 5)
  max: Number(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 5,

  // Use IP address as key - throw if missing to prevent bypass
  keyGenerator: safeKeyGenerator,

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
  keyGenerator: safeKeyGenerator,
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
  keyGenerator: safeKeyGenerator,
  errorResponseBuilder: () => ({
    error: 'Too Many Requests',
    message: 'This operation is rate limited. Please try again later.',
    statusCode: 429,
  }),
};

/**
 * Register rate limiting middleware with Fastify
 *
 * This sets up per-route rate limiting (global: false).
 * Individual routes must opt-in by specifying rate limit config.
 *
 * @param app - Fastify instance
 */
export async function registerRateLimiting(app: FastifyInstance): Promise<void> {
  await app.register(fastifyRateLimit, {
    global: false, // Per-route rate limiting - routes must opt-in
    max: API_RATE_LIMIT_CONFIG.max,
    timeWindow: API_RATE_LIMIT_CONFIG.timeWindow,
    errorResponseBuilder: API_RATE_LIMIT_CONFIG.errorResponseBuilder,
    keyGenerator: safeKeyGenerator,
  });

  console.log('[RateLimit] Per-route rate limiting registered (global: false):', {
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
