/**
 * Action Progress Bar Component
 * Shows gathering/action progress to the player
 */

import React, { useEffect, useState } from 'react'
import type { World } from '../../types'
import { EventType } from '../../types/events'

interface ActionProgress {
  action: string
  resourceName: string
  progress: number // 0-1
  duration: number
  startTime: number
}

export function ActionProgressBar({ world }: { world: World }) {
  const [currentAction, setCurrentAction] = useState<ActionProgress | null>(null)

  useEffect(() => {
    const handleGatheringStart = (data: { 
      playerId: string
      resourceId: string
      action?: string
      duration?: number
    }) => {
      const localPlayer = world.entities?.player
      if (!localPlayer || localPlayer.id !== data.playerId) return

      // Determine action name and resource name
      const action = data.action || 'Gathering'
      const resourceId = data.resourceId || ''
      const resourceName = resourceId.includes('tree') ? 'Tree' : 
                          resourceId.includes('fish') ? 'Fishing Spot' :
                          resourceId.includes('rock') ? 'Rock' : 'Resource'
      
      setCurrentAction({
        action,
        resourceName,
        progress: 0,
        duration: data.duration || 5000,
        startTime: Date.now()
      })
    }

    const handleGatheringComplete = (data: { playerId: string }) => {
      const localPlayer = world.entities?.player
      if (!localPlayer || localPlayer.id !== data.playerId) return

      setCurrentAction(null)
    }

    const handleGatheringStopped = (data: { playerId: string }) => {
      const localPlayer = world.entities?.player
      if (!localPlayer || localPlayer.id !== data.playerId) return

      setCurrentAction(null)
    }

    world.on(EventType.RESOURCE_GATHERING_STARTED, handleGatheringStart)
    world.on(EventType.RESOURCE_GATHERING_COMPLETED, handleGatheringComplete)
    world.on(EventType.RESOURCE_GATHERING_STOPPED, handleGatheringStopped)

    return () => {
      world.off(EventType.RESOURCE_GATHERING_STARTED, handleGatheringStart)
      world.off(EventType.RESOURCE_GATHERING_COMPLETED, handleGatheringComplete)
      world.off(EventType.RESOURCE_GATHERING_STOPPED, handleGatheringStopped)
    }
  }, [world])

  // Update progress based on elapsed time
  useEffect(() => {
    if (!currentAction) return

    const interval = setInterval(() => {
      const elapsed = Date.now() - currentAction.startTime
      const progress = Math.min(elapsed / currentAction.duration, 1)
      
      setCurrentAction(prev => prev ? { ...prev, progress } : null)

      if (progress >= 1) {
        clearInterval(interval)
      }
    }, 50) // Update every 50ms for smooth animation

    return () => clearInterval(interval)
  }, [currentAction?.startTime])

  if (!currentAction) return null

  const percentage = Math.floor(currentAction.progress * 100)

  return (
    <div
      className="action-progress-bar fixed left-1/2 -translate-x-1/2 pointer-events-none z-[999]"
      style={{
        bottom: 'calc(15% + env(safe-area-inset-bottom))',
      }}
    >
      <style>{`
        .action-progress-bar {
          width: 320px;
          max-width: 90vw;
        }
        .action-progress-label {
          text-align: center;
          color: white;
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
        }
        .action-progress-track {
          height: 24px;
          background: rgba(0, 0, 0, 0.6);
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 12px;
          overflow: hidden;
          position: relative;
        }
        .action-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #4CAF50, #8BC34A);
          border-radius: 10px;
          transition: width 0.05s linear;
          box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.3);
          position: relative;
          overflow: hidden;
        }
        .action-progress-fill::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 50%;
          background: linear-gradient(to bottom, rgba(255, 255, 255, 0.4), transparent);
        }
        .action-progress-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: white;
          font-size: 0.75rem;
          font-weight: bold;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
          pointer-events: none;
        }
        .action-icon {
          display: inline-block;
          margin-right: 0.25rem;
        }
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.6;
          }
        }
        .action-progress-label {
          animation: pulse 2s ease-in-out infinite;
        }
      `}</style>

      <div className="action-progress-label">
        <span className="action-icon">🪓</span>
        {currentAction.action} {currentAction.resourceName}...
      </div>
      
      <div className="action-progress-track">
        <div 
          className="action-progress-fill"
          style={{ width: `${percentage}%` }}
        />
        <div className="action-progress-text">
          {percentage}%
        </div>
      </div>
    </div>
  )
}

