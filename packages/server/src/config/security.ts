/**
 * Security Configuration
 *
 * Centralized security constants and configuration for authentication,
 * authorization, and protection mechanisms.
 *
 * This module provides a single source of truth for security-related
 * constants to prevent magic numbers and ensure consistency across the codebase.
 */

/**
 * Cookie security constants
 *
 * Defines validation rules and masking behavior for secure cookies.
 */
export const COOKIE_SECURITY = {
  /**
   * Minimum length for tokens (CSRF tokens, session tokens, etc.)
   *
   * 16 bytes provides 128 bits of entropy, which is sufficient for
   * preventing brute-force attacks while being practical for storage.
   */
  MIN_TOKEN_LENGTH: 16,

  /**
   * Minimum length for session identifiers
   *
   * Session IDs should have at least 128 bits of entropy to prevent
   * session fixation and brute-force attacks.
   */
  MIN_SESSION_ID_LENGTH: 16,

  /**
   * Number of characters to show at the start when masking session IDs in logs
   *
   * Showing a small prefix helps with debugging while preventing full
   * session ID disclosure in logs.
   */
  SESSION_ID_MASK_PREFIX_LENGTH: 4,

  /**
   * Number of characters to show at the end when masking session IDs in logs
   *
   * Showing a small suffix helps with debugging while preventing full
   * session ID disclosure in logs.
   */
  SESSION_ID_MASK_SUFFIX_LENGTH: 4,
} as const;

/**
 * CSRF protection constants
 */
export const CSRF_SECURITY = {
  /**
   * Minimum token length for CSRF tokens
   *
   * Derived from COOKIE_SECURITY.MIN_TOKEN_LENGTH for consistency
   */
  MIN_TOKEN_LENGTH: COOKIE_SECURITY.MIN_TOKEN_LENGTH,
} as const;

/**
 * Authentication security constants
 */
export const AUTH_SECURITY = {
  /**
   * Minimum length for JWT tokens
   *
   * JWTs typically have 3 parts (header.payload.signature) and should
   * be at least this long to be considered valid.
   */
  MIN_JWT_LENGTH: 32,

  /**
   * Number of parts in a valid JWT token
   *
   * JWTs must have exactly 3 parts: header, payload, and signature
   */
  JWT_PARTS_COUNT: 3,
} as const;
