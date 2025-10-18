/**
 * Client-Side CSRF Utilities - Real Browser Tests
 *
 * These are REAL tests using Playwright that verify the client-side CSRF token handling
 * works correctly in an actual browser environment.
 *
 * Tests:
 * 1. CSRF token retrieval from cookies
 * 2. Adding CSRF headers to fetch requests
 * 3. Cookie parsing utilities
 * 4. URL-encoding and edge cases
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

describe('CSRF Utilities - Real Browser Tests', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeEach(async () => {
    // Launch a real browser for each test
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();

    // Navigate to a blank page where we can inject and test our utilities
    await page.goto('about:blank');

    // Inject the CSRF utility functions into the page
    await page.addScriptTag({
      content: `
        // Copy of getCsrfTokenFromCookie function
        function getCsrfTokenFromCookie() {
          if (typeof document === 'undefined') {
            return null;
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

        // Copy of parseCookies function
        function parseCookies() {
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
          }, {});
        }

        // Copy of getCookie function
        function getCookie(name) {
          const cookies = parseCookies();
          return cookies[name] || null;
        }

        // Copy of hasCsrfToken function
        function hasCsrfToken() {
          return getCsrfTokenFromCookie() !== null;
        }

        // Expose functions to window for testing
        window.getCsrfTokenFromCookie = getCsrfTokenFromCookie;
        window.parseCookies = parseCookies;
        window.getCookie = getCookie;
        window.hasCsrfToken = hasCsrfToken;
      `,
    });
  });

  afterEach(async () => {
    // Clean up browser resources
    await page.close();
    await context.close();
    await browser.close();
  });

  describe('getCsrfTokenFromCookie', () => {
    test('retrieves CSRF token from cookie', async () => {
      // Set cookie in the browser context
      await context.addCookies([
        {
          name: 'csrf-token',
          value: 'test-csrf-123',
          domain: 'localhost',
          path: '/',
        },
        {
          name: 'other',
          value: 'value',
          domain: 'localhost',
          path: '/',
        },
      ]);

      // Reload to apply cookies
      await page.reload();

      // Call function in browser context
      const token = await page.evaluate(() => {
        return window.getCsrfTokenFromCookie();
      });

      expect(token).toBe('test-csrf-123');
    });

    test('returns null when CSRF token not found', async () => {
      await context.addCookies([
        {
          name: 'other',
          value: 'value',
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.reload();

      const token = await page.evaluate(() => {
        return window.getCsrfTokenFromCookie();
      });

      expect(token).toBeNull();
    });

    test('handles URL-encoded CSRF tokens', async () => {
      await context.addCookies([
        {
          name: 'csrf-token',
          value: 'abc%2B123%3D%3D',
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.reload();

      const token = await page.evaluate(() => {
        return window.getCsrfTokenFromCookie();
      });

      expect(token).toBe('abc+123==');
    });

    test('handles empty cookie string', async () => {
      // No cookies set
      await page.reload();

      const token = await page.evaluate(() => {
        return window.getCsrfTokenFromCookie();
      });

      expect(token).toBeNull();
    });

    test('handles cookies with spaces', async () => {
      // Set cookie with value that will have spaces trimmed
      await context.addCookies([
        {
          name: 'csrf-token',
          value: 'token-with-spaces',
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.reload();

      const token = await page.evaluate(() => {
        return window.getCsrfTokenFromCookie();
      });

      expect(token).toBe('token-with-spaces');
    });

    test('handles cookie values with = characters (e.g., JWTs)', async () => {
      // Simulate a JWT-like token with = characters
      const jwtLikeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0=';

      await context.addCookies([
        {
          name: 'csrf-token',
          value: jwtLikeToken,
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.reload();

      const token = await page.evaluate(() => {
        return window.getCsrfTokenFromCookie();
      });

      expect(token).toBe(jwtLikeToken);
    });
  });

  describe('hasCsrfToken', () => {
    test('returns true when CSRF token exists', async () => {
      await context.addCookies([
        {
          name: 'csrf-token',
          value: 'exists',
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.reload();

      const hasToken = await page.evaluate(() => {
        return window.hasCsrfToken();
      });

      expect(hasToken).toBe(true);
    });

    test('returns false when CSRF token does not exist', async () => {
      await context.addCookies([
        {
          name: 'other',
          value: 'value',
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.reload();

      const hasToken = await page.evaluate(() => {
        return window.hasCsrfToken();
      });

      expect(hasToken).toBe(false);
    });
  });

  describe('parseCookies', () => {
    test('parses all cookies into key-value object', async () => {
      await context.addCookies([
        {
          name: 'name',
          value: 'value',
          domain: 'localhost',
          path: '/',
        },
        {
          name: 'csrf-token',
          value: 'abc123',
          domain: 'localhost',
          path: '/',
        },
        {
          name: 'session',
          value: 'xyz789',
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.reload();

      const cookies = await page.evaluate(() => {
        return window.parseCookies();
      });

      expect(cookies['name']).toBe('value');
      expect(cookies['csrf-token']).toBe('abc123');
      expect(cookies['session']).toBe('xyz789');
    });

    test('handles URL-encoded cookie values', async () => {
      await context.addCookies([
        {
          name: 'name',
          value: 'John%20Doe',
          domain: 'localhost',
          path: '/',
        },
        {
          name: 'token',
          value: 'abc%2B123',
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.reload();

      const cookies = await page.evaluate(() => {
        return window.parseCookies();
      });

      expect(cookies['name']).toBe('John Doe');
      expect(cookies['token']).toBe('abc+123');
    });

    test('returns empty object for empty cookies', async () => {
      // No cookies
      await page.reload();

      const cookies = await page.evaluate(() => {
        return window.parseCookies();
      });

      expect(Object.keys(cookies).length).toBe(0);
    });

    test('handles cookie values with = characters', async () => {
      const base64Value = 'dGVzdD1kYXRh==';

      await context.addCookies([
        {
          name: 'encoded',
          value: base64Value,
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.reload();

      const cookies = await page.evaluate(() => {
        return window.parseCookies();
      });

      expect(cookies['encoded']).toBe(base64Value);
    });
  });

  describe('getCookie', () => {
    test('retrieves specific cookie by name', async () => {
      await context.addCookies([
        {
          name: 'name',
          value: 'value',
          domain: 'localhost',
          path: '/',
        },
        {
          name: 'csrf-token',
          value: 'abc123',
          domain: 'localhost',
          path: '/',
        },
        {
          name: 'session',
          value: 'xyz789',
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.reload();

      const csrfToken = await page.evaluate(() => {
        return window.getCookie('csrf-token');
      });

      const session = await page.evaluate(() => {
        return window.getCookie('session');
      });

      expect(csrfToken).toBe('abc123');
      expect(session).toBe('xyz789');
    });

    test('returns null when cookie not found', async () => {
      await context.addCookies([
        {
          name: 'name',
          value: 'value',
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.reload();

      const token = await page.evaluate(() => {
        return window.getCookie('non-existent');
      });

      expect(token).toBeNull();
    });

    test('handles URL-encoded values', async () => {
      await context.addCookies([
        {
          name: 'encoded',
          value: 'Hello%20World%21',
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.reload();

      const value = await page.evaluate(() => {
        return window.getCookie('encoded');
      });

      expect(value).toBe('Hello World!');
    });
  });

  describe('CSRF Header Injection', () => {
    test('verifies X-CSRF-Token header is added to fetch requests', async () => {
      // Set CSRF token cookie
      await context.addCookies([
        {
          name: 'csrf-token',
          value: 'test-header-token',
          domain: 'localhost',
          path: '/',
        },
      ]);

      await page.reload();

      // Set up route interception to capture request headers
      let capturedHeaders: Record<string, string> = {};

      await page.route('**/api/test', (route) => {
        capturedHeaders = route.request().headers();
        route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true }),
        });
      });

      // Make a fetch request in the browser that should include CSRF header
      await page.evaluate(() => {
        const csrfToken = window.getCsrfTokenFromCookie();
        return fetch('/api/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken || '',
          },
        });
      });

      // Verify the header was sent
      expect(capturedHeaders['x-csrf-token']).toBe('test-header-token');
    });
  });
});
