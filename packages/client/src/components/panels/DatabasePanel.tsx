import React, { useEffect, useState } from 'react'
import type { World } from '@hyperscape/shared'

interface DatabaseStats {
  timestamp: string
  container?: {
    name: string
    status: string
    health: string
    startedAt: string
  }
  resources?: {
    memory: string
    cpu: string
  }
  database?: {
    totalConnections: number
    idleConnections: number
    waitingRequests: number
    size?: number
    sizeFormatted?: string
    activeConnections?: number
    maxConnections?: number
    tableCount?: number
  }
}

interface DatabasePanelProps {
  world: World
}

export function DatabasePanel({ world }: DatabasePanelProps) {
  const [stats, setStats] = useState<DatabaseStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<string>('')
  const [showLogs, setShowLogs] = useState(false)

  const fetchStats = async () => {
    const serverUrl = world.network.url!.replace('/ws', '')
    const response = await fetch(`${serverUrl}/api/database/status`)
    if (!response.ok) throw new Error('Failed to fetch stats')
    const data = await response.json() as DatabaseStats
    return data
  }

  const fetchLogs = async () => {
    const serverUrl = world.network.url!.replace('/ws', '')
    const response = await fetch(`${serverUrl}/api/database/logs?tail=50`)
    if (!response.ok) throw new Error('Failed to fetch logs')
    const data = await response.json() as { logs: string }
    setLogs(data.logs)
    setShowLogs(true)
  }

  const restartContainer = async () => {
    if (!confirm('Are you sure you want to restart the PostgreSQL container?')) {
      return
    }
    const serverUrl = world.network.url!.replace('/ws', '')
    const response = await fetch(`${serverUrl}/api/database/restart`, { method: 'POST' })
    if (!response.ok) throw new Error('Failed to restart container')

    setTimeout(() => {
      fetchStats().then(setStats).catch(err => setError(err.message))
    }, 3000)
  }

  useEffect(() => {
    const loadStats = async () => {
      setLoading(true)
      setError(null)
      fetchStats()
        .then(data => {
          setStats(data)
          setLoading(false)
        })
        .catch(err => {
          setError(err.message)
          setLoading(false)
        })
    }

    loadStats()
    const interval = setInterval(loadStats, 5000)
    return () => clearInterval(interval)
  }, [world])

  const getStatusColor = (status: string) => {
    if (status === 'running') return 'text-green-400'
    if (status === 'healthy') return 'text-green-400'
    if (status === 'starting') return 'text-yellow-400'
    return 'text-red-400'
  }

  const getHealthIcon = (health: string) => {
    if (health === 'healthy') return '✓'
    if (health === 'unhealthy') return '✗'
    return '?'
  }

  const formatUptime = (startedAt: string) => {
    const start = new Date(startedAt)
    const now = new Date()
    const diff = now.getTime() - start.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}h ${minutes}m`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-white/60">
        <div className="animate-pulse">Loading database stats...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-red-400 text-sm">
        <div className="font-semibold mb-2">Error loading stats</div>
        <div className="text-xs">{error}</div>
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="text-white text-sm space-y-4">
      {/* Container Status */}
      {stats.container && (
        <div className="space-y-2">
          <div className="font-semibold text-white/90 border-b border-white/10 pb-1">
            Container Status
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="text-white/60">Name:</div>
            <div className="font-mono text-white/90">{stats.container.name}</div>

            <div className="text-white/60">Status:</div>
            <div className={`font-semibold ${getStatusColor(stats.container.status)}`}>
              {stats.container.status.toUpperCase()}
            </div>

            <div className="text-white/60">Health:</div>
            <div className={`font-semibold ${getStatusColor(stats.container.health)}`}>
              {getHealthIcon(stats.container.health)} {stats.container.health.toUpperCase()}
            </div>

            <div className="text-white/60">Uptime:</div>
            <div className="text-white/90">
              {formatUptime(stats.container.startedAt)}
            </div>
          </div>
        </div>
      )}

      {/* Resource Usage */}
      {stats.resources && (
        <div className="space-y-2">
          <div className="font-semibold text-white/90 border-b border-white/10 pb-1">
            Resource Usage
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="text-white/60">Memory:</div>
            <div className="font-mono text-white/90">{stats.resources.memory}</div>

            <div className="text-white/60">CPU:</div>
            <div className="font-mono text-white/90">{stats.resources.cpu}</div>
          </div>
        </div>
      )}

      {/* Database Info */}
      {stats.database && (
        <div className="space-y-2">
          <div className="font-semibold text-white/90 border-b border-white/10 pb-1">
            Database Info
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {stats.database.sizeFormatted && (
              <>
                <div className="text-white/60">Size:</div>
                <div className="font-mono text-white/90">{stats.database.sizeFormatted}</div>
              </>
            )}

            {stats.database.tableCount !== undefined && (
              <>
                <div className="text-white/60">Tables:</div>
                <div className="font-mono text-white/90">{stats.database.tableCount}</div>
              </>
            )}

            {stats.database.activeConnections !== undefined && (
              <>
                <div className="text-white/60">Active Connections:</div>
                <div className="font-mono text-white/90">
                  {stats.database.activeConnections} / {stats.database.maxConnections}
                </div>
              </>
            )}

            <div className="text-white/60">Pool Connections:</div>
            <div className="font-mono text-white/90">
              {stats.database.totalConnections} total, {stats.database.idleConnections} idle
            </div>

            {stats.database.waitingRequests > 0 && (
              <>
                <div className="text-white/60">Waiting:</div>
                <div className="font-mono text-yellow-400">{stats.database.waitingRequests} requests</div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-2 border-t border-white/10">
        <button
          onClick={() => fetchLogs()}
          className="flex-1 bg-blue-600/80 hover:bg-blue-600 text-white text-xs py-2 px-3 rounded transition-colors"
        >
          View Logs
        </button>
        <button
          onClick={() => restartContainer()}
          className="flex-1 bg-red-600/80 hover:bg-red-600 text-white text-xs py-2 px-3 rounded transition-colors"
        >
          Restart
        </button>
      </div>

      {/* Logs Modal */}
      {showLogs && (
        <div className="fixed inset-0 bg-black/80 z-[2000] flex items-center justify-center p-4" onClick={() => setShowLogs(false)}>
          <div className="bg-[rgba(11,10,21,0.98)] border border-white/10 rounded-xl max-w-4xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-white/10">
              <div className="font-semibold text-white">Container Logs</div>
              <button
                onClick={() => setShowLogs(false)}
                className="bg-red-500 text-white rounded-md w-6 h-6 flex items-center justify-center text-sm font-bold"
              >
                ✕
              </button>
            </div>
            <div className="p-3 overflow-y-auto flex-1">
              <pre className="text-xs font-mono text-white/80 whitespace-pre-wrap break-words">
                {logs || 'No logs available'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
