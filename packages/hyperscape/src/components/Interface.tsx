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
import { ResourceContextMenu } from '../client/components/ResourceContextMenu'

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
  const [inventory, setInventory] = useState<InventoryItem[] | null>(null)
  
  // Debug: log inventory changes
  useEffect(() => {
    if (!inventory) return
    console.log('[Interface] Inventory state updated:', inventory.length, 'items:', inventory.map(i => ({ id: i.id, itemId: i.itemId, slot: i.slot, quantity: i.quantity })))
  }, [inventory])
  const [equipment, setEquipment] = useState<PlayerEquipmentItems | null>(null)
  const [showInventory, setShowInventory] = useState(false)
  const [showBank, setShowBank] = useState(false)
  const [showStore, setShowStore] = useState(false)
  const [showSkills, setShowSkills] = useState(false)
  const [bankData, setBankData] = useState<BankEntityData & { items: BankItem[] } | null>(null)
  const [storeData, setStoreData] = useState<StoreData | null>(null)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    itemId: string
    actions: string[]
  } | null>(null)
  const [resourceContextMenu, setResourceContextMenu] = useState<{
    visible: boolean
    position: { x: number; y: number }
    actions: Array<{ id: string; label: string; icon?: string; enabled: boolean; onClick: () => void }>
    targetId: string
    targetType: string
  }>({
    visible: false,
    position: { x: 0, y: 0 },
    actions: [],
    targetId: '',
    targetType: ''
  })
  const [damageNumbers, setDamageNumbers] = useState<DamageNumber[]>([])
  // Character selection (server feature-flag controlled)
  const [showCharacterSelect, setShowCharacterSelect] = useState(false)
  const [characters, setCharacters] = useState<Array<{ id: string; name: string; level?: number; lastLocation?: { x: number; y: number; z: number } }>>([])
  const [newCharacterName, setNewCharacterName] = useState('')

  useEffect(() => {
    const getLocal = () => world.getPlayer()
    // local player may be null until spawned (character select). Always guard accesses.
    // Handle UI updates
    const handleUIUpdate = (data: unknown) => {
      const update = data as {
        playerId: string
        component: 'player' | 'health' | 'inventory' | 'equipment' | 'bank' | 'store'
        data: unknown
      }
      const lp = getLocal()
      if (!lp || update.playerId !== lp.id) return

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
      const lp = getLocal(); if (!lp || data.playerId !== lp.id) return
      setPlayerStats(prev => prev ? { ...prev, ...data } : null)
    }

    const handleInventoryUpdate = (rawData: unknown) => {
      const data = rawData as { playerId: string; items: InventoryItem[] }
      if (typeof window !== 'undefined' && (window as any).DEBUG_RPG === '1') {
        console.log('[Interface] handleInventoryUpdate:', data.playerId, data.items?.length, 'items')
      }
      const lp = getLocal(); 
      if (!lp) {
        if ((window as any).DEBUG_RPG === '1') console.log('[Interface] No local player yet')
        return
      }
      if (data.playerId !== lp.id) {
        if ((window as any).DEBUG_RPG === '1') console.log('[Interface] Inventory update for different player:', data.playerId, 'vs', lp.id)
        return
      }
      if ((window as any).DEBUG_RPG === '1') console.log('[Interface] Updating inventory UI with', data.items?.length, 'items')
      setInventory(data.items || [])
    }

    const handleEquipmentUpdate = (rawData: unknown) => {
              const data = rawData as { playerId: string; equipment: PlayerEquipmentItems }
      const lp = getLocal(); if (!lp || data.playerId !== lp.id) return
      setEquipment(data.equipment)
    }

    const handleBankOpen = (rawData: unknown) => {
              const data = rawData as BankEntityData & { playerId: string; items: BankItem[] }
      const lp = getLocal(); if (!lp || data.playerId !== lp.id) return
      setBankData(data)
      setShowBank(true)
    }

    const handleBankClose = (rawData: unknown) => {
      const data = rawData as { playerId: string }
      const lp = getLocal(); if (!lp || data.playerId !== lp.id) return
      setShowBank(false)
      setBankData(null)
    }

    const handleStoreOpen = (rawData: unknown) => {
      const data = rawData as StoreData & { playerId: string }
      const lp = getLocal(); if (!lp || data.playerId !== lp.id) return
      setStoreData(data)
      setShowStore(true)
    }

    const handleStoreClose = (rawData: unknown) => {
      const data = rawData as { playerId: string }
      const lp = getLocal(); if (!lp || data.playerId !== lp.id) return
      setShowStore(false)
      setStoreData(null)
    }

    // Open panes from global UI events (RS-style sidebar tabs)
    const handleOpenPane = (raw: unknown) => {
      const data = raw as { pane?: string | null }
      if (!data) return
      switch (data.pane) {
        case 'skills':
          // handled by Sidebar unified panel
          setShowSkills(false)
          break
        case 'inventory':
          // handled by Sidebar unified panel
          setShowInventory(false)
          break
        case 'prefs':
          // handled by Sidebar; nothing to do here
          break
        case null:
        case 'close':
          setShowSkills(false)
          setShowInventory(false)
          break
      }
    }

    const handleContextMenu = (rawData: unknown) => {
      const data = rawData as {
        x: number
        y: number
        itemId: string
        actions: string[]
        playerId: string
      }
      const lp = getLocal(); if (!lp || data.playerId !== lp.id) return
      setContextMenu({
        x: data.x,
        y: data.y,
        itemId: data.itemId,
        actions: data.actions
      })
    }

    const handleResourceMenu = (rawData: unknown) => {
      const data = rawData as {
        playerId: string
        type?: 'context'
        position?: { x: number; y: number }
        actions?: Array<{ id: string; label: string; icon?: string; enabled: boolean; onClick: () => void }>
        targetId?: string
        targetType?: 'resource'
      }
      const lp = getLocal(); if (!lp || data.playerId !== lp.id) return
      
      // Check if this is a resource context menu
      if (data.type === 'context' && data.targetType === 'resource' && data.actions && data.position) {
        setResourceContextMenu({
          visible: true,
          position: data.position,
          actions: data.actions,
          targetId: data.targetId || '',
          targetType: data.targetType
        })
        // Close regular context menu if open
        setContextMenu(null)
      }
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

    // Character selection events (sent only when server feature flag is enabled)
    const handleCharacterList = (raw: unknown) => {
      const data = raw as { characters: Array<{ id: string; name: string; level?: number; lastLocation?: { x: number; y: number; z: number } }> }
      try { console.log('[Interface] character:list received', (data.characters || []).length) } catch {}
      setCharacters(data.characters || [])
      // Only show modal if there are characters to choose from
      if ((data.characters || []).length > 0) {
        setShowCharacterSelect(true)
      } else {
        setShowCharacterSelect(false)
      }
    }
    const handleCharacterCreated = (raw: unknown) => {
      const data = raw as { id: string; name: string }
      setCharacters(prev => [...prev, { id: data.id, name: data.name }])
      setNewCharacterName('')
    }
    const handleCharacterSelected = (_raw: unknown) => {
      // Selection acknowledged; request enter world
      const net = (world.network as unknown) as { requestEnterWorld?: () => void }
      if (net?.requestEnterWorld) net.requestEnterWorld()
      setShowCharacterSelect(false)
      // Also broadcast a DOM event so pre-world shell can proceed to create world
      try {
        const ev = new CustomEvent('rpg:character:selected')
        window.dispatchEvent(ev)
      } catch {}
    }

    // Subscribe to events
    const typedWorld = world
    typedWorld.on('rpg:character:list', handleCharacterList)
    typedWorld.on('rpg:character:created', handleCharacterCreated)
    typedWorld.on('rpg:character:selected', handleCharacterSelected)
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
    typedWorld.on(EventType.UI_OPEN_PANE, handleOpenPane)
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
    const lp = getLocal(); 
    if (lp) {
      typedWorld.emit(EventType.UI_REQUEST, { playerId: lp.id })
      // Also explicitly request inventory update in case early updates were dropped
      setTimeout(() => {
        const player = world.getPlayer()
        if (player) {
          console.log('[Interface] Requesting inventory update for', player.id)
          typedWorld.emit(EventType.INVENTORY_REQUEST, { playerId: player.id })
        }
      }, 500)
    }
    // If the network already cached a character list (packet arrived before UI mount), show it now
    try {
      const net = (world.network as unknown) as { lastCharacterList?: Array<{ id: string; name: string }> }
      if (net?.lastCharacterList && net.lastCharacterList.length >= 0) {
        setCharacters(net.lastCharacterList)
        setShowCharacterSelect(true)
      }
    } catch {}

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
      typedWorld.off(EventType.UI_OPEN_PANE, handleOpenPane)
      typedWorld.off(EventType.COMBAT_DAMAGE_DEALT, handleCombatEvent)
      typedWorld.off(EventType.COMBAT_HEAL, handleCombatEvent)
      typedWorld.off(EventType.SKILLS_XP_GAINED, handleCombatEvent)
      typedWorld.off(EventType.COMBAT_MISS, handleCombatEvent)
      typedWorld.off('rpg:character:list', handleCharacterList)
      typedWorld.off('rpg:character:created', handleCharacterCreated)
      typedWorld.off('rpg:character:selected', handleCharacterSelected)
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
                constitution: { level: 10, xp: 0 },
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
      {showCharacterSelect && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-[200]"
          style={{ pointerEvents: 'auto' }}
        >
          <div
            className="bg-[rgba(11,10,21,0.95)] border border-dark-border rounded-lg p-4 w-[28rem]"
            style={{ backdropFilter: 'blur(5px)' }}
          >
            <div className="flex justify-between items-center mb-3">
              <h3 className="m-0 text-lg">Select Character</h3>
            </div>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto mb-3">
              {characters.length === 0 && (
                <div className="text-gray-400 text-sm">No characters yet. Create one below.</div>
              )}
              {characters.map((c) => (
                <div key={c.id} className="flex items-center justify-between bg-black/30 rounded p-2">
                  <div>
                    <div className="font-bold">{c.name}</div>
                    {c.level !== undefined && (
                      <div className="text-xs text-gray-400">Level {c.level}</div>
                    )}
                  </div>
                  <button
                    className="bg-emerald-600 text-white text-sm rounded px-3 py-1 border-0 cursor-pointer"
                    onClick={() => {
                      const net = (world.network as unknown) as { requestCharacterSelect?: (id: string) => void }
                      if (net?.requestCharacterSelect) net.requestCharacterSelect(c.id)
                    }}
                  >
                    Play
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2">
              <div className="text-sm text-gray-300 mb-1">Create New Character</div>
              <div className="flex gap-2">
                <input
                  value={newCharacterName}
                  onChange={(e) => setNewCharacterName(e.target.value)}
                  placeholder="Name"
                  className="flex-1 bg-black/40 border border-white/10 rounded px-2 py-1 text-white"
                />
                <button
                  className="bg-blue-600 text-white text-sm rounded px-3 py-1 border-0 cursor-pointer"
                  onClick={() => {
                    const name = newCharacterName.trim()
                    if (!name) return
                    const net = (world.network as unknown) as { requestCharacterCreate?: (name: string) => void }
                    if (net?.requestCharacterCreate) net.requestCharacterCreate(name)
                  }}
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* HUD removed; replaced by minimap/side panel */}
      {/* Skills now lives in right sidebar panel */}
      {/* Inventory/Equipment panel moved to right sidebar */}
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
      {/* ButtonPanel removed; replaced by minimap tabs in Sidebar */}
      <DamageNumbers damageNumbers={damageNumbers} />
      <InteractionHandler world={world} />
    </>
  )
}
// RuneScape-style Skills Panel
function SkillsPanel({ stats, onClose }: { stats: PlayerStats & {
  id: string
  name: string
  stamina: number
  maxStamina: number
  xp: number
  maxXp: number
  coins: number
  combatStyle: 'attack' | 'strength' | 'defense' | 'ranged'
}; onClose: () => void }) {
  const skills = [
    { key: 'attack', label: 'Attack', icon: '⚔️' },
    { key: 'strength', label: 'Strength', icon: '💪' },
    { key: 'defense', label: 'Defense', icon: '🛡️' },
    { key: 'ranged', label: 'Ranged', icon: '🏹' },
    { key: 'constitution', label: 'Constitution', icon: '❤️' },
    { key: 'woodcutting', label: 'Woodcutting', icon: '🪓' },
    { key: 'fishing', label: 'Fishing', icon: '🎣' },
    { key: 'firemaking', label: 'Firemaking', icon: '🔥' },
    { key: 'cooking', label: 'Cooking', icon: '🍳' },
  ] as const

  const totalLevel = skills.reduce((sum, s) => sum + (stats.skills?.[s.key as keyof typeof stats.skills]?.level ?? 1), 0)

  // Dynamic positioning under minimap
  const [panelPos, setPanelPos] = useState<{ top: number; right: number }>({ top: 96, right: 16 })
  useEffect(() => {
    const compute = () => {
      const mm = document.querySelector('.minimap') as HTMLElement | null
      if (!mm) {
        setPanelPos({ top: 96, right: 16 })
        return
      }
      const rect = mm.getBoundingClientRect()
      const top = rect.bottom + 8
      const right = Math.max(8, window.innerWidth - rect.right + 0)
      setPanelPos({ top, right })
    }
    compute()
    window.addEventListener('resize', compute)
    const id = window.setInterval(compute, 500) // track layout changes
    return () => { window.removeEventListener('resize', compute); window.clearInterval(id) }
  }, [])

  // Hover tooltip with XP and next level
  const [hoverInfo, setHoverInfo] = useState<{ label: string; xp: number; level: number } | null>(null)
  const [mouse, setMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  const getXpForLevel = (level: number): number => {
    // RuneScape/OSRS XP curve up to 120: standard formula to 99
    let points = 0
    for (let lvl = 1; lvl < level; lvl++) {
      points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7))
    }
    return Math.floor(points / 4)
  }

  return (
    <div
      className="rpg-skills fixed w-[17rem] bg-[rgba(11,10,21,0.94)] border border-dark-border rounded-lg p-3 pointer-events-auto backdrop-blur-md z-[90]"
      style={{
        top: panelPos.top,
        right: panelPos.right,
      }}
      onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}
    >
      <div className="flex justify-between items-center mb-2">
        <h3 className="m-0 text-base">Skills</h3>
        <button
          onClick={onClose}
          className="bg-red-500 border-none rounded text-white py-1 px-2 cursor-pointer text-xs"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {skills.map(({ key, label, icon }) => {
          const level = stats.skills?.[key as keyof typeof stats.skills]?.level ?? 1
          const xp = stats.skills?.[key as keyof typeof stats.skills]?.xp ?? 0
          const nextLevel = Math.min(120, level + 1)
          const nextXp = getXpForLevel(nextLevel)
          const curLevelXp = getXpForLevel(level)
          const toNext = Math.max(0, nextXp - xp)
          return (
            <div
              key={key}
              className="flex items-center gap-2 bg-black/35 border border-white/[0.08] rounded-md py-1.5 px-2 cursor-default"
              onMouseEnter={() => setHoverInfo({ label, xp, level })}
              onMouseLeave={() => setHoverInfo(null)}
            >
              <div className="text-base w-6 text-center">{icon}</div>
              <div className="flex justify-between w-full text-[0.85rem]">
                <span>{label}</span>
                <span>{level}/{level}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#9ca3af', textAlign: 'right' }}>
        Total level: {totalLevel}
      </div>

      {hoverInfo && (
        <div
          style={{
            position: 'fixed',
            left: mouse.x + 12,
            top: mouse.y + 12,
            background: 'rgba(20,20,28,0.98)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '0.375rem',
            padding: '0.5rem 0.6rem',
            color: '#fff',
            pointerEvents: 'none',
            fontSize: '0.8rem',
            zIndex: 200,
            maxWidth: '16rem'
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{hoverInfo.label}</div>
          <div style={{ opacity: 0.9 }}>XP: {Math.floor(hoverInfo.xp).toLocaleString()}</div>
          <div style={{ opacity: 0.9 }}>Next level at: {getXpForLevel(Math.min(120, hoverInfo.level + 1)).toLocaleString()} xp</div>
          <div style={{ opacity: 0.9 }}>Remaining: {(getXpForLevel(Math.min(120, hoverInfo.level + 1)) - Math.floor(hoverInfo.xp)).toLocaleString()} xp</div>
        </div>
      )}
    </div>
  )
}

// ButtonPanel removed (function deleted)

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
      className="rpg-hud absolute w-80 bg-dark-bg border border-dark-border rounded-lg p-3 pointer-events-none backdrop-blur-md"
      style={{
        top: 'calc(1rem + env(safe-area-inset-top))',
        left: 'calc(1rem + env(safe-area-inset-left))',
      }}
    >
      {/* Top Info */}
      <div className="mb-3 flex justify-between items-center">
        <div>
          <div className="font-bold text-lg">Level {stats.level}</div>
          <div className="text-sm text-gray-400">Combat Lv. {Math.floor(((stats.skills?.attack?.level || 0) + (stats.skills?.strength?.level || 0) + (stats.skills?.defense?.level || 0) + (stats.skills?.ranged?.level || 0)) / 4)}</div>
        </div>
        <div className="text-right">
          <div className="text-yellow-400 font-bold">{stats.coins.toLocaleString()} gp</div>
          <div 
            className="text-sm"
            style={{ color: combatLevelColors[stats.combatStyle] }}
          >Style: {stats.combatStyle}</div>
        </div>
      </div>
      
      {/* Health Bar */}
      <div className="mb-2">
        <div className="text-sm mb-0.5 flex justify-between">
          <span>Health</span>
          <span>{stats.health.current}/{stats.health.max}</span>
        </div>
        <div className="w-full h-4 bg-black/50 rounded border border-white/10 overflow-hidden">
          <div
            className="h-full transition-[width] duration-300 ease-out"
            style={{
              width: `${healthPercent}%`,
              background: `linear-gradient(90deg, ${healthColor}, ${healthColor}dd)`,
            }}
          />
        </div>
      </div>
      
      {/* Stamina Bar removed - now shown on minimap */}
      
      {/* XP Bar */}
      <div className="mb-2">
        <div className="text-sm mb-0.5 flex justify-between">
          <span>Experience</span>
          <span>{stats.xp}/{stats.maxXp} ({xpPercent.toFixed(1)}%)</span>
        </div>
        <div className="w-full h-3 bg-black/50 rounded border border-white/10 overflow-hidden">
          <div
            className="h-full transition-[width] duration-300 ease-out"
            style={{
              width: `${xpPercent}%`,
              background: `linear-gradient(90deg, ${xpColor}, ${xpColor}dd)`,
            }}
          />
        </div>
      </div>
      
      {/* Skills summary removed; open full panel via Skills button */}
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
function _Inventory({
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
        className="rpg-inventory absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[26rem] bg-[rgba(11,10,21,0.95)] border border-dark-border rounded-lg p-4 pointer-events-auto backdrop-blur-md"
        onClick={(e) => {
          // Only close context menu if clicking the background, not child elements
          if (e.target === e.currentTarget) {
            setContextMenu(null)
          }
        }}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="m-0 text-xl">Inventory</h3>
          <div className="flex gap-2 items-center">
            <span className="text-sm text-gray-400">
              {items.length}/28 slots
            </span>
            <button
              onClick={onClose}
              className="bg-red-500 border-none rounded text-white py-1 px-2 cursor-pointer text-sm"
            >
              Close
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-4">
          {slots.map((item, index) => (
            <div
              key={index}
              onClick={(e) => handleItemClick(e, index, item)}
              onContextMenu={(e) => handleItemRightClick(e, index, item)}
              onMouseEnter={() => setHoveredSlot(index)}
              onMouseLeave={() => setHoveredSlot(null)}
              className={`w-[3.25rem] h-[3.25rem] rounded flex flex-col items-center justify-center text-[0.7rem] relative transition-all duration-200 ${
                selectedSlot === index 
                  ? 'bg-blue-500' 
                  : hoveredSlot === index 
                    ? 'bg-white/10 scale-105' 
                    : 'bg-black/50 scale-100'
              } ${item ? 'cursor-pointer' : 'cursor-default'}`}
              style={{
                border: `0.0625rem solid ${item ? getItemTypeColor(getItemDisplayProps(item).type) : '#1f2937'}`,
              }}
            >
              {item && (
                <>
                  <div className="text-center leading-none font-bold shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                    {getItemDisplayProps(item).name.substring(0, 8)}
                  </div>
                  {item.quantity > 1 && (
                    <div className="absolute bottom-0.5 right-0.5 text-yellow-400 font-bold text-[0.6rem] bg-black/70 rounded-sm py-0.5 px-1">
                      {item.quantity}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {selectedSlot !== null && slots[selectedSlot] && (
          <div 
            className="p-3 bg-black/30 rounded"
            style={{
              border: `1px solid ${getItemTypeColor(slots[selectedSlot].type)}` 
            }}
          >
            <div className="font-bold mb-1">
              {slots[selectedSlot].name}
            </div>
            <div className="text-sm text-gray-400 mb-2">
              Type: {slots[selectedSlot].type} • Quantity: {slots[selectedSlot].quantity}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleContextMenuAction('use')}
                className="bg-emerald-500 border-none rounded text-white py-1.5 px-3 cursor-pointer text-sm"
              >
                Use
              </button>
              <button
                onClick={() => handleContextMenuAction('equip')}
                className="bg-blue-500 border-none rounded text-white py-1.5 px-3 cursor-pointer text-sm"
              >
                Equip
              </button>
              <button
                onClick={() => handleContextMenuAction('drop')}
                className="bg-red-500 border-none rounded text-white py-1.5 px-3 cursor-pointer text-sm"
              >
                Drop
              </button>
              <button
                onClick={() => handleContextMenuAction('examine')}
                className="bg-gray-500 border-none rounded text-white py-1.5 px-3 cursor-pointer text-sm"
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
function _EquipmentPanel({
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
      className="rpg-bank absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30rem] bg-[rgba(11,10,21,0.95)] border border-dark-border rounded-lg p-4 pointer-events-auto backdrop-blur-md"
    >
      <div className="flex justify-between items-center mb-4">
        <h3 className="m-0">{bankName}</h3>
        <div className="flex items-center gap-4">
          <span className="text-gray-500">
            {usedSlots}/{maxSlots} slots
          </span>
          <button
            onClick={onClose}
            className="bg-red-500 border-none rounded text-white py-1 px-2 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      <div className="grid grid-cols-8 gap-1 max-h-80 overflow-y-auto">
        {slots.map((item, index) => (
          <div
            key={index}
            onClick={() => item && handleWithdraw(index)}
            className={`w-14 h-14 rounded flex flex-col items-center justify-center text-xs relative ${
              item ? 'bg-black/70 border-gray-600 cursor-pointer' : 'bg-black/30 border-gray-800 cursor-default'
            }`}
            style={{
              border: `0.0625rem solid ${item ? '#4b5563' : '#1f2937'}`,
            }}
          >
            {item && (
              <>
                <div>{item.name.substring(0, 8)}</div>
                {item.quantity > 1 && (
                  <div className="absolute bottom-0.5 right-0.5 text-yellow-400 font-bold">
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
      className="rpg-store absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[35rem] bg-[rgba(11,10,21,0.95)] border border-dark-border rounded-lg p-4 pointer-events-auto backdrop-blur-md"
    >
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="m-0">{storeName}</h3>
          {npcName && <div className="text-gray-500 text-sm">Shopkeeper: {npcName}</div>}
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-yellow-600/20 py-2 px-4 rounded">
            <span className="text-yellow-400">Coins: {playerCoins} gp</span>
          </div>
          <button
            onClick={onClose}
            className="bg-red-500 border-none rounded text-white py-1 px-2 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
        {items.map((item, index) => (
          <div
            key={index}
            className="flex items-center p-3 bg-black/30 rounded gap-4"
          >
            <div className="flex-1">
              <div className="font-bold">{item.name}</div>
            </div>
            <div className="text-right">
              <div className="text-yellow-400 font-bold">{item.price} gp</div>
              <div className={`text-sm ${item.stockQuantity > 0 || item.stockQuantity === -1 ? 'text-green-400' : 'text-red-500'}`}>
                Stock: {item.stockQuantity === -1 ? '∞' : item.stockQuantity}
              </div>
            </div>
            <button
              onClick={() => handleBuy(item.itemId)}
              disabled={item.stockQuantity === 0}
              className={`border-none rounded text-white py-2 px-4 ${
                item.stockQuantity === 0 
                  ? 'bg-gray-600 cursor-not-allowed opacity-50' 
                  : 'bg-emerald-500 cursor-pointer opacity-100'
              }`}
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
      className="rpg-context-menu absolute bg-[rgba(11,10,21,0.95)] border border-dark-border rounded p-1 pointer-events-auto backdrop-blur-md min-w-40"
      style={{
        left: `${x}px`,
        top: `${y}px`,
      }}
      onMouseLeave={onClose}
    >
      {options.map((option, index: number) => (
        <div
          key={index}
          onClick={() => handleOption(option)}
          className="py-2 px-3 cursor-pointer rounded transition-colors duration-100 hover:bg-white/10"
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
      className="rpg-hotbar fixed left-1/2 -translate-x-1/2 flex gap-1 bg-[rgba(11,10,21,0.9)] border border-dark-border rounded-lg p-2 pointer-events-auto backdrop-blur-md z-50"
      style={{
        bottom: 'calc(1rem + env(safe-area-inset-bottom))',
      }}
    >
      {selectedSlots.map((item, index) => {
        const isActive = activeSlot === index
        const keyLabel = index < 9 ? (index + 1).toString() : index === 9 ? '0' : index === 10 ? 'F11' : 'F12'
        
        return (
          <div
            key={index}
            onClick={() => handleSlotClick(index)}
            className={`w-10 h-10 rounded flex flex-col items-center justify-center relative transition-all duration-200 ${
              isActive 
                ? 'bg-blue-500/30 border-2 border-blue-500' 
                : 'bg-black/50 border border-white/20'
            } ${item ? 'cursor-pointer hover:scale-105' : 'cursor-default'}`}
          >
            {item && (
              <>
                <div className="text-[0.7rem] font-bold text-center leading-none text-white shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                  {getItemIcon(item)}
                </div>
                {item.quantity > 1 && (
                  <div className="absolute bottom-0.5 right-0.5 bg-yellow-400/90 text-black text-[0.5rem] font-bold rounded-sm py-0.5 px-1 min-w-3 text-center">
                    {item.quantity}
                  </div>
                )}
              </>
            )}
            {/* Key label */}
            <div className="absolute -top-0.5 -left-0.5 bg-black/80 text-gray-400 text-[0.5rem] rounded-sm py-0.5 px-1 min-w-3 text-center border border-white/10">
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
            className="fixed font-bold shadow-[2px_2px_4px_rgba(0,0,0,0.8)] pointer-events-none z-[1000] select-none transition-none"
            style={{
              left: `${damage.position.x}px`,
              top: `${damage.position.y - progress * 100}px`,
              color: getColor(damage.type),
              fontSize: damage.type === 'miss' ? '1.2rem' : '1.5rem',
              opacity: 1 - progress,
              transform: `scale(${1 + progress * 0.5})`,
            }}
          >
            {getText(damage)}
          </div>
        )
      })}
    </>
  )
}