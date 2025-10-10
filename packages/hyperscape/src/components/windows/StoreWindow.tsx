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
        <div className="py-3 px-4 flex items-center justify-between bg-[rgba(11,10,21,0.95)] rounded-t-2xl border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-base">🛒</span>
            <span className="text-sm font-medium">General Store</span>
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
      <div className="w-[500px] h-[450px] bg-[rgba(11,10,21,0.95)] border border-dark-border backdrop-blur-md rounded-2xl rounded-t-none p-4 flex flex-col">
        {/* Player Coins */}
        <div className="mb-4 p-2 bg-yellow-600/10 rounded-lg flex items-center gap-2 text-sm font-medium">
          <span className="text-base text-yellow-400">💰</span>
          <span className="text-white/90">
            Your coins: {playerCoins.toLocaleString()}
          </span>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {categories.map(category => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`py-1 px-3 rounded-full text-xs cursor-pointer capitalize ${
                selectedCategory === category
                  ? 'bg-blue-500/30 border border-blue-500/50 text-blue-400'
                  : 'bg-white/10 border border-white/20 text-white/80'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto bg-black/20 rounded-lg p-2">
          {filteredItems.map((item) => (
            <div
              key={item.itemId}
              className={`${selectedItem === item ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10'} border border-white/10 rounded-lg p-3 mb-2 cursor-pointer transition-all duration-200`}
              onClick={() => setSelectedItem(item)}
            >
              <div className="flex items-center gap-3">
                <div className="text-2xl min-w-[2rem] text-center">
                  {getStoreItemIcon(item)}
                </div>
                
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <h4 className="m-0 text-sm font-medium text-white/90">
                      {item.name}
                    </h4>
                    <div className="flex items-center gap-1 text-yellow-500 text-sm font-medium">
                      <span className="text-xs">💰</span>
                      {item.price}
                    </div>
                  </div>
                  
                  <p className="mt-1 mb-0 text-xs text-white/70 leading-tight">
                    {item.description}
                  </p>
                  
                  <div className="mt-1 text-xs text-white/60">
                    Stock: {item.stockQuantity > 0 ? item.stockQuantity : 'Unlimited'}
                  </div>
                </div>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleBuyItem(item, 1)
                  }}
                  disabled={playerCoins < item.price || item.stockQuantity === 0}
                  className={`py-2 px-4 rounded text-xs font-medium ${
                    (playerCoins >= item.price && item.stockQuantity > 0)
                      ? 'bg-green-500/20 border border-green-500/40 text-green-500 cursor-pointer'
                      : 'bg-white/10 border border-white/20 text-white/50 cursor-not-allowed'
                  }`}
                >
                  Buy
                </button>
              </div>
            </div>
          ))}
          
          {filteredItems.length === 0 && (
            <div className="text-center text-white/60 text-sm p-8">
              No items in this category
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="mt-2 text-xs text-white/60 text-center">
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