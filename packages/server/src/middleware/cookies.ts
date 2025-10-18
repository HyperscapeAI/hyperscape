/**
 * Cookie Middleware (Fastify)
 *
 * Handles secure cookie management for authentication tokens.
 * Implements HttpOnly cookies to protect against XSS attacks.
 *
 * Security Features:
 * - HttpOnly flag (prevents JavaScript access)
 * - Secure flag (HTTPS only in production)
 * - SameSite=Strict (CSRF protection)
 * - Configurable expiration
 *
 * Cookie Types:
 * - privy-id-token: Identity token from Privy (HttpOnly)
 * - csrf-token: CSRF protection token (readable by client)
 * - hyperscape-session: Server session ID (HttpOnly)
 *
 * Usage:
 * ```typescript
 * import { registerCookies, setAuthCookie, getAuthCookie } from './middleware/cookies';
 *
 * // Register cookie plugin
 * await app.register(registerCookies);
 *
 * // In route handler
 * setAuthCookie(reply, identityToken);
 * const token = getAuthCookie(request);
 * ```
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { COOKIE_SECURITY } from '../config/security';

/**
 * Cookie names used in the application
 */
export const COOKIE_NAMES = {
  /** Privy identity token (HttpOnly, secure) */
  PRIVY_ID_TOKEN: 'privy-id-token',

  /** CSRF protection token (readable by client) */
  CSRF_TOKEN: 'csrf-token',

  /** Server session ID (HttpOnly, secure) */
  HYPERSCAPE_SESSION: 'hyperscape-session',
} as const;

/**
 * Cookie configuration options (Fastify format)
 */
interface CookieOptions {
  /** Whether cookie is accessible only via HTTP (not JavaScript) */
  httpOnly?: boolean;

  /** Whether cookie should only be sent over HTTPS */
  secure?: boolean;

  /** SameSite policy */
  sameSite?: 'strict' | 'lax' | 'none' | boolean;

  /** Maximum age in seconds (Note: Fastify uses seconds, not milliseconds) */
  maxAge?: number;

  /** Cookie path */
  path?: string;

  /** Cookie domain */
  domain?: string;
}

/**
 * Parse maxAge from environment variable with safe fallback
 */
function parseMaxAgeFromEnv(envVar: string | undefined, defaultValue: number): number {
  if (!envVar) {
    return defaultValue;
  }
  const parsed = parseInt(envVar, 10);
  if (isNaN(parsed) || parsed <= 0) {
    console.warn(`[Cookies] Invalid maxAge value "${envVar}", using default ${defaultValue}`);
    return defaultValue;
  }
  return parsed;
}

/**
 * Default cookie options for authentication
 *
 * - HttpOnly: true (prevents XSS)
 * - Secure: true in production (HTTPS only)
 * - SameSite: strict (prevents CSRF)
 * - MaxAge: configurable via AUTH_COOKIE_MAX_AGE_SECONDS (default: 3600 seconds)
 */
export const DEFAULT_AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: parseMaxAgeFromEnv(process.env.AUTH_COOKIE_MAX_AGE_SECONDS, 3600), // Default: 1 hour
  path: '/',
};

/**
 * Default cookie options for CSRF tokens
 *
 * - HttpOnly: false (client needs to read this)
 * - Secure: true in production
 * - SameSite: strict
 * - MaxAge: configurable via CSRF_COOKIE_MAX_AGE_SECONDS (default: 3600 seconds)
 */
export const DEFAULT_CSRF_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: false, // Client needs to read this for CSRF protection
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: parseMaxAgeFromEnv(process.env.CSRF_COOKIE_MAX_AGE_SECONDS, 3600), // Default: 1 hour
  path: '/',
};

/**
 * Register cookie plugin with Fastify
 *
 * @param app - Fastify instance
 */
export async function registerCookies(app: FastifyInstance): Promise<void> {
  const cookieSecret = process.env.COOKIE_SECRET;
  const jwtSecret = process.env.JWT_SECRET;

  // In production, require COOKIE_SECRET to be set and different from JWT_SECRET
  if (process.env.NODE_ENV === 'production') {
    if (!cookieSecret) {
      throw new Error('COOKIE_SECRET environment variable is required in production');
    }
    if (cookieSecret === jwtSecret) {
      throw new Error('COOKIE_SECRET must be different from JWT_SECRET in production for security');
    }
  } else {
    // In development, allow fallback but warn
    if (!cookieSecret) {
      console.warn('[Cookies] WARNING: COOKIE_SECRET not set, falling back to JWT_SECRET (not recommended for production)');
    } else if (cookieSecret === jwtSecret) {
      console.warn('[Cookies] WARNING: COOKIE_SECRET equals JWT_SECRET (use different secrets in production)');
    }
  }

  const secret = cookieSecret || jwtSecret;
  if (!secret) {
    throw new Error('COOKIE_SECRET or JWT_SECRET environment variable is required for cookie signing');
  }

  await app.register(fastifyCookie, {
    secret, // Use for signed cookies (optional)
    parseOptions: {}, // Options for cookie parsing
  });

  console.log('[Cookies] Cookie plugin registered');
}

/**
 * Set authentication cookie with Privy identity token
 *
 * @param reply - Fastify reply object
 * @param token - Privy identity token (JWT)
 * @param options - Optional cookie configuration
 */
export function setAuthCookie(
  reply: FastifyReply,
  token: string,
  options: CookieOptions = {}
): void {
  // Validate token before setting
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    console.error('[Cookies] Invalid auth token provided - cannot set cookie');
    throw new Error('Invalid auth token: must be a non-empty string');
  }

  // Basic JWT format validation (should have 3 parts separated by dots)
  const jwtParts = token.split('.');
  if (jwtParts.length !== 3 || jwtParts.some(part => part.length === 0)) {
    console.error('[Cookies] Invalid JWT format - expected 3 parts');
    throw new Error('Invalid JWT format');
  }

  const cookieOptions = { ...DEFAULT_AUTH_COOKIE_OPTIONS, ...options };

  reply.setCookie(COOKIE_NAMES.PRIVY_ID_TOKEN, token, cookieOptions);

  console.log('[Cookies] Set authentication cookie:', {
    name: COOKIE_NAMES.PRIVY_ID_TOKEN,
    httpOnly: cookieOptions.httpOnly,
    secure: cookieOptions.secure,
    sameSite: cookieOptions.sameSite,
    maxAge: cookieOptions.maxAge,
  });
}

/**
 * Get authentication cookie from request
 *
 * @param request - Fastify request object
 * @returns Identity token or null if not found
 */
export function getAuthCookie(request: FastifyRequest): string | null {
  const token = request.cookies[COOKIE_NAMES.PRIVY_ID_TOKEN];
  return token || null;
}

/**
 * Clear authentication cookie (logout)
 *
 * @param reply - Fastify reply object
 */
export function clearAuthCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAMES.PRIVY_ID_TOKEN, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });

  console.log('[Cookies] Cleared authentication cookie');
}

/**
 * Set CSRF token cookie
 *
 * @param reply - Fastify reply object
 * @param token - CSRF token
 * @param options - Optional cookie configuration
 */
export function setCsrfCookie(
  reply: FastifyReply,
  token: string,
  options: CookieOptions = {}
): void {
  // Validate CSRF token before setting
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    throw new Error('Invalid CSRF token: must be a non-empty string');
  }

  // CSRF tokens should be at least MIN_TOKEN_LENGTH characters for security
  if (token.length < COOKIE_SECURITY.MIN_TOKEN_LENGTH) {
    throw new Error(`CSRF token too short: minimum ${COOKIE_SECURITY.MIN_TOKEN_LENGTH} characters required`);
  }

  const cookieOptions = { ...DEFAULT_CSRF_COOKIE_OPTIONS, ...options };

  reply.setCookie(COOKIE_NAMES.CSRF_TOKEN, token, cookieOptions);

  console.log('[Cookies] Set CSRF token cookie');
}

/**
 * Get CSRF token from request
 *
 * @param request - Fastify request object
 * @returns CSRF token or null if not found
 */
export function getCsrfCookie(request: FastifyRequest): string | null {
  return request.cookies[COOKIE_NAMES.CSRF_TOKEN] || null;
}

/**
 * Clear CSRF token cookie
 *
 * @param reply - Fastify reply object
 */
export function clearCsrfCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAMES.CSRF_TOKEN, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });

  console.log('[Cookies] Cleared CSRF cookie');
}

/**
 * Set session cookie
 *
 * @param reply - Fastify reply object
 * @param sessionId - Unique session identifier
 * @param options - Optional cookie configuration
 */
export function setSessionCookie(
  reply: FastifyReply,
  sessionId: string,
  options: CookieOptions = {}
): void {
  // Validate session ID before setting
  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    console.error('[Cookies] Invalid session ID provided - cannot set cookie');
    throw new Error('Invalid session ID: must be a non-empty string');
  }

  // Session IDs should be at least MIN_SESSION_ID_LENGTH characters for security
  if (sessionId.length < COOKIE_SECURITY.MIN_SESSION_ID_LENGTH) {
    console.error(`[Cookies] Session ID too short - minimum ${COOKIE_SECURITY.MIN_SESSION_ID_LENGTH} characters`);
    throw new Error(`Session ID too short: minimum ${COOKIE_SECURITY.MIN_SESSION_ID_LENGTH} characters required`);
  }

  const cookieOptions = { ...DEFAULT_AUTH_COOKIE_OPTIONS, ...options };

  reply.setCookie(COOKIE_NAMES.HYPERSCAPE_SESSION, sessionId, cookieOptions);

  // Don't log the full session ID in production to avoid leaking it
  const maskedSessionId = process.env.NODE_ENV === 'production'
    ? `${sessionId.substring(0, COOKIE_SECURITY.SESSION_ID_MASK_PREFIX_LENGTH)}...${sessionId.substring(sessionId.length - COOKIE_SECURITY.SESSION_ID_MASK_SUFFIX_LENGTH)}`
    : sessionId;

  console.log('[Cookies] Set session cookie:', maskedSessionId);
}

/**
 * Get session cookie from request
 *
 * @param request - Fastify request object
 * @returns Session ID or null if not found
 */
export function getSessionCookie(request: FastifyRequest): string | null {
  return request.cookies[COOKIE_NAMES.HYPERSCAPE_SESSION] || null;
}

/**
 * Clear session cookie
 *
 * @param reply - Fastify reply object
 */
export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAMES.HYPERSCAPE_SESSION, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  });

  console.log('[Cookies] Cleared session cookie');
}

/**
 * Clear all authentication-related cookies
 *
 * @param reply - Fastify reply object
 */
export function clearAllAuthCookies(reply: FastifyReply): void {
  clearAuthCookie(reply);
  clearCsrfCookie(reply);
  clearSessionCookie(reply);

  console.log('[Cookies] Cleared all authentication cookies');
}

/**
 * Parse cookie string into key-value pairs
 *
 * This utility function parses raw cookie headers (e.g., from WebSocket upgrade requests)
 * into a structured object. Used for manual cookie parsing when Fastify's cookie
 * parser is not available.
 *
 * @param cookieHeader - Raw cookie header string (e.g., "name=value; foo=bar")
 * @returns Object with cookie key-value pairs
 *
 * @example
 * ```typescript
 * const cookies = parseCookieString('privy-id-token=abc123; csrf-token=xyz789');
 * console.log(cookies['privy-id-token']); // 'abc123'
 * console.log(cookies['csrf-token']); // 'xyz789'
 * ```
 */
export function parseCookieString(cookieHeader: string): Record<string, string> {
  return cookieHeader.split(';').reduce((acc, cookie) => {
    const trimmed = cookie.trim();
    const equalsIndex = trimmed.indexOf('=');

    if (equalsIndex === -1) {
      // No '=' found - treat as key with empty value
      if (trimmed) {
        acc[trimmed] = '';
      }
    } else {
      // Split on first '=' only (limit 2)
      const key = trimmed.substring(0, equalsIndex);
      const value = trimmed.substring(equalsIndex + 1);

      if (key) {
        try {
          acc[key] = decodeURIComponent(value);
        } catch {
          // If decodeURIComponent fails, use raw value
          acc[key] = value;
        }
      }
    }

    return acc;
  }, {} as Record<string, string>);
}
