import React, { useState, useEffect, useCallback } from 'react'

import { DraggableWindow } from '../../client/components/DraggableWindow'
import { ContextMenu } from '../../client/components/ContextMenu'
import { InventorySystem } from '../../systems/InventorySystem'
import type { InventorySlotItem } from '../../types/core'
import type { Item } from '../../types/core'
import { ItemType } from '../../types/core'
import { EventType } from '../../types/events'
import type { WindowProps, ItemContextMenu } from '../../types/ui-types';
// Using emojis for icons to avoid lucide-react version issues

interface InventoryWindowProps extends WindowProps {
  // Additional props specific to inventory window if any
}

export function InventoryWindow({ world, visible, onClose }: InventoryWindowProps) {
  const [inventory, setInventory] = useState<InventorySlotItem[]>([])
  const [coins, setCoins] = useState(0)
  const [contextMenu, setContextMenu] = useState<ItemContextMenu>({
    visible: false,
    position: { x: 0, y: 0 },
    item: null
  })
  const [draggedItem, setDraggedItem] = useState<InventorySlotItem | null>(null)
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null)

  // Fetch inventory data from systems
  useEffect(() => {
    if (!visible || !world.systems) return

    const inventorySystem = world.systems.find(s => 
      s.constructor.name === 'InventorySystem'
    ) as InventorySystem | undefined
    
    if (!inventorySystem) {
      console.warn('[InventoryWindow] No InventorySystem found')
      return
    }

    const playerId = world.entities.player?.id
    if (!playerId) return

    const updateInventory = () => {
      // Access inventory data - using type assertion for private property access
      
      try {
        const playerInventory = inventorySystem.getInventory?.(playerId)
        if (playerInventory) {
          setInventory(playerInventory.items || [])
          setCoins(playerInventory.coins || 0)
        }
      } catch (error) {
        console.warn('Failed to get inventory data:', error)
      }
    }

    // Initial load
    updateInventory()

    // Listen for inventory updates
    const handleInventoryUpdate = (data: { playerId?: string }) => {
      if (data.playerId === playerId) {
        updateInventory()
      }
    }

    world.on(EventType.INVENTORY_UPDATED, handleInventoryUpdate)
    world.on(EventType.INVENTORY_INITIALIZED, handleInventoryUpdate)

    return () => {
      world.off(EventType.INVENTORY_UPDATED, handleInventoryUpdate)
      world.off(EventType.INVENTORY_INITIALIZED, handleInventoryUpdate)
    }
  }, [visible, world])

  const handleItemRightClick = useCallback((event: React.MouseEvent, item: InventorySlotItem) => {
    event.preventDefault()
    event.stopPropagation()
    
    setContextMenu({
      visible: true,
      position: { x: event.clientX, y: event.clientY },
      item
    })
  }, [])

  const handleItemLeftClick = useCallback((item: InventorySlotItem) => {
    // Emit item use event for equippable items
    if (item.item?.type === ItemType.WEAPON || item.item?.type === ItemType.ARMOR) {
      world.emit(EventType.EQUIPMENT_EQUIP, {
        playerId: world.entities.player?.id,
        itemId: item.itemId,
        slot: item.slot
      })
    }
  }, [world])

  const getItemActions = (item: InventorySlotItem) => {
    const actions: Array<{
      id: string
      label: string
      icon?: string
      enabled: boolean
      onClick: () => void
    }> = []
    const itemData = item.item

    // Use/Equip action
    if (itemData?.type === ItemType.WEAPON || itemData?.type === ItemType.ARMOR) {
      actions.push({
        id: 'equip',
        label: 'Equip',
        icon: '⚔️',
        enabled: true,
        onClick: () => {
          world.emit(EventType.EQUIPMENT_EQUIP, {
            playerId: world.entities.player?.id,
            itemId: item.itemId,
            slot: item.slot
          })
        }
      })
    }

    // Eat action for food
    if (itemData?.type === ItemType.FOOD || itemData?.name?.toLowerCase().includes('fish')) {
      actions.push({
        id: 'eat',
        label: 'Eat',
        icon: '🍽️',
        enabled: true,
        onClick: () => {
          world.emit(EventType.INVENTORY_USE, {
            playerId: world.entities.player?.id,
            itemId: item.itemId,
            slot: item.slot,
            action: 'eat'
          })
        }
      })
    }

    // Use action for tools and consumables
    if (itemData?.type === ItemType.TOOL || itemData?.type === ItemType.CONSUMABLE) {
      actions.push({
        id: 'use',
        label: 'Use',
        icon: '🔧',
        enabled: true,
        onClick: () => {
          world.emit(EventType.INVENTORY_USE, {
            playerId: world.entities.player?.id,
            itemId: item.itemId,
            slot: item.slot,
            action: 'use'
          })
        }
      })
    }

    // Drop action
    actions.push({
      id: 'drop',
      label: `Drop ${item.quantity > 1 ? 'All' : ''}`,
      icon: '📦',
      enabled: true,
      onClick: () => {
        world.emit(EventType.ITEM_DROP, {
          playerId: world.entities.player?.id,
          itemId: item.itemId,
          slot: item.slot,
          quantity: item.quantity
        })
      }
    })

    // Drop one (for stackable items)
    if (item.quantity > 1) {
      actions.push({
        id: 'drop-one',
        label: 'Drop 1',
        icon: '📦',
        enabled: true,
        onClick: () => {
          world.emit(EventType.ITEM_DROP, {
            playerId: world.entities.player?.id,
            itemId: item.itemId,
            slot: item.slot,
            quantity: 1
          })
        }
      })
    }

    return actions
  }

  const closeContextMenu = () => {
    setContextMenu({
      visible: false,
      position: { x: 0, y: 0 },
      item: null
    })
  }

  // Drag and drop handlers
  const handleDragStart = useCallback((event: React.DragEvent<HTMLElement>, item: InventorySlotItem) => {
    setDraggedItem(item)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/json', JSON.stringify(item))
    
    // Add visual feedback
    event.currentTarget.style.opacity = '0.5'
  }, [])

  const handleDragEnd = useCallback((event: React.DragEvent<HTMLElement>) => {
    setDraggedItem(null)
    setDragOverSlot(null)
    event.currentTarget.style.opacity = '1'
  }, [])

  const handleDragOver = useCallback((event: React.DragEvent, targetSlot: number) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setDragOverSlot(targetSlot)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverSlot(null)
  }, [])

  const handleDrop = useCallback((event: React.DragEvent, targetSlot: number) => {
    event.preventDefault()
    setDragOverSlot(null)
    
    if (!draggedItem) return
    
    const sourceSlot = draggedItem.slot
    const targetItem = inventory.find(item => item.slot === targetSlot)
    
    // Don't allow dropping on the same slot
    if (sourceSlot === targetSlot) return
    
    // Emit inventory move event
    world.emit(EventType.INVENTORY_MOVE, {
      playerId: world.entities.player?.id,
      sourceSlot,
      targetSlot,
      sourceItem: draggedItem,
      targetItem
    })
    
    console.log(`[InventoryWindow] Moving item from slot ${sourceSlot} to slot ${targetSlot}`)
  }, [draggedItem, inventory, world])

  if (!visible) return null

  // Create 28-slot grid (7x4)
  const inventoryGrid = Array.from({ length: 28 }, (_, index) => {
    const item = inventory.find(item => item.slot === index)
    return item || null
  })

  return (
    <>
      <DraggableWindow
        initialPosition={{ x: 400, y: 200 }}
        dragHandle={
          <div style={{
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(11, 10, 21, 0.95)',
            borderTopLeftRadius: '1rem',
            borderTopRightRadius: '1rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1rem' }}>🎒</span>
              <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>Inventory</span>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.7)',
                cursor: 'pointer',
                padding: '0.25rem',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              <span style={{ fontSize: '1rem' }}>×</span>
            </button>
          </div>
        }
        style={{
          position: 'fixed',
          zIndex: 1200
        }}
      >
        <div style={{
          width: '400px',
          background: 'rgba(11, 10, 21, 0.95)',
          border: '0.0625rem solid #2a2b39',
          backdropFilter: 'blur(5px)',
          borderRadius: '1rem',
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          padding: '1rem'
        }}>
          {/* Coins Display */}
          <div style={{
            marginBottom: '1rem',
            padding: '0.5rem',
            background: 'rgba(255, 215, 0, 0.1)',
            borderRadius: '0.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.875rem',
            fontWeight: '500'
          }}>
            <span style={{ color: '#ffd700' }}>💰</span>
            <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
              {coins.toLocaleString()} coins
            </span>
          </div>

          {/* Inventory Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '4px',
            marginBottom: '0.5rem'
          }}>
            {inventoryGrid.map((item, index) => (
              <div
                key={index}
                data-testid={`inventory-slot-${index}`}
                data-slot-index={index}
                draggable={!!item}
                style={{
                  width: '48px',
                  height: '48px',
                  background: dragOverSlot === index 
                    ? 'rgba(59, 130, 246, 0.3)' 
                    : item ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                  border: dragOverSlot === index 
                    ? '2px solid rgba(59, 130, 246, 0.8)' 
                    : '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  cursor: item ? (draggedItem ? 'grabbing' : 'grab') : 'default',
                  transition: 'all 0.2s ease',
                  opacity: draggedItem?.slot === index ? 0.5 : 1
                }}
                onClick={() => item && handleItemLeftClick(item)}
                onContextMenu={(e) => item && handleItemRightClick(e, item)}
                onDragStart={(e) => item && handleDragStart(e, item)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, index)}
                onMouseEnter={(e) => {
                  if (item && !draggedItem) {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)'
                    e.currentTarget.style.transform = 'scale(1.05)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (item && !draggedItem) {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
                    e.currentTarget.style.transform = 'scale(1)'
                  }
                }}
              >
                {item && (
                  <>
                    {/* Item Icon Placeholder */}
                    <div style={{
                      fontSize: '1.5rem',
                      color: 'rgba(255, 255, 255, 0.8)'
                    }}>
                      {getItemIcon(item.item)}
                    </div>
                    
                    {/* Quantity Badge */}
                    {item.quantity > 1 && (
                      <div style={{
                        position: 'absolute',
                        bottom: '2px',
                        right: '2px',
                        background: 'rgba(0, 0, 0, 0.8)',
                        color: 'white',
                        fontSize: '0.625rem',
                        padding: '1px 4px',
                        borderRadius: '8px',
                        minWidth: '12px',
                        textAlign: 'center'
                      }}>
                        {item.quantity}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Instructions */}
          <div style={{
            fontSize: '0.75rem',
            color: 'rgba(255, 255, 255, 0.6)',
            textAlign: 'center',
            marginTop: '0.5rem'
          }}>
            Left-click to equip • Right-click for options • Drag to move items
          </div>
        </div>
      </DraggableWindow>

      {/* Context Menu */}
      <ContextMenu
        visible={contextMenu.visible}
        position={contextMenu.position}
        actions={contextMenu.item ? getItemActions(contextMenu.item as InventorySlotItem) : []}
        onClose={closeContextMenu}
        title={contextMenu.item ? `${(contextMenu.item as InventorySlotItem).item?.name || (contextMenu.item as InventorySlotItem).itemId}${(contextMenu.item as InventorySlotItem).quantity > 1 ? ` (${(contextMenu.item as InventorySlotItem).quantity})` : ''}` : undefined}
      />
    </>
  )
}

// Helper function to get item icons
function getItemIcon(itemData?: Item | { name?: string; type?: string } | null): string {
  if (!itemData) return '📦'
  
  const itemType = itemData.type
  const name = itemData.name?.toLowerCase() || ''
  
  // Weapons
  if (itemType === 'WEAPON') {
    if (name.includes('sword')) return '⚔️'
    if (name.includes('bow')) return '🏹'
    if (name.includes('axe') || name.includes('hatchet')) return '🪓'
    return '⚔️'
  }
  
  // Armor
  if (itemType === 'ARMOR') {
    if (name.includes('helmet')) return '⛑️'
    if (name.includes('body') || name.includes('chest')) return '🛡️'
    if (name.includes('legs')) return '👖'
    if (name.includes('shield')) return '🛡️'
    return '🛡️'
  }
  
  // Tools
  if (itemType === 'TOOL') {
    if (name.includes('hatchet')) return '🪓'
    if (name.includes('fishing')) return '🎣'
    if (name.includes('tinderbox')) return '🔥'
    if (name.includes('pickaxe')) return '⛏️'
    return '🔧'
  }
  
  // Food
  if (itemType === 'FOOD' || name.includes('fish')) {
    if (name.includes('fish')) return '🐟'
    return '🍖'
  }
  
  // Resources
  if (itemType === 'RESOURCE') {
    if (name.includes('log')) return '🪵'
    if (name.includes('ore')) return '⛏️'
    if (name.includes('herb')) return '🌿'
    return '📦'
  }
  
  // Ammunition
  if (name.includes('arrow')) return '🏹'
  
  // Currency
  if (name.includes('coin')) return '💰'
  
  return '📦'
}