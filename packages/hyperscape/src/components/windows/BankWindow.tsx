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
        <div className="py-3 px-4 flex items-center justify-between bg-[rgba(11,10,21,0.95)] rounded-t-2xl border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-base">🏦</span>
            <span className="text-sm font-medium">Bank Storage</span>
          </div>
          <button
            onClick={onClose}
            className="bg-transparent border-none text-white/70 cursor-pointer p-1 rounded flex items-center justify-center hover:text-white"
          >
            <span className="text-base">×</span>
          </button>
        </div>
      }
      className="fixed z-[1300]"
    >
      <div className="w-[600px] bg-[rgba(11,10,21,0.95)] border border-dark-border backdrop-blur-md rounded-2xl rounded-t-none p-4">
        <div className="flex gap-4 h-[400px]">
          {/* Inventory Side */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h4 className="m-0 text-sm text-white/90 font-medium">
                Your Inventory
              </h4>
              <button
                onClick={handleDepositAll}
                className="bg-green-500/20 border border-green-500/40 text-green-500 py-1 px-2 rounded text-xs cursor-pointer hover:bg-green-500/30"
              >
                Deposit All
              </button>
            </div>
            
            <div className="grid grid-cols-7 gap-0.5 mb-2 max-h-[320px] overflow-y-auto p-1 bg-black/20 rounded">
              {inventoryGrid.map((item, index) => (
                <div
                  key={index}
                  className={`w-8 h-8 ${item ? 'bg-white/10' : 'bg-white/5'} ${selectedInventoryItem === item ? 'border-2 border-green-500' : 'border border-white/20'} rounded-sm flex items-center justify-center relative ${item ? 'cursor-pointer' : 'cursor-default'} text-xs`}
                  onClick={() => setSelectedInventoryItem(item)}
                  onDoubleClick={() => item && handleDepositItem(item)}
                >
                  {item && (
                    <>
                      {getItemIcon(item.item)}
                      {item.quantity > 1 && (
                        <div className="absolute bottom-px right-px bg-black/80 text-white text-[0.5rem] px-0.5 rounded-sm min-w-[8px] text-center">
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
          <div className="flex flex-col justify-center gap-2 px-2">
            <button
              onClick={() => selectedInventoryItem && handleDepositItem(selectedInventoryItem)}
              disabled={!selectedInventoryItem}
              className={`${selectedInventoryItem ? 'bg-green-500/20 border-green-500/40 text-green-500 cursor-pointer' : 'bg-white/10 border-white/20 text-white/50 cursor-not-allowed'} border p-2 rounded flex items-center justify-center`}
              title="Deposit selected item"
            >
              <span className="text-base">→</span>
            </button>
            
            <button
              onClick={() => selectedBankItem && handleWithdrawItem(selectedBankItem, 1)}
              disabled={!selectedBankItem}
              className={`${selectedBankItem ? 'bg-blue-500/20 border-blue-500/40 text-blue-500 cursor-pointer' : 'bg-white/10 border-white/20 text-white/50 cursor-not-allowed'} border p-2 rounded flex items-center justify-center`}
              title="Withdraw selected item"
            >
              <span className="text-base">←</span>
            </button>
          </div>

          {/* Bank Side */}
          <div className="flex-1">
            <h4 className="m-0 mb-2 text-sm text-white/90 font-medium">
              Bank Storage ({bankItems.length} items)
            </h4>
            
            <div className="grid grid-cols-7 gap-0.5 max-h-[320px] overflow-y-auto p-1 bg-black/20 rounded">
              {bankGrid.map((item, index) => (
                <div
                  key={index}
                  className={`w-8 h-8 ${item ? 'bg-white/10' : 'bg-white/5'} ${selectedBankItem === item ? 'border-2 border-blue-500' : 'border border-white/20'} rounded-sm flex items-center justify-center relative ${item ? 'cursor-pointer' : 'cursor-default'} text-xs`}
                  onClick={() => setSelectedBankItem(item)}
                  onDoubleClick={() => item && handleWithdrawItem(item, 1)}
                >
                  {item && (
                    <>
                      {getItemIcon({ name: item.name })}
                      {item.quantity > 1 && (
                        <div className="absolute bottom-px right-px bg-black/80 text-white text-[0.5rem] px-0.5 rounded-sm min-w-[8px] text-center">
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
        <div className="mt-2 text-xs text-white/60 text-center">
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