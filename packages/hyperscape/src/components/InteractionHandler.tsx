import React, { useState, useEffect, useCallback } from 'react'
import { ContextMenu } from '../client/components/ContextMenu'
import { BankWindow } from './windows/BankWindow'
import { StoreWindow } from './windows/StoreWindow'
import type { World } from '../World'
import type { Player, PlayerEntity } from '../types/index'
import type { CombatSystem } from '../systems/CombatSystem'
import { EventType } from '../types/events'
import type { 
  InteractionAction, 
  InteractionTarget, 
  InteractionContextMenuState 
} from '../types/interaction-types';

interface InteractionHandlerProps {
  world: World
}

export function InteractionHandler({ world }: InteractionHandlerProps) {
  const [contextMenu, setContextMenu] = useState<InteractionContextMenuState>({
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
            // Emit event to Banking System
            const player = world.getPlayer()
            if (!player) return
            const entity = player as PlayerEntity
            world.emit(EventType.BANK_OPEN, {
              playerId: entity.id,
              bankId: target.id,
              position: entity.node.position
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
            // Emit event to Store System
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
        const player = world.getPlayer() as Player | null
        if (!player) break
        
        // Check combat status using the CombatSystem
        const combatSystem = world.getSystem('rpg-combat') as CombatSystem | null
        const isInCombat = combatSystem ? combatSystem.isInCombat(player.id) : false
        
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
        // Let ResourceInteractionSystem + UISystem own resource context menus entirely
        return
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
    // Listen for interaction events from the Interaction System
    const handleInteraction = (event: Event) => {
      const customEvent = event as CustomEvent<{
        type: string;
        target: { id: string; type: string; name: string; position?: { x: number; y: number; z: number } };
        position?: { x: number; y: number };
        mousePosition?: { x: number; y: number };
      }>;
      // Accept both native and custom contextmenu events
      const isContext = customEvent.type === 'contextmenu' || customEvent.type === 'rpg:contextmenu';
      if (isContext && customEvent.detail?.target) {
        handleInteraction({
          detail: {
            target: customEvent.detail.target as Omit<InteractionTarget, 'actions'> & { requiredTool?: string },
            mousePosition: customEvent.detail.position || customEvent.detail.mousePosition || { x: 0, y: 0 }
          }
        } as CustomEvent<{ target: Omit<InteractionTarget, 'actions'> & { requiredTool?: string }; mousePosition: { x: number; y: number } }>)
      }
    }

    // Add event listeners for system interactions
    window.addEventListener('rpg:interaction', handleInteraction as EventListener)
    window.addEventListener('rpg:contextmenu', handleInteraction as EventListener)

    return () => {
      window.removeEventListener('rpg:interaction', handleInteraction as EventListener)
      window.removeEventListener('rpg:contextmenu', handleInteraction as EventListener)
    }
  }, [handleInteraction])

  return (
    <>
      <ContextMenu
        visible={contextMenu.visible}
        position={contextMenu.position}
        actions={contextMenu.target ? contextMenu.target.actions.map(action => ({
          id: action.id,
          label: action.label,
          icon: action.icon,
          enabled: action.enabled !== false,
          onClick: action.onClick
        })) : []}
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
function checkRequiredTool(target: { type: string; requiredTool?: string }, player: Player): boolean {
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

