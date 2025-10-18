/**
 * Privy Authentication - Third-party auth provider integration
 *
 * This module integrates Privy's authentication service into Hyperscape.
 * Privy provides wallet-based authentication with support for multiple providers:
 * - Ethereum wallets (MetaMask, WalletConnect, etc.)
 * - Email/password authentication
 * - Social logins (Google, Twitter, Discord)
 * - Farcaster integration for Frames
 *
 * **Architecture**:
 * - Client-side: Users authenticate with Privy SDK (in PrivyAuthProvider.tsx)
 * - Client sends Privy access token to server via WebSocket handshake
 * - Server verifies token and extracts user info (this module)
 * - Server creates/links Hyperscape account with Privy user ID
 *
 * **Configuration**:
 * Requires environment variables:
 * - `PRIVY_APP_ID` or `PUBLIC_PRIVY_APP_ID` - Your Privy application ID
 * - `PRIVY_APP_SECRET` - Server-side secret for token verification
 *
 * If these are not set, Privy auth is disabled and the server falls back to
 * anonymous/JWT authentication.
 *
 * **User Linking**:
 * When a user authenticates with Privy:
 * 1. Verify their access token with Privy servers
 * 2. Extract privyUserId and optionally farcasterFid
 * 3. Look up existing Hyperscape user by privyUserId
 * 4. If not found, create new user with privyUserId as stable ID
 * 5. Generate Hyperscape JWT for WebSocket authentication
 *
 * **Security**:
 * - Never expose PRIVY_APP_SECRET to client
 * - Token verification happens server-side only
 * - Privy tokens are single-use and expire quickly
 *
 * **Referenced by**: ServerNetwork.ts (onConnection for user authentication)
 */

import { PrivyClient } from "@privy-io/server-auth";

/**
 * Cached Privy client instance (singleton pattern)
 *
 * The client is lazily initialized on first use to avoid startup errors
 * if Privy credentials are not configured.
 */
let privyClient: PrivyClient | null = null;

/**
 * Categorize error types for better debugging
 *
 * Discriminates between network errors, HTTP status errors,
 * validation errors, and expired token errors.
 */
function categorizeError(error: unknown): { type: string; message: string } {
  if (!error) {
    return { type: 'unknown', message: 'No error information available' };
  }

  const errorMessage = error instanceof Error ? error.message : String(error);

  // Check for network errors (connection failures, timeouts, DNS)
  if (errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('ETIMEDOUT') ||
      errorMessage.includes('ENOTFOUND') ||
      errorMessage.includes('network') ||
      errorMessage.includes('fetch failed')) {
    return { type: 'network', message: errorMessage };
  }

  // Check for HTTP status errors (401, 403, 404, 500, etc.)
  if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
    return { type: 'http_401_unauthorized', message: errorMessage };
  }
  if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
    return { type: 'http_403_forbidden', message: errorMessage };
  }
  if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
    return { type: 'http_404_not_found', message: errorMessage };
  }
  if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
    return { type: 'http_500_server_error', message: errorMessage };
  }
  if (errorMessage.match(/\b[45]\d{2}\b/)) {
    return { type: 'http_error', message: errorMessage };
  }

  // Check for validation errors (invalid token format, missing fields)
  if (errorMessage.includes('invalid') ||
      errorMessage.includes('malformed') ||
      errorMessage.includes('validation')) {
    return { type: 'validation', message: errorMessage };
  }

  // Check for expired token errors
  if (errorMessage.includes('expired') ||
      errorMessage.includes('exp') ||
      errorMessage.includes('TTL')) {
    return { type: 'expired', message: errorMessage };
  }

  // Unknown error type
  return { type: 'unknown', message: errorMessage };
}

/**
 * Get or create the Privy client instance
 *
 * Initializes the Privy SDK client with credentials from environment variables.
 * Returns null if Privy is not configured (missing app ID or secret).
 *
 * @returns Privy client instance or null if not configured
 */
function getPrivyClient(): PrivyClient | null {
  if (privyClient) {
    return privyClient;
  }

  const appId = process.env.PRIVY_APP_ID || process.env.PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;

  if (!appId || !appSecret) {
    return null;
  }

  privyClient = new PrivyClient(appId, appSecret);
  return privyClient;
}

/**
 * Privy user information extracted from verified tokens
 *
 * Contains all relevant identity information from Privy's authentication system.
 */
export interface PrivyUserInfo {
  /** Privy's unique user ID (stable across sessions) */
  privyUserId: string;

  /** Farcaster ID if user linked their Farcaster account */
  farcasterFid: string | null;

  /** Primary wallet address if using wallet auth */
  walletAddress: string | null;

  /** Email address if using email auth */
  email: string | null;

  /** Whether the user's identity has been verified by Privy */
  isVerified: boolean;
}

/**
 * Verify a Privy token (access or identity token) and extract user information
 *
 * This function:
 * 1. Attempts to verify as identity token first (preferred for 2025)
 * 2. Falls back to access token verification for backward compatibility
 * 3. Fetches full user profile from Privy API
 * 4. Extracts relevant identity fields (Farcaster, wallet, email)
 *
 * Returns null if:
 * - Privy is not configured (missing credentials)
 * - Token is invalid or expired
 * - User does not exist
 *
 * @param token - Privy identity token or access token from client
 * @returns User information or null if verification fails
 */
export async function verifyPrivyToken(
  token: string,
): Promise<PrivyUserInfo | null> {
  const client = getPrivyClient();

  if (!client) {
    return null;
  }

  let verifiedClaims: { userId: string } | null = null;

  // Try identity token verification first (preferred method for 2025)
  try {
    // Get user info directly from Privy API using the token
    const userInfo = await client.users().get({ id_token: token });

    if (userInfo && userInfo.id) {
      verifiedClaims = { userId: userInfo.id };
      console.log('[PrivyAuth] Verified identity token for user:', userInfo.id);
    }
  } catch (identityTokenErr) {
    // Discriminate error types for identity token failure
    const identityErrorType = categorizeError(identityTokenErr);
    console.warn(`[PrivyAuth] Identity token verification failed (${identityErrorType.type}): ${identityErrorType.message}`);

    try {
      // Attempt to verify as access token instead
      const accessTokenClaims = await client.verifyAuthToken(token);

      if (accessTokenClaims && accessTokenClaims.userId) {
        verifiedClaims = { userId: accessTokenClaims.userId };
        console.log('[PrivyAuth] Verified access token for user:', accessTokenClaims.userId);
      }
    } catch (accessTokenErr) {
      // Discriminate error types for access token failure
      const accessErrorType = categorizeError(accessTokenErr);

      // Both methods failed - log comprehensive error information
      console.error('[PrivyAuth] Both identity token and access token verification failed:', {
        identityToken: {
          type: identityErrorType.type,
          message: identityErrorType.message,
        },
        accessToken: {
          type: accessErrorType.type,
          message: accessErrorType.message,
        },
      });
      return null;
    }
  }

  if (!verifiedClaims || !verifiedClaims.userId) {
    return null;
  }

  // Fetch full user profile
  const user = await client.getUserById(verifiedClaims.userId);

  if (!user) {
    return null;
  }

  const privyUserId = user.id;
  const farcasterFid = user.farcaster?.fid ? String(user.farcaster.fid) : null;
  const walletAddress = user.wallet?.address || null;
  const email = user.email?.address || null;
  const isVerified = true;

  return {
    privyUserId,
    farcasterFid,
    walletAddress,
    email,
    isVerified,
  };
}

/**
 * Check if Privy authentication is enabled
 *
 * Returns true if both PRIVY_APP_ID and PRIVY_APP_SECRET are configured.
 * Used by ServerNetwork to determine whether to attempt Privy authentication.
 *
 * @returns true if Privy credentials are configured, false otherwise
 */
export function isPrivyEnabled(): boolean {
  const appId = process.env.PRIVY_APP_ID || process.env.PUBLIC_PRIVY_APP_ID;
  const appSecret = process.env.PRIVY_APP_SECRET;
  return !!(appId && appSecret);
}

/**
 * Get Privy user information by ID (for admin/system use)
 *
 * Fetches user profile directly from Privy API without requiring a token.
 * This is useful for:
 * - Admin tools that need to look up user information
 * - System processes that link accounts
 * - Background jobs that need user data
 *
 * Note: This does NOT verify the user's identity - it just fetches their
 * profile information that Privy has on file. Only use this for administrative
 * purposes, not for authentication.
 *
 * @param userId - Privy user ID to look up
 * @returns User information or null if user doesn't exist or Privy not configured
 */
export async function getPrivyUserById(
  userId: string,
): Promise<PrivyUserInfo | null> {
  const client = getPrivyClient();

  if (!client) {
    return null;
  }

  const user = await client.getUserById(userId);

  if (!user) {
    return null;
  }

  return {
    privyUserId: user.id,
    farcasterFid: user.farcaster?.fid ? String(user.farcaster.fid) : null,
    walletAddress: user.wallet?.address || null,
    email: user.email?.address || null,
    isVerified: true,
  };
}
