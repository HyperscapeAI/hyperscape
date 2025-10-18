/**
 * Cookie Parsing Unit Tests
 *
 * Tests cookie parsing functionality without browser or server dependencies.
 * Pure unit tests focusing on parseCookieString utility function.
 */

import { describe, test, expect } from 'vitest';
import { parseCookieString } from '../middleware/cookies';

describe('Cookie Parsing Unit Tests', () => {
  test('should parse cookies from HTTP request header', () => {
    // Prepare test cookie header
    const testCookieHeader = 'privy-id-token=test-token-123; csrf-token=test-csrf-456';

    // Parse cookies using the middleware function
    const cookies = parseCookieString(testCookieHeader);

    // Assert cookies are extracted correctly
    expect(cookies['privy-id-token']).toBe('test-token-123');
    expect(cookies['csrf-token']).toBe('test-csrf-456');
  });

  test('should parse URL-encoded cookie values', () => {
    const testCookieHeader = 'name=John%20Doe; token=abc%2B123%3D%3D';

    const cookies = parseCookieString(testCookieHeader);

    expect(cookies['name']).toBe('John Doe');
    expect(cookies['token']).toBe('abc+123==');
  });

  test('should handle empty cookie string', () => {
    const testCookieHeader = '';

    const cookies = parseCookieString(testCookieHeader);

    expect(Object.keys(cookies).length).toBe(0);
  });

  test('should skip malformed cookie entries', () => {
    const testCookieHeader = 'valid=value; malformed; another=good';

    const cookies = parseCookieString(testCookieHeader);

    expect(cookies['valid']).toBe('value');
    expect(cookies['another']).toBe('good');
    expect(cookies['malformed']).toBeUndefined();
  });

  test('should parse cookies from WebSocket upgrade request simulation', () => {
    // Simulate WebSocket upgrade request with Cookie header
    const mockWebSocketCookieHeader = 'privy-id-token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9; csrf-token=csrf-123-abc; hyperscape-session=session-xyz-789';

    const cookies = parseCookieString(mockWebSocketCookieHeader);

    // Verify all authentication cookies are parsed
    expect(cookies['privy-id-token']).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
    expect(cookies['csrf-token']).toBe('csrf-123-abc');
    expect(cookies['hyperscape-session']).toBe('session-xyz-789');
    expect(Object.keys(cookies).length).toBe(3);
  });

  test('should handle cookies with spaces in values', () => {
    const testCookieHeader = 'message=Hello%20World%20from%20Hyperscape; user=test%20user';

    const cookies = parseCookieString(testCookieHeader);

    expect(cookies['message']).toBe('Hello World from Hyperscape');
    expect(cookies['user']).toBe('test user');
  });

  test('should handle complex JWT tokens in cookies', () => {
    // Real JWT token format
    const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const testCookieHeader = `privy-id-token=${jwtToken}; csrf-token=test-csrf`;

    const cookies = parseCookieString(testCookieHeader);

    expect(cookies['privy-id-token']).toBe(jwtToken);
    expect(cookies['csrf-token']).toBe('test-csrf');
  });

  test('should handle cookies with special characters requiring URL encoding', () => {
    const testCookieHeader = 'data=value%26with%26ampersands; path=%2Fhome%2Fuser';

    const cookies = parseCookieString(testCookieHeader);

    expect(cookies['data']).toBe('value&with&ampersands');
    expect(cookies['path']).toBe('/home/user');
  });

  test('should handle cookies with equals signs in values', () => {
    // Base64-encoded values often have trailing equals signs
    const testCookieHeader = 'encoded=dGVzdA%3D%3D; another=value%3Dtest';

    const cookies = parseCookieString(testCookieHeader);

    expect(cookies['encoded']).toBe('dGVzdA==');
    expect(cookies['another']).toBe('value=test');
  });

  test('should handle real Hyperscape authentication flow cookies', () => {
    // Simulate complete authentication cookie set from real Hyperscape flow
    const authCookies = [
      'privy-id-token=eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWQ6cHJpdnk6MHgxMjM0In0.sig',
      'csrf-token=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
      'hyperscape-session=sess_1234567890abcdefghijklmnopqrstuv'
    ].join('; ');

    const cookies = parseCookieString(authCookies);

    expect(cookies['privy-id-token']).toContain('eyJ');
    expect(cookies['csrf-token']).toBe('a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6');
    expect(cookies['hyperscape-session']).toContain('sess_');
    expect(Object.keys(cookies).length).toBe(3);
  });
});
