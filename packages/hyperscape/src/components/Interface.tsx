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
import { LootWindow } from '../client/components/LootWindow'
import { EntityContextMenu } from '../client/components/EntityContextMenu'

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
  const [showSkills, setShowSkills] = useState(false)
  const [bankData, setBankData] = useState<BankEntityData & { items: BankItem[] } | null>(null)
  const [storeData, setStoreData] = useState<StoreData | null>(null)
  // Removed contextMenu and resourceContextMenu - EntityContextMenu handles all menus now
  const [damageNumbers, setDamageNumbers] = useState<DamageNumber[]>([])
  const [gatheringState, setGatheringState] = useState<{
    active: boolean
    action: string
    resourceType: string
    startTime: number
    duration: number
  } | null>(null)
  const [combatState, setCombatState] = useState<{
    active: boolean
    targetId: string
    targetName: string
    targetLevel: number
  } | null>(null)
  const [lootWindow, setLootWindow] = useState<{
    visible: boolean
    corpseId: string
    corpseName: string
    lootItems: InventoryItem[]
  }>({
    visible: false,
    corpseId: '',
    corpseName: '',
    lootItems: []
  })

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

    const handleCorpseClick = (rawData: unknown) => {
      const data = rawData as { corpseId: string; playerId: string; lootItems?: InventoryItem[]; position?: { x: number; y: number; z: number } }
      if (data.playerId !== localPlayer.id) return
      
      // Get corpse entity to retrieve loot items
      const corpseEntity = world.entities.get(data.corpseId)
      if (corpseEntity && 'getLootItems' in corpseEntity) {
        const lootItems = (corpseEntity as { getLootItems: () => InventoryItem[] }).getLootItems()
        const corpseName = corpseEntity.name || 'Corpse'
        
        setLootWindow({
          visible: true,
          corpseId: data.corpseId,
          corpseName,
          lootItems
        })
      }
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

    // All menu handlers removed - EntityContextMenu handles everything via rpg:contextmenu event

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

    const handleGatheringStarted = (rawData: unknown) => {
      const data = rawData as { playerId: string; resourceId: string; skill?: string; actionName?: string; duration?: number; action?: string }
      if (data.playerId !== localPlayer.id) return
      
      const actionName = data.actionName || data.action || data.skill || 'gathering'
      const resourceType = data.resourceId.includes('tree') ? 'tree' : 
                           data.resourceId.includes('fish') ? 'fishing spot' :
                           data.resourceId.includes('rock') ? 'rock' : 'resource'
      
      setGatheringState({
        active: true,
        action: actionName,
        resourceType,
        startTime: Date.now(),
        duration: data.duration || 5000 // Default 5 seconds
      })
    }

    const handleGatheringCompleted = (rawData: unknown) => {
      const data = rawData as { playerId: string }
      if (data.playerId !== localPlayer.id) return
      
      setGatheringState(null)
    }

    const handleGatheringStopped = (rawData: unknown) => {
      const data = rawData as { playerId: string }
      if (data.playerId !== localPlayer.id) return
      
      setGatheringState(null)
    }

    const handleCombatStarted = (rawData: unknown) => {
      const data = rawData as { attackerId: string; targetId: string }
      // Handle combat for local player (whether they're attacker or target)
      if (data.attackerId !== localPlayer.id && data.targetId !== localPlayer.id) return
      
      // Determine which entity is the opponent
      const opponentId = data.attackerId === localPlayer.id ? data.targetId : data.attackerId
      const opponentEntity = world.entities.get(opponentId)
      const opponentData = opponentEntity && (opponentEntity as any).getMobData ? (opponentEntity as any).getMobData() : null
      
      setCombatState({
        active: true,
        targetId: opponentId,
        targetName: opponentData?.name || opponentEntity?.name || 'Enemy',
        targetLevel: opponentData?.level || 1
      })
      
      console.log('[Interface] Combat started:', {
        localPlayer: localPlayer.id,
        opponent: opponentId,
        opponentName: opponentData?.name
      })
    }

    const handleCombatEnded = (rawData: unknown) => {
      const data = rawData as { attackerId: string; targetId: string }
      // End combat if local player is involved
      if (data.attackerId !== localPlayer.id && data.targetId !== localPlayer.id) return
      
      console.log('[Interface] Combat ended for local player')
      setCombatState(null)
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
    // Removed old menu event listeners - EntityContextMenu handles everything
    typedWorld.on(EventType.UI_OPEN_PANE, handleOpenPane)
    typedWorld.on(EventType.COMBAT_DAMAGE_DEALT, handleCombatEvent)
    typedWorld.on(EventType.COMBAT_HEAL, handleCombatEvent)
    typedWorld.on(EventType.SKILLS_XP_GAINED, handleCombatEvent)
    typedWorld.on(EventType.COMBAT_MISS, handleCombatEvent)
    typedWorld.on(EventType.RESOURCE_GATHERING_STARTED, handleGatheringStarted)
    typedWorld.on(EventType.RESOURCE_GATHERING_COMPLETED, handleGatheringCompleted)
    typedWorld.on(EventType.RESOURCE_GATHERING_STOPPED, handleGatheringStopped)
    typedWorld.on(EventType.COMBAT_STARTED, handleCombatStarted)
    typedWorld.on(EventType.COMBAT_ENDED, handleCombatEnded)
    typedWorld.on(EventType.CORPSE_CLICK, handleCorpseClick)

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
      // Removed old menu event listeners cleanup
      typedWorld.off(EventType.UI_OPEN_PANE, handleOpenPane)
      typedWorld.off(EventType.COMBAT_DAMAGE_DEALT, handleCombatEvent)
      typedWorld.off(EventType.COMBAT_HEAL, handleCombatEvent)
      typedWorld.off(EventType.SKILLS_XP_GAINED, handleCombatEvent)
      typedWorld.off(EventType.COMBAT_MISS, handleCombatEvent)
      typedWorld.off(EventType.RESOURCE_GATHERING_STARTED, handleGatheringStarted)
      typedWorld.off(EventType.RESOURCE_GATHERING_COMPLETED, handleGatheringCompleted)
      typedWorld.off(EventType.RESOURCE_GATHERING_STOPPED, handleGatheringStopped)
      typedWorld.off(EventType.COMBAT_STARTED, handleCombatStarted)
      typedWorld.off(EventType.COMBAT_ENDED, handleCombatEnded)
      typedWorld.off(EventType.CORPSE_CLICK, handleCorpseClick)
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
      {/* All old context menus removed - EntityContextMenu handles everything */}
      {/* ButtonPanel removed; replaced by minimap tabs in Sidebar */}
      <DamageNumbers damageNumbers={damageNumbers} />
      {gatheringState && <GatheringProgress state={gatheringState} />}
      {combatState && <CombatIndicator state={combatState} />}
      <LootWindow
        visible={lootWindow.visible}
        corpseId={lootWindow.corpseId}
        corpseName={lootWindow.corpseName}
        lootItems={lootWindow.lootItems}
        onClose={() => setLootWindow({ visible: false, corpseId: '', corpseName: '', lootItems: [] })}
        world={world}
      />
      <EntityContextMenu world={world} />
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

      <div className="mt-2 text-[0.85rem] text-gray-400 text-right">
        Total level: {totalLevel}
      </div>

      {hoverInfo && (
        <div
          className="fixed bg-[rgba(20,20,28,0.98)] border border-white/15 rounded-md p-2 px-2.5 text-white pointer-events-none text-[0.8rem] z-[200] max-w-64"
          style={{
            left: mouse.x + 12,
            top: mouse.y + 12,
          }}
        >
          <div className="font-semibold mb-1">{hoverInfo.label}</div>
          <div className="opacity-90">XP: {Math.floor(hoverInfo.xp).toLocaleString()}</div>
          <div className="opacity-90">Next level at: {getXpForLevel(Math.min(120, hoverInfo.level + 1)).toLocaleString()} xp</div>
          <div className="opacity-90">Remaining: {(getXpForLevel(Math.min(120, hoverInfo.level + 1)) - Math.floor(hoverInfo.xp)).toLocaleString()} xp</div>
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

// ContextMenuPanel removed - EntityContextMenu handles all context menus now

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

// Gathering Progress Component
function GatheringProgress({ state }: { 
  state: { 
    active: boolean
    action: string
    resourceType: string
    startTime: number
    duration: number
  } 
}) {
  const [progress, setProgress] = useState(0)
  
  useEffect(() => {
    if (!state.active) return
    
    const updateProgress = () => {
      const elapsed = Date.now() - state.startTime
      const progressPercent = Math.min((elapsed / state.duration) * 100, 100)
      setProgress(progressPercent)
      
      if (progressPercent >= 100) {
        return
      }
    }
    
    // Update every 50ms for smooth animation
    const interval = setInterval(updateProgress, 50)
    updateProgress() // Initial update
    
    return () => clearInterval(interval)
  }, [state])
  
  const getActionIcon = (action: string) => {
    if (action.includes('chop')) return '🪓'
    if (action.includes('fish')) return '🎣'
    if (action.includes('mine')) return '⛏️'
    return '⚒️'
  }
  
  const getActionColor = (action: string) => {
    if (action.includes('chop')) return '#8B4513' // Brown
    if (action.includes('fish')) return '#4682B4' // Blue
    if (action.includes('mine')) return '#808080' // Gray
    return '#10b981' // Green
  }
  
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 bg-[rgba(11,10,21,0.95)] border border-white/20 rounded-lg p-4 pointer-events-none backdrop-blur-xl z-[900] shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
      style={{
        bottom: 'calc(6rem + env(safe-area-inset-bottom))',
        minWidth: '300px'
      }}
    >
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{getActionIcon(state.action)}</span>
        <div className="flex-1">
          <div className="text-sm font-medium text-white/90 capitalize">
            {state.action.replace('_', ' ')}
          </div>
          <div className="text-xs text-white/60">
            {state.resourceType.replace('_', ' ')}
          </div>
        </div>
        <div className="text-sm font-mono text-white/70">
          {Math.ceil((state.duration - (Date.now() - state.startTime)) / 1000)}s
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="w-full h-2 bg-black/50 rounded-full overflow-hidden border border-white/10">
        <div
          className="h-full transition-all duration-100 ease-linear rounded-full"
          style={{
            width: `${progress}%`,
            background: `linear-gradient(90deg, ${getActionColor(state.action)}, ${getActionColor(state.action)}cc)`,
            boxShadow: `0 0 10px ${getActionColor(state.action)}88`
          }}
        />
      </div>
      
      {/* Progress percentage */}
      <div className="text-center text-xs mt-1 text-white/50 font-mono">
        {Math.floor(progress)}%
      </div>
    </div>
  )
}

// Combat Indicator Component - shows active combat status with clear visibility
function CombatIndicator({ state }: { 
  state: { 
    active: boolean
    targetId: string
    targetName: string
    targetLevel: number
  } 
}) {
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 bg-[rgba(139,0,0,0.95)] border-2 border-red-500/50 rounded-lg p-3 pointer-events-none backdrop-blur-xl z-[900] shadow-[0_8px_32px_rgba(255,0,0,0.4)]"
      style={{
        top: 'calc(6rem + env(safe-area-inset-top))',
        minWidth: '320px'
      }}
    >
      <div className="flex items-center gap-3">
        <span className="text-3xl">⚔️</span>
        <div className="flex-1">
          <div className="text-base font-bold text-red-200 uppercase tracking-wide mb-1">
            ⚔️ In Combat!
          </div>
          <div className="text-sm text-white/90 font-medium">
            Fighting: <span className="font-bold text-white">{state.targetName}</span> <span className="text-yellow-300">(Lv {state.targetLevel})</span>
          </div>
          <div className="mt-2 text-xs text-red-300/70">
            Auto-attacking every 3 seconds...
          </div>
        </div>
        <div className="w-4 h-4 bg-red-500 rounded-full animate-ping absolute -top-2 -right-2"></div>
        <div className="w-4 h-4 bg-red-500 rounded-full absolute -top-2 -right-2"></div>
      </div>
    </div>
  )
}