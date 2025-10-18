import React, { useEffect, useMemo, useRef, useState } from 'react'
import { isTouch } from '@hyperscape/shared'
import type { World } from '@hyperscape/shared'
import { useFullscreen } from '../useFullscreen'
import {
  FieldBtn,
  FieldRange,
  FieldSwitch,
  FieldText,
  FieldToggle,
} from '../Fields'

interface SettingsPanelProps {
  world: World
}

const shadowOptions = [
  { label: 'None', value: 'none' },
  { label: 'Low', value: 'low' },
  { label: 'Med', value: 'med' },
  { label: 'High', value: 'high' },
]

function Group({ label }: { label?: string }) {
  return (
    <>
      <div className="h-px my-2.5" style={{ backgroundColor: 'rgba(242, 208, 138, 0.2)' }} />
      {label && (
        <div className="font-medium leading-none py-3 pl-4 -mt-2.5" style={{ color: '#f2d08a' }}>
          {label}
        </div>
      )}
    </>
  )
}

function Prefs({ world, hidden: _hidden }: { world: World; hidden: boolean }) {
  const player = world.entities.player
  const [name, setName] = useState(() => player?.name || '')
  const [dpr, setDPR] = useState(world.prefs?.dpr || 1)
  const [shadows, setShadows] = useState(world.prefs?.shadows || 'med')
  const [postprocessing, setPostprocessing] = useState(world.prefs?.postprocessing ?? true)
  const [bloom, setBloom] = useState(world.prefs?.bloom ?? true)
  const [music, setMusic] = useState(world.prefs?.music || 0.5)
  const [sfx, setSFX] = useState(world.prefs?.sfx || 0.5)
  const [voice, setVoice] = useState(world.prefs?.voice || 1)
  const [ui, setUI] = useState(world.prefs?.ui || 1)
  const nullRef = useRef<HTMLElement>(null)
  const [canFullscreen, isFullscreen, toggleFullscreen] = useFullscreen(nullRef)
  const [_stats, _setStats] = useState(world.prefs?.stats || false)
  
  const changeName = (name: string) => {
    if (!name) return setName(player!.name || '')
    player!.name = name
  }

  // Sync music preference with localStorage
  useEffect(() => {
    const updateMusicEnabled = () => {
      const enabled = music > 0
      localStorage.setItem('music_enabled', String(enabled))
    }
    updateMusicEnabled()
  }, [music])

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
    const onPrefsChange = (changes: Record<string, { value: unknown }>) => {
      if (changes.dpr) setDPR(changes.dpr.value as number)
      if (changes.shadows) setShadows(changes.shadows.value as string)
      if (changes.postprocessing) setPostprocessing(changes.postprocessing.value as boolean)
      if (changes.bloom) setBloom(changes.bloom.value as boolean)
      if (changes.music) setMusic(changes.music.value as number)
      if (changes.sfx) setSFX(changes.sfx.value as number)
      if (changes.voice) setVoice(changes.voice.value as number)
      if (changes.ui) setUI(changes.ui.value as number)
      if (changes.stats) _setStats(changes.stats.value as boolean)
    }
    world.prefs?.on('change', onPrefsChange)
    return () => {
      world.prefs?.off('change', onPrefsChange)
    }
  }, [])
  
  return (
    <div className='prefs noscrollbar w-full h-full overflow-y-auto'>
      <FieldText label='Character Name' hint='Change your character name in the game' value={name} onChange={changeName} />
      
      <Group label='Interface & Display' />
      <FieldRange
        label='UI Scale'
        hint='Change the scale of the user interface'
        min={0.5}
        max={1.5}
        step={0.1}
        value={ui}
        onChange={ui => world.prefs?.setUI(ui)}
      />
      <FieldToggle
        label='Fullscreen'
        hint='Toggle fullscreen. Not supported in some browsers'
        value={isFullscreen as boolean}
        onChange={value => { if (canFullscreen) toggleFullscreen(value) }}
        trueLabel='Enabled'
        falseLabel='Disabled'
      />
      <FieldToggle
        label='Performance Stats'
        hint='Show or hide performance statistics'
        value={world.prefs?.stats || false}
        onChange={stats => world.prefs?.setStats(stats)}
        trueLabel='Visible'
        falseLabel='Hidden'
      />
      {!isTouch && (
        <FieldBtn
          label='Hide Interface'
          note='Z'
          hint='Hide the user interface. Press Z to re-enable.'
          onClick={() => world.ui?.toggleVisible()}
        />
      )}
      
      <Group label='Visual Quality' />
      
      {/* Renderer info display */}
      <div className="mb-2 px-3 py-2 border rounded" style={{ backgroundColor: 'rgba(0, 0, 0, 0.35)', borderColor: 'rgba(242, 208, 138, 0.3)' }}>
        <div className="text-xs mb-1" style={{ color: 'rgba(242, 208, 138, 0.7)' }}>Rendering Backend</div>
        <div className="text-sm flex items-center gap-2">
          <span style={{ color: world.graphics?.isWebGPU ? '#22c55e' : '#60a5fa' }}>
            {world.graphics?.isWebGPU ? '⚡ WebGPU' : '🔷 WebGL 2'}
          </span>
          <span className="text-xs" style={{ color: 'rgba(242, 208, 138, 0.5)' }}>
            {world.graphics?.isWebGPU ? '(Modern, High Performance)' : '(Universal Compatibility)'}
          </span>
        </div>
      </div>
      
      <FieldSwitch
        label='Resolution'
        hint='Change your display resolution for better performance or quality'
        options={dprOptions}
        value={dpr}
        onChange={dpr => world.prefs?.setDPR(dpr as number)}
      />
      <FieldSwitch
        label='Shadow Quality'
        hint='Change the quality of shadows cast by objects and characters'
        options={shadowOptions}
        value={shadows}
        onChange={shadows => world.prefs?.setShadows(shadows as string)}
      />
      <FieldToggle
        label='Post-Processing'
        hint='Enable advanced visual effects like bloom and ambient occlusion. Improves visual quality but may reduce performance.'
        trueLabel='Enabled'
        falseLabel='Disabled'
        value={postprocessing}
        onChange={postprocessing => {
          world.prefs?.setPostprocessing(postprocessing)
        }}
      />
      {postprocessing && (
        <FieldToggle
          label='Bloom Effect'
          hint='Enable glowing effects on bright and magical objects.'
          trueLabel='Enabled'
          falseLabel='Disabled'
          value={bloom}
          onChange={bloom => {
            world.prefs?.setBloom(bloom)
          }}
        />
      )}
      
      <Group label='Audio & Sound' />
      <FieldRange
        label='Music Volume'
        hint='Adjust background music and ambient sounds'
        min={0}
        max={2}
        step={0.05}
        value={music}
        onChange={music => world.prefs?.setMusic(music)}
      />
      <FieldRange
        label='Effects Volume'
        hint='Adjust combat, magic, and interaction sound effects'
        min={0}
        max={2}
        step={0.05}
        value={sfx}
        onChange={sfx => world.prefs?.setSFX(sfx)}
      />
      <FieldRange
        label='Voice Chat'
        hint='Adjust volume for player voice communication'
        min={0}
        max={2}
        step={0.05}
        value={voice}
        onChange={voice => world.prefs?.setVoice(voice)}
      />
    </div>
  )
}

export function SettingsPanel({ world }: SettingsPanelProps) {
  const [advanced, setAdvanced] = useState(false)
  const [uiScale, setUiScale] = useState(world.prefs!.ui)
  const [statsOn, setStatsOn] = useState(world.prefs!.stats)
  const nullRef = useRef<HTMLElement>(null)
  const [canFullscreen, isFullscreen, toggleFullscreen] = useFullscreen(nullRef)

  const advancedModal = advanced ? (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[2000] pointer-events-auto"
      onClick={() => setAdvanced(false)}
    >
      <div
        className="w-[520px] max-w-[90vw] max-h-[80vh] bg-[rgba(11,10,21,0.98)] border rounded-xl overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
        style={{ borderColor: 'rgba(242, 208, 138, 0.4)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between py-2.5 px-3 border-b" style={{ borderBottomColor: 'rgba(242, 208, 138, 0.3)' }}>
          <div className="font-semibold" style={{ color: '#f2d08a' }}>Advanced Settings</div>
          <button onClick={() => setAdvanced(false)} className="border-none text-white rounded-md py-1 px-2 cursor-pointer" style={{ backgroundColor: '#8b4513' }}>Close</button>
        </div>
        <div className='noscrollbar overflow-y-auto max-h-[calc(80vh-48px)] py-2 px-3'>
          <Prefs world={world} hidden={false} />
        </div>
      </div>
    </div>
  ) : null

  return (
    <div className="w-full h-full overflow-y-auto relative">
      <div className="font-semibold mb-2.5 text-white">Quick Settings</div>
      <div className="flex flex-col gap-2.5">
        <div>
          <div className="mb-1 text-white/90">UI Scale</div>
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
            className="w-full"
          />
        </div>
        <div className="flex justify-between items-center">
          <div className="text-white/90">Fullscreen</div>
          <button
            onClick={() => { if (canFullscreen) toggleFullscreen(!(isFullscreen as boolean)) }}
            className="border text-white rounded-md py-1 px-2 cursor-pointer"
            style={{
              backgroundColor: 'rgba(242, 208, 138, 0.15)',
              borderColor: 'rgba(242, 208, 138, 0.5)',
              color: '#f2d08a',
            }}
          >
            {(isFullscreen as boolean) ? 'Disable' : 'Enable'}
          </button>
        </div>
        <div className="flex justify-between items-center">
          <div className="text-white/90">Performance Stats</div>
          <button
            onClick={() => {
              const next = !statsOn
              setStatsOn(next)
              world.prefs!.setStats(next)
            }}
            className="border-none text-white rounded-md py-1 px-2 cursor-pointer"
            style={{ backgroundColor: statsOn ? '#22c55e' : '#6b7280' }}
          >
            {statsOn ? 'Shown' : 'Hidden'}
          </button>
        </div>
        <button
          onClick={() => world.ui!.toggleVisible()}
          className="border-none text-white rounded-md py-1.5 px-2.5 cursor-pointer"
          style={{ backgroundColor: '#8b4513', color: '#f2d08a' }}
        >
          Hide Interface (Z)
        </button>

        <div className="h-2" />
        <button
          onClick={() => setAdvanced(true)}
          className="border text-white rounded-md py-2 px-2.5 cursor-pointer"
          style={{
            backgroundColor: 'rgba(242, 208, 138, 0.15)',
            borderColor: 'rgba(242, 208, 138, 0.5)',
            color: '#f2d08a',
          }}
        >
          Open Advanced Settings
        </button>
      </div>
      {advancedModal}
    </div>
  )
}


