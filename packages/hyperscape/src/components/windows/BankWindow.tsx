import { useEffect, useState } from 'react'

import { DraggableWindow } from '../../client/components/DraggableWindow'
import { BankingSystem } from '../../systems/BankingSystem'
import { InventorySystem } from '../../systems/InventorySystem'
import type { BankItem, InventorySlotItem, Item } from '../../types/core'
import { EventType } from '../../types/events'
import type { BankWindowProps } from '../../types/ui-types'
// Using emojis for icons to avoid lucide-react version issues

export function BankWindow({ world, visible, onClose, bankId = 'bank_town_0' }: BankWindowProps) {
  const [bankItems, setBankItems] = useState<BankItem[]>([])
  const [inventoryItems, setInventoryItems] = useState<InventorySlotItem[]>([])
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<InventorySlotItem | null>(null)
  const [selectedBankItem, setSelectedBankItem] = useState<BankItem | null>(null)

  useEffect(() => {
    if (!visible || !world.systems) return

    // Find systems with proper typing
    const bankingSystem = world.systems.find(s => 
      s.constructor.name === 'BankingSystem'
    ) as BankingSystem | undefined
    
    const inventorySystem = world.systems.find(s => 
      s.constructor.name === 'InventorySystem'
    ) as InventorySystem | undefined

    if (!bankingSystem || !inventorySystem) {
      console.warn('[BankWindow] Required systems not found')
      return
    }

    const playerId = world.entities.player?.id
    if (!playerId) return

    const updateBankData = () => {
      // Access bank data - these are private properties accessed for UI display
      // Using explicit type assertion since these systems manage their own state internally
      
      // Get bank data via public API
      const bankData = bankingSystem.getBankData(playerId, bankId)
      if (bankData) {
        setBankItems(bankData.items || [])
      }

      // Get inventory data using public methods  
      try {
        const playerInventory = inventorySystem.getInventory?.(playerId)
        if (playerInventory) {
          setInventoryItems(playerInventory.items || [])
        }
      } catch (error) {
        console.warn('Failed to get inventory data:', error)
      }
    }

    // Initial load
    updateBankData()

    // Listen for updates
    const handleBankUpdate = (data: { playerId?: string }) => {
      if (data.playerId === playerId) {
        updateBankData()
      }
    }

    world.on(EventType.UI_UPDATE, handleBankUpdate)
    world.on(EventType.INVENTORY_UPDATED, handleBankUpdate)

    return () => {
      world.off(EventType.UI_UPDATE, handleBankUpdate)
      world.off(EventType.INVENTORY_UPDATED, handleBankUpdate)
    }
  }, [visible, world, bankId])

  const handleDepositItem = (inventoryItem: InventorySlotItem) => {
    if (!inventoryItem) return

    world.emit(EventType.BANK_DEPOSIT, {
      playerId: world.entities.player?.id,
      bankId,
      itemId: inventoryItem.itemId,
      quantity: inventoryItem.quantity,
      inventorySlot: inventoryItem.slot
    })
  }

  const handleWithdrawItem = (bankItem: BankItem, quantity: number = 1) => {
    if (!bankItem) return

    world.emit(EventType.BANK_WITHDRAW, {
      playerId: world.entities.player?.id,
      bankId,
      itemId: bankItem.id,
      quantity: Math.min(quantity, bankItem.quantity)
    })
  }

  const handleDepositAll = () => {
    world.emit(EventType.BANK_DEPOSIT_ALL, {
      playerId: world.entities.player?.id,
      bankId
    })
  }

  if (!visible) return null

  // Create bank grid (10x10 = 100 slots for "unlimited" storage)
  const bankGrid = Array.from({ length: 50 }, (_, index) => {
    const item = bankItems.find(item => Number(item.id) === index)
    return item || null
  })

  // Create inventory grid (7x4 = 28 slots)
  const inventoryGrid = Array.from({ length: 28 }, (_, index) => {
    const item = inventoryItems.find(item => item.slot === index)
    return item || null
  })

  return (
    <DraggableWindow
      initialPosition={{ x: 300, y: 150 }}
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
            <span style={{ fontSize: '1rem' }}>🏦</span>
            <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>Bank Storage</span>
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
        zIndex: 1300
      }}
    >
      <div style={{
        width: '600px',
        background: 'rgba(11, 10, 21, 0.95)',
        border: '0.0625rem solid #2a2b39',
        backdropFilter: 'blur(5px)',
        borderRadius: '1rem',
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        padding: '1rem'
      }}>
        <div style={{ display: 'flex', gap: '1rem', height: '400px' }}>
          {/* Inventory Side */}
          <div style={{ flex: 1 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.5rem'
            }}>
              <h4 style={{ 
                margin: 0, 
                fontSize: '0.875rem', 
                color: 'rgba(255, 255, 255, 0.9)',
                fontWeight: '500'
              }}>
                Your Inventory
              </h4>
              <button
                onClick={handleDepositAll}
                style={{
                  background: 'rgba(34, 197, 94, 0.2)',
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                  color: '#22c55e',
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  cursor: 'pointer'
                }}
              >
                Deposit All
              </button>
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '2px',
              marginBottom: '0.5rem',
              maxHeight: '320px',
              overflowY: 'auto',
              padding: '0.25rem',
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '4px'
            }}>
              {inventoryGrid.map((item, index) => (
                <div
                  key={index}
                  style={{
                    width: '32px',
                    height: '32px',
                    background: item ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                    border: selectedInventoryItem === item ? '2px solid #22c55e' : '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    cursor: item ? 'pointer' : 'default',
                    fontSize: '0.75rem'
                  }}
                  onClick={() => setSelectedInventoryItem(item)}
                  onDoubleClick={() => item && handleDepositItem(item)}
                >
                  {item && (
                    <>
                      {getItemIcon(item.item)}
                      {item.quantity > 1 && (
                        <div style={{
                          position: 'absolute',
                          bottom: '1px',
                          right: '1px',
                          background: 'rgba(0, 0, 0, 0.8)',
                          color: 'white',
                          fontSize: '0.5rem',
                          padding: '0px 2px',
                          borderRadius: '2px',
                          minWidth: '8px',
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
          </div>

          {/* Transfer Buttons */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0 0.5rem'
          }}>
            <button
              onClick={() => selectedInventoryItem && handleDepositItem(selectedInventoryItem)}
              disabled={!selectedInventoryItem}
              style={{
                background: selectedInventoryItem ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                border: selectedInventoryItem ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid rgba(255, 255, 255, 0.2)',
                color: selectedInventoryItem ? '#22c55e' : 'rgba(255, 255, 255, 0.5)',
                padding: '0.5rem',
                borderRadius: '4px',
                cursor: selectedInventoryItem ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Deposit selected item"
            >
              <span style={{ fontSize: '1rem' }}>→</span>
            </button>
            
            <button
              onClick={() => selectedBankItem && handleWithdrawItem(selectedBankItem, 1)}
              disabled={!selectedBankItem}
              style={{
                background: selectedBankItem ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                border: selectedBankItem ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255, 255, 255, 0.2)',
                color: selectedBankItem ? '#3b82f6' : 'rgba(255, 255, 255, 0.5)',
                padding: '0.5rem',
                borderRadius: '4px',
                cursor: selectedBankItem ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              title="Withdraw selected item"
            >
              <span style={{ fontSize: '1rem' }}>←</span>
            </button>
          </div>

          {/* Bank Side */}
          <div style={{ flex: 1 }}>
            <h4 style={{ 
              margin: 0, 
              marginBottom: '0.5rem',
              fontSize: '0.875rem', 
              color: 'rgba(255, 255, 255, 0.9)',
              fontWeight: '500'
            }}>
              Bank Storage ({bankItems.length} items)
            </h4>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '2px',
              maxHeight: '320px',
              overflowY: 'auto',
              padding: '0.25rem',
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '4px'
            }}>
              {bankGrid.map((item, index) => (
                <div
                  key={index}
                  style={{
                    width: '32px',
                    height: '32px',
                    background: item ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                    border: selectedBankItem === item ? '2px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    cursor: item ? 'pointer' : 'default',
                    fontSize: '0.75rem'
                  }}
                  onClick={() => setSelectedBankItem(item)}
                  onDoubleClick={() => item && handleWithdrawItem(item, 1)}
                >
                  {item && (
                    <>
                      {getItemIcon({ name: item.name })}
                      {item.quantity > 1 && (
                        <div style={{
                          position: 'absolute',
                          bottom: '1px',
                          right: '1px',
                          background: 'rgba(0, 0, 0, 0.8)',
                          color: 'white',
                          fontSize: '0.5rem',
                          padding: '0px 2px',
                          borderRadius: '2px',
                          minWidth: '8px',
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
          </div>
        </div>

        {/* Instructions */}
        <div style={{
          marginTop: '0.5rem',
          fontSize: '0.75rem',
          color: 'rgba(255, 255, 255, 0.6)',
          textAlign: 'center'
        }}>
          Click to select • Double-click to transfer • Use arrow buttons for selected items
        </div>
      </div>
    </DraggableWindow>
  )
}

// Helper function to get item icons (reuse from InventoryWindow)
function getItemIcon(itemData?: { name?: string; type?: string } | Item): string {
  if (!itemData) return '📦'
  
  const name = itemData.name?.toLowerCase() || ''
  
  // Weapons
  if (name.includes('sword')) return '⚔️'
  if (name.includes('bow')) return '🏹'
  if (name.includes('axe') || name.includes('hatchet')) return '🪓'
  
  // Armor
  if (name.includes('helmet')) return '⛑️'
  if (name.includes('body') || name.includes('chest')) return '🛡️'
  if (name.includes('legs')) return '👖'
  if (name.includes('shield')) return '🛡️'
  
  // Tools
  if (name.includes('hatchet')) return '🪓'
  if (name.includes('fishing')) return '🎣'
  if (name.includes('tinderbox')) return '🔥'
  if (name.includes('pickaxe')) return '⛏️'
  
  // Food
  if (name.includes('fish')) return '🐟'
  
  // Resources
  if (name.includes('log')) return '🪵'
  if (name.includes('ore')) return '⛏️'
  if (name.includes('herb')) return '🌿'
  
  // Ammunition
  if (name.includes('arrow')) return '🏹'
  
  // Currency
  if (name.includes('coin')) return '💰'
  
  return '📦'
}