import React, { useState, useEffect, useCallback } from 'react'
import { ContextMenu } from '../../client/components/ContextMenu'
import { BankWindow } from './windows/BankWindow'
import { StoreWindow } from './windows/StoreWindow'
import type { World } from '../../core/World'
import type { Player } from '../../types/index'
import type { InteractionAction as BaseInteractionAction } from '../types/core'
import { EventType } from '../../types/events'

// RPG Player interface that extends the base Player
interface RPGPlayer extends Player {
  rpgStats?: {
    combatLevel: number;
    inCombat: boolean;
  };
}

// Intersection type to add RPG-specific methods to World
type WorldWithPlayer = World & {
  getPlayer(playerId?: string): RPGPlayer | null
}

interface InteractionHandlerProps {
  world: WorldWithPlayer
}

// Extend the base interaction action for UI purposes
interface InteractionAction extends Omit<BaseInteractionAction, 'callback'> {
  onClick: () => void
}

// Base interaction target
interface InteractionTargetBase {
  id: string
  name: string
  position: { x: number; y: number; z: number }
  actions: InteractionAction[]
}

// Specific target types with their unique properties
interface ResourceTarget extends InteractionTargetBase {
  type: 'resource'
  requiredTool?: string
}

type InteractionTarget = 
  | (InteractionTargetBase & { type: 'bank' | 'store' | 'npc' | 'item' | 'mob' })
  | ResourceTarget

interface ContextMenuState {
  visible: boolean
  position: { x: number; y: number }
  target: InteractionTarget | null
}

export function InteractionHandler({ world }: InteractionHandlerProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    position: { x: 0, y: 0 },
    target: null
  })

  const [bankWindow, setBankWindow] = useState({ visible: false, bankId: '' })
  const [storeWindow, setStoreWindow] = useState({ visible: false, storeId: '' })

  const handleInteraction = useCallback((event: CustomEvent<{
    target: Omit<InteractionTarget, 'actions'> & { requiredTool?: string }
    mousePosition: { x: number; y: number }
  }>) => {
    const { target, mousePosition } = event.detail
    
    if (!target) return

    // Create contextual actions based on target type
    const actions: InteractionAction[] = []

    switch (target.type) {
      case 'bank':
        actions.push({
          id: 'open-bank',
          label: 'Open Bank',
          icon: '🏦',
          enabled: true,
          onClick: () => {
            // Emit event to RPG Banking System
            const player = world.getPlayer()
            if (!player) return
            world.emit(EventType.BANK_OPEN, {
              playerId: player.id,
              bankId: target.id,
              position: player.node.position
            })
            setBankWindow({ visible: true, bankId: target.id })
          }
        })
        break

      case 'store':
        actions.push({
          id: 'open-store',
          label: 'Open Store',
          icon: '🏪',
          enabled: true,
          onClick: () => {
            // Emit event to RPG Store System
            const player = world.getPlayer()
            if (!player) return
            world.emit(EventType.STORE_OPEN, {
              playerId: player.id,
              storeId: target.id,
              position: player.node.position
            })
            setStoreWindow({ visible: true, storeId: target.id })
          }
        })
        break

      case 'npc':
        actions.push({
          id: 'talk',
          label: 'Talk',
          icon: '💬',
          enabled: true,
          onClick: () => {
            const player = world.getPlayer()
            if (!player) return
            world.emit(EventType.NPC_DIALOGUE, {
              playerId: player.id,
              npcId: target.id
            })
          }
        })
        break

      case 'mob': {
        const player = world.getPlayer() as RPGPlayer | null
        if (!player) break
        const _playerLevel = player.rpgStats?.combatLevel || 1
        const isInCombat = player.rpgStats?.inCombat || false
        
        actions.push({
          id: 'attack',
          label: `Attack ${target.name}`,
          icon: '⚔️',
          enabled: !isInCombat,
          onClick: () => {
            world.emit(EventType.COMBAT_STARTED, {
              playerId: player.id,
              targetId: target.id,
              targetType: 'mob'
            })
          }
        })
        break
      }

      case 'resource': {
        const player = world.getPlayer()
        if (!player) break
        const hasRequiredTool = checkRequiredTool(target, player)
        
        actions.push({
          id: 'gather',
          label: `Gather ${target.name}`,
          icon: getResourceIcon(target.name),
          enabled: hasRequiredTool,
          onClick: () => {
            world.emit(EventType.RESOURCE_GATHER, {
              playerId: player.id,
              resourceId: target.id,
              resourceType: target.name.toLowerCase()
            })
          }
        })
        break
      }

      case 'item': {
        const player = world.getPlayer()
        if (!player) break
        actions.push({
          id: 'pickup',
          label: `Pick up ${target.name}`,
          icon: '🎒',
          enabled: true,
          onClick: () => {
            world.emit(EventType.ITEM_PICKUP, {
              playerId: player.id,
              itemId: target.id
            })
          }
        })
        break
      }
    }

    if (actions.length > 0) {
      setContextMenu({
        visible: true,
        position: mousePosition,
        target: {
          ...target,
          actions
        }
      })
    }
  }, [world])

  const closeContextMenu = useCallback(() => {
    setContextMenu({
      visible: false,
      position: { x: 0, y: 0 },
      target: null
    })
  }, [])

  useEffect(() => {
    // Listen for interaction events from the RPG Interaction System
    const handleRPGInteraction = (event: Event) => {
      const customEvent = event as CustomEvent<{
        type: string;
        target: { id: string; type: string; name: string; position?: { x: number; y: number; z: number } };
        position?: { x: number; y: number };
      }>;
      if (customEvent.type === 'contextmenu' && customEvent.detail?.target) {
        handleInteraction({
          detail: {
            target: customEvent.detail.target as Omit<InteractionTarget, 'actions'> & { requiredTool?: string },
            mousePosition: customEvent.detail.position || { x: 0, y: 0 }
          }
        } as CustomEvent<{ target: Omit<InteractionTarget, 'actions'> & { requiredTool?: string }; mousePosition: { x: number; y: number } }>)
      }
    }

    // Add event listeners for RPG system interactions
    window.addEventListener('rpg:interaction', handleRPGInteraction as EventListener)
    window.addEventListener('rpg:contextmenu', handleRPGInteraction as EventListener)

    return () => {
      window.removeEventListener('rpg:interaction', handleRPGInteraction as EventListener)
      window.removeEventListener('rpg:contextmenu', handleRPGInteraction as EventListener)
    }
  }, [handleInteraction])

  return (
    <>
      <ContextMenu
        visible={contextMenu.visible}
        position={contextMenu.position}
        actions={contextMenu.target ? contextMenu.target.actions : []}
        onClose={closeContextMenu}
        title={contextMenu.target ? contextMenu.target.name : ''}
      />
      
      <BankWindow
        world={world}
        visible={bankWindow.visible}
        bankId={bankWindow.bankId}
        onClose={() => setBankWindow({ visible: false, bankId: '' })}
      />
      
      <StoreWindow
        world={world}
        visible={storeWindow.visible}
        storeId={storeWindow.storeId}
        onClose={() => setStoreWindow({ visible: false, storeId: '' })}
      />
    </>
  )
}

// Helper functions
function checkRequiredTool(target: { type: string; requiredTool?: string }, player: RPGPlayer): boolean {
  if (target.type !== 'resource' || !target.requiredTool || !player?.inventory) return true
  
  const inventory = player.inventory.items || []
  return inventory.some((item) => item.itemId === target.requiredTool)
}

function getResourceIcon(resourceName: string): string {
  const name = resourceName.toLowerCase()
  if (name.includes('tree') || name.includes('log')) return '🌳'
  if (name.includes('fish')) return '🐟'
  if (name.includes('ore') || name.includes('rock')) return '⛏️'
  if (name.includes('herb')) return '🌿'
  return '📦'
}

