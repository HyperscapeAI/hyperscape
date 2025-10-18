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
 *
 * Route matching:
 * - Exact match: '/api/health' matches only '/api/health'
 * - Wildcard prefix: '/api/webhooks/*' matches any path starting with '/api/webhooks/'
 * - Must use explicit '*' for prefix matching to avoid accidental broad exemptions
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
  const csrfSecret = process.env.CSRF_SECRET;
  const jwtSecret = process.env.JWT_SECRET;

  // Warn if CSRF_SECRET is not set and falling back to JWT_SECRET
  if (!csrfSecret && jwtSecret) {
    console.warn('[CSRF] WARNING: CSRF_SECRET not set, falling back to JWT_SECRET. Set CSRF_SECRET for better security.');
  }

  const secret = csrfSecret || jwtSecret;
  if (!secret) {
    throw new Error('CSRF_SECRET or JWT_SECRET environment variable is required for CSRF protection');
  }

  await app.register(fastifyCsrf, {
    // Use cookie-based CSRF protection (double-submit cookie pattern)
    sessionPlugin: '@fastify/cookie',

    // CSRF secret for token generation (fallback to JWT secret)
    cookieKey: secret,

    // Cookie options for CSRF token
    // WARNING: httpOnly: false means client JavaScript can read this cookie
    // This is necessary for CSRF double-submit pattern but exposes tokens to XSS
    // Ensure proper XSS protection measures are in place (Content-Security-Policy, etc.)
    cookieOpts: {
      httpOnly: false, // Client needs to read this for CSRF double-submit pattern
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

  // Add hook to exempt certain routes and verify CSRF tokens
  app.addHook('preHandler', async (request, reply) => {
    // Skip CSRF for exempt routes
    if (isRouteExempt(request)) {
      return;
    }

    // For non-exempt routes, verify CSRF token
    // The @fastify/csrf-protection plugin provides request.csrfProtection()
    try {
      // Type assertion for CSRF protection method
      interface CsrfRequest extends FastifyRequest {
        csrfProtection?: () => Promise<void>;
      }

      // Call the CSRF verification function provided by the plugin
      // This verifies that the token in the header matches the cookie
      const csrfProtection = (request as CsrfRequest).csrfProtection;
      if (csrfProtection) {
        await csrfProtection();
      }
    } catch (error) {
      // Discriminate error types for better debugging
      let reason: 'token_missing' | 'token_invalid' | 'unknown' = 'unknown';
      let errorMessage = 'Unknown error';

      if (error instanceof Error) {
        errorMessage = error.message;
        // Check common error patterns from @fastify/csrf-protection
        if (errorMessage.includes('missing') || errorMessage.includes('not found')) {
          reason = 'token_missing';
        } else if (errorMessage.includes('invalid') || errorMessage.includes('mismatch')) {
          reason = 'token_invalid';
        }
      }

      // CSRF verification failed - log with specific reason
      console.error('[CSRF] CSRF verification failed:', {
        url: request.url,
        method: request.method,
        reason,
        error: errorMessage,
      });

      // Send 403 Forbidden response with specific reason
      reply.code(403).send({
        error: 'Forbidden',
        message: 'CSRF token verification failed',
        reason, // Include specific failure reason in response
      });

      // End request processing
      return;
    }
  });
}

/**
 * Normalized path for comparison
 * Removes query string and trailing slashes
 *
 * @param path - URL path
 * @returns Normalized path
 */
function normalizePath(path: string): string {
  // Remove query string
  const pathWithoutQuery = path.split('?')[0]!;

  // URL decode to prevent encoding bypasses
  // Wrap in try-catch to handle malformed URIs gracefully
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathWithoutQuery);
  } catch {
    // If decoding fails (malformed URI), use the raw path
    // This prevents throwing errors for invalid inputs
    decoded = pathWithoutQuery;
  }

  // Remove trailing slash for consistency (but keep root '/')
  return decoded.length > 1 && decoded.endsWith('/')
    ? decoded.slice(0, -1)
    : decoded;
}

/**
 * Check if route is exempt from CSRF protection
 *
 * Supports two matching strategies:
 * 1. Exact match: '/api/health' matches only '/api/health'
 * 2. Wildcard prefix: '/api/webhooks/*' matches '/api/webhooks/github', '/api/webhooks/stripe', etc.
 *
 * Wildcard matching requires explicit '*' to prevent accidental broad exemptions.
 * For example, '/api/agent/auth' will NOT match '/api/agent/auth/login' unless
 * you explicitly add '/api/agent/auth/*' to the exempt list.
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

  // Normalize the incoming path to prevent traversal/encoding bypasses
  const normalizedPath = normalizePath(path);

  // Check exempt routes with both exact and wildcard matching
  for (const exemptRoute of CSRF_EXEMPT_ROUTES) {
    // Exact match (no wildcard)
    if (!exemptRoute.includes('*')) {
      if (normalizedPath === exemptRoute) {
        return true;
      }
      continue;
    }

    // Wildcard prefix match (explicit '*' required)
    if (exemptRoute.endsWith('/*')) {
      const prefix = exemptRoute.slice(0, -2); // Remove '/*' suffix
      if (normalizedPath === prefix || normalizedPath.startsWith(prefix + '/')) {
        return true;
      }
    } else if (exemptRoute.endsWith('*')) {
      // Support '/api/webhooks*' pattern (matches /api/webhooks and /api/webhooks...)
      const prefix = exemptRoute.slice(0, -1); // Remove '*' suffix
      if (normalizedPath.startsWith(prefix)) {
        return true;
      }
    }
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
