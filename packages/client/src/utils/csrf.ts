/**
 * CSRF Token Utilities
 *
 * Client-side utilities for handling CSRF (Cross-Site Request Forgery) protection.
 * Works with the server's CSRF middleware to protect state-changing requests.
 *
 * Usage:
 * ```typescript
 * import { getCsrfTokenFromCookie, addCsrfHeader } from './utils/csrf';
 *
 * // Get CSRF token from cookie
 * const csrfToken = getCsrfTokenFromCookie();
 *
 * // Make authenticated request with CSRF protection
 * const response = await fetch('/api/endpoint', {
 *   method: 'POST',
 *   credentials: 'include', // Include HttpOnly cookies
 *   ...addCsrfHeader({
 *     headers: {
 *       'Content-Type': 'application/json',
 *     },
 *     body: JSON.stringify(data),
 *   }),
 * });
 * ```
 */

/**
 * Fetch request initialization options
 *
 * Type-safe wrapper for fetch API options.
 * We define our own interface using string literals to avoid ESLint no-undef warnings
 * while maintaining type safety with the browser fetch API.
 */
interface FetchOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
  credentials?: 'include' | 'omit' | 'same-origin'
  cache?: 'default' | 'no-store' | 'reload' | 'no-cache' | 'force-cache' | 'only-if-cached'
  mode?: 'cors' | 'no-cors' | 'same-origin' | 'navigate'
  redirect?: 'follow' | 'error' | 'manual'
  referrer?: string
  referrerPolicy?: 'no-referrer' | 'no-referrer-when-downgrade' | 'origin' | 'origin-when-cross-origin' | 'same-origin' | 'strict-origin' | 'strict-origin-when-cross-origin' | 'unsafe-url'
  integrity?: string
  keepalive?: boolean
  signal?: { aborted: boolean; addEventListener: (type: string, listener: () => void) => void }
}

/**
 * Get CSRF token from cookie
 *
 * Parses document.cookie to extract the CSRF token.
 * The token is set by the server after successful authentication.
 *
 * @returns CSRF token or null if not found
 */
export function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') {
    return null; // Not in browser environment
  }

  const cookies = document.cookie.split(';');
  const csrfCookie = cookies.find(c => c.trim().startsWith('csrf-token='));

  if (!csrfCookie) {
    return null;
  }

  const value = csrfCookie.split('=')[1];
  return value ? decodeURIComponent(value.trim()) : null;
}

/**
 * Add CSRF token to fetch request options
 *
 * Automatically adds the X-CSRF-Token header to request options.
 * The token is read from the cookie set by the server.
 *
 * @param options - Fetch request options (optional)
 * @returns Updated request options with CSRF header
 *
 * @example
 * ```typescript
 * const response = await fetch('/api/endpoint', addCsrfHeader({
 *   method: 'POST',
 *   body: JSON.stringify(data),
 * }));
 * ```
 */
export function addCsrfHeader(options: FetchOptions = {}): FetchOptions {
  const csrfToken = getCsrfTokenFromCookie();

  if (!csrfToken) {
    console.warn('[CSRF] No CSRF token found in cookies - request may fail');
    return options;
  }

  return {
    ...options,
    headers: {
      ...options.headers,
      'X-CSRF-Token': csrfToken,
    },
  };
}

/**
 * Check if CSRF token exists in cookies
 *
 * @returns true if CSRF token is present, false otherwise
 */
export function hasCsrfToken(): boolean {
  return getCsrfTokenFromCookie() !== null;
}

/**
 * Make a CSRF-protected fetch request
 *
 * Wrapper around fetch that automatically includes:
 * - credentials: 'include' (for HttpOnly cookies)
 * - X-CSRF-Token header (from cookie)
 *
 * @param url - Request URL
 * @param options - Fetch request options
 * @returns Fetch promise
 *
 * @example
 * ```typescript
 * const response = await csrfFetch('/api/endpoint', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify(data),
 * });
 * ```
 */
export async function csrfFetch(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const csrfOptions: FetchOptions = {
    ...addCsrfHeader(options),
    credentials: 'include', // Always include cookies
  };

  // Cast to unknown first, then to the global RequestInit type
  // This maintains type safety while working with the browser fetch API
  return fetch(url, csrfOptions as unknown as globalThis.RequestInit);
}

/**
 * Parse all cookies from document.cookie into key-value object
 *
 * @returns Object with cookie names as keys and values as values
 */
export function parseCookies(): Record<string, string> {
  if (typeof document === 'undefined') {
    return {};
  }

  return document.cookie.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key && value) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {} as Record<string, string>);
}

/**
 * Get a specific cookie value by name
 *
 * @param name - Cookie name
 * @returns Cookie value or null if not found
 */
export function getCookie(name: string): string | null {
  const cookies = parseCookies();
  return cookies[name] || null;
}
