/**
 * Cookie Parsing Unit Tests
 *
 * These tests verify the cookie parsing logic works correctly.
 * Extracted from auth-security.test.ts to keep tests focused.
 */

import { describe, test, expect } from 'vitest';

/**
 * Helper function to parse cookie string into key-value pairs
 *
 * @param cookieHeader - Raw cookie header string
 * @returns Object with cookie key-value pairs
 */
function parseCookieString(cookieHeader: string): Record<string, string> {
  return cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key && value) {
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {} as Record<string, string>);
}

describe('Cookie Parsing Logic', () => {
  test('should parse cookies from WebSocket upgrade request', () => {
    // This is a unit test of the cookie parsing logic
    const mockCookieHeader = 'privy-id-token=test-token; csrf-token=test-csrf';

    const cookies = parseCookieString(mockCookieHeader);

    expect(cookies['privy-id-token']).toBe('test-token');
    expect(cookies['csrf-token']).toBe('test-csrf');

    console.log('✅ Cookie parsing logic works correctly');
  });

  test('should handle URL-encoded cookie values', () => {
    const mockCookieHeader = 'name=John%20Doe; token=abc%2B123%3D%3D';

    const cookies = parseCookieString(mockCookieHeader);

    expect(cookies['name']).toBe('John Doe');
    expect(cookies['token']).toBe('abc+123==');

    console.log('✅ Cookie parsing handles URL encoding');
  });

  test('should handle empty cookie string', () => {
    const mockCookieHeader = '';

    const cookies = parseCookieString(mockCookieHeader);

    expect(Object.keys(cookies).length).toBe(0);

    console.log('✅ Cookie parsing handles empty string');
  });

  test('should skip malformed cookie entries', () => {
    const mockCookieHeader = 'valid=value; malformed; another=good';

    const cookies = parseCookieString(mockCookieHeader);

    expect(cookies['valid']).toBe('value');
    expect(cookies['another']).toBe('good');
    expect(cookies['malformed']).toBeUndefined();

    console.log('✅ Cookie parsing skips malformed entries');
  });
});
