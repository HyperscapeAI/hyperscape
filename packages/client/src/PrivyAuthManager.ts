/**
 * Privy Authentication Manager
 * Handles Privy authentication state and token management for Hyperscape
 */

import type { User } from '@privy-io/react-auth'
import { z } from 'zod'

/**
 * Zod schema for authentication response validation
 */
const AuthResponseSchema = z.object({
  csrfToken: z.string().min(16, 'csrfToken must be at least 16 characters'),
  userId: z.string(),
})

/**
 * Authentication error codes
 */
type AuthErrorCode = 'NETWORK_ERROR' | 'INVALID_TOKEN' | 'SERVER_ERROR' | 'VALIDATION_ERROR'

/**
 * Structured authentication error
 */
export class AuthenticationError extends Error {
  constructor(
    message: string,
    public code: AuthErrorCode,
    public retryable: boolean,
    public originalError?: unknown
  ) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

/**
 * Privy authentication state
 *
 * Contains all authentication-related state including user data,
 * tokens, and Farcaster integration.
 *
 * NOTE: Tokens are now stored in HttpOnly cookies (not localStorage) for enhanced security.
 * The privyToken field is kept for backward compatibility but is no longer used for auth.
 *
 * @public
 */
export interface PrivyAuthState {
  /** Whether the user is currently authenticated */
  isAuthenticated: boolean

  /** Privy user ID (unique identifier from Privy) */
  privyUserId: string | null

  /** Privy identity token (JWT with user claims) - stored in HttpOnly cookie, not in state */
  privyToken: string | null

  /** Full Privy user object with profile data */
  user: User | null

  /** Farcaster FID if the user has linked their Farcaster account */
  farcasterFid: string | null

  /** CSRF token for state-changing requests (readable from client) */
  csrfToken: string | null
}

/**
 * PrivyAuthManager - Privy authentication state management
 * 
 * Manages Privy authentication state and provides methods for login/logout.
 * Stores authentication data in localStorage for persistence across page refreshes.
 * 
 * @remarks
 * This is a singleton that manages Privy-specific authentication separately
 * from the PlayerTokenManager (which handles in-game identity).
 * 
 * @public
 */
export class PrivyAuthManager {
  private static instance: PrivyAuthManager
  private state: PrivyAuthState = {
    isAuthenticated: false,
    privyUserId: null,
    privyToken: null,
    user: null,
    farcasterFid: null,
    csrfToken: null,
  }

  private listeners: Set<(state: PrivyAuthState) => void> = new Set()
  private csrfTokenPromise: Promise<void> | null = null

  private constructor() {}

  /**
   * Gets the server URL from environment or window location
   *
   * @returns The server URL to use for API requests
   * @private
   */
  private getServerUrl(): string {
    return import.meta.env.HYPERSCAPE_SERVER_URL || window.location.origin
  }

  /**
   * Validates authentication response data using Zod schema
   *
   * @param rawData - The raw response data to validate
   * @returns Validated response with csrfToken and userId
   * @throws Error if parsing fails or csrfToken doesn't meet requirements
   * @private
   */
  private validateAuthResponse(rawData: unknown): { csrfToken: string; userId: string } {
    const parseResult = AuthResponseSchema.safeParse(rawData)

    if (!parseResult.success) {
      throw new Error(
        `Invalid response format: ${parseResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      )
    }

    return parseResult.data
  }

  /**
   * Gets the singleton instance of PrivyAuthManager
   * 
   * @returns The singleton instance
   * 
   * @public
   */
  static getInstance(): PrivyAuthManager {
    if (!PrivyAuthManager.instance) {
      PrivyAuthManager.instance = new PrivyAuthManager()
    }
    return PrivyAuthManager.instance
  }

  /**
   * Updates authentication state
   * 
   * Merges the provided updates with the current state and notifies all listeners.
   * This is the internal method used by setAuthenticatedUser and clearAuth.
   * 
   * @param updates - Partial state updates to apply
   * 
   * @public
   */
  updateState(updates: Partial<PrivyAuthState>): void {
    this.state = { ...this.state, ...updates }
    this.notifyListeners()
  }

  /**
   * Sets the authenticated user from Privy
   *
   * Called after successful Privy authentication. Exchanges the identity token
   * for an HttpOnly cookie on the server, then updates local state.
   *
   * SECURITY: Identity tokens are now stored in HttpOnly cookies (not localStorage)
   * to prevent XSS attacks. The token is sent to the server once and never stored client-side.
   *
   * @param user - Privy user object with profile data
   * @param identityToken - Privy identity token (JWT with user claims)
   * @throws {AuthenticationError} Structured error with retry guidance
   *
   * @public
   */
  async setAuthenticatedUser(user: User, identityToken: string): Promise<void> {
    // Extract Farcaster FID if available
    const farcasterAccount = user.farcaster
    const farcasterFid = farcasterAccount?.fid ? String(farcasterAccount.fid) : null

    try {
      // Exchange identity token for HttpOnly cookie on server
      const response = await fetch(`${this.getServerUrl()}/api/auth/privy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies in request
        body: JSON.stringify({
          identityToken,
          name: user.email?.address || user.wallet?.address || 'Adventurer',
          avatar: null,
        }),
      })

      // Categorize errors by HTTP status
      if (!response.ok) {
        let errorData: { message?: string } = {}

        // Safely parse error response JSON
        try {
          errorData = await response.json()
        } catch (jsonError) {
          console.warn('[PrivyAuthManager] Failed to parse error response as JSON:', jsonError)
          // Continue with empty errorData object
        }

        const errorMessage = errorData.message || `HTTP ${response.status}: Failed to authenticate with server`

        // Categorize by status code
        if (response.status === 401) {
          throw new AuthenticationError(
            errorMessage,
            'INVALID_TOKEN',
            false, // Non-retryable - token is invalid
            response
          )
        } else if (response.status >= 500) {
          throw new AuthenticationError(
            errorMessage,
            'SERVER_ERROR',
            true, // Retryable - server is having issues
            response
          )
        } else {
          throw new AuthenticationError(
            errorMessage,
            'SERVER_ERROR',
            false, // Non-retryable - client error (4xx)
            response
          )
        }
      }

      // Parse and validate response
      let data: { csrfToken: string; userId: string }
      try {
        const rawData = await response.json()
        data = this.validateAuthResponse(rawData)
      } catch (validationError) {
        throw new AuthenticationError(
          'Server returned invalid authentication response',
          'VALIDATION_ERROR',
          false, // Non-retryable - response format is wrong
          validationError
        )
      }

      // Update state with user info and CSRF token
      // NOTE: The actual auth token is now in an HttpOnly cookie, not in state
      this.updateState({
        isAuthenticated: true,
        privyUserId: user.id,
        privyToken: null, // No longer stored client-side
        user,
        farcasterFid,
        csrfToken: data.csrfToken,
      })

      // Store minimal data in localStorage (no tokens!)
      localStorage.setItem('privy_user_id', user.id)
      if (farcasterFid) {
        localStorage.setItem('farcaster_fid', farcasterFid)
      }
      // Store CSRF token (safe to store - it's not the auth token)
      localStorage.setItem('csrf_token', data.csrfToken)

      console.log('[PrivyAuthManager] Authentication successful - credentials stored in HttpOnly cookie')
    } catch (error) {
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new AuthenticationError(
          'Network error: Failed to connect to authentication server',
          'NETWORK_ERROR',
          true, // Retryable - network issues are temporary
          error
        )
        console.error('[PrivyAuthManager] Network error during authentication:', {
          code: networkError.code,
          retryable: networkError.retryable,
          message: networkError.message,
          originalError: error
        })
        throw networkError
      }

      // Re-throw AuthenticationError with logging
      if (error instanceof AuthenticationError) {
        console.error('[PrivyAuthManager] Authentication failed:', {
          code: error.code,
          retryable: error.retryable,
          message: error.message,
          originalError: error.originalError
        })

        // Emit retry recommendation for retryable errors
        if (error.retryable) {
          console.warn('[PrivyAuthManager] This error is retryable. Consider implementing exponential backoff.')
        }

        throw error
      }

      // Unknown error - wrap it
      const unknownError = new AuthenticationError(
        error instanceof Error ? error.message : 'Unknown authentication error',
        'SERVER_ERROR',
        false,
        error
      )
      console.error('[PrivyAuthManager] Unknown error during authentication:', {
        code: unknownError.code,
        retryable: unknownError.retryable,
        originalError: error
      })
      throw unknownError
    }
  }

  /**
   * Clears all authentication state
   *
   * Removes auth data from memory, localStorage, and server-side cookies.
   * Called on logout.
   *
   * @public
   */
  async clearAuth(): Promise<void> {
    // Call server logout endpoint to clear HttpOnly cookies
    try {
      await fetch(`${this.getServerUrl()}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include', // Include cookies so they can be cleared
      })
    } catch (error) {
      console.warn('[PrivyAuthManager] Failed to clear server-side cookies:', error)
      // Continue with local cleanup even if server call fails
    }

    this.updateState({
      isAuthenticated: false,
      privyUserId: null,
      privyToken: null,
      user: null,
      farcasterFid: null,
      csrfToken: null,
    })

    // Clear from localStorage (no auth tokens stored anymore, just metadata)
    localStorage.removeItem('privy_auth_token') // Legacy - already removed
    localStorage.removeItem('privy_user_id')
    localStorage.removeItem('farcaster_fid')
    localStorage.removeItem('csrf_token')

    console.log('[PrivyAuthManager] Logged out - all auth data cleared')
  }

  /**
   * Gets the current authentication state
   * 
   * @returns A copy of the current auth state
   * 
   * @public
   */
  getState(): PrivyAuthState {
    return { ...this.state }
  }

  /**
   * Gets the Privy identity token for API calls
   *
   * @deprecated Identity tokens are now stored in HttpOnly cookies and are not accessible from JavaScript.
   * Use the CSRF token for state-changing requests instead via getCsrfToken().
   * Authentication is automatically handled via cookies in fetch requests with credentials: 'include'.
   *
   * @returns Always returns null (tokens are in HttpOnly cookies)
   *
   * @public
   */
  getToken(): string | null {
    return null // Tokens are in HttpOnly cookies, not accessible from JS
  }

  /**
   * Gets the CSRF token for state-changing requests
   *
   * Include this token in the X-CSRF-Token header when making POST/PUT/DELETE requests.
   *
   * @returns The CSRF token or null if not authenticated
   *
   * @public
   */
  getCsrfToken(): string | null {
    return this.state.csrfToken
  }

  /**
   * Ensures a CSRF token exists by fetching from server if missing
   *
   * Called automatically during restoration if CSRF token is not in localStorage.
   * Fetches a new CSRF token from the server using the HttpOnly cookie for auth.
   * Prevents race conditions by ensuring only one fetch happens at a time.
   *
   * @returns Promise that resolves when CSRF token is fetched and updated
   *
   * @public
   */
  async ensureCsrfToken(): Promise<void> {
    // If we already have a CSRF token, no need to fetch
    if (this.state.csrfToken) {
      return
    }

    // If a fetch is already in progress, return the existing promise
    if (this.csrfTokenPromise) {
      return this.csrfTokenPromise
    }

    // Check authentication before starting fetch
    if (!this.state.privyUserId) {
      throw new Error('Cannot fetch CSRF token: user not authenticated')
    }

    // Create a self-contained async IIFE that handles the fetch
    this.csrfTokenPromise = (async () => {
      try {
        const response = await fetch(`${this.getServerUrl()}/api/auth/csrf`, {
          method: 'GET',
          credentials: 'include', // Include cookies for authentication
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch CSRF token: ${response.status}`)
        }

        // Validate response using helper
        const csrfData = this.validateAuthResponse(await response.json())

        // Re-check authentication after fetch completes (to detect logout during fetch)
        if (!this.state.privyUserId) {
          throw new Error('User logged out during CSRF token fetch')
        }

        // Update state with fetched CSRF token
        this.updateState({
          csrfToken: csrfData.csrfToken,
        })

        // Store in localStorage for next session
        localStorage.setItem('csrf_token', csrfData.csrfToken)

        console.log('[PrivyAuthManager] CSRF token fetched and updated')
      } catch (error) {
        console.error('[PrivyAuthManager] Failed to fetch CSRF token:', error)
        // Don't clear auth state - the error is logged and can be retried
        throw error
      } finally {
        // Clear the promise so future calls can retry
        this.csrfTokenPromise = null
      }
    })()

    return this.csrfTokenPromise
  }

  /**
   * Gets the Privy user ID
   * 
   * @returns The user ID or null if not authenticated
   * 
   * @public
   */
  getUserId(): string | null {
    return this.state.privyUserId
  }

  /**
   * Gets the Farcaster FID if the user has linked their account
   * 
   * @returns The Farcaster FID or null if not linked
   * 
   * @public
   */
  getFarcasterFid(): string | null {
    return this.state.farcasterFid
  }

  /**
   * Checks if the user is currently authenticated
   * 
   * @returns true if authenticated, false otherwise
   * 
   * @public
   */
  isAuthenticated(): boolean {
    return this.state.isAuthenticated
  }

  /**
   * Subscribes to authentication state changes
   * 
   * Registers a listener that will be called whenever the auth state changes.
   * Useful for updating UI in response to login/logout events.
   * 
   * @param listener - Callback function that receives the new state
   * @returns Unsubscribe function
   * 
   * @example
   * ```typescript
   * const unsubscribe = privyAuthManager.subscribe((state) => {
   *   console.log('Auth state changed:', state.isAuthenticated);
   * });
   * 
   * // Later, to stop listening:
   * unsubscribe();
   * ```
   * 
   * @public
   */
  subscribe(listener: (state: PrivyAuthState) => void): () => void {
    this.listeners.add(listener)
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      listener(this.getState())
    })
  }

  /**
   * Restores authentication from localStorage
   *
   * Attempts to restore auth state from localStorage on page load.
   * This allows the user to stay logged in across page refreshes.
   *
   * NOTE: Auth tokens are now in HttpOnly cookies (not localStorage).
   * This method only restores user metadata (userId, fid, csrfToken).
   * Actual authentication is validated server-side via cookies.
   *
   * @returns Promise that resolves with object containing restored userId and csrfToken (token is always null)
   *
   * @public
   */
  async restoreFromStorage(): Promise<{ token: string | null; userId: string | null; csrfToken: string | null }> {
    const userId = localStorage.getItem('privy_user_id')
    const fid = localStorage.getItem('farcaster_fid')
    const csrfToken = localStorage.getItem('csrf_token')

    // Remove legacy token storage if it exists
    const legacyToken = localStorage.getItem('privy_auth_token')
    if (legacyToken) {
      localStorage.removeItem('privy_auth_token')
      console.warn('[PrivyAuthManager] Removed legacy token from localStorage - tokens are now in HttpOnly cookies')
    }

    // Restore authentication if userId exists, even without CSRF token
    if (userId) {
      this.updateState({
        isAuthenticated: true, // Tentative - will be verified server-side
        privyUserId: userId,
        privyToken: null, // Tokens are in HttpOnly cookies
        farcasterFid: fid,
        csrfToken: csrfToken || null, // May be null if cookie not yet returned
      })

      // If CSRF token is missing, try to fetch it
      if (!csrfToken) {
        console.log('[PrivyAuthManager] Restoring without CSRF token - will fetch')
        // Await the CSRF token fetch to ensure it completes before callers proceed
        await this.ensureCsrfToken().catch((error) => {
          console.warn('[PrivyAuthManager] Failed to fetch CSRF token:', error)
          // Don't clear auth state - just log the error
        })
      }
    }

    return { token: null, userId, csrfToken }
  }
}

/**
 * Singleton instance of PrivyAuthManager
 * 
 * Use this throughout the application for Privy authentication.
 * 
 * @public
 */
export const privyAuthManager = PrivyAuthManager.getInstance()


