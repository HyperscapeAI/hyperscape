/**
 * AI Agent Management Panel
 *
 * Allows authenticated users to create and manage AI agents that can play in the world.
 * Each agent gets a unique auth token to connect to the game server.
 *
 * **Features**:
 * - Create agents with custom names and personalities
 * - Generate agent-specific auth tokens
 * - Start/stop agents
 * - View agent status and in-game activity
 * - Delete agents
 *
 * **Referenced by**: Sidebar.tsx
 */

import React, { useEffect, useState } from 'react'
import type { World } from '@hyperscape/shared'
import { privyAuthManager } from '../../PrivyAuthManager'

interface AgentManagementPanelProps {
  world: World
}

interface Agent {
  id: string
  name: string
  characterFile: string
  status: 'stopped' | 'active' | 'error'
  isRunning: boolean
  playerId: string | null
  createdAt: number
}

interface AgentStats {
  totalAgents: number
  activeAgents: number
  stoppedAgents: number
  errorAgents: number
}

export function AgentManagementPanel({ world }: AgentManagementPanelProps) {
  // API URL from environment
  const API_URL = import.meta.env.PUBLIC_API_URL || 'http://localhost:5555/api'

  const [authState, setAuthState] = useState(privyAuthManager.getState())
  const [agents, setAgents] = useState<Agent[]>([])
  const [stats, setStats] = useState<AgentStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create agent form state
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newAgentName, setNewAgentName] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('default')

  // Agent token display state
  const [selectedAgentForToken, setSelectedAgentForToken] = useState<string | null>(null)
  const [agentToken, setAgentToken] = useState<string | null>(null)

  // Subscribe to auth state changes
  useEffect(() => {
    const unsubscribe = privyAuthManager.subscribe(setAuthState)
    return unsubscribe
  }, [])

  // Fetch agents when authenticated
  useEffect(() => {
    if (authState.isAuthenticated && authState.privyToken) {
      fetchAgents()
      fetchStats()
    }
  }, [authState.isAuthenticated, authState.privyToken])

  const fetchAgents = async () => {
    if (!authState.privyToken) return

    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/agents`, {
        headers: {
          'Authorization': `Bearer ${authState.privyToken}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch agents')
      }

      const data = await response.json()
      setAgents(data.agents || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents')
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    if (!authState.privyToken) return

    try{
      const response = await fetch(`${API_URL}/agents/stats`, {
        headers: {
          'Authorization': `Bearer ${authState.privyToken}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setStats(data.stats)
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }

  const createAgent = async () => {
    if (!authState.privyToken || !newAgentName.trim()) return

    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/agents`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.privyToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: newAgentName.trim(),
          characterTemplate: selectedTemplate
        })
      })

      if (!response.ok) {
        throw new Error('Failed to create agent')
      }

      const data = await response.json()

      // Show token for new agent
      await generateAgentToken(data.agent.id)

      // Reset form and refresh list
      setNewAgentName('')
      setSelectedTemplate('default')
      setShowCreateForm(false)
      await fetchAgents()
      await fetchStats()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent')
    } finally {
      setLoading(false)
    }
  }

  const startAgent = async (agentId: string) => {
    if (!authState.privyToken) return

    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/agents/${agentId}/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.privyToken}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to start agent')
      }

      await fetchAgents()
      await fetchStats()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start agent')
    } finally {
      setLoading(false)
    }
  }

  const stopAgent = async (agentId: string) => {
    if (!authState.privyToken) return

    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/agents/${agentId}/stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.privyToken}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to stop agent')
      }

      await fetchAgents()
      await fetchStats()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop agent')
    } finally {
      setLoading(false)
    }
  }

  const deleteAgent = async (agentId: string) => {
    if (!authState.privyToken) return
    if (!confirm('Are you sure you want to delete this agent?')) return

    try {
      setLoading(true)
      const response = await fetch(`${API_URL}/agents/${agentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authState.privyToken}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to delete agent')
      }

      await fetchAgents()
      await fetchStats()
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete agent')
    } finally {
      setLoading(false)
    }
  }

  const generateAgentToken = async (agentId: string) => {
    if (!authState.privyToken) return

    try {
      const response = await fetch(`${API_URL}/agents/${agentId}/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authState.privyToken}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to generate token')
      }

      const data = await response.json()
      setAgentToken(data.token)
      setSelectedAgentForToken(agentId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate token')
    }
  }

  const copyToken = () => {
    if (agentToken) {
      navigator.clipboard.writeText(agentToken)
      alert('Token copied to clipboard!')
    }
  }

  // Require authentication
  if (!authState.isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <div className="text-center text-gray-400">
          <div className="text-4xl mb-4">🤖</div>
          <div className="text-lg font-semibold mb-2">AI Agent Management</div>
          <div className="text-sm">
            Please log in with Privy to create and manage AI agents
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Header with Stats */}
      {stats && (
        <div className="bg-black/35 border border-white/[0.08] rounded-md p-3">
          <div className="font-semibold mb-2 text-sm">Your AI Agents</div>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div className="text-center">
              <div className="text-gray-400">Total</div>
              <div className="text-xl font-bold">{stats.totalAgents}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">Active</div>
              <div className="text-xl font-bold text-green-400">{stats.activeAgents}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">Stopped</div>
              <div className="text-xl font-bold text-gray-500">{stats.stoppedAgents}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">Error</div>
              <div className="text-xl font-bold text-red-400">{stats.errorAgents}</div>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-md p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Create Agent Button */}
      {!showCreateForm && (
        <button
          onClick={() => setShowCreateForm(true)}
          disabled={loading}
          className="bg-blue-500/25 border border-blue-500/50 rounded-md py-2 px-3 cursor-pointer hover:bg-blue-500/40 text-sm font-medium disabled:opacity-50"
        >
          + Create New Agent
        </button>
      )}

      {/* Create Agent Form */}
      {showCreateForm && (
        <div className="bg-black/35 border border-white/[0.08] rounded-md p-3">
          <div className="font-semibold mb-3 text-sm">Create AI Agent</div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Agent Name</label>
              <input
                type="text"
                value={newAgentName}
                onChange={(e) => setNewAgentName(e.target.value)}
                className="w-full text-sm py-1.5 px-2 bg-white/5 border border-white/10 rounded text-white"
                placeholder="Enter agent name..."
                maxLength={30}
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">Personality Template</label>
              <select
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="w-full text-sm py-1.5 px-2 bg-white/5 border border-white/10 rounded text-white"
              >
                <option value="default">Default (Balanced)</option>
                <option value="woodcutter">Woodcutter (Resource Gatherer)</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={createAgent}
                disabled={loading || !newAgentName.trim()}
                className="flex-1 bg-green-500/25 border border-green-500/50 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-green-500/40 disabled:opacity-50"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false)
                  setNewAgentName('')
                  setSelectedTemplate('default')
                }}
                className="flex-1 bg-gray-500/25 border border-gray-500/50 rounded px-2 py-1.5 text-sm cursor-pointer hover:bg-gray-500/40"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Token Display */}
      {agentToken && selectedAgentForToken && (
        <div className="bg-green-900/20 border border-green-500/50 rounded-md p-3">
          <div className="font-semibold mb-2 text-sm text-green-300">Agent Auth Token</div>
          <div className="text-xs text-gray-300 mb-2">
            Use this token when configuring your agent:
          </div>
          <div className="bg-black/50 rounded p-2 mb-2">
            <code className="text-xs font-mono text-green-400 break-all">{agentToken}</code>
          </div>
          <div className="flex gap-2">
            <button
              onClick={copyToken}
              className="flex-1 bg-green-500/25 border border-green-500/50 rounded px-2 py-1 text-xs cursor-pointer hover:bg-green-500/40"
            >
              Copy Token
            </button>
            <button
              onClick={() => {
                setAgentToken(null)
                setSelectedAgentForToken(null)
              }}
              className="flex-1 bg-gray-500/25 border border-gray-500/50 rounded px-2 py-1 text-xs cursor-pointer hover:bg-gray-500/40"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Agents List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {loading && agents.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">Loading agents...</div>
        ) : agents.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">
            No agents yet. Create your first AI agent!
          </div>
        ) : (
          agents.map((agent) => (
            <div key={agent.id} className="bg-black/35 border border-white/[0.08] rounded-md p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="font-semibold text-sm">{agent.name}</div>
                  <div className="text-xs text-gray-400">{agent.characterFile}</div>
                </div>
                <div className={`text-xs px-2 py-1 rounded ${
                  agent.status === 'active' ? 'bg-green-500/25 text-green-300' :
                  agent.status === 'error' ? 'bg-red-500/25 text-red-300' :
                  'bg-gray-500/25 text-gray-300'
                }`}>
                  {agent.status}
                </div>
              </div>

              {agent.playerId && (
                <div className="text-xs text-gray-400 mb-2">
                  In-game ID: {agent.playerId.substring(0, 8)}...
                </div>
              )}

              <div className="flex gap-2 mt-2">
                {!agent.isRunning ? (
                  <button
                    onClick={() => startAgent(agent.id)}
                    disabled={loading}
                    className="flex-1 bg-green-500/25 border border-green-500/50 rounded px-2 py-1 text-xs cursor-pointer hover:bg-green-500/40 disabled:opacity-50"
                  >
                    Start
                  </button>
                ) : (
                  <button
                    onClick={() => stopAgent(agent.id)}
                    disabled={loading}
                    className="flex-1 bg-yellow-500/25 border border-yellow-500/50 rounded px-2 py-1 text-xs cursor-pointer hover:bg-yellow-500/40 disabled:opacity-50"
                  >
                    Stop
                  </button>
                )}
                <button
                  onClick={() => generateAgentToken(agent.id)}
                  disabled={loading}
                  className="flex-1 bg-blue-500/25 border border-blue-500/50 rounded px-2 py-1 text-xs cursor-pointer hover:bg-blue-500/40 disabled:opacity-50"
                >
                  Get Token
                </button>
                <button
                  onClick={() => deleteAgent(agent.id)}
                  disabled={loading}
                  className="bg-red-500/25 border border-red-500/50 rounded px-2 py-1 text-xs cursor-pointer hover:bg-red-500/40 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
