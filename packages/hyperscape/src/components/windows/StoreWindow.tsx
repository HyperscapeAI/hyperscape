import { useEffect, useState } from 'react'
import { DraggableWindow } from '../../client/components/DraggableWindow'
import { InventorySystem } from '../../systems/InventorySystem'
import { StoreSystem } from '../../systems/StoreSystem'
import { EventType } from '../../types/events'
import type { StoreItem } from '../../types/core'
import type { StoreWindowProps } from '../../types/ui-types';


export function StoreWindow({ world, visible, onClose, storeId = 'general_store' }: StoreWindowProps) {
  const [storeItems, setStoreItems] = useState<StoreItem[]>([])
  const [playerCoins, setPlayerCoins] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedItem, setSelectedItem] = useState<StoreItem | null>(null)

  useEffect(() => {
    if (!visible || !world.systems) return

    const storeSystem = world.systems.find(s => 
      s.constructor.name === 'StoreSystem'
    ) as StoreSystem | undefined
    const inventorySystem = world.systems.find(s => 
      s.constructor.name === 'InventorySystem'  
    ) as InventorySystem | undefined

    if (!storeSystem || !inventorySystem) {
      throw new Error('[StoreWindow] Required systems not found')
    }

    const playerId = world.entities.player?.id
    if (!playerId) {
      throw new Error('[StoreWindow] Player not found')
    }

    const updateStoreData = () => {
      // Access store data - using type assertion for private property access
      
      try {
        const storeData = storeSystem.getStore?.(storeId)
        if (storeData) {
          setStoreItems(storeData.items || getDefaultStoreItems())
        } else {
          setStoreItems(getDefaultStoreItems())
        }
      } catch (error) {
        console.warn('Failed to get store data:', error)
        setStoreItems(getDefaultStoreItems())
      }

      // Get player coins using public methods
      
      try {
        const playerInventory = inventorySystem.getInventory?.(playerId)
        if (playerInventory) {
          setPlayerCoins(playerInventory.coins || 0)
        }
      } catch (error) {
        console.warn('Failed to get inventory data:', error)
      }
    }

    // Initial load
    updateStoreData()

    // Listen for updates
    const handleStoreUpdate = (data: { playerId?: string }) => {
      if (data.playerId === playerId) {
        updateStoreData()
      }
    }

    world.on(EventType.STORE_TRANSACTION, handleStoreUpdate)
    world.on(EventType.INVENTORY_UPDATED, handleStoreUpdate)

    return () => {
      world.off(EventType.STORE_TRANSACTION, handleStoreUpdate)
      world.off(EventType.INVENTORY_UPDATED, handleStoreUpdate)
    }
  }, [visible, world, storeId])

  const handleBuyItem = (item: StoreItem, quantity: number = 1) => {
    if (playerCoins < item.price * quantity) {
      console.log('Not enough coins!')
      return
    }

    world.emit(EventType.STORE_TRANSACTION, {
      playerId: world.entities.player?.id,
      storeId,
      itemId: item.itemId,
      quantity,
      totalPrice: item.price * quantity
    })
  }


  if (!visible) return null

  const categories = ['all', 'tools', 'weapons', 'armor', 'consumables', 'ammunition']
  const filteredItems = selectedCategory === 'all' 
    ? storeItems 
    : storeItems.filter(item => item.category === selectedCategory)

  return (
    <DraggableWindow
      initialPosition={{ x: 350, y: 180 }}
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
            <span style={{ fontSize: '1rem' }}>🛒</span>
            <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>General Store</span>
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
        width: '500px',
        height: '450px',
        background: 'rgba(11, 10, 21, 0.95)',
        border: '0.0625rem solid #2a2b39',
        backdropFilter: 'blur(5px)',
        borderRadius: '1rem',
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        padding: '1rem',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Player Coins */}
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
          <span style={{ fontSize: '1rem', color: '#ffd700' }}>💰</span>
          <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
            Your coins: {playerCoins.toLocaleString()}
          </span>
        </div>

        {/* Category Filter */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          flexWrap: 'wrap'
        }}>
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              style={{
                background: selectedCategory === category 
                  ? 'rgba(59, 130, 246, 0.3)' 
                  : 'rgba(255, 255, 255, 0.1)',
                border: selectedCategory === category 
                  ? '1px solid rgba(59, 130, 246, 0.5)' 
                  : '1px solid rgba(255, 255, 255, 0.2)',
                color: selectedCategory === category 
                  ? '#60a5fa' 
                  : 'rgba(255, 255, 255, 0.8)',
                padding: '0.25rem 0.75rem',
                borderRadius: '1rem',
                fontSize: '0.75rem',
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Items List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          background: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '0.5rem',
          padding: '0.5rem'
        }}>
          {filteredItems.map((item) => (
            <div
              key={item.itemId}
              style={{
                background: selectedItem === item 
                  ? 'rgba(255, 255, 255, 0.15)' 
                  : 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '0.5rem',
                padding: '0.75rem',
                marginBottom: '0.5rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onClick={() => setSelectedItem(item)}
              onMouseEnter={(e) => {
                if (selectedItem !== item) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
                }
              }}
              onMouseLeave={(e) => {
                if (selectedItem !== item) {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{
                  fontSize: '1.5rem',
                  minWidth: '2rem',
                  textAlign: 'center'
                }}>
                  {getStoreItemIcon(item)}
                </div>
                
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{
                      margin: 0,
                      fontSize: '0.875rem',
                      fontWeight: '500',
                      color: 'rgba(255, 255, 255, 0.9)'
                    }}>
                      {item.name}
                    </h4>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      color: '#ffd700',
                      fontSize: '0.875rem',
                      fontWeight: '500'
                    }}>
                      <span style={{ fontSize: '0.75rem' }}>💰</span>
                      {item.price}
                    </div>
                  </div>
                  
                  <p style={{
                    margin: '0.25rem 0 0 0',
                    fontSize: '0.75rem',
                    color: 'rgba(255, 255, 255, 0.7)',
                    lineHeight: '1.2'
                  }}>
                    {item.description}
                  </p>
                  
                  <div style={{
                    marginTop: '0.25rem',
                    fontSize: '0.75rem',
                    color: 'rgba(255, 255, 255, 0.6)'
                  }}>
                    Stock: {item.stockQuantity > 0 ? item.stockQuantity : 'Unlimited'}
                  </div>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleBuyItem(item, 1)
                  }}
                  disabled={playerCoins < item.price || item.stockQuantity === 0}
                  style={{
                    background: (playerCoins >= item.price && item.stockQuantity > 0) 
                      ? 'rgba(34, 197, 94, 0.2)' 
                      : 'rgba(255, 255, 255, 0.1)',
                    border: (playerCoins >= item.price && item.stockQuantity > 0) 
                      ? '1px solid rgba(34, 197, 94, 0.4)' 
                      : '1px solid rgba(255, 255, 255, 0.2)',
                    color: (playerCoins >= item.price && item.stockQuantity > 0) 
                      ? '#22c55e' 
                      : 'rgba(255, 255, 255, 0.5)',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.25rem',
                    fontSize: '0.75rem',
                    cursor: (playerCoins >= item.price && item.stockQuantity > 0) 
                      ? 'pointer' 
                      : 'not-allowed',
                    fontWeight: '500'
                  }}
                >
                  Buy
                </button>
              </div>
            </div>
          ))}
          
          {filteredItems.length === 0 && (
            <div style={{
              textAlign: 'center',
              color: 'rgba(255, 255, 255, 0.6)',
              fontSize: '0.875rem',
              padding: '2rem'
            }}>
              No items in this category
            </div>
          )}
        </div>

        {/* Instructions */}
        <div style={{
          marginTop: '0.5rem',
          fontSize: '0.75rem',
          color: 'rgba(255, 255, 255, 0.6)',
          textAlign: 'center'
        }}>
          Click an item to select • Click "Buy" to purchase
        </div>
      </div>
    </DraggableWindow>
  )
}

function getDefaultStoreItems(): StoreItem[] {
  return [
    // Tools
    {
      id: 'hatchet',
      itemId: 'hatchet',
      name: 'Bronze Hatchet',
      description: 'A basic hatchet for chopping trees',
      price: 50,
      stockQuantity: -1, // Unlimited
      category: 'tools',
      restockTime: 0
    },
    {
      id: 'fishing_rod',
      itemId: 'fishing_rod',
      name: 'Fishing Rod',
      description: 'Standard fishing rod for catching fish',
      price: 75,
      stockQuantity: -1,
      category: 'tools',
      restockTime: 0
    },
    {
      id: 'tinderbox',
      itemId: 'tinderbox',
      name: 'Tinderbox',
      description: 'For creating fires from logs',
      price: 10,
      stockQuantity: -1,
      category: 'tools',
      restockTime: 0
    },
    
    // Ammunition
    {
      id: 'arrows',
      itemId: 'arrows',
      name: 'Arrows',
      description: 'Basic arrows for bows',
      price: 1,
      stockQuantity: -1,
      category: 'ammunition',
      restockTime: 0
    },
    
    // Basic Consumables
    {
      id: 'bread',
      itemId: 'bread',
      name: 'Bread',
      description: 'Restores a small amount of health',
      price: 5,
      stockQuantity: -1,
      category: 'consumables',
      restockTime: 0
    },
    
    // Basic Weapons (limited stock)
    {
      id: 'bronze_sword',
      itemId: 'bronze_sword',
      name: 'Bronze Sword',
      description: 'A basic sword made of bronze',
      price: 100,
      stockQuantity: 3,
      category: 'weapons',
      restockTime: 0
    },
    {
      id: 'wood_bow',
      itemId: 'wood_bow',
      name: 'Wood Bow',
      description: 'A simple bow made of wood',
      price: 80,
      stockQuantity: 2,
      category: 'weapons',
      restockTime: 0
    },
    
    // Basic Armor (limited stock)
    {
      id: 'bronze_helmet',
      itemId: 'bronze_helmet',
      name: 'Bronze Helmet',
      description: 'Basic bronze head protection',
      price: 60,
      stockQuantity: 2,
      category: 'armor',
      restockTime: 0
    },
    {
      id: 'bronze_shield',
      itemId: 'bronze_shield',
      name: 'Bronze Shield',
      description: 'Basic bronze shield for defense',
      price: 80,
      stockQuantity: 2,
      category: 'armor',
      restockTime: 0
    }
  ]
}

function getStoreItemIcon(item: StoreItem): string {
  const name = item.name.toLowerCase()
  
  // Tools
  if (name.includes('hatchet')) return '🪓'
  if (name.includes('fishing')) return '🎣'
  if (name.includes('tinderbox')) return '🔥'
  if (name.includes('pickaxe')) return '⛏️'
  
  // Weapons
  if (name.includes('sword')) return '⚔️'
  if (name.includes('bow')) return '🏹'
  
  // Armor
  if (name.includes('helmet')) return '⛑️'
  if (name.includes('shield')) return '🛡️'
  if (name.includes('body') || name.includes('chest')) return '🛡️'
  
  // Ammunition
  if (name.includes('arrow')) return '🏹'
  
  // Consumables
  if (name.includes('bread') || name.includes('food')) return '🍞'
  if (name.includes('fish')) return '🐟'
  
  return '📦'
}