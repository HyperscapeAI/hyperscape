import React, { useState, useEffect, useCallback } from 'react'

import { DraggableWindow } from '../../client/components/DraggableWindow'
import { EquipmentSlot, EquipmentSystem } from '../../systems/EquipmentSystem'
import type { Item } from '../../types/core'
import { EquipmentSlotName } from '../../types/core'
import { EventType } from '../../types/events'
import type { WindowProps } from '../../types/ui-types';

// Using emojis for icons to avoid lucide-react version issues

interface EquipmentWindowProps extends WindowProps {
  // Additional props specific to equipment window if any
}

const EQUIPMENT_SLOTS: Array<{ slot: keyof typeof EquipmentSlotName; name: string; icon: string; position: { row: number; col: number } }> = [
  { slot: 'HELMET', name: 'Helmet', icon: '⛑️', position: { row: 0, col: 1 } },
  { slot: 'WEAPON', name: 'Weapon', icon: '⚔️', position: { row: 1, col: 0 } },
  { slot: 'BODY', name: 'Body', icon: '🛡️', position: { row: 1, col: 1 } },
  { slot: 'SHIELD', name: 'Shield', icon: '🛡️', position: { row: 1, col: 2 } },
  { slot: 'LEGS', name: 'Legs', icon: '👖', position: { row: 2, col: 1 } },
  { slot: 'ARROWS', name: 'Arrows', icon: '🏹', position: { row: 3, col: 1 } }
]

export function EquipmentWindow({ world, visible, onClose }: EquipmentWindowProps) {
  const [equipment, setEquipment] = useState<Record<string, EquipmentSlot>>({})
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null)

  // Fetch equipment data from systems
  useEffect(() => {
    if (!visible || !world.systems) return

    const equipmentSystem = world.systems.find(s => 
      s.constructor.name === 'EquipmentSystem'
    ) as EquipmentSystem | undefined
    
    if (!equipmentSystem) {
      console.warn('[EquipmentWindow] No EquipmentSystem found')
      return
    }

    const playerId = world.entities.player?.id
    if (!playerId) return

    const updateEquipment = () => {
      // Access equipment data using public methods or fallback to internal access
      
      try {
        const playerEquipmentData = equipmentSystem.getPlayerEquipment?.(playerId)
        if (playerEquipmentData) {
          const equipmentMap: Record<string, EquipmentSlot> = {}
          
          EQUIPMENT_SLOTS.forEach(slotDef => {
            const slotValue = EquipmentSlotName[slotDef.slot] 
            const slotData = playerEquipmentData[slotValue]
            equipmentMap[slotValue] = {
              id: `equipment_${slotValue}_${playerId}`,
              name: slotDef.name,
              slot: EquipmentSlotName[slotDef.slot],
              itemId: slotData?.itemId || null,
              item: slotData?.item || null
            }
          })
          
          setEquipment(equipmentMap)
        }
      } catch (error) {
        console.warn('Failed to get equipment data:', error)
      }
    }

    // Initial load
    updateEquipment()

    // Listen for equipment updates
    const handleEquipmentUpdate = (data: { playerId?: string }) => {
      if (data.playerId === playerId) {
        updateEquipment()
      }
    }

    world.on(EventType.PLAYER_EQUIPMENT_UPDATED, handleEquipmentUpdate)

    return () => {
      world.off(EventType.PLAYER_EQUIPMENT_UPDATED, handleEquipmentUpdate)
    }
  }, [visible, world])

  // Drag and drop handlers
  const handleDragOver = useCallback((event: React.DragEvent, targetSlot: string) => {
    event.preventDefault()
    
    // Check if dragged item is compatible with this slot
    try {
      const dragData = event.dataTransfer.getData('application/json')
      if (dragData) {
        const draggedItem = JSON.parse(dragData)
        
        // Basic compatibility check
        if (canEquipItem(draggedItem.item, targetSlot)) {
          event.dataTransfer.dropEffect = 'move'
          setDragOverSlot(targetSlot)
        } else {
          event.dataTransfer.dropEffect = 'none'
        }
      }
    } catch (_error) {
      event.dataTransfer.dropEffect = 'none'
    }
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragOverSlot(null)
  }, [])

  const handleDrop = useCallback((event: React.DragEvent, targetSlot: string) => {
    event.preventDefault()
    setDragOverSlot(null)
    
    try {
      const dragData = event.dataTransfer.getData('application/json')
      if (!dragData) return
      
      const draggedItem = JSON.parse(dragData)
      
      // Verify item can be equipped in this slot
      if (!canEquipItem(draggedItem.item, targetSlot)) {
        console.log(`[EquipmentWindow] Item ${draggedItem.item?.name} cannot be equipped in ${targetSlot} slot`)
        return
      }
      
      // Emit equipment event
      world.emit(EventType.EQUIPMENT_EQUIP, {
        playerId: world.entities.player?.id,
        itemId: draggedItem.itemId,
        sourceSlot: draggedItem.slot,
        targetSlot: targetSlot
      })
      
      console.log(`[EquipmentWindow] Equipping ${draggedItem.item?.name} to ${targetSlot} slot`)
      
    } catch (error) {
      console.error('[EquipmentWindow] Drop error:', error)
    }
  }, [world])

  const handleUnequip = useCallback((slot: string) => {
    const item = equipment[slot]?.item
    if (!item) return
    
    world.emit(EventType.EQUIPMENT_UNEQUIP, {
      playerId: world.entities.player?.id,
      slot: slot,
      item: item
    })
    
    console.log(`[EquipmentWindow] Unequipping ${item.name} from ${slot} slot`)
  }, [equipment, world])

  if (!visible) return null

  return (
    <DraggableWindow
      initialPosition={{ x: 600, y: 200 }}
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
            <span style={{ fontSize: '1rem' }}>⚔️</span>
            <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>Equipment</span>
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
          >
            <span style={{ fontSize: '1rem' }}>×</span>
          </button>
        </div>
      }
      style={{
        position: 'fixed',
        zIndex: 1250
      }}
    >
      <div style={{
        width: '300px',
        height: '350px',
        background: 'rgba(11, 10, 21, 0.95)',
        border: '0.0625rem solid #2a2b39',
        backdropFilter: 'blur(5px)',
        borderRadius: '1rem',
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        padding: '1rem'
      }}>
        {/* Equipment Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(4, 1fr)',
          gap: '12px',
          height: '240px',
          marginBottom: '1rem'
        }}>
          {/* Create grid positions */}
          {Array.from({ length: 12 }, (_, index) => {
            const row = Math.floor(index / 3)
            const col = index % 3
            
            // Find equipment slot for this position
            const slotDef = EQUIPMENT_SLOTS.find(s => 
              s.position.row === row && s.position.col === col
            )
            
            if (!slotDef) {
              // Empty grid cell
              return (
                <div
                  key={`empty-${index}`}
                  style={{
                    width: '64px',
                    height: '64px',
                    background: 'transparent'
                  }}
                />
              )
            }
            
            const slotValue = EquipmentSlotName[slotDef.slot]
            const equipmentSlot = equipment[slotValue]
            const hasItem = equipmentSlot?.item
            
            return (
              <div
                key={slotValue}
                data-testid={`equipment-slot-${slotValue}`}
                style={{
                  width: '64px',
                  height: '64px',
                  background: dragOverSlot === slotValue 
                    ? 'rgba(34, 197, 94, 0.3)' 
                    : hasItem 
                      ? 'rgba(255, 255, 255, 0.15)' 
                      : 'rgba(255, 255, 255, 0.05)',
                  border: dragOverSlot === slotValue 
                    ? '2px solid rgba(34, 197, 94, 0.8)' 
                    : '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  cursor: hasItem ? 'pointer' : 'default',
                  transition: 'all 0.2s ease'
                }}
                onDragOver={(e) => handleDragOver(e, slotValue)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, slotValue)}
                onClick={() => hasItem && handleUnequip(slotValue)}
                title={hasItem ? `${hasItem.name} (click to unequip)` : `${slotDef.name} slot`}
              >
                {hasItem ? (
                  // Equipped item
                  <div style={{
                    fontSize: '1.5rem',
                    color: 'rgba(255, 255, 255, 0.9)'
                  }}>
                    {getEquipmentIcon(slotValue, hasItem)}
                  </div>
                ) : (
                  // Empty slot with placeholder
                  <>
                    <div style={{
                      fontSize: '1.25rem',
                      color: 'rgba(255, 255, 255, 0.3)',
                      marginBottom: '2px'
                    }}>
                      {slotDef.icon}
                    </div>
                    <div style={{
                      fontSize: '0.625rem',
                      color: 'rgba(255, 255, 255, 0.4)',
                      textAlign: 'center',
                      lineHeight: '1'
                    }}>
                      {slotDef.name}
                    </div>
                  </>
                )}
                
                {/* Item name tooltip */}
                {hasItem && (
                  <div style={{
                    position: 'absolute',
                    bottom: '-2px',
                    left: '2px',
                    right: '2px',
                    fontSize: '0.5rem',
                    color: 'rgba(255, 255, 255, 0.8)',
                    textAlign: 'center',
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    borderRadius: '2px',
                    padding: '1px',
                    maxWidth: '60px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {hasItem.name}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Stats Display */}
        <div style={{
          background: 'rgba(0, 0, 0, 0.3)',
          borderRadius: '0.5rem',
          padding: '0.5rem',
          fontSize: '0.75rem',
          color: 'rgba(255, 255, 255, 0.8)'
        }}>
          <div style={{ marginBottom: '0.25rem' }}>
            <strong>Equipment Stats</strong>
          </div>
          {calculateEquipmentStats(equipment)}
        </div>

        {/* Instructions */}
        <div style={{
          fontSize: '0.75rem',
          color: 'rgba(255, 255, 255, 0.6)',
          textAlign: 'center',
          marginTop: '0.5rem'
        }}>
          Drag items from inventory • Click equipped items to unequip
        </div>
      </div>
    </DraggableWindow>
  )
}

// Helper functions
function canEquipItem(item?: Item | null, slot?: string): boolean {
  if (!item) return false
  
  const itemType = item.type?.toLowerCase()
  const itemName = item.name?.toLowerCase() || ''
  
  switch (slot) {
    case EquipmentSlotName.WEAPON:
      return itemType === 'weapon' || itemName.includes('sword') || itemName.includes('bow') || itemName.includes('axe')
    case EquipmentSlotName.SHIELD:
      return itemType === 'armor' && itemName.includes('shield')
    case EquipmentSlotName.HELMET:
      return itemType === 'armor' && itemName.includes('helmet')
    case EquipmentSlotName.BODY:
      return itemType === 'armor' && (itemName.includes('body') || itemName.includes('chest'))
    case EquipmentSlotName.LEGS:
      return itemType === 'armor' && itemName.includes('legs')
    case EquipmentSlotName.ARROWS:
      return itemName.includes('arrow')
    default:
      return false
  }
}

function getEquipmentIcon(slot: string, item?: Item | null): string {
  if (!item) return '📦'
  
  const name = item.name?.toLowerCase() || ''
  
  switch (slot) {
    case EquipmentSlotName.WEAPON:
      if (name.includes('sword')) return '⚔️'
      if (name.includes('bow')) return '🏹'
      if (name.includes('axe') || name.includes('hatchet')) return '🪓'
      return '⚔️'
    case EquipmentSlotName.SHIELD:
      return '🛡️'
    case EquipmentSlotName.HELMET:
      return '⛑️'
    case EquipmentSlotName.BODY:
      return '🛡️'
    case EquipmentSlotName.LEGS:
      return '👖' 
    case EquipmentSlotName.ARROWS:
      return '🏹'
    default:
      return '📦'
  }
}

function calculateEquipmentStats(equipment: Record<string, EquipmentSlot>): React.ReactNode {
  const stats = {
    attack: 0,
    defense: 0,
    ranged: 0
  }
  
  Object.values(equipment).forEach(slot => {
    if (slot.item) {
      // Add basic stat bonuses based on item type
      const name = slot.item.name?.toLowerCase() || ''
      
      if (name.includes('sword')) stats.attack += 5
      if (name.includes('bow')) stats.ranged += 5
      if (name.includes('shield')) stats.defense += 3
      if (name.includes('helmet')) stats.defense += 2
      if (name.includes('body')) stats.defense += 4
      if (name.includes('legs')) stats.defense += 3
    }
  })
  
  return (
    <div>
      <div>Attack Bonus: +{stats.attack}</div>
      <div>Defense Bonus: +{stats.defense}</div>
      <div>Ranged Bonus: +{stats.ranged}</div>
    </div>
  )
}