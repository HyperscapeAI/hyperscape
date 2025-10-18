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
 * Default cookie options for authentication
 *
 * - HttpOnly: true (prevents XSS)
 * - Secure: true in production (HTTPS only)
 * - SameSite: strict (prevents CSRF)
 * - MaxAge: 1 hour
 */
export const DEFAULT_AUTH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 60 * 60, // 1 hour in seconds
  path: '/',
};

/**
 * Default cookie options for CSRF tokens
 *
 * - HttpOnly: false (client needs to read this)
 * - Secure: true in production
 * - SameSite: strict
 * - MaxAge: 1 hour
 */
export const DEFAULT_CSRF_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: false, // Client needs to read this for CSRF protection
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 60 * 60, // 1 hour in seconds
  path: '/',
};

/**
 * Register cookie plugin with Fastify
 *
 * @param app - Fastify instance
 */
export async function registerCookies(app: FastifyInstance): Promise<void> {
  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || process.env.JWT_SECRET, // Use for signed cookies (optional)
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
    console.error('[Cookies] Invalid CSRF token provided - cannot set cookie');
    throw new Error('Invalid CSRF token: must be a non-empty string');
  }

  // CSRF tokens should be at least 16 characters for security
  if (token.length < 16) {
    console.error('[Cookies] CSRF token too short - minimum 16 characters');
    throw new Error('CSRF token too short: minimum 16 characters required');
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

  // Session IDs should be at least 16 characters for security
  if (sessionId.length < 16) {
    console.error('[Cookies] Session ID too short - minimum 16 characters');
    throw new Error('Session ID too short: minimum 16 characters required');
  }

  const cookieOptions = { ...DEFAULT_AUTH_COOKIE_OPTIONS, ...options };

  reply.setCookie(COOKIE_NAMES.HYPERSCAPE_SESSION, sessionId, cookieOptions);

  // Don't log the full session ID in production to avoid leaking it
  const maskedSessionId = process.env.NODE_ENV === 'production'
    ? `${sessionId.substring(0, 4)}...${sessionId.substring(sessionId.length - 4)}`
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
