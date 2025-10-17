import React, { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5555/api'

/**
 * Agent token generator with challenge-response flow
 * Two-step process for maximum security:
 * Step 1: User generates challenge code (authenticated)
 * Step 2: Agent exchanges challenge code for scoped JWT token
 *
 * Security features:
 * - Server never sees Privy token after initial challenge creation
 * - Challenge codes expire in 5 minutes
 * - One-time use challenges (deleted after token generation)
 * - Scoped JWT with limited permissions (game play only)
 * - NO wallet access or fund transfer capabilities
 */
export function GetAgentToken() {
  const { getAccessToken, authenticated } = usePrivy()
  const [challengeCode, setChallengeCode] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<number | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [scopes, setScopes] = useState<string[]>([])
  const [restrictions, setRestrictions] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedChallenge, setCopiedChallenge] = useState(false)
  const [copiedToken, setCopiedToken] = useState(false)

  // Step 1: Generate challenge code
  const generateChallenge = async () => {
    try {
      setLoading(true)
      setError(null)
      setChallengeCode(null)
      setToken(null)

      // Get Privy token to authenticate user
      const privyToken = await getAccessToken()

      if (!privyToken) {
        setError('Not authenticated - please log in')
        return
      }

      // Call server to create challenge code
      const response = await fetch(`${API_URL}/agent/challenge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${privyToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      })

      const text = await response.text()
      if (!text) {
        throw new Error('Empty response from server')
      }

      const data = JSON.parse(text)

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate challenge')
      }

      setChallengeCode(data.challengeCode)
      setExpiresAt(data.expiresAt)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate challenge')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Exchange challenge for token (agent does this)
  const exchangeChallenge = async (code: string) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`${API_URL}/agent/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ challengeCode: code }),
      })

      const text = await response.text()
      if (!text) {
        throw new Error('Empty response from server')
      }

      const data = JSON.parse(text)

      if (!response.ok) {
        throw new Error(data.error || 'Failed to exchange challenge')
      }

      setToken(data.token)
      setScopes(data.scopes || [])
      setRestrictions(data.restrictions || [])
      setChallengeCode(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to exchange challenge')
    } finally {
      setLoading(false)
    }
  }

  const copyChallenge = () => {
    if (challengeCode) {
      navigator.clipboard.writeText(challengeCode)
      setCopiedChallenge(true)
      setTimeout(() => setCopiedChallenge(false), 2000)
    }
  }

  const copyToken = () => {
    if (token) {
      navigator.clipboard.writeText(token)
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 2000)
    }
  }

  const reset = () => {
    setChallengeCode(null)
    setToken(null)
    setScopes([])
    setRestrictions([])
    setError(null)
  }

  if (!authenticated) {
    return (
      <div className="text-sm opacity-70">
        Please log in to generate an agent token
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* No challenge or token yet - show generate button */}
      {!challengeCode && !token && (
        <>
          <div className="text-sm opacity-70">
            Generate a secure challenge code for your AI agent
          </div>
          <button
            onClick={generateChallenge}
            disabled={loading}
            className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-500 text-white px-4 py-2 rounded"
          >
            {loading ? 'Generating...' : '🤖 Generate Challenge Code'}
          </button>
        </>
      )}

      {/* Challenge code generated - show it to user */}
      {challengeCode && !token && (
        <>
          <div className="text-xs opacity-50 mb-1">Your Challenge Code:</div>
          <div className="bg-black/50 p-4 rounded border border-yellow-500/50">
            <div className="font-mono text-2xl font-bold text-center text-yellow-300 tracking-widest">
              {challengeCode}
            </div>
          </div>

          <div className="text-xs bg-yellow-500/10 border border-yellow-500/30 rounded p-3">
            <div className="font-semibold mb-2">📋 Instructions for your AI agent:</div>
            <ol className="opacity-70 space-y-1 ml-4 list-decimal">
              <li>Copy this challenge code</li>
              <li>Give it to your AI agent</li>
              <li>Agent calls: <code className="bg-black/30 px-1 rounded">POST /api/agent/token</code></li>
              <li>Agent receives encrypted token with limited permissions</li>
            </ol>
          </div>

          <div className="text-xs bg-red-500/10 border border-red-500/30 rounded p-2">
            <div className="font-semibold mb-1">⏱️ Expires in 5 minutes</div>
            <div className="opacity-70 font-mono text-[10px]">
              {expiresAt && new Date(expiresAt).toLocaleTimeString()}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={copyChallenge}
              className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black px-4 py-2 rounded font-semibold"
            >
              {copiedChallenge ? '✓ Copied!' : '📋 Copy Challenge Code'}
            </button>
            <button
              onClick={reset}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
            >
              Cancel
            </button>
          </div>

          <div className="text-xs opacity-50">
            ℹ️ The challenge code is one-time use and server never stores your Privy credentials
          </div>
        </>
      )}

      {/* Token received - show it */}
      {token && (
        <>
          <div className="text-xs opacity-50 mb-1">Your Secure Agent Token:</div>
          <div className="bg-black/50 p-3 rounded font-mono text-xs break-all border border-green-500/30">
            {token}
          </div>

          {/* Show what the token CAN do */}
          {scopes.length > 0 && (
            <div className="text-xs bg-green-500/10 border border-green-500/30 rounded p-2">
              <div className="font-semibold mb-1">✅ Allowed Actions:</div>
              <div className="opacity-70">{scopes.join(', ')}</div>
            </div>
          )}

          {/* Show what the token CANNOT do */}
          {restrictions.length > 0 && (
            <div className="text-xs bg-red-500/10 border border-red-500/30 rounded p-2">
              <div className="font-semibold mb-1">🚫 Restrictions:</div>
              <div className="opacity-70">{restrictions.join(', ')}</div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={copyToken}
              className="flex-1 bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
            >
              {copiedToken ? '✓ Copied!' : '📋 Copy Token'}
            </button>
            <button
              onClick={reset}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
            >
              Hide
            </button>
          </div>

          <div className="text-xs opacity-50">
            ✓ This token is encrypted and has NO wallet access
          </div>
        </>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 p-2 rounded text-sm text-red-300">
          {error}
        </div>
      )}
    </div>
  )
}
