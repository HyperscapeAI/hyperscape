import { MessageSquareIcon, Settings } from 'lucide-react'
// MenuIcon available but unused
import React, { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { isTouch } from '../utils'
import { cls } from './cls'

import { World } from '../../World'
import type { InventoryItem, PlayerEquipmentItems, PlayerStats, Item } from '../../types/core'
import { PlayerMigration } from '../../types/core'
import { EquipmentSlotName } from '../../types/core'
import { WeaponType } from '../../types/core'
import { EventType } from '../../types/events'
import { DraggableWindow } from './DraggableWindow'
import {
  FieldBtn,
  FieldRange,
  FieldSwitch,
  FieldText,
  FieldToggle,
} from './Fields'
import { HintContext, HintProvider } from './Hint'
import { MicIcon, MicOffIcon, VRIcon } from './Icons'
import { Minimap } from './Minimap'
import { useFullscreen } from './useFullscreen'

const _mainSectionPanes = ['prefs']


/**
 * frosted
 * 
background: rgba(11, 10, 21, 0.85); 
border: 0.0625rem solid #2a2b39;
backdrop-filter: blur(5px);
 *
 */

interface SidebarProps {
  world: World
  ui: {
    active: boolean
    pane: string | null
  }
}

export function Sidebar({ world, ui }: SidebarProps) {
  const [livekit, setLiveKit] = useState(() => world.livekit!.status)
  const [activePane, setActivePane] = useState<string>('skills')
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [equipment, setEquipment] = useState<PlayerEquipmentItems | null>(null)
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null)
  const [coins, setCoins] = useState<number>(0)
  
  useEffect(() => {
    const onLiveKitStatus = status => {
      setLiveKit({ ...status })
    }
    world.livekit!.on('status', onLiveKitStatus)
    const onOpenPane = (data: { pane?: string | null }) => {
      setActivePane((data?.pane ?? 'skills') as string)
    }
    world.on(EventType.UI_OPEN_PANE, onOpenPane)
    const onUIUpdate = (raw: unknown) => {
      const update = raw as { component: string; data: unknown }
      if (update.component === 'player') {
        setPlayerStats(update.data as PlayerStats)
      }
      if (update.component === 'equipment') {
        const data = update.data as { equipment: PlayerEquipmentItems }
        setEquipment(data.equipment)
      }
    }
    const onInventory = (raw: unknown) => {
      const data = raw as { items: InventoryItem[] }
      if (Array.isArray(data.items)) setInventory(data.items)
    }
    const onCoins = (raw: unknown) => {
      const data = raw as { playerId: string; coins: number }
      const localId = world.entities.player?.id
      if (!localId || data.playerId === localId) setCoins(typeof data.coins === 'number' ? data.coins : 0)
    }
    world.on(EventType.UI_UPDATE, onUIUpdate)
    world.on(EventType.INVENTORY_UPDATED, onInventory)
    world.on(EventType.INVENTORY_UPDATE_COINS, onCoins)
    return () => {
      world.livekit!.off('status', onLiveKitStatus)
      world.off(EventType.UI_OPEN_PANE, onOpenPane)
      world.off(EventType.UI_UPDATE, onUIUpdate)
      world.off(EventType.INVENTORY_UPDATED, onInventory)
      world.off(EventType.INVENTORY_UPDATE_COINS, onCoins)
    }
  }, [])
  
  const _activePane = ui.active ? ui.pane : null
  return (
    <HintProvider>
      <div
        className='sidebar'
        style={{
          position: 'absolute',
          fontSize: '1rem',
          top: 'calc(2rem + env(safe-area-inset-top))',
          right: 'calc(2rem + env(safe-area-inset-right))',
          bottom: 'calc(2rem + env(safe-area-inset-bottom))',
          left: 'calc(2rem + env(safe-area-inset-left))',
          display: 'flex',
          gap: '0.625rem',
          zIndex: 1,
        }}
      >
        <style>{`
          @media all and (max-width: 1200px) {
            .sidebar {
              top: calc(1rem + env(safe-area-inset-top));
              right: calc(1rem + env(safe-area-inset-right));
              bottom: calc(1rem + env(safe-area-inset-bottom));
              left: calc(1rem + env(safe-area-inset-left));
            }
          }
          .sidebar-sections {
            display: flex;
            flex-direction: column;
            flex-shrink: 0;
            gap: 0.625rem;
          }
          .sidebar-content.hidden {
            opacity: 0;
            pointer-events: none;
          }
          .sidebarpane.hidden {
            opacity: 0;
            pointer-events: none;
          }
          .sidebarpane-content {
            pointer-events: auto;
            max-height: 100%;
            display: flex;
            flex-direction: column;
          }
          .world-head {
            height: 3.125rem;
            padding: 0 1rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            align-items: center;
          }
          .world-title {
            font-weight: 500;
            font-size: 1rem;
            line-height: 1;
          }
          .world-content {
            flex: 1;
            padding: 0.5rem 0;
            overflow-y: auto;
          }
        `}</style>
        <div className='sidebar-sections'>
          {/* Chat and voice controls - top left */}
          <Section active={false} bottom>
            {isTouch && (
              <Btn
                onClick={() => {
                  world.emit(EventType.UI_SIDEBAR_CHAT_TOGGLE, undefined)
                }}
              >
                <MessageSquareIcon size='1.25rem' />
              </Btn>
            )}
            {livekit.available && !world.livekit?.room && (
              <Btn disabled>
                <MicOffIcon size='1.25rem' />
              </Btn>
            )}
            {livekit.available && world.livekit?.room && (
              <Btn
                onClick={() => {
                  if (livekit.audio) {
                    world.livekit!.disableAudio()
                  } else {
                    world.livekit!.enableAudio()
                  }
                }}
              >
                {livekit.audio ? <MicIcon size='1.25rem' /> : <MicOffIcon size='1.25rem' />}
              </Btn>
            )}
            {world.xr?.supportsVR && (
              <Btn
                onClick={() => {
                  world.xr?.enter()
                }}
              >
                <VRIcon size={20} />
              </Btn>
            )}
          </Section>
        </div>
        
        {/* Minimap + Right sidebar column */}
        <div style={{ position: 'fixed', right: 20, top: 24, zIndex: 998, pointerEvents: 'auto', width: 320 }}>
          <div className="minimap-card" style={{
            background: 'linear-gradient(180deg, rgba(12,12,20,0.98), rgba(12,12,20,0.92))',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 12,
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            padding: 8
          }}>
            <Minimap 
              world={world}
              width={304}
              height={304}
              zoom={50}
              style={{ borderRadius: 8, overflow: 'hidden' }}
            />
          </div>
          {/* Right docked panel that includes tab bar */}
          <RightDockPanel world={world} activePane={activePane} ui={ui}>
            {activePane === 'combat' && <CombatPage world={world} stats={playerStats} equipment={equipment} />}
            {activePane === 'skills' && <SkillsPage world={world} stats={playerStats} />}
            {activePane === 'inventory' && <InventoryPage items={inventory} coins={coins} />}
            {activePane === 'equipment' && <EquipmentPage equipment={equipment} />}
            {activePane === 'prefs' && <SettingsPage world={world} />}
          </RightDockPanel>
        </div>
        
        {/* Settings handled in the right dock panel via activePane === 'prefs' */}
      </div>
    </HintProvider>
  )
}

interface SectionProps {
  active: boolean
  top?: boolean
  bottom?: boolean
  children: React.ReactNode
}

function Section({ active, top = false, bottom = false, children }: SectionProps) {
  return (
    <div
      className={cls('sidebar-section', { active, top, bottom })}
      style={{
        background: 'rgba(11, 10, 21, 0.85)',
        border: '0.0625rem solid #2a2b39',
        backdropFilter: 'blur(5px)',
        borderRadius: '1rem',
        padding: '0.6875rem 0',
        pointerEvents: 'auto',
        position: 'relative',
      }}
    >
      {children}
    </div>
  )
}

interface BtnProps extends React.HTMLAttributes<HTMLDivElement> {
  disabled?: boolean
  suspended?: boolean
  active?: boolean
  children: React.ReactNode
}

function Btn({ disabled = false, suspended = false, active = false, children, ...props }: BtnProps) {
  return (
    <div
      className={cls('sidebar-btn', { disabled, suspended, active })}
      style={{
        width: '2.75rem',
        height: '1.875rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255, 255, 255, 0.8)',
        position: 'relative',
      }}
      {...props}
    >
      <style>{`
        .sidebar-btn-dot {
          display: none;
          position: absolute;
          top: 0.8rem;
          right: 0.2rem;
          width: 0.3rem;
          height: 0.3rem;
          border-radius: 0.15rem;
          background: white;
        }
        .sidebar-btn:hover {
          cursor: pointer;
          color: white;
        }
        .sidebar-btn.active {
          color: white;
        }
        .sidebar-btn.active .sidebar-btn-dot {
          display: block;
        }
        .sidebar-btn.suspended .sidebar-btn-dot {
          display: block;
          background: #ba6540;
        }
        .sidebar-btn.disabled {
          color: #5d6077;
        }
      `}</style>
      {children}
      <div className='sidebar-btn-dot' />
    </div>
  )
}

function TabButton({ label, onClick, disabled, titleHint, active }: { label: string; onClick?: () => void; disabled?: boolean; titleHint?: string; active?: boolean }) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        height: 32,
        borderRadius: 8,
        background: disabled ? 'rgba(255,255,255,0.06)' : active ? 'linear-gradient(180deg, rgba(59,130,246,0.35), rgba(59,130,246,0.2))' : 'rgba(0,0,0,0.35)',
        border: active ? '1px solid rgba(59,130,246,0.7)' : '1px solid rgba(255,255,255,0.12)',
        color: disabled ? '#6b7280' : '#e5e7eb',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, cursor: disabled ? 'default' : 'pointer', userSelect: 'none',
        boxShadow: active ? 'inset 0 0 10px rgba(59,130,246,0.35)' : 'none'
      }}
      title={titleHint || label}
    >
      {label}
    </div>
  )
}

function RightDockPanel({ children, world, activePane, ui }: { children: React.ReactNode; world: World; activePane: string; ui: { pane: string | null } }) {
  const [style, setStyle] = useState<{ top: number; left: number; width: number; height: number }>({ top: 24 + 304 + 12 + 46, left: window.innerWidth - 20 - 320, width: 320, height: 0 })
  useEffect(() => {
    const compute = () => {
      const card = document.querySelector('.minimap-card') as HTMLElement | null
      const gap = 12
      const bottomInset = 28
      const width = 320
      if (!card) {
        // Fallback constants mirroring container top spacing
        const columns = 4, rows = 7, cellGap = 6
        const size = Math.floor((width - cellGap * (columns - 1)) / columns)
        const top = 24 + 304 + gap + 46
        const maxH = window.innerHeight - top - bottomInset
        const panelHeight = Math.floor(Math.min(maxH, size * rows + cellGap * (rows - 1) + 16))
        setStyle({ top, left: Math.floor(window.innerWidth - 20 - width), width, height: panelHeight })
        return
      }
      const rect = card.getBoundingClientRect()
      // Derive consistent panel height from inventory grid (4x7)
      const columns = 4, rows = 7, cellGap = 6
      const size = Math.floor((width - cellGap * (columns - 1)) / columns)
      const top = Math.floor(rect.bottom + gap)
      const maxHeight = window.innerHeight - top - bottomInset
      const panelHeight = Math.floor(Math.min(maxHeight, size * rows + cellGap * (rows - 1) + 16))
      setStyle({ top, left: Math.floor(rect.left), width, height: panelHeight })
    }
    compute()
    window.addEventListener('resize', compute)
    return () => { window.removeEventListener('resize', compute) }
  }, [])
  return (
    <div style={{ position: 'fixed', left: style.left, top: style.top, width: style.width }}>
      <div className="panel-tabs" style={{
        display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6,
        background: 'rgba(11, 10, 21, 0.96)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderTopLeftRadius: 12, borderTopRightRadius: 12,
        padding: '8px 8px'
      }}>
        <TabButton label='⚔️' titleHint='Combat' active={activePane === 'combat'} onClick={() => world.emit(EventType.UI_OPEN_PANE, { pane: 'combat' })} />
        <TabButton label='🧠' titleHint='Skills' active={activePane === 'skills'} onClick={() => world.emit(EventType.UI_OPEN_PANE, { pane: 'skills' })} />
        <TabButton label='🎒' titleHint='Inventory' active={activePane === 'inventory'} onClick={() => world.emit(EventType.UI_OPEN_PANE, { pane: 'inventory' })} />
        <TabButton label='🛡️' titleHint='Worn Equipment' active={activePane === 'equipment'} onClick={() => world.emit(EventType.UI_OPEN_PANE, { pane: 'equipment' })} />
        <TabButton label='⚙️' titleHint='Settings' active={ui.pane === 'prefs'} onClick={() => world.emit(EventType.UI_OPEN_PANE, { pane: 'prefs' })} />
      </div>
      <div
        style={{
          width: style.width,
          height: style.height,
          background: 'rgba(11, 10, 21, 0.96)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderTop: 'none',
          borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
          padding: '10px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
          pointerEvents: 'auto',
          zIndex: 998,
          overflowY: 'auto',
          overflowX: 'hidden',
          boxSizing: 'border-box',
          scrollbarGutter: 'stable'
        }}
      >
        {children}
      </div>
    </div>
  )
}

function SkillsPage({ world, stats }: { world: World; stats: PlayerStats | null }) {
  const s = stats?.skills || ({} as NonNullable<PlayerStats['skills']>)
  const items = [
    { key: 'attack', label: 'Attack', icon: '⚔️', level: s?.attack?.level || 1, xp: s?.attack?.xp || 0 },
    { key: 'constitution', label: 'Constitution', icon: '❤️', level: Math.max(10, s?.constitution?.level || 10), xp: s?.constitution?.xp || 0 },
    { key: 'strength', label: 'Strength', icon: '💪', level: s?.strength?.level || 1, xp: s?.strength?.xp || 0 },
    { key: 'defense', label: 'Defense', icon: '🛡️', level: s?.defense?.level || 1, xp: s?.defense?.xp || 0 },
    { key: 'ranged', label: 'Ranged', icon: '🏹', level: s?.ranged?.level || 1, xp: s?.ranged?.xp || 0 },
    { key: 'woodcutting', label: 'Woodcutting', icon: '🪓', level: s?.woodcutting?.level || 1, xp: s?.woodcutting?.xp || 0 },
    { key: 'fishing', label: 'Fishing', icon: '🎣', level: s?.fishing?.level || 1, xp: s?.fishing?.xp || 0 },
    { key: 'firemaking', label: 'Firemaking', icon: '🔥', level: s?.firemaking?.level || 1, xp: s?.firemaking?.xp || 0 },
    { key: 'cooking', label: 'Cooking', icon: '🍳', level: s?.cooking?.level || 1, xp: s?.cooking?.xp || 0 }
  ]
  const totalLevel = items.reduce((sum, it) => sum + (it.level || 1), 0)
  const totalXP = items.reduce((sum, it) => sum + (it.xp || 0), 0)
  const [hover, setHover] = useState<{ label: string; xp: number } | null>(null)
  const [mouse, setMouse] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  return (
    <div style={{ position: 'relative', height: '100%' }} onMouseMove={(e) => setMouse({ x: e.clientX, y: e.clientY })}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {items.map((it) => (
          <div key={it.key} style={{
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            padding: '6px 8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
            fontSize: 13, cursor: 'default'
          }}
          onMouseEnter={() => setHover({ label: it.label, xp: it.xp })}
          onMouseLeave={() => setHover(null)}
          >
            <span style={{ fontSize: 18 }}>{it.icon}</span>
            <span>{it.level}/{it.level}</span>
          </div>
        ))}
      </div>
      <div
        style={{ position: 'absolute', left: 8, right: 8, bottom: 8, textAlign: 'right', color: '#9ca3af', fontSize: 12 }}
        onMouseEnter={() => setHover({ label: 'Total', xp: totalXP })}
        onMouseLeave={() => setHover(null)}
      >
        Total level: {totalLevel}
      </div>
      {hover && (
        (() => {
          const pad = 12
          const tooltipWidth = 160
          const tooltipHeight = 56
          let left = mouse.x + pad
          if (left + tooltipWidth > window.innerWidth - 8) left = mouse.x - tooltipWidth - pad
          if (left < 8) left = 8
          let top = mouse.y + pad
          if (top + tooltipHeight > window.innerHeight - 8) top = mouse.y - tooltipHeight - pad
          if (top < 8) top = 8
          return (
            <div style={{ position: 'fixed', left, top, width: tooltipWidth, background: 'rgba(20,20,28,0.98)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '6px 8px', color: '#fff', fontSize: 12, pointerEvents: 'none', zIndex: 200 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                {hover.label === 'Total' ? 'Total Experience' : hover.label}
              </div>
              <div>{hover.label === 'Total' ? 'Total XP' : 'XP'}: {Math.floor(hover.xp).toLocaleString()}</div>
            </div>
          )
        })()
      )}
    </div>
  )
}

function InventoryPage({ items, coins }: { items: InventoryItem[]; coins: number }) {
  const slots = Array(28).fill(null)
  items.forEach((item, i) => { if (i < 28) slots[i] = item })
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<number>(40)
  useEffect(() => {
    const compute = () => {
      const grid = gridRef.current
      if (!grid) return
      const parent = grid.parentElement as HTMLElement | null
      const columns = 4
      const rows = 7
      const gap = 8
      const widthAvailable = (parent?.clientWidth || grid.clientWidth)
      const byWidth = Math.floor((widthAvailable - gap * (columns - 1)) / columns)
      const next = Math.max(20, byWidth)
      setSize(next)
    }
    compute()
    window.addEventListener('resize', compute)
    const id = window.setInterval(compute, 500)
    return () => { window.removeEventListener('resize', compute); window.clearInterval(id) }
  }, [])
  const rows = 7
  const columns = 4
  const gap = 8
  const gridHeight = size * rows + gap * (rows - 1)
  return (
    <div style={{ height: gridHeight + 44, width: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
      <div ref={gridRef} style={{ margin: '0 auto', display: 'grid', gridTemplateColumns: `repeat(${columns}, ${size}px)`, gridTemplateRows: `repeat(${rows}, ${size}px)`, gridAutoFlow: 'row', gap: gap, width: (size * columns + gap * (columns - 1)) }}>
        {slots.map((item, i) => (
          <div key={i} style={{
            width: size, height: size,
            background: 'rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10
          }}>
            {item ? (item.itemId.substring(0, 3)) : ''}
          </div>
        ))}
      </div>
      <div style={{
        marginTop: 10,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(0,0,0,0.35)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 6,
        padding: '8px 10px',
        color: '#e5e7eb', fontSize: 13
      }}>
        <span>Coins</span>
        <span style={{ color: '#fbbf24', fontWeight: 700 }}>{coins.toLocaleString()} gp</span>
      </div>
    </div>
  )
}

function CombatPage({ world, stats, equipment }: { world: World; stats: PlayerStats | null; equipment: PlayerEquipmentItems | null }) {
  const [style, setStyle] = useState<string>('accurate')
  const [cooldown, setCooldown] = useState<number>(0)
  const combatLevel = (typeof stats?.combatLevel === 'number')
    ? (stats!.combatLevel as number)
    : (stats?.skills ? PlayerMigration.calculateCombatLevel(stats.skills) : 1)

  useEffect(() => {
    const id = world.entities.player?.id
    if (!id) return
    const api = (world as unknown as { api?: { getAttackStyleInfo?: (playerId: string, cb: (info: { style: string; cooldown?: number }) => void) => void } }).api
    api?.getAttackStyleInfo?.(id, (info: { style: string; cooldown?: number }) => {
      if (info) {
        setStyle(info.style)
        setCooldown(info.cooldown || 0)
      }
    })
    const onUpdate = (data: { playerId: string; currentStyle: { id: string } }) => {
      if (data.playerId !== id) return
      setStyle(data.currentStyle.id)
    }
    const onChanged = (data: { playerId: string; currentStyle: { id: string } }) => {
      if (data.playerId !== id) return
      setStyle(data.currentStyle.id)
    }
    world.on(EventType.UI_ATTACK_STYLE_UPDATE, onUpdate)
    world.on(EventType.UI_ATTACK_STYLE_CHANGED, onChanged)
    return () => {
      world.off(EventType.UI_ATTACK_STYLE_UPDATE, onUpdate)
      world.off(EventType.UI_ATTACK_STYLE_CHANGED, onChanged)
    }
  }, [world, world.entities.player?.id])

  const changeStyle = (next: string) => {
    const id = world.entities.player?.id
    if (!id) return
    const api = (world as unknown as { api?: { changeAttackStyle?: (playerId: string, style: string) => void } }).api
    api?.changeAttackStyle?.(id, next)
  }

  // Determine if ranged weapon equipped; if so, limit to ranged/defense like RS
  const isRanged = !!(equipment?.arrows || (equipment?.weapon && (equipment.weapon.weaponType === WeaponType.BOW || equipment.weapon.weaponType === WeaponType.CROSSBOW)))
  const styles: Array<{ id: string; label: string }> = isRanged
    ? [
        { id: 'accurate', label: 'Ranged' },
        { id: 'defensive', label: 'Defensive' },
      ]
    : [
        { id: 'accurate', label: 'Accurate' },
        { id: 'aggressive', label: 'Aggressive' },
        { id: 'defensive', label: 'Defensive' },
      ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{
        background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
        padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between'
      }}>
        <div style={{ fontWeight: 600 }}>Combat level</div>
        <div>{combatLevel}</div>
      </div>
      <div style={{ fontWeight: 600, marginTop: 4 }}>Attack style</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {styles.map(s => (
          <button key={s.id}
            onClick={() => changeStyle(s.id)}
            disabled={cooldown > 0}
            style={{
              background: style === s.id ? 'rgba(59,130,246,0.25)' : 'rgba(0,0,0,0.35)',
              border: style === s.id ? '1px solid rgba(59,130,246,0.7)' : '1px solid rgba(255,255,255,0.08)',
              color: '#e5e7eb', borderRadius: 6, padding: '8px 10px', cursor: 'pointer'
            }}
          >{s.label}</button>
        ))}
      </div>
      {cooldown > 0 && (
        <div style={{ fontSize: 12, color: '#9ca3af' }}>Style change available in {Math.ceil(cooldown / 1000)}s</div>
      )}
    </div>
  )
}

function EquipmentPage({ equipment }: { equipment: PlayerEquipmentItems | null }) {
  // Fixed slot layout (shows placeholders even when empty)
  // Use the same slots as defined in Interface.tsx and PlayerEquipmentItems
  const slots = [
    { key: EquipmentSlotName.HELMET as 'helmet', label: 'Helmet' },
    { key: EquipmentSlotName.BODY as 'body', label: 'Body' },
    { key: EquipmentSlotName.LEGS as 'legs', label: 'Legs' },
    { key: EquipmentSlotName.WEAPON as 'weapon', label: 'Weapon' },
    { key: EquipmentSlotName.SHIELD as 'shield', label: 'Shield' },
    { key: EquipmentSlotName.ARROWS as 'arrows', label: 'Arrows' },
  ] as const

  const itemMap: Record<string, Item | null> = equipment
    ? (equipment as unknown as Record<string, Item | null>)
    : {}

  const cell = (slotKey: string, label: string) => {
    const item = (itemMap && slotKey in itemMap ? itemMap[slotKey] : null) as Item | null
    return (
      <div
        key={slotKey}
        style={{
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#e5e7eb', fontSize: 11, position: 'relative'
        }}
        title={item ? item.name : label}
      >
        <div style={{
          position: 'absolute', top: 4, left: 6, color: '#9ca3af', fontSize: 10
        }}>{label}</div>
        <div style={{ fontSize: 12 }}>
          {item ? (item.id.substring(0, 3)) : ''}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div
        style={{
          background: 'rgba(0,0,0,0.35)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 6,
          padding: 8,
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gridTemplateRows: 'repeat(4, 1fr)',
            gap: 6,
          }}
        >
          {slots.map((s) => (
            <div key={s.key} style={{ width: '100%', aspectRatio: '1 / 1' }}>
              {cell(s.key, s.label)}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SettingsPage({ world }: { world: World }) {
  const [advanced, setAdvanced] = useState(false)
  // Hooks must not be conditional – declare upfront
  const [uiScale, setUiScale] = useState(world.prefs!.ui)
  const [statsOn, setStatsOn] = useState(world.prefs!.stats)
  const nullRef = useRef<HTMLElement>(null)
  const [canFullscreen, isFullscreen, toggleFullscreen] = useFullscreen(nullRef)

  // Advanced settings modal overlay (centered, scrollable)
  const advancedModal = advanced ? (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000, pointerEvents: 'auto'
      }}
      onClick={() => setAdvanced(false)}
    >
      <div
        style={{
          width: 520, maxWidth: '90vw', maxHeight: '80vh',
          background: 'rgba(11, 10, 21, 0.98)',
          border: '1px solid #2a2b39', borderRadius: 12,
          overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div style={{ fontWeight: 600 }}>Advanced Settings</div>
          <button onClick={() => setAdvanced(false)} style={{ background: '#ef4444', border: 'none', color: '#fff', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}>Close</button>
        </div>
        <div className='noscrollbar' style={{ overflowY: 'auto', maxHeight: 'calc(80vh - 48px)', padding: '8px 12px' }}>
          <Prefs world={world} hidden={false} />
        </div>
      </div>
    </div>
  ) : null
  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', position: 'relative' }}>
      <div style={{ fontWeight: 600, marginBottom: 10 }}>Quick Settings</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* UI Scale */}
        <div>
          <div style={{ marginBottom: 4 }}>UI Scale</div>
          <input
            type='range'
            min={0.6}
            max={1.6}
            step={0.05}
            value={uiScale}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              setUiScale(v)
              world.prefs!.setUI(v)
            }}
            style={{ width: '100%' }}
          />
        </div>
        {/* Fullscreen */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>Fullscreen</div>
          <button
            onClick={() => { if (canFullscreen && typeof toggleFullscreen === 'function') toggleFullscreen(!(isFullscreen as boolean)) }}
            style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.15)', color: 'white', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
          >
            {(isFullscreen as boolean) ? 'Disable' : 'Enable'}
          </button>
        </div>
        {/* Performance Stats */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>Performance Stats</div>
          <button
            onClick={() => {
              const next = !statsOn
              setStatsOn(next)
              world.prefs!.setStats(next)
            }}
            style={{ background: statsOn ? '#10b981' : '#4b5563', border: 'none', color: 'white', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
          >
            {statsOn ? 'Shown' : 'Hidden'}
          </button>
        </div>
        {/* Hide Interface */}
        <button
          onClick={() => world.ui!.toggleVisible()}
          style={{ background: '#ef4444', border: 'none', color: 'white', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}
        >
          Hide Interface (Z)
        </button>

        <div style={{ height: 8 }} />
        <button
          onClick={() => setAdvanced(true)}
          style={{ background: '#3b82f6', border: 'none', color: 'white', borderRadius: 6, padding: '8px 10px', cursor: 'pointer' }}
        >
          Open Advanced Settings
        </button>
      </div>
      {advancedModal}
    </div>
  )
}

interface ContentProps {
  width?: string
  hidden: boolean
  children: React.ReactNode
}

function _Content({ width = '20rem', hidden, children }: ContentProps) {
  return (
    <div
      className={cls('sidebar-content', { hidden })}
      style={{
        width: width,
        pointerEvents: 'auto',
        background: 'rgba(11, 10, 21, 0.85)',
        border: '0.0625rem solid #2a2b39',
        backdropFilter: 'blur(5px)',
        borderRadius: '1rem',
        display: 'flex',
        alignItems: 'stretch',
      }}
    >
      <div className='sidebar-content-main'>{children}</div>
      <Hint />
    </div>
  )
}

interface PaneProps {
  width?: string
  hidden: boolean
  children: React.ReactNode
}

function _Pane({ width = '20rem', hidden, children }: PaneProps) {
  return (
    <div
      className={cls('sidebarpane', { hidden })}
      style={{
        width: width,
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div className='sidebarpane-content'>{children}</div>
      <Hint />
    </div>
  )
}

function Hint() {
  const contextValue = useContext(HintContext)
  if (!contextValue) return null
  const { hint } = contextValue
  if (!hint) return null
  return (
    <div
      className='hint'
      style={{
        marginTop: '0.25rem',
        background: 'rgba(11, 10, 21, 0.85)',
        border: '0.0625rem solid #2a2b39',
        backdropFilter: 'blur(5px)',
        borderRadius: '1rem',
        minWidth: '0',
        padding: '1rem',
        fontSize: '0.9375rem',
      }}
    >
      <span>{hint}</span>
    </div>
  )
}

interface GroupProps {
  label?: string
}

function Group({ label }: GroupProps) {
  return (
    <>
      <div
        style={{
          height: '0.0625rem',
          background: 'rgba(255, 255, 255, 0.05)',
          margin: '0.6rem 0',
        }}
      />
      {label && (
        <div
          style={{
            fontWeight: '500',
            lineHeight: '1',
            padding: '0.75rem 0 0.75rem 1rem',
            marginTop: '-0.6rem',
          }}
        >
          {label}
        </div>
      )}
    </>
  )
}

const shadowOptions = [
  { label: 'None', value: 'none' },
  { label: 'Low', value: 'low' },
  { label: 'Med', value: 'med' },
  { label: 'High', value: 'high' },
]
interface PrefsProps {
  world: SidebarProps['world']
  hidden: boolean
}

function Prefs({ world, hidden: _hidden }: PrefsProps) {
  const player = world.entities.player
  const [name, setName] = useState(() => player?.name || '')
  const [dpr, setDPR] = useState(world.prefs!.dpr)
  const [shadows, setShadows] = useState(world.prefs!.shadows)
  const [postprocessing, setPostprocessing] = useState(world.prefs!.postprocessing)
  const [bloom, setBloom] = useState(world.prefs!.bloom)
  const [music, setMusic] = useState(world.prefs!.music)
  const [sfx, setSFX] = useState(world.prefs!.sfx)
  const [voice, setVoice] = useState(world.prefs!.voice)
  const [ui, setUI] = useState(world.prefs!.ui)
  const nullRef = useRef<HTMLElement>(null)
  const [canFullscreen, isFullscreen, toggleFullscreen] = useFullscreen(nullRef)
  const [_stats, _setStats] = useState(world.prefs!.stats)
  
  const changeName = name => {
    if (!name) return setName(player.data.name || '')
    player.data.name = name
  }
  const dprOptions = useMemo(() => {
    const _width = world.graphics!.width
    const _height = world.graphics!.height
    const dpr = window.devicePixelRatio
    const options: Array<{label: string; value: number}> = []
    const add = (label: string, dpr: number) => {
      options.push({
        label,
        value: dpr,
      })
    }
    add('0.5x', 0.5)
    add('1x', 1)
    if (dpr >= 2) add('2x', 2)
    if (dpr >= 3) add('3x', dpr)
    return options
  }, [])
  useEffect(() => {
    const onPrefsChange = changes => {
      if (changes.dpr) setDPR(changes.dpr.value)
      if (changes.shadows) setShadows(changes.shadows.value)
      if (changes.postprocessing) setPostprocessing(changes.postprocessing.value)
      if (changes.bloom) setBloom(changes.bloom.value)
      if (changes.music) setMusic(changes.music.value)
      if (changes.sfx) setSFX(changes.sfx.value)
      if (changes.voice) setVoice(changes.voice.value)
      if (changes.ui) setUI(changes.ui.value)
      if (changes.stats) _setStats(changes.stats.value)
    }
    world.prefs!.on('change', onPrefsChange)
    return () => {
      world.prefs!.off('change', onPrefsChange)
    }
  }, [])
  
  return (
    <div
      className='prefs noscrollbar'
      style={{
        width: '20rem',
        maxHeight: '28rem',
        overflowY: 'auto',
        background: 'rgba(11, 10, 21, 0.85)',
        border: '0.0625rem solid #2a2b39',
        backdropFilter: 'blur(5px)',
        borderRadius: '1rem',
        borderTopLeftRadius: 0,
        borderTopRightRadius: 0,
        padding: '0.6rem 0',
      }}
    >
        <FieldText label='Character Name' hint='Change your character name in the game' value={name} onChange={changeName} />
        
        <Group label='Interface & Display' />
        <FieldRange
          label='UI Scale'
          hint='Change the scale of the user interface'
          min={0.5}
          max={1.5}
          step={0.1}
          value={ui}
          onChange={ui => world.prefs!.setUI(ui)}
        />
        <FieldToggle
          label='Fullscreen'
          hint='Toggle fullscreen. Not supported in some browsers'
          value={isFullscreen as boolean}
          onChange={value => { if (canFullscreen && typeof toggleFullscreen === 'function') toggleFullscreen(value) }}
          trueLabel='Enabled'
          falseLabel='Disabled'
        />
        <FieldToggle
          label='Performance Stats'
          hint='Show or hide performance statistics'
          value={world.prefs!.stats}
          onChange={stats => world.prefs!.setStats(stats)}
          trueLabel='Visible'
          falseLabel='Hidden'
        />
        {!isTouch && (
          <FieldBtn
            label='Hide Interface'
            note='Z'
            hint='Hide the user interface. Press Z to re-enable.'
            onClick={() => world.ui!.toggleVisible()}
          />
        )}
        
        <Group label='Visual Quality' />
        <FieldSwitch
          label='Resolution'
          hint='Change your display resolution for better performance or quality'
          options={dprOptions}
          value={dpr}
          onChange={dpr => world.prefs!.setDPR(dpr as number)}
        />
        <FieldSwitch
          label='Shadow Quality'
          hint='Change the quality of shadows cast by objects and characters'
          options={shadowOptions}
          value={shadows}
          onChange={shadows => world.prefs!.setShadows(shadows as string)}
        />
        <FieldToggle
          label='Visual Effects'
          hint='Enable or disable advanced visual effects'
          trueLabel='Enabled'
          falseLabel='Disabled'
          value={postprocessing}
          onChange={postprocessing => world.prefs!.setPostprocessing(postprocessing)}
        />
        <FieldToggle
          label='Magical Glow'
          hint='Enable or disable magical bloom effects on bright objects'
          trueLabel='Enabled'
          falseLabel='Disabled'
          value={bloom}
          onChange={bloom => world.prefs!.setBloom(bloom)}
        />
        
        <Group label='Audio & Sound' />
        <FieldRange
          label='Music Volume'
          hint='Adjust background music and ambient sounds'
          min={0}
          max={2}
          step={0.05}
          value={music}
          onChange={music => world.prefs!.setMusic(music)}
        />
        <FieldRange
          label='Effects Volume'
          hint='Adjust combat, magic, and interaction sound effects'
          min={0}
          max={2}
          step={0.05}
          value={sfx}
          onChange={sfx => world.prefs!.setSFX(sfx)}
        />
        <FieldRange
          label='Voice Chat'
          hint='Adjust volume for player voice communication'
          min={0}
          max={2}
          step={0.05}
          value={voice}
          onChange={voice => world.prefs!.setVoice(voice)}
        />
    </div>
  )
}

