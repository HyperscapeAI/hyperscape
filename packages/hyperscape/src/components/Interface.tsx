import { useCallback, useEffect, useState } from 'react'
import { EventType } from '../types/events'
// import { getTypedWorld } from '../../types/typed-world'
import {
  DamageNumber,
  EquipmentSlotName,
  InventoryItem,
  PlayerStats,
  BankEntityData,
  BankItem,
  StoreData,
  World,
  PlayerEquipmentItems
} from '../types/core'
import { InteractionHandler } from './InteractionHandler'

// No local interfaces - use shared types with proper type assertions

// Helper to get item display properties
const getItemDisplayProps = (item: InventoryItem | null): { name: string; type?: string } => {
  if (!item) return { name: 'Empty', type: undefined }
  // For now, we'll use the itemId as the name since InventoryItem doesn't have name/type
  // In a real implementation, this would look up the full item data from the item registry
  return {
    name: item.itemId,
    type: undefined // Type would come from the full item data lookup
  }
}

export function Interface({ world }: { world: World }) {
  // Extended player stats to include UI-specific fields
  const [playerStats, setPlayerStats] = useState<PlayerStats & {
    id: string
    name: string
    stamina: number
    maxStamina: number
    xp: number
    maxXp: number
    coins: number
    combatStyle: 'attack' | 'strength' | 'defense' | 'ranged'
  } | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [equipment, setEquipment] = useState<PlayerEquipmentItems | null>(null)
  const [showInventory, setShowInventory] = useState(false)
  const [showBank, setShowBank] = useState(false)
  const [showStore, setShowStore] = useState(false)
  const [bankData, setBankData] = useState<BankEntityData & { items: BankItem[] } | null>(null)
  const [storeData, setStoreData] = useState<StoreData | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    itemId: string
    actions: string[]
  } | null>(null)
  const [damageNumbers, setDamageNumbers] = useState<DamageNumber[]>([])

  useEffect(() => {
    const localPlayer = world.getPlayer()
    if (!localPlayer) return

    // Handle UI updates
    const handleUIUpdate = (data: unknown) => {
      const update = data as {
        playerId: string
        component: 'player' | 'health' | 'inventory' | 'equipment' | 'bank' | 'store'
        data: unknown
      }
      if (update.playerId !== localPlayer.id) return

      switch (update.component) {
        case 'player':
        case 'health': {
          const playerData = update.data as PlayerStats & {
            id: string
            name: string
            stamina: number
            maxStamina: number
            xp: number
            maxXp: number
            coins: number
            combatStyle: 'attack' | 'strength' | 'defense' | 'ranged'
          }
          setPlayerStats(playerData)
          break
        }
        case 'inventory': {
          const inventoryData = update.data as { items: InventoryItem[] }
          setInventory(inventoryData.items || [])
          break
        }
        case 'equipment': {
          const equipmentData = update.data as { equipment: PlayerEquipmentItems }
          setEquipment(equipmentData.equipment || null)
          break
        }
        case 'bank': {
          const bankData = update.data as BankEntityData & { isOpen: boolean; items: BankItem[] }
          if (bankData.isOpen) {
            setBankData(bankData)
            setShowBank(true)
          } else {
            setShowBank(false)
          }
          break
        }
      }
    }

    // Handle specific events
    const handleStatsUpdate = (rawData: unknown) => {
      const data = rawData as Partial<PlayerStats & {
        id: string
        name: string
        stamina: number
        maxStamina: number
        xp: number
        maxXp: number
        coins: number
        combatStyle: 'attack' | 'strength' | 'defense' | 'ranged'
      }> & { playerId: string }
      if (data.playerId !== localPlayer.id) return
      setPlayerStats(prev => prev ? { ...prev, ...data } : null)
    }

    const handleInventoryUpdate = (rawData: unknown) => {
      const data = rawData as { playerId: string; items: InventoryItem[] }
      if (data.playerId !== localPlayer.id) return
      setInventory(data.items || [])
    }

    const handleEquipmentUpdate = (rawData: unknown) => {
              const data = rawData as { playerId: string; equipment: PlayerEquipmentItems }
      if (data.playerId !== localPlayer.id) return
      setEquipment(data.equipment)
    }

    const handleBankOpen = (rawData: unknown) => {
              const data = rawData as BankEntityData & { playerId: string; items: BankItem[] }
      if (data.playerId !== localPlayer.id) return
      setBankData(data)
      setShowBank(true)
    }

    const handleBankClose = (rawData: unknown) => {
      const data = rawData as { playerId: string }
      if (data.playerId !== localPlayer.id) return
      setShowBank(false)
      setBankData(null)
    }

    const handleStoreOpen = (rawData: unknown) => {
      const data = rawData as StoreData & { playerId: string }
      if (data.playerId !== localPlayer.id) return
      setStoreData(data)
      setShowStore(true)
    }

    const handleStoreClose = (rawData: unknown) => {
      const data = rawData as { playerId: string }
      if (data.playerId !== localPlayer.id) return
      setShowStore(false)
      setStoreData(null)
    }

    const handleContextMenu = (rawData: unknown) => {
      const data = rawData as {
        x: number
        y: number
        itemId: string
        actions: string[]
        playerId: string
      }
      if (data.playerId !== localPlayer.id) return
      setContextMenu({
        x: data.x,
        y: data.y,
        itemId: data.itemId,
        actions: data.actions
      })
    }

    const handleCombatEvent = (rawData: unknown) => {
      const data = rawData as { damage?: number; amount?: number; type?: string; x?: number; y?: number }
      // Add damage numbers for combat events
      if (data.damage !== undefined || data.type) {
        // Determine the type based on the data
        let damageType: 'damage' | 'heal' | 'xp' | 'miss' = 'damage';
        if (data.type && ['damage', 'heal', 'xp', 'miss'].includes(data.type)) {
          damageType = data.type as 'damage' | 'heal' | 'xp' | 'miss';
        } else if (data.damage !== undefined) {
          damageType = data.damage > 0 ? 'damage' : 'heal';
        }
        
        const newDamageNumber: DamageNumber = {
          id: `${Date.now()}-${Math.random()}`,
          value: data.damage || data.amount || 0,
          type: damageType,
          position: {
            x: (data.x || Math.random() * window.innerWidth * 0.5) + window.innerWidth * 0.25,
            y: (data.y || Math.random() * window.innerHeight * 0.5) + window.innerHeight * 0.25,
            z: 0
          },
          timestamp: Date.now(),
        }
        
        setDamageNumbers(prev => [...prev, newDamageNumber])
        
        // Remove damage number after animation
        setTimeout(() => {
          setDamageNumbers(prev => prev.filter(num => num.id !== newDamageNumber.id))
        }, 2000)
      }
    }

    // Subscribe to events
    const typedWorld = world
    typedWorld.on(EventType.UI_UPDATE, handleUIUpdate)
    typedWorld.on(EventType.STATS_UPDATE, handleStatsUpdate)
    typedWorld.on(EventType.INVENTORY_UPDATED, handleInventoryUpdate)
    typedWorld.on(EventType.UI_EQUIPMENT_UPDATE, handleEquipmentUpdate)
    typedWorld.on(EventType.BANK_OPEN, handleBankOpen)
    typedWorld.on(EventType.BANK_CLOSE, handleBankClose)
    // Removed BANK_INTERFACE_UPDATE - UI updates reactively to BANK_DEPOSIT_SUCCESS/BANK_WITHDRAW_SUCCESS
    typedWorld.on(EventType.STORE_OPEN, handleStoreOpen)
    typedWorld.on(EventType.STORE_CLOSE, handleStoreClose)
    // Removed STORE_INTERFACE_UPDATE - UI updates reactively to STORE_BUY/STORE_SELL events
    typedWorld.on(EventType.UI_CONTEXT_MENU, handleContextMenu)
    typedWorld.on(EventType.COMBAT_DAMAGE_DEALT, handleCombatEvent)
    typedWorld.on(EventType.COMBAT_HEAL, handleCombatEvent)
    typedWorld.on(EventType.SKILLS_XP_GAINED, handleCombatEvent)
    typedWorld.on(EventType.COMBAT_MISS, handleCombatEvent)

    // Keyboard shortcuts
    const control = world.controls?.bind({ priority: 100 }) as {
      keyI?: { onPress: () => void };
      keyB?: { onPress: () => void };
      keyT?: { onPress: () => void };
      keyC?: { onPress: () => void };
      unbind: () => void;
    } | undefined
    if (control) {
      if (control.keyI) {
        control.keyI.onPress = () => setShowInventory(prev => !prev)
      }
    }

    // Request initial data
    typedWorld.emit(EventType.UI_REQUEST, { playerId: localPlayer.id })

    return () => {
      typedWorld.off(EventType.UI_UPDATE, handleUIUpdate)
      typedWorld.off(EventType.STATS_UPDATE, handleStatsUpdate)
      typedWorld.off(EventType.INVENTORY_UPDATED, handleInventoryUpdate)
      typedWorld.off(EventType.UI_EQUIPMENT_UPDATE, handleEquipmentUpdate)
      typedWorld.off(EventType.BANK_OPEN, handleBankOpen)
      typedWorld.off(EventType.BANK_CLOSE, handleBankClose)
      // Removed BANK_INTERFACE_UPDATE listener cleanup
      typedWorld.off(EventType.STORE_OPEN, handleStoreOpen)
      typedWorld.off(EventType.STORE_CLOSE, handleStoreClose)
      // Removed STORE_INTERFACE_UPDATE listener cleanup
      typedWorld.off(EventType.UI_CONTEXT_MENU, handleContextMenu)
      typedWorld.off(EventType.COMBAT_DAMAGE_DEALT, handleCombatEvent)
      typedWorld.off(EventType.COMBAT_HEAL, handleCombatEvent)
      typedWorld.off(EventType.SKILLS_XP_GAINED, handleCombatEvent)
      typedWorld.off(EventType.COMBAT_MISS, handleCombatEvent)
      if (control?.unbind) {
        control.unbind()
      }
    }
  }, [world])

  // Update player health from player object directly
  useEffect(() => {
    const interval = setInterval(() => {
      const player = world.getPlayer()
      if (player && player.health !== undefined) {
        setPlayerStats(prev => {
          if (!prev) {
            const defaultEquipment: PlayerEquipmentItems = {
              weapon: null,
              shield: null,
              helmet: null,
              body: null,
              legs: null,
              arrows: null
            }
            return {
              id: player.id || 'player',
              name: player.name || 'Player',
              health: {
                current: Math.floor(player.health.current ?? 100),
                max: 100
              },
              stamina: 100,
              maxStamina: 100,
              level: 1,
              combatLevel: 3,
              xp: 0,
              maxXp: 83,
              coins: 0,
              inCombat: false,
              combatStyle: 'attack' as const,
              equipment: defaultEquipment,
              skills: {
                attack: { level: 1, xp: 0 },
                strength: { level: 1, xp: 0 },
                defense: { level: 1, xp: 0 },
                constitution: { level: 1, xp: 0 },
                ranged: { level: 1, xp: 0 },
                woodcutting: { level: 1, xp: 0 },
                fishing: { level: 1, xp: 0 },
                firemaking: { level: 1, xp: 0 },
                cooking: { level: 1, xp: 0 }
              }
            }
          }
          return {
            ...prev,
            health: {
              current: Math.floor(player.health.current ?? 100),
              max: prev.health?.max || 100
            },
            stamina: prev.stamina || 100,
            maxStamina: prev.maxStamina || 100,
            combatLevel: prev.combatLevel || 3,
            inCombat: prev.inCombat || false,
          }
        })
      }
    }, 100)

    return () => clearInterval(interval)
  }, [world])

  return (
    <>
      {playerStats && <Hud stats={playerStats} />}
      {showInventory && (
        <UnifiedInventoryEquipment
          items={inventory}
          equipment={equipment}
          stats={playerStats}
          onClose={() => setShowInventory(false)}
          world={world}
        />
      )}
      {showBank && bankData && (
        <Bank
          data={bankData}
          onClose={() => {
            setShowBank(false)
            const player = world.getPlayer()
            if (player) {
              world.emit(EventType.BANK_CLOSE, {
                playerId: player.id,
                bankId: bankData.id,
              })
            }
          }}
          world={world}
        />
      )}
      {showStore && storeData && (
        <StorePanel
          data={storeData}
          onClose={() => {
            setShowStore(false)
            const player = world.getPlayer()
            if (player) {
              world.emit(EventType.STORE_CLOSE, {
                playerId: player.id,
                storeId: storeData.id,
              })
            }
          }}
          world={world}
        />
      )}
      {contextMenu && (
        <ContextMenuPanel
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          world={world}
        />
      )}
      <ButtonPanel
        onInventoryClick={() => setShowInventory(!showInventory)}
        showInventory={showInventory}
        world={world}
      />
      <DamageNumbers damageNumbers={damageNumbers} />
      <Hotbar stats={playerStats} inventory={inventory} world={world} />
      <InteractionHandler world={world} />
    </>
  )
}

// Button Panel Component (Bottom-Right UI)
function ButtonPanel({
  onInventoryClick,
  showInventory,
  world: _world,
}: {
  onInventoryClick: () => void
  showInventory: boolean
  world: World
}) {
  const buttonStyle = {
    width: '3rem',
    height: '3rem',
    background: 'rgba(11, 10, 21, 0.9)',
    border: '0.0625rem solid #2a2b39',
    borderRadius: '0.375rem',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.25rem',
    fontWeight: 'bold',
    backdropFilter: 'blur(5px)',
    transition: 'all 0.2s ease',
  }

  const activeButtonStyle = {
    ...buttonStyle,
    background: 'rgba(59, 130, 246, 0.8)',
    borderColor: '#3b82f6',
    boxShadow: '0 0 10px rgba(59, 130, 246, 0.5)',
  }

  return (
    <div
      className="rpg-button-panel"
      style={{
        position: 'fixed',
        bottom: 'calc(1rem + env(safe-area-inset-bottom))',
        right: 'calc(1rem + env(safe-area-inset-right))',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        pointerEvents: 'auto',
        zIndex: 100,
      }}
    >
      {/* Inventory Button */}
      <button
        onClick={onInventoryClick}
        style={showInventory ? activeButtonStyle : buttonStyle}
        onMouseEnter={(e) => {
          if (!showInventory) {
            e.currentTarget.style.background = 'rgba(11, 10, 21, 0.95)'
            e.currentTarget.style.borderColor = '#3b82f6'
            e.currentTarget.style.transform = 'scale(1.05)'
          }
        }}
        onMouseLeave={(e) => {
          if (!showInventory) {
            e.currentTarget.style.background = 'rgba(11, 10, 21, 0.9)'
            e.currentTarget.style.borderColor = '#2a2b39'
            e.currentTarget.style.transform = 'scale(1)'
          }
        }}
        title="Inventory (I)"
      >
        🎒
      </button>

      {/* Settings Button */}
      <button
        style={buttonStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(11, 10, 21, 0.95)'
          e.currentTarget.style.borderColor = '#3b82f6'
          e.currentTarget.style.transform = 'scale(1.05)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(11, 10, 21, 0.9)'
          e.currentTarget.style.borderColor = '#2a2b39'
          e.currentTarget.style.transform = 'scale(1)'
        }}
        title="Settings"
        onClick={() => {
          const player = _world.getPlayer()
          if (!player) return
          // Open the preferences pane in the sidebar
          _world.emit(EventType.UI_OPEN_PANE, { pane: 'prefs' })
        }}
      >
        ⚙️
      </button>
    </div>
  )
}

// HUD Component
function Hud({ stats }: { stats: PlayerStats & {
  id: string
  name: string
  stamina: number
  maxStamina: number
  xp: number
  maxXp: number
  coins: number
  combatStyle: 'attack' | 'strength' | 'defense' | 'ranged'
} }) {
  const healthPercent = (stats.health.current / stats.health.max) * 100
  const healthColor = healthPercent > 60 ? '#4ade80' : healthPercent > 30 ? '#fbbf24' : '#ef4444'
  
  const staminaPercent = (stats.stamina / stats.maxStamina) * 100
  const staminaColor = '#3b82f6' // Blue color for stamina
  
  const xpPercent = (stats.xp / stats.maxXp) * 100
  const xpColor = '#8b5cf6' // Purple color for XP
  
  const combatLevelColors = {
    attack: '#ef4444',    // Red
    strength: '#10b981',  // Green  
    defense: '#3b82f6',   // Blue
    ranged: '#f59e0b'     // Orange
  }

  return (
    <div
      className="rpg-hud"
      style={{
        position: 'absolute',
        top: 'calc(1rem + env(safe-area-inset-top))',
        left: 'calc(1rem + env(safe-area-inset-left))',
        width: '20rem',
        background: 'rgba(11, 10, 21, 0.85)',
        border: '0.0625rem solid #2a2b39',
        borderRadius: '0.5rem',
        padding: '0.75rem',
        pointerEvents: 'none',
        backdropFilter: 'blur(5px)',
      }}
    >
      {/* Top Info */}
      <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>Level {stats.level}</div>
          <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Combat Lv. {Math.floor(((stats.skills?.attack?.level || 0) + (stats.skills?.strength?.level || 0) + (stats.skills?.defense?.level || 0) + (stats.skills?.ranged?.level || 0)) / 4)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#fbbf24', fontWeight: 'bold' }}>{stats.coins.toLocaleString()} gp</div>
          <div style={{ fontSize: '0.875rem', color: combatLevelColors[stats.combatStyle] }}>Style: {stats.combatStyle}</div>
        </div>
      </div>
      
      {/* Health Bar */}
      <div style={{ marginBottom: '0.5rem' }}>
        <div style={{ fontSize: '0.875rem', marginBottom: '0.125rem', display: 'flex', justifyContent: 'space-between' }}>
          <span>Health</span>
          <span>{stats.health.current}/{stats.health.max}</span>
        </div>
        <div
          style={{
            width: '100%',
            height: '1rem',
            background: 'rgba(0, 0, 0, 0.5)',
            borderRadius: '0.25rem',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div
            style={{
              width: `${healthPercent}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${healthColor}, ${healthColor}dd)`,
              transition: 'width 0.3s ease-out',
            }}
          />
        </div>
      </div>
      
      {/* Stamina Bar */}
      <div style={{ marginBottom: '0.5rem' }}>
        <div style={{ fontSize: '0.875rem', marginBottom: '0.125rem', display: 'flex', justifyContent: 'space-between' }}>
          <span>Stamina</span>
          <span>{stats.stamina}/{stats.maxStamina}</span>
        </div>
        <div
          style={{
            width: '100%',
            height: '1rem',
            background: 'rgba(0, 0, 0, 0.5)',
            borderRadius: '0.25rem',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div
            style={{
              width: `${staminaPercent}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${staminaColor}, ${staminaColor}dd)`,
              transition: 'width 0.3s ease-out',
            }}
          />
        </div>
      </div>
      
      {/* XP Bar */}
      <div style={{ marginBottom: '0.5rem' }}>
        <div style={{ fontSize: '0.875rem', marginBottom: '0.125rem', display: 'flex', justifyContent: 'space-between' }}>
          <span>Experience</span>
          <span>{stats.xp}/{stats.maxXp} ({xpPercent.toFixed(1)}%)</span>
        </div>
        <div
          style={{
            width: '100%',
            height: '0.75rem',
            background: 'rgba(0, 0, 0, 0.5)',
            borderRadius: '0.25rem',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <div
            style={{
              width: `${xpPercent}%`,
              height: '100%',
              background: `linear-gradient(90deg, ${xpColor}, ${xpColor}dd)`,
              transition: 'width 0.3s ease-out',
            }}
          />
        </div>
      </div>
      
      {/* Quick Skills Display */}
      <div style={{ marginTop: '0.75rem' }}>
        <div style={{ fontSize: '0.875rem', marginBottom: '0.25rem', color: '#9ca3af' }}>Combat Skills</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.8rem' }}>
          <div>ATK: {stats.skills?.attack?.level || 0}</div>
          <div>STR: {stats.skills?.strength?.level || 0}</div>
          <div>DEF: {stats.skills?.defense?.level || 0}</div>
          <div>RNG: {stats.skills?.ranged?.level || 0}</div>
        </div>
      </div>
    </div>
  )
}

// Unified Inventory & Equipment Component
function UnifiedInventoryEquipment({
  items,
  equipment,
  stats,
  onClose,
  world,
}: {
  items: InventoryItem[]
  equipment: PlayerEquipmentItems | null
  stats: PlayerStats & {
    id: string
    name: string
    stamina: number
    maxStamina: number
    xp: number
    maxXp: number
    coins: number
    combatStyle: 'attack' | 'strength' | 'defense' | 'ranged'
  } | null
  onClose: () => void
  world: World
}) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; slot: number; item: InventoryItem } | null>(null)

  const handleItemClick = (e: React.MouseEvent, slot: number, item: InventoryItem | null) => {
    e.stopPropagation()
    if (!item) {
      setSelectedSlot(null)
      return
    }
    setSelectedSlot(slot)
    setContextMenu(null)
  }

  const handleItemRightClick = (e: React.MouseEvent, slot: number, item: InventoryItem | null) => {
    e.preventDefault()
    e.stopPropagation()
    if (!item) return
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      slot,
      item
    })
  }

  const handleContextMenuAction = (action: string) => {
    if (!contextMenu) return
    
    const localPlayer = world.getPlayer()
    if (!localPlayer) return

    const { slot, item } = contextMenu
    
    switch (action) {
      case 'use':
        world.emit(EventType.INVENTORY_USE, {
          playerId: localPlayer.id,
          itemId: item.id,
          slot,
        })
        break
      case 'equip':
        world.emit(EventType.EQUIPMENT_TRY_EQUIP, {
          playerId: localPlayer.id,
          itemId: item.id,
        })
        break
      case 'drop':
        world.emit(EventType.ITEM_DROP, {
          playerId: localPlayer.id,
          itemId: item.id,
          slot,
          quantity: 1,
        })
        break
      case 'examine':
        world.emit(EventType.ITEM_EXAMINE, {
          playerId: localPlayer.id,
          itemId: item.id,
        })
        break
    }
    
    setContextMenu(null)
    setSelectedSlot(null)
  }

  const handleUnequip = (slot: EquipmentSlotName) => {
    const localPlayer = world.getPlayer()
    if (!localPlayer) return

    world.emit(EventType.EQUIPMENT_UNEQUIP, {
      playerId: localPlayer.id,
      slot,
    })
  }

  const getItemTypeColor = (type: string | undefined) => {
    if (!type) return '#6b7280'
    switch (type.toLowerCase()) {
      case 'weapon': return '#ef4444'
      case 'armor': return '#3b82f6'
      case 'consumable': return '#10b981'
      case 'tool': return '#f59e0b'
      case 'resource': return '#8b5cf6'
      default: return '#6b7280'
    }
  }

  const slots = Array(28).fill(null)
  items.forEach((item, index) => {
    if (index < 28) slots[index] = item
  })

  const equipmentSlots = [
    { key: EquipmentSlotName.HELMET, label: 'Helmet', icon: '🎩' },
    { key: EquipmentSlotName.BODY, label: 'Body', icon: '🎽' },
    { key: EquipmentSlotName.LEGS, label: 'Legs', icon: '👖' },
    { key: EquipmentSlotName.WEAPON, label: 'Weapon', icon: '⚔️' },
    { key: EquipmentSlotName.SHIELD, label: 'Shield', icon: '🛡️' },
    { key: EquipmentSlotName.ARROWS, label: 'Arrows', icon: '🏹' },
  ]

  return (
    <>
      <div
        className="rpg-inventory-equipment"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '40rem',
          background: 'rgba(11, 10, 21, 0.95)',
          border: '0.0625rem solid #2a2b39',
          borderRadius: '0.5rem',
          padding: '1rem',
          pointerEvents: 'auto',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          gap: '1rem',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setContextMenu(null)
          }
        }}
      >
        {/* Equipment Section (Left) */}
        <div style={{ width: '14rem' }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>Equipment</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            {equipmentSlots.map(({ key, label, icon }) => {
              const item = equipment?.[key]
              return (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem',
                    background: 'rgba(0, 0, 0, 0.3)',
                    borderRadius: '0.25rem',
                    border: item ? '1px solid #3b82f6' : '1px solid transparent',
                  }}
                >
                  <div style={{ fontSize: '1.2rem', width: '2rem', textAlign: 'center' }}>{icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{label}</div>
                    {item ? (
                      <div style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>
                        {item.name || `Item ${item.itemId}`}
                        {key === 'arrows' && item?.quantity && ` (${item.quantity})`}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>(empty)</div>
                    )}
                  </div>
                  {item && (
                    <button
                      onClick={() => handleUnequip(key)}
                      style={{
                        background: '#6b7280',
                        border: 'none',
                        borderRadius: '0.25rem',
                        color: 'white',
                        padding: '0.125rem 0.375rem',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                      }}
                      title="Unequip"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
          </div>

          {/* Combat Stats */}
          {stats && (
            <div
              style={{
                padding: '0.75rem',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '0.25rem',
              }}
            >
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>Combat Stats</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.8rem' }}>
                <div>⚔️ ATK: {stats.skills?.attack?.level || 0}</div>
                <div>💪 STR: {stats.skills?.strength?.level || 0}</div>
                <div>🛡️ DEF: {stats.skills?.defense?.level || 0}</div>
                <div>🏹 RNG: {stats.skills?.ranged?.level || 0}</div>
              </div>
            </div>
          )}
        </div>

        {/* Inventory Section (Right) */}
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Inventory</h3>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                {items.length}/28 slots
              </span>
              <button
                onClick={onClose}
                style={{
                  background: '#ef4444',
                  border: 'none',
                  borderRadius: '0.25rem',
                  color: 'white',
                  padding: '0.25rem 0.5rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Close (I)
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: '0.25rem',
              marginBottom: '1rem',
            }}
          >
            {slots.map((item, index) => (
              <div
                key={index}
                onClick={(e) => handleItemClick(e, index, item)}
                onContextMenu={(e) => handleItemRightClick(e, index, item)}
                onMouseEnter={() => setHoveredSlot(index)}
                onMouseLeave={() => setHoveredSlot(null)}
                style={{
                  width: '3rem',
                  height: '3rem',
                  background: selectedSlot === index ? '#3b82f6' : hoveredSlot === index ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.5)',
                  border: `0.0625rem solid ${item ? getItemTypeColor(getItemDisplayProps(item).type) : '#1f2937'}`,
                  borderRadius: '0.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: item ? 'pointer' : 'default',
                  fontSize: '0.65rem',
                  position: 'relative',
                  transition: 'all 0.2s ease',
                  transform: hoveredSlot === index ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                {item && (
                  <>
                    <div style={{ 
                      textAlign: 'center', 
                      lineHeight: '1',
                      fontWeight: 'bold',
                      textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)' 
                    }}>
                      {getItemDisplayProps(item).name.substring(0, 8)}
                    </div>
                    {item.quantity > 1 && (
                      <div
                        style={{
                          position: 'absolute',
                          bottom: '0.125rem',
                          right: '0.125rem',
                          color: '#fbbf24',
                          fontWeight: 'bold',
                          fontSize: '0.55rem',
                          background: 'rgba(0, 0, 0, 0.7)',
                          borderRadius: '0.125rem',
                          padding: '0.125rem 0.25rem',
                        }}
                      >
                        {item.quantity}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {selectedSlot !== null && slots[selectedSlot] && (
            <div style={{ 
              padding: '0.75rem', 
              background: 'rgba(0, 0, 0, 0.3)', 
              borderRadius: '0.25rem',
              border: `1px solid ${getItemTypeColor(slots[selectedSlot].type)}` 
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
                {slots[selectedSlot].name}
              </div>
              <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                Type: {slots[selectedSlot].type} • Quantity: {slots[selectedSlot].quantity}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleContextMenuAction('use')}
                  style={{
                    background: '#10b981',
                    border: 'none',
                    borderRadius: '0.25rem',
                    color: 'white',
                    padding: '0.375rem 0.75rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Use
                </button>
                <button
                  onClick={() => handleContextMenuAction('equip')}
                  style={{
                    background: '#3b82f6',
                    border: 'none',
                    borderRadius: '0.25rem',
                    color: 'white',
                    padding: '0.375rem 0.75rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Equip
                </button>
                <button
                  onClick={() => handleContextMenuAction('drop')}
                  style={{
                    background: '#ef4444',
                    border: 'none',
                    borderRadius: '0.25rem',
                    color: 'white',
                    padding: '0.375rem 0.75rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Drop
                </button>
                <button
                  onClick={() => handleContextMenuAction('examine')}
                  style={{
                    background: '#6b7280',
                    border: 'none',
                    borderRadius: '0.25rem',
                    color: 'white',
                    padding: '0.375rem 0.75rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Examine
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            background: 'rgba(11, 10, 21, 0.95)',
            border: '0.0625rem solid #2a2b39',
            borderRadius: '0.25rem',
            padding: '0.25rem',
            pointerEvents: 'auto',
            backdropFilter: 'blur(5px)',
            minWidth: '8rem',
            zIndex: 1000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {['use', 'equip', 'drop', 'examine'].map((action) => (
            <div
              key={action}
              onClick={() => handleContextMenuAction(action)}
              style={{
                padding: '0.5rem 0.75rem',
                cursor: 'pointer',
                borderRadius: '0.25rem',
                transition: 'background 0.1s',
                textTransform: 'capitalize',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {action}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// Inventory Component
function Inventory({
  items,
  onClose,
  world,
}: {
  items: InventoryItem[]
  onClose: () => void
  world: World
}) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [hoveredSlot, setHoveredSlot] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; slot: number; item: InventoryItem } | null>(null)

  const handleItemClick = (e: React.MouseEvent, slot: number, item: InventoryItem | null) => {
    e.stopPropagation() // Prevent event bubbling
    if (!item) {
      setSelectedSlot(null)
      return
    }
    setSelectedSlot(slot)
    setContextMenu(null)
  }

  const handleItemRightClick = (e: React.MouseEvent, slot: number, item: InventoryItem | null) => {
    e.preventDefault()
    e.stopPropagation() // Prevent event bubbling
    if (!item) return
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      slot,
      item
    })
  }

  const handleContextMenuAction = (action: string) => {
    if (!contextMenu) return
    
    const localPlayer = world.getPlayer()
    if (!localPlayer) return

    const { slot, item } = contextMenu
    
    switch (action) {
      case 'use':
        world.emit(EventType.INVENTORY_USE, {
          playerId: localPlayer.id,
          itemId: item.id,
          slot,
        })
        break
      case 'equip':
        world.emit(EventType.EQUIPMENT_TRY_EQUIP, {
          playerId: localPlayer.id,
          itemId: item.id,
        })
        break
      case 'drop':
        world.emit(EventType.ITEM_DROP, {
          playerId: localPlayer.id,
          itemId: item.id,
          slot,
          quantity: 1,
        })
        break
      case 'examine':
        world.emit(EventType.ITEM_EXAMINE, {
          playerId: localPlayer.id,
          itemId: item.id,
        })
        break
    }
    
    setContextMenu(null)
    setSelectedSlot(null)
  }

  const getItemTypeColor = (type: string | undefined) => {
    if (!type) return '#6b7280'
    switch (type.toLowerCase()) {
      case 'weapon': return '#ef4444'
      case 'armor': return '#3b82f6'
      case 'consumable': return '#10b981'
      case 'tool': return '#f59e0b'
      case 'resource': return '#8b5cf6'
      default: return '#6b7280'
    }
  }

  const slots = Array(28).fill(null)
  items.forEach((item, index) => {
    if (index < 28) slots[index] = item
  })

  return (
    <>
      <div
        className="rpg-inventory"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '26rem',
          background: 'rgba(11, 10, 21, 0.95)',
          border: '0.0625rem solid #2a2b39',
          borderRadius: '0.5rem',
          padding: '1rem',
          pointerEvents: 'auto',
          backdropFilter: 'blur(5px)',
        }}
        onClick={(e) => {
          // Only close context menu if clicking the background, not child elements
          if (e.target === e.currentTarget) {
            setContextMenu(null)
          }
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Inventory</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
              {items.length}/28 slots
            </span>
            <button
              onClick={onClose}
              style={{
                background: '#ef4444',
                border: 'none',
                borderRadius: '0.25rem',
                color: 'white',
                padding: '0.25rem 0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Close
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: '0.25rem',
            marginBottom: '1rem',
          }}
        >
          {slots.map((item, index) => (
            <div
              key={index}
              onClick={(e) => handleItemClick(e, index, item)}
              onContextMenu={(e) => handleItemRightClick(e, index, item)}
              onMouseEnter={() => setHoveredSlot(index)}
              onMouseLeave={() => setHoveredSlot(null)}
              style={{
                width: '3.25rem',
                height: '3.25rem',
                background: selectedSlot === index ? '#3b82f6' : hoveredSlot === index ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.5)',
                border: `0.0625rem solid ${item ? getItemTypeColor(getItemDisplayProps(item).type) : '#1f2937'}`,
                borderRadius: '0.25rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: item ? 'pointer' : 'default',
                fontSize: '0.7rem',
                position: 'relative',
                transition: 'all 0.2s ease',
                transform: hoveredSlot === index ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              {item && (
                <>
                  <div style={{ 
                    textAlign: 'center', 
                    lineHeight: '1',
                    fontWeight: 'bold',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)' 
                  }}>
                    {getItemDisplayProps(item).name.substring(0, 8)}
                  </div>
                  {item.quantity > 1 && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: '0.125rem',
                        right: '0.125rem',
                        color: '#fbbf24',
                        fontWeight: 'bold',
                        fontSize: '0.6rem',
                        background: 'rgba(0, 0, 0, 0.7)',
                        borderRadius: '0.125rem',
                        padding: '0.125rem 0.25rem',
                      }}
                    >
                      {item.quantity}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {selectedSlot !== null && slots[selectedSlot] && (
          <div style={{ 
            padding: '0.75rem', 
            background: 'rgba(0, 0, 0, 0.3)', 
            borderRadius: '0.25rem',
            border: `1px solid ${getItemTypeColor(slots[selectedSlot].type)}` 
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '0.25rem' }}>
              {slots[selectedSlot].name}
            </div>
            <div style={{ fontSize: '0.875rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
              Type: {slots[selectedSlot].type} • Quantity: {slots[selectedSlot].quantity}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                onClick={() => handleContextMenuAction('use')}
                style={{
                  background: '#10b981',
                  border: 'none',
                  borderRadius: '0.25rem',
                  color: 'white',
                  padding: '0.375rem 0.75rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Use
              </button>
              <button
                onClick={() => handleContextMenuAction('equip')}
                style={{
                  background: '#3b82f6',
                  border: 'none',
                  borderRadius: '0.25rem',
                  color: 'white',
                  padding: '0.375rem 0.75rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Equip
              </button>
              <button
                onClick={() => handleContextMenuAction('drop')}
                style={{
                  background: '#ef4444',
                  border: 'none',
                  borderRadius: '0.25rem',
                  color: 'white',
                  padding: '0.375rem 0.75rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Drop
              </button>
              <button
                onClick={() => handleContextMenuAction('examine')}
                style={{
                  background: '#6b7280',
                  border: 'none',
                  borderRadius: '0.25rem',
                  color: 'white',
                  padding: '0.375rem 0.75rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Examine
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            background: 'rgba(11, 10, 21, 0.95)',
            border: '0.0625rem solid #2a2b39',
            borderRadius: '0.25rem',
            padding: '0.25rem',
            pointerEvents: 'auto',
            backdropFilter: 'blur(5px)',
            minWidth: '8rem',
            zIndex: 1000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {['use', 'equip', 'drop', 'examine'].map((action) => (
            <div
              key={action}
              onClick={() => handleContextMenuAction(action)}
              style={{
                padding: '0.5rem 0.75rem',
                cursor: 'pointer',
                borderRadius: '0.25rem',
                transition: 'background 0.1s',
                textTransform: 'capitalize',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              {action}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// Equipment Component
function EquipmentPanel({
  equipment,
  stats,
  onClose,
  world,
}: {
  equipment: PlayerEquipmentItems
  stats: PlayerStats & {
    id: string
    name: string
    stamina: number
    maxStamina: number
    xp: number
    maxXp: number
    coins: number
    combatStyle: 'attack' | 'strength' | 'defense' | 'ranged'
  } | null
  onClose: () => void
  world: World
}) {
  const handleUnequip = (slot: EquipmentSlotName) => {
    const localPlayer = world.getPlayer()
    if (!localPlayer) return

    world.emit(EventType.EQUIPMENT_UNEQUIP, {
      playerId: localPlayer.id,
      slot,
    })
  }

  const equipmentSlots = [
    { key: EquipmentSlotName.HELMET, label: 'Helmet' },
    { key: EquipmentSlotName.BODY, label: 'Body' },
    { key: EquipmentSlotName.LEGS, label: 'Legs' },
    { key: EquipmentSlotName.WEAPON, label: 'Weapon' },
    { key: EquipmentSlotName.SHIELD, label: 'Shield' },
    { key: EquipmentSlotName.ARROWS, label: 'Arrows' },
  ]

  return (
    <div
      className="rpg-equipment"
      style={{
        position: 'absolute',
        top: '50%',
        left: '35%',
        transform: 'translate(-50%, -50%)',
        width: '20rem',
        background: 'rgba(11, 10, 21, 0.95)',
        border: '0.0625rem solid #2a2b39',
        borderRadius: '0.5rem',
        padding: '1rem',
        pointerEvents: 'auto',
        backdropFilter: 'blur(5px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h3 style={{ margin: 0 }}>Equipment</h3>
        <button
          onClick={onClose}
          style={{
            background: '#ef4444',
            border: 'none',
            borderRadius: '0.25rem',
            color: 'white',
            padding: '0.25rem 0.5rem',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {equipmentSlots.map(({ key, label }) => {
          const item = equipment[key]
          return (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: '0.25rem',
              }}
            >
              <div style={{ width: '5rem' }}>{label}:</div>
              <div style={{ flex: 1 }}>
                {item ? (
                  <span>
                    {item.name || `Item ${item.itemId}`}
                    {key === 'arrows' && item?.quantity && ` (${item.quantity})`}
                  </span>
                ) : (
                  <span style={{ color: '#6b7280' }}>(empty)</span>
                )}
              </div>
              {item && (
                <button
                  onClick={() => handleUnequip(key)}
                  style={{
                    background: '#6b7280',
                    border: 'none',
                    borderRadius: '0.25rem',
                    color: 'white',
                    padding: '0.125rem 0.5rem',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                  }}
                >
                  Unequip
                </button>
              )}
            </div>
          )
        })}
      </div>

      {stats && (
        <div
          style={{
            marginTop: '1rem',
            padding: '0.5rem',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '0.25rem',
          }}
        >
          <h4 style={{ margin: '0 0 0.5rem 0' }}>Combat Stats</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem', fontSize: '0.875rem' }}>
            <div>Attack: {stats.skills?.attack?.level || 0}</div>
            <div>Strength: {stats.skills?.strength?.level || 0}</div>
            <div>Defense: {stats.skills?.defense?.level || 0}</div>
            <div>Range: {stats.skills?.ranged?.level || 0}</div>
          </div>
        </div>
      )}
    </div>
  )
}

// Bank Component  
function Bank({ data, onClose, world }: { data: BankEntityData & { items: BankItem[] }; onClose: () => void; world: World }) {
  const { id: _bankId, items, maxSlots } = data
  const bankName = data.name || 'Bank'
  const usedSlots = items.length

  const handleWithdraw = (slot: number) => {
    const localPlayer = world.getPlayer()
    if (!localPlayer) return
    
    const item = items[slot]
    if (!item) return

    world.emit(EventType.BANK_WITHDRAW, {
      playerId: localPlayer.id,
      itemId: item.id,
      quantity: 1,
      slotIndex: slot,
    })
  }

  const slots = Array(maxSlots).fill(null)
  items.forEach((item: BankItem, index: number) => {
    if (index < maxSlots) slots[index] = item
  })

  return (
    <div
      className="rpg-bank"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '30rem',
        background: 'rgba(11, 10, 21, 0.95)',
        border: '0.0625rem solid #2a2b39',
        borderRadius: '0.5rem',
        padding: '1rem',
        pointerEvents: 'auto',
        backdropFilter: 'blur(5px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h3 style={{ margin: 0 }}>{bankName}</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ color: '#6b7280' }}>
            {usedSlots}/{maxSlots} slots
          </span>
          <button
            onClick={onClose}
            style={{
              background: '#ef4444',
              border: 'none',
              borderRadius: '0.25rem',
              color: 'white',
              padding: '0.25rem 0.5rem',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          gap: '0.25rem',
          maxHeight: '20rem',
          overflowY: 'auto',
        }}
      >
        {slots.map((item, index) => (
          <div
            key={index}
            onClick={() => item && handleWithdraw(index)}
            style={{
              width: '3.5rem',
              height: '3.5rem',
              background: item ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.3)',
              border: `0.0625rem solid ${item ? '#4b5563' : '#1f2937'}`,
              borderRadius: '0.25rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: item ? 'pointer' : 'default',
              fontSize: '0.75rem',
              position: 'relative',
            }}
          >
            {item && (
              <>
                <div>{item.name.substring(0, 8)}</div>
                {item.quantity > 1 && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '0.125rem',
                      right: '0.125rem',
                      color: '#fbbf24',
                      fontWeight: 'bold',
                    }}
                  >
                    {item.quantity}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Store Component
function StorePanel({ data, onClose, world }: { data: StoreData; onClose: () => void; world: World }) {
  const { id: storeId, name, items } = data
  const storeName = name
  const npcName = 'Shopkeeper'
  const [playerCoins, setPlayerCoins] = useState(0)

  useEffect(() => {
    const handleCoinsUpdate = (rawData: unknown) => {
      const data = rawData as { playerId: string; coins: number }
      const localPlayer = world.getPlayer()
      if (data.playerId === localPlayer?.id) {
        setPlayerCoins(data.coins)
      }
    }

    const typedWorld = world
    typedWorld.on(EventType.STORE_PLAYER_COINS, handleCoinsUpdate)
    return () => {
      typedWorld.off(EventType.STORE_PLAYER_COINS, handleCoinsUpdate)
    }
  }, [world])

  const handleBuy = (itemId: string) => {
    const localPlayer = world.getPlayer()
    if (!localPlayer) return

    world.emit(EventType.STORE_BUY, {
      playerId: localPlayer.id,
      storeId: storeId,
      itemId,
      quantity: 1,
    })
  }

  return (
    <div
      className="rpg-store"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '35rem',
        background: 'rgba(11, 10, 21, 0.95)',
        border: '0.0625rem solid #2a2b39',
        borderRadius: '0.5rem',
        padding: '1rem',
        pointerEvents: 'auto',
        backdropFilter: 'blur(5px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>{storeName}</h3>
          {npcName && <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>Shopkeeper: {npcName}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              background: 'rgba(251, 191, 36, 0.2)',
              padding: '0.5rem 1rem',
              borderRadius: '0.25rem',
            }}
          >
            <span style={{ color: '#fbbf24' }}>Coins: {playerCoins} gp</span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#ef4444',
              border: 'none',
              borderRadius: '0.25rem',
              color: 'white',
              padding: '0.25rem 0.5rem',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          maxHeight: '20rem',
          overflowY: 'auto',
        }}
      >
        {items.map((item, index) => (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '0.75rem',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '0.25rem',
              gap: '1rem',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'bold' }}>{item.name}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#fbbf24', fontWeight: 'bold' }}>{item.price} gp</div>
              <div style={{ fontSize: '0.875rem', color: item.stockQuantity > 0 || item.stockQuantity === -1 ? '#4ade80' : '#ef4444' }}>
                Stock: {item.stockQuantity === -1 ? '∞' : item.stockQuantity}
              </div>
            </div>
            <button
              onClick={() => handleBuy(item.itemId)}
              disabled={item.stockQuantity === 0}
              style={{
                background: item.stockQuantity === 0 ? '#4b5563' : '#10b981',
                border: 'none',
                borderRadius: '0.25rem',
                color: 'white',
                padding: '0.5rem 1rem',
                cursor: item.stockQuantity === 0 ? 'not-allowed' : 'pointer',
                opacity: item.stockQuantity === 0 ? 0.5 : 1,
              }}
            >
              Buy
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// Context Menu Component
function ContextMenuPanel({
  menu,
  onClose,
  world,
}: {
  menu: {
    x: number
    y: number
    itemId: string
    actions: string[]
  }
  onClose: () => void
  world: World
}) {
  const { x, y, actions } = menu
  const options = actions.map(action => ({ action: action as 'use' | 'drop' | 'examine' | 'equip' | 'unequip', label: action }))

  const handleOption = (option: { action: 'use' | 'drop' | 'examine' | 'equip' | 'unequip'; label: string }) => {
    const localPlayer = world.getPlayer()
    if (!localPlayer) return

    world.emit(EventType.UI_CONTEXT_MENU, {
      playerId: localPlayer.id,
      x: menu.x,
      y: menu.y,
      itemId: menu.itemId,
      actions: [option.action],
    })
    onClose()
  }

  return (
    <div
      className="rpg-context-menu"
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        background: 'rgba(11, 10, 21, 0.95)',
        border: '0.0625rem solid #2a2b39',
        borderRadius: '0.25rem',
        padding: '0.25rem',
        pointerEvents: 'auto',
        backdropFilter: 'blur(5px)',
        minWidth: '10rem',
      }}
      onMouseLeave={onClose}
    >
      {options.map((option, index: number) => (
        <div
          key={index}
          onClick={() => handleOption(option)}
          style={{
            padding: '0.5rem 0.75rem',
            cursor: 'pointer',
            borderRadius: '0.25rem',
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          {option.label}
        </div>
      ))}
    </div>
  )
}

// Hotbar Component (RuneScape-style)
function Hotbar({ stats: _stats, inventory, world }: { stats: PlayerStats & {
  id: string
  name: string
  stamina: number
  maxStamina: number
  xp: number
  maxXp: number
  coins: number
  combatStyle: 'attack' | 'strength' | 'defense' | 'ranged'
} | null; inventory: InventoryItem[]; world: World }) {
  const [selectedSlots, _setSelectedSlots] = useState<(InventoryItem | null)[]>(Array(12).fill(null))
  const [activeSlot, setActiveSlot] = useState<number>(0)

  // Auto-populate hotbar with consumables and tools
  useEffect(() => {
    // TODO: Auto-population disabled until we have access to full item data
    // InventoryItem doesn't have type or name properties
    // This would need to look up the full item data from the registry
    /*
    const hotbarItems = Array(12).fill(null)
    let slotIndex = 0
    
    // Add food and consumables first
    inventory.forEach(item => {
      if (slotIndex < 12 && (item.type === 'consumable' || item.name.toLowerCase().includes('fish'))) {
        hotbarItems[slotIndex] = item
        slotIndex++
      }
    })
    
    // Add tools if space available
    inventory.forEach(item => {
      if (slotIndex < 12 && item.type === 'tool') {
        hotbarItems[slotIndex] = item
        slotIndex++
      }
    })
    
    _setSelectedSlots(hotbarItems)
    */
  }, [inventory])

  const handleSlotClick = (index: number) => {
    setActiveSlot(index)
    const item = selectedSlots[index]
    if (item) {
      // Use the item
      const localPlayer = world.getPlayer()
      if (localPlayer) {
        world.emit(EventType.INVENTORY_USE, {
          playerId: localPlayer.id,
          itemId: item.id,
          slot: index,
        })
      }
    }
  }

  const handleKeyPress = useCallback((event: KeyboardEvent) => {
    const keyNumber = parseInt(event.key)
    if (keyNumber >= 1 && keyNumber <= 9) {
      const slotIndex = keyNumber - 1
      if (selectedSlots[slotIndex]) {
        handleSlotClick(slotIndex)
      }
    }
    if (event.key === '0' && selectedSlots[9]) {
      handleSlotClick(9)
    }
    // F1-F12 keys for slots 10-12
    if (event.key === 'F11' && selectedSlots[10]) {
      handleSlotClick(10)
    }
    if (event.key === 'F12' && selectedSlots[11]) {
      handleSlotClick(11)
    }
  }, [selectedSlots])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress)
    return () => document.removeEventListener('keydown', handleKeyPress)
  }, [handleKeyPress])

  return (
    <div
      className="rpg-hotbar"
      style={{
        position: 'fixed',
        bottom: 'calc(1rem + env(safe-area-inset-bottom))',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '0.25rem',
        background: 'rgba(11, 10, 21, 0.9)',
        border: '0.0625rem solid #2a2b39',
        borderRadius: '0.5rem',
        padding: '0.5rem',
        pointerEvents: 'auto',
        backdropFilter: 'blur(5px)',
        zIndex: 50,
      }}
    >
      {selectedSlots.map((item, index) => {
        const isActive = activeSlot === index
        const keyLabel = index < 9 ? (index + 1).toString() : index === 9 ? '0' : index === 10 ? 'F11' : 'F12'
        
        return (
          <div
            key={index}
            onClick={() => handleSlotClick(index)}
            style={{
              width: '2.5rem',
              height: '2.5rem',
              background: isActive ? 'rgba(59, 130, 246, 0.3)' : 'rgba(0, 0, 0, 0.5)',
              border: isActive ? '2px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '0.25rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: item ? 'pointer' : 'default',
              position: 'relative',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              if (item) {
                e.currentTarget.style.transform = 'scale(1.05)'
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)'
            }}
          >
            {item && (
              <>
                <div style={{
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                  textAlign: 'center',
                  lineHeight: '1',
                  color: '#ffffff',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)'
                }}>
                  {getItemIcon(item)}
                </div>
                {item.quantity > 1 && (
                  <div style={{
                    position: 'absolute',
                    bottom: '0.125rem',
                    right: '0.125rem',
                    background: 'rgba(251, 191, 36, 0.9)',
                    color: '#000',
                    fontSize: '0.5rem',
                    fontWeight: 'bold',
                    borderRadius: '0.125rem',
                    padding: '0.125rem 0.25rem',
                    minWidth: '0.75rem',
                    textAlign: 'center'
                  }}>
                    {item.quantity}
                  </div>
                )}
              </>
            )}
            {/* Key label */}
            <div style={{
              position: 'absolute',
              top: '-0.125rem',
              left: '-0.125rem',
              background: 'rgba(0, 0, 0, 0.8)',
              color: '#9ca3af',
              fontSize: '0.5rem',
              borderRadius: '0.125rem',
              padding: '0.125rem 0.25rem',
              minWidth: '0.75rem',
              textAlign: 'center',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              {keyLabel}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Helper function for hotbar item icons
function getItemIcon(item: InventoryItem): string {
  const name = item.itemId.toLowerCase()  // Using itemId since name is not available
  
  // Food
  if (name.includes('fish') || name.includes('bread') || name.includes('meat')) return '🍖'
  if (name.includes('potion')) return '🧪'
  
  // Tools
  if (name.includes('hatchet') || name.includes('axe')) return '🪓'
  if (name.includes('fishing')) return '🎣'
  if (name.includes('pickaxe')) return '⛏️'
  if (name.includes('tinderbox')) return '🔥'
  
  // Weapons
  if (name.includes('sword')) return '⚔️'
  if (name.includes('bow')) return '🏹'
  if (name.includes('arrow')) return '🏹'
  
  // Default
  return '📦'
}

// Damage Numbers Component
function DamageNumbers({ damageNumbers }: { damageNumbers: DamageNumber[] }) {
  return (
    <>
      {damageNumbers.map((damage) => {
        const age = Date.now() - damage.timestamp
        const progress = Math.min(age / 2000, 1) // 2 second animation
        
        const getColor = (type: string) => {
          switch (type) {
            case 'damage': return '#ef4444'
            case 'heal': return '#10b981'
            case 'xp': return '#8b5cf6'
            case 'miss': return '#6b7280'
            default: return '#ffffff'
          }
        }
        
        const getText = (damage: DamageNumber) => {
          if (damage.type === 'miss') return 'MISS'
          if (damage.type === 'xp') return `+${damage.value} XP`
          if (damage.type === 'heal') return `+${damage.value}`
          return `-${damage.value}`
        }
        
        return (
          <div
            key={damage.id}
            style={{
              position: 'fixed',
              left: `${damage.position.x}px`,
              top: `${damage.position.y - progress * 100}px`, // Float upward
              color: getColor(damage.type),
              fontSize: damage.type === 'miss' ? '1.2rem' : '1.5rem',
              fontWeight: 'bold',
              textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8)',
              opacity: 1 - progress, // Fade out
              transform: `scale(${1 + progress * 0.5})`, // Scale up slightly
              pointerEvents: 'none',
              zIndex: 1000,
              userSelect: 'none',
              transition: 'none',
            }}
          >
            {getText(damage)}
          </div>
        )
      })}
    </>
  )
}