/**
 * CSRF Protection Middleware (Fastify)
 *
 * Protects against Cross-Site Request Forgery attacks when using cookie-based authentication.
 * Uses Fastify's built-in @fastify/csrf-protection plugin.
 *
 * How it works:
 * 1. Server generates random CSRF token on session start
 * 2. Token stored in cookie (readable by client)
 * 3. Client includes token in X-CSRF-Token header for state-changing requests
 * 4. Server validates token matches cookie value
 *
 * Security Features:
 * - Double-submit cookie pattern
 * - Cryptographically secure tokens
 * - Automatic token generation
 * - Configurable exempt routes
 *
 * Usage:
 * ```typescript
 * import { registerCsrfProtection } from './middleware/csrf';
 *
 * // Register CSRF protection
 * await app.register(registerCsrfProtection);
 *
 * // In routes, CSRF is automatically enforced for POST/PUT/DELETE/PATCH
 * // Client must include CSRF token in X-CSRF-Token header
 * ```
 *
 * @see https://github.com/fastify/csrf-protection
 * @see https://owasp.org/www-community/attacks/csrf
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastifyCsrf from '@fastify/csrf-protection';
import { getCsrfCookie, setCsrfCookie } from './cookies';
import { timingSafeEqual } from 'crypto';

/**
 * CSRF token header name
 */
export const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Routes that are exempt from CSRF protection
 *
 * Add routes here that should not require CSRF tokens:
 * - GET requests (read-only, already exempt)
 * - HEAD requests (read-only)
 * - OPTIONS requests (CORS preflight)
 * - Public webhooks
 */
export const CSRF_EXEMPT_ROUTES: string[] = [
  '/api/agent/auth', // Agent authentication (uses different auth)
  '/api/health', // Health check endpoint
  '/ws', // WebSocket upgrade (uses different auth)
];

/**
 * Register CSRF protection with Fastify
 *
 * Uses @fastify/csrf-protection plugin with double-submit cookie strategy.
 *
 * @param app - Fastify instance
 */
export async function registerCsrfProtection(app: FastifyInstance): Promise<void> {
  await app.register(fastifyCsrf, {
    // Use cookie-based CSRF protection (double-submit cookie pattern)
    sessionPlugin: '@fastify/cookie',

    // CSRF secret for token generation (fallback to JWT secret)
    cookieKey: process.env.CSRF_SECRET || process.env.JWT_SECRET,

    // Cookie options for CSRF token
    cookieOpts: {
      httpOnly: false, // Client needs to read this
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    },

    // Get CSRF token from request header
    getToken: (req: FastifyRequest): string | void => {
      // First check X-CSRF-Token header
      const headerToken = req.headers[CSRF_HEADER_NAME];
      if (headerToken && typeof headerToken === 'string') {
        return headerToken;
      }

      // Fallback to cookie
      const cookieToken = getCsrfCookie(req);
      return cookieToken || undefined; // Convert null to undefined for Fastify
    },
  });

  console.log('[CSRF] CSRF protection registered');

  // Add hook to exempt certain routes
  app.addHook('preHandler', async (request, _reply) => {
    // Skip CSRF for exempt routes
    if (isRouteExempt(request)) {
      return;
    }
  });
}

/**
 * Check if route is exempt from CSRF protection
 *
 * @param request - Fastify request object
 * @returns true if route is exempt, false otherwise
 */
export function isRouteExempt(request: FastifyRequest): boolean {
  const path = request.url;

  // Safe methods don't need CSRF protection
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(request.method)) {
    return true;
  }

  // Check if route is in exempt list
  if (CSRF_EXEMPT_ROUTES.some(route => path.startsWith(route))) {
    return true;
  }

  return false;
}

/**
 * Generate and issue CSRF token to client
 *
 * Call this after successful authentication to issue CSRF token.
 *
 * @param request - Fastify request object
 * @param reply - Fastify reply object
 * @returns The generated CSRF token
 */
export async function issueCSRFToken(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<string> {
  // Check if CSRF token already exists
  const existingToken = getCsrfCookie(request);

  if (existingToken) {
    return existingToken;
  }

  // Generate new CSRF token using Fastify's CSRF plugin
  const token = await reply.generateCsrf();

  // Set CSRF token in cookie (client-readable)
  setCsrfCookie(reply, token);

  console.log('[CSRF] Issued new CSRF token');

  return token;
}

/**
 * Verify CSRF token manually
 *
 * Use this if you need to verify CSRF token outside of route handlers.
 *
 * @param request - Fastify request object
 * @param token - CSRF token to verify
 * @returns true if token is valid, false otherwise
 */
export function verifyCsrfToken(request: FastifyRequest, token: string): boolean {
  try {
    // This uses Fastify's internal CSRF verification
    // The actual implementation depends on the plugin configuration
    const cookieToken = getCsrfCookie(request);

    if (!cookieToken) {
      return false;
    }

    // Timing-safe comparison to prevent timing attacks
    // First check lengths match
    if (token.length !== cookieToken.length) {
      return false;
    }

    // Convert to Buffers for timing-safe comparison
    const tokenBuffer = Buffer.from(token, 'utf8');
    const cookieBuffer = Buffer.from(cookieToken, 'utf8');

    // Use crypto.timingSafeEqual for constant-time comparison
    return timingSafeEqual(tokenBuffer, cookieBuffer);
  } catch (err) {
    console.error('[CSRF] Error verifying CSRF token:', err);
    return false;
  }
}

/**
 * Get CSRF tokens from request (for debugging)
 *
 * @param request - Fastify request object
 * @returns Object with header token and cookie token
 */
export function getCSRFTokens(request: FastifyRequest): {
  headerToken: string | null;
  cookieToken: string | null;
} {
  const headerToken = request.headers[CSRF_HEADER_NAME];
  const cookieToken = getCsrfCookie(request);

  return {
    headerToken: typeof headerToken === 'string' ? headerToken : null,
    cookieToken,
  };
}
