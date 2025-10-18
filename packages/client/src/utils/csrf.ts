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

  const firstEqualIndex = csrfCookie.indexOf('=');
  if (firstEqualIndex === -1) {
    return null;
  }

  const value = csrfCookie.slice(firstEqualIndex + 1).trim();
  return value ? decodeURIComponent(value) : null;
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
export function addCsrfHeader(options: RequestInit = {}): RequestInit {
  const csrfToken = getCsrfTokenFromCookie();

  if (!csrfToken) {
    console.warn('[CSRF] No CSRF token found in cookies - request may fail');
    return options;
  }

  return {
    ...options,
    headers: {
      ...(options.headers as Record<string, string> | undefined),
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
  options: RequestInit = {}
): Promise<Response> {
  const csrfOptions: RequestInit = {
    ...addCsrfHeader(options),
    credentials: 'include', // Always include cookies
  };

  return fetch(url, csrfOptions);
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
    const firstEqualIndex = cookie.indexOf('=');
    if (firstEqualIndex === -1) {
      return acc;
    }

    const key = cookie.slice(0, firstEqualIndex).trim();
    const value = cookie.slice(firstEqualIndex + 1).trim();
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
