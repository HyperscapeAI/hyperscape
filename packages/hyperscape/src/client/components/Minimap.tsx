import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Entity } from '../../entities/Entity';
import THREE from '../../extras/three';
import type { EntityPip, MinimapProps } from '../../types/ui-types';
import type { PlayerLocal } from '../../entities/PlayerLocal';
import { EventType } from '../../types/events';

export function Minimap({ 
  world, 
  width = 200, 
  height = 200, 
  zoom = 50,
  className = '',
  style = {}
}: MinimapProps) {
  const webglCanvasRef = useRef<HTMLCanvasElement>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const [entityPips, setEntityPips] = useState<EntityPip[]>([])
  
  // Minimap zoom state (orthographic half-extent in world units)
  const [extent, setExtent] = useState<number>(zoom)
  const MIN_EXTENT = 20
  const MAX_EXTENT = 200
  const STEP_EXTENT = 10

  // Rotation: follow main camera yaw (RS3-like) with North toggle
  const [rotateWithCamera, setRotateWithCamera] = useState<boolean>(true)
  const [yawDeg, setYawDeg] = useState<number>(0)
  // Persistent destination (stays until reached or new click)
  const [lastDestinationWorld, setLastDestinationWorld] = useState<{ x: number; z: number } | null>(null)
  // Run mode UI state
  const [runMode, setRunMode] = useState<boolean>(true)
  // For minimap clicks: keep the pixel where user clicked until arrival
  const [lastMinimapClickScreen, setLastMinimapClickScreen] = useState<{ x: number; y: number } | null>(null)

  // Red click indicator state
  const [clickIndicator, setClickIndicator] = useState<{ x: number; y: number; opacity: number } | null>(null)
  const clickFadeRef = useRef<number | null>(null)

  // Initialize minimap renderer and camera
  useEffect(() => {
    const webglCanvas = webglCanvasRef.current
    const overlayCanvas = overlayCanvasRef.current
    if (!webglCanvas || !overlayCanvas) return

    // Create orthographic camera for overhead view - much higher up
    const camera = new THREE.OrthographicCamera(
      -extent, extent, extent, -extent, 0.1, 2000
    )
    // Orient minimap to match main camera heading on XZ plane
    const initialForward = new THREE.Vector3()
    if (world?.camera) {
      world.camera.getWorldDirection(initialForward)
    } else {
      initialForward.set(0, 0, -1)
    }
    initialForward.y = 0
    if (initialForward.lengthSq() < 0.0001) {
      initialForward.set(0, 0, -1)
    } else {
      initialForward.normalize()
    }
    camera.up.copy(initialForward)
    camera.position.set(0, 500, 0) // Much higher for better overview
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    try {
      // Create renderer
      const renderer = new THREE.WebGLRenderer({ 
        canvas: webglCanvas,
        alpha: true,
        antialias: false
      })
      renderer.setSize(width, height)
      renderer.setClearColor(0x1a1a2e, 0.9) // Dark blue background
      rendererRef.current = renderer
    } catch (error) {
      console.error('[Minimap] Failed to create WebGL renderer:', error)
      // Fall back to 2D canvas rendering only
      rendererRef.current = null
    }

    // Ensure both canvases have the correct backing size
    webglCanvas.width = width
    webglCanvas.height = height
    overlayCanvas.width = width
    overlayCanvas.height = height

    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose()
      }
    }
  }, [width, height, extent])

  // Use the actual world scene instead of creating a separate one
  useEffect(() => {
    if (!world.stage.scene) return
    
    // Use the world's actual scene for minimap rendering
    sceneRef.current = world.stage.scene
    
    // No cleanup needed - we're using the world's scene
  }, [world])

  // Update camera position based on player position
  useEffect(() => {
    let rafId: number | null = null
    const loop = () => {
      const cam = cameraRef.current
      const player = world.entities.player as Entity | undefined
      if (cam && player) {
        // Keep centered on player
        cam.position.x = player.node.position.x
        cam.position.z = player.node.position.z
        cam.lookAt(player.node.position.x, 0, player.node.position.z)

        // Rotate minimap with main camera yaw if enabled
        if (rotateWithCamera && world.camera) {
          const worldCam = world.camera
          const forward = new THREE.Vector3()
          worldCam.getWorldDirection(forward)
          forward.y = 0
          if (forward.lengthSq() > 1e-6) {
            forward.normalize()
            // Compute yaw so that up vector rotates the minimap
            const yaw = Math.atan2(forward.x, -forward.z) // yaw=0 when facing -Z
            const upX = Math.sin(yaw)
            const upZ = -Math.cos(yaw)
            cam.up.set(upX, 0, upZ)
            setYawDeg(THREE.MathUtils.radToDeg(yaw))
          }
        } else {
          cam.up.set(0, 0, -1)
          setYawDeg(0)
        }

        // Do not sync world clicks into minimap dot; minimap dot should stay fixed where clicked

        // Clear destination when reached
        if (lastDestinationWorld) {
          const dx = lastDestinationWorld.x - player.node.position.x
          const dz = lastDestinationWorld.z - player.node.position.z
          if (Math.hypot(dx, dz) < 0.6) {
            setLastDestinationWorld(null)
            setLastMinimapClickScreen(null)
          }
        }
      }
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    return () => { if (rafId) cancelAnimationFrame(rafId) }
  }, [world, rotateWithCamera, lastDestinationWorld, lastMinimapClickScreen])

  // Update camera frustum when extent changes
  useEffect(() => {
    if (!cameraRef.current) return
    const cam = cameraRef.current
    cam.left = -extent
    cam.right = extent
    cam.top = extent
    cam.bottom = -extent
    cam.updateProjectionMatrix()
  }, [extent])

  // Collect entity data for pips (update at a moderate cadence)
  useEffect(() => {
    if (!world.entities) return
    let intervalId: number | null = null
    const update = () => {
      // Sync run mode from PlayerLocal if available
      const pl = world.entities.player as unknown as PlayerLocal | undefined
      if (pl && typeof pl.runMode === 'boolean') {
        setRunMode(pl.runMode)
      }
      const pips: EntityPip[] = []
      const player = world.entities.player as Entity | undefined
      if (player && player.node && player.node.position) {
        pips.push({ id: 'local-player', type: 'player', position: player.node.position, color: '#00ff00' })
      }

      // Add other players using entities system for reliable positions
      if (world.entities && typeof world.entities.getAllPlayers === 'function') {
        const players = world.entities.getAllPlayers()
        players.forEach((otherPlayer) => {
          if (!player || otherPlayer.id !== player.id) {
            const otherEntity = world.entities.get(otherPlayer.id)
            if (otherEntity && otherEntity.node && otherEntity.node.position) {
              pips.push({ id: otherPlayer.id, type: 'player', position: new THREE.Vector3(otherEntity.node.position.x, 0, otherEntity.node.position.z), color: '#0088ff' })
            }
          }
        })
      }

      // Add enemies - check entities or stage entities
      if (world.stage.scene) {
        world.stage.scene.traverse((object) => {
          // Look for mob entities with certain naming patterns
          if (object.name && (
            object.name.includes('Goblin') || 
            object.name.includes('Bandit') || 
            object.name.includes('Barbarian') ||
            object.name.includes('Guard') ||
            object.name.includes('Knight') ||
            object.name.includes('Warrior') ||
            object.name.includes('Ranger')
          )) {
            const worldPos = new THREE.Vector3()
            object.getWorldPosition(worldPos)
            
            pips.push({
              id: object.uuid,
              type: 'enemy',
              position: new THREE.Vector3(worldPos.x, 0, worldPos.z),
              color: '#ff4444' // Red for enemies
            })
          }
          
          // Look for building/structure entities
          if (object.name && (
            object.name.includes('Bank') ||
            object.name.includes('Store') ||
            object.name.includes('Building') ||
            object.name.includes('Structure') ||
            object.name.includes('House') ||
            object.name.includes('Shop')
          )) {
            const worldPos = new THREE.Vector3()
            object.getWorldPosition(worldPos)
            
            pips.push({
              id: object.uuid,
              type: 'building',
              position: new THREE.Vector3(worldPos.x, 0, worldPos.z),
              color: '#ffaa00' // Orange for buildings
            })
          }
        })
      }
      // Add pips for all known entities safely
      if (world.entities) {
        const allEntities = world.entities.getAll()
        allEntities.forEach((entity) => {
          // Skip if no valid position
          const pos = entity?.position
          if (!pos) return

          let color = '#ffffff'
          let type: EntityPip['type'] = 'item'

          switch (entity.type) {
            case 'player':
              // Already handled above; skip to avoid duplicates
              return
            case 'mob':
            case 'enemy':
              color = '#ff4444'
              type = 'enemy'
              break
            case 'building':
            case 'structure':
              color = '#ffaa00'
              type = 'building'
              break
            case 'item':
            case 'loot':
              color = '#ffff44'
              type = 'item'
              break
            default:
              // Treat unknown as items for now
              color = '#cccccc'
              type = 'item'
          }

          pips.push({
            id: entity.id,
            type,
            position: new THREE.Vector3(pos.x, 0, pos.z),
            color
          })
        })
      }

      setEntityPips(pips)
    }
    update()
    intervalId = window.setInterval(update, 200)
    return () => { if (intervalId) clearInterval(intervalId) }
  }, [world])

  // Render pips on canvas
  useEffect(() => {
    const overlayCanvas = overlayCanvasRef.current
    if (!overlayCanvas) return

    let rafId: number | null = null
    const render = () => {
      // Try WebGL rendering first if available
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        try {
          rendererRef.current.render(sceneRef.current, cameraRef.current)
        } catch (error) {
          console.warn('[Minimap] WebGL render failed:', error)
        }
      }
      
      // Always draw 2D pips on overlay canvas
      const ctx = overlayCanvas.getContext('2d')
      if (ctx) {
        // Clear the overlay each frame
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height)
        // If no WebGL renderer, fill background on overlay
        if (!rendererRef.current) {
          ctx.fillStyle = '#1a1a2e'
          ctx.fillRect(0, 0, overlayCanvas.width, overlayCanvas.height)
        }
        
        // Draw entity pips
        entityPips.forEach(pip => {
          // Convert world position to screen position
          if (cameraRef.current) {
            const vector = pip.position.clone()
            vector.project(cameraRef.current)
            
            const x = (vector.x * 0.5 + 0.5) * width
            const y = (vector.y * -0.5 + 0.5) * height
            
            // Only draw if within bounds
            if (x >= 0 && x <= width && y >= 0 && y <= height) {
              // Set pip properties based on type
              let radius = 3
              let borderColor = '#ffffff'
              let borderWidth = 1
              
              switch (pip.type) {
                case 'player':
                  // RS3-style: simple dot for player, no arrow
                  radius = 4
                  borderWidth = 1
                  break
                case 'enemy':
                  radius = 3
                  borderColor = '#ffffff'
                  borderWidth = 1
                  break
                case 'building':
                  radius = 4
                  borderColor = '#000000'
                  borderWidth = 2
                  break
                case 'item':
                  radius = 2
                  borderColor = '#ffffff'
                  borderWidth = 1
                  break
              }
              
              // Draw pip
              ctx.fillStyle = pip.color
              ctx.beginPath()
              
              // Draw different shapes for different types
              if (pip.type === 'building') {
                // Square for buildings
                ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2)
                ctx.strokeStyle = borderColor
                ctx.lineWidth = borderWidth
                ctx.strokeRect(x - radius, y - radius, radius * 2, radius * 2)
              } else {
                // Circle for everything else
                ctx.arc(x, y, radius, 0, 2 * Math.PI)
                ctx.fill()
                
                // Add border for better visibility
                ctx.strokeStyle = borderColor
                ctx.lineWidth = borderWidth
                ctx.stroke()
              }
            }
          }
        })

        // Draw red click indicator, fading out
        if (clickIndicator && clickIndicator.opacity > 0) {
          ctx.save()
          ctx.globalAlpha = Math.max(0, Math.min(1, clickIndicator.opacity))
          ctx.fillStyle = '#ff0000'
          ctx.beginPath()
          ctx.arc(clickIndicator.x, clickIndicator.y, 4, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }

        // Draw destination like world clicks: project world target to minimap
        try {
          const lastTarget = (typeof window !== 'undefined' ? (window as any).__lastRaycastTarget : null)
          const target = lastTarget && Number.isFinite(lastTarget.x) && Number.isFinite(lastTarget.z)
            ? { x: lastTarget.x as number, z: lastTarget.z as number }
            : (lastDestinationWorld ? { x: lastDestinationWorld.x, z: lastDestinationWorld.z } : null)
          if (target && cameraRef.current) {
            const v = new THREE.Vector3(target.x, 0, target.z)
            v.project(cameraRef.current)
            const sx = (v.x * 0.5 + 0.5) * width
            const sy = (v.y * -0.5 + 0.5) * height
            ctx.save()
            ctx.globalAlpha = 1
            ctx.fillStyle = '#ff3333'
            ctx.beginPath()
            ctx.arc(sx, sy, 3, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
          }
        } catch {}
      }
      rafId = requestAnimationFrame(render)
    }
    rafId = requestAnimationFrame(render)
    return () => { if (rafId) cancelAnimationFrame(rafId) }
  }, [entityPips, width, height, clickIndicator, world, lastDestinationWorld, lastMinimapClickScreen])

  // Convert a click in the minimap to a world XZ position
  const screenToWorldXZ = useCallback((clientX: number, clientY: number): { x: number; z: number } | null => {
    const cam = cameraRef.current
    const canvas = overlayCanvasRef.current || webglCanvasRef.current
    if (!cam || !canvas) return null

    const rect = canvas.getBoundingClientRect()
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1
    const v = new THREE.Vector3(ndcX, ndcY, 0)
    v.unproject(cam)
    // For top-down ortho, y is constant; grab x/z
    return { x: v.x, z: v.z }
  }, [])

  // Helper: project world XZ to overlay pixel using current camera
  const projectWorldToOverlay = (x: number, z: number): { x: number; y: number } | null => {
    const cam = cameraRef.current
    if (!cam) return null
    const v = new THREE.Vector3(x, 0, z)
    v.project(cam)
    return { x: (v.x * 0.5 + 0.5) * width, y: (v.y * -0.5 + 0.5) * height }
  }

  // Clamp to same max travel distance as InteractionSystem (currently 100 units)
  const MAX_TRAVEL_DISTANCE = 100

  // Shared click handler core
  const handleMinimapClick = useCallback((clientX: number, clientY: number) => {
    const worldPos = screenToWorldXZ(clientX, clientY)
    if (!worldPos) return

    const player = world.entities.player as unknown as PlayerLocal | undefined
    if (!player || !player.position) return
    const dx = worldPos.x - player.position.x
    const dz = worldPos.z - player.position.z
    const dist = Math.hypot(dx, dz)
    let targetX = worldPos.x
    let targetZ = worldPos.z
    if (dist > MAX_TRAVEL_DISTANCE) {
      const scale = MAX_TRAVEL_DISTANCE / dist
      targetX = player.position.x + dx * scale
      targetZ = player.position.z + dz * scale
    }

    const terrainSystem = (world as any).getSystem?.('terrain') as { getHeightAt?: (x: number, z: number) => number } | undefined
    let targetY = 0
    if (terrainSystem?.getHeightAt) {
      const h = terrainSystem.getHeightAt(targetX, targetZ)
      targetY = (Number.isFinite(h) ? h : 0) + 0.1
    }

    if (typeof (player as PlayerLocal).setClickMoveTarget === 'function') {
      ;(player as PlayerLocal).setClickMoveTarget({ x: targetX, y: targetY, z: targetZ })
    }

    // Persist destination dot until arrival (no auto-fade)
    setLastDestinationWorld({ x: targetX, z: targetZ })
    // Expose same diagnostic target used by world clicks so minimap renders dot identically
    if (typeof window !== 'undefined') {
      (window as any).__lastRaycastTarget = { x: targetX, y: targetY, z: targetZ, method: 'minimap' }
    }
  }, [screenToWorldXZ, world])

  const onMinimapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    handleMinimapClick(e.clientX, e.clientY)
  }, [handleMinimapClick])

  const onOverlayClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    handleMinimapClick(e.clientX, e.clientY)
  }, [handleMinimapClick])

  const onMinimapWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const sign = Math.sign(e.deltaY)
    if (sign === 0) return
    // Notched steps
    const steps = Math.max(1, Math.min(5, Math.round(Math.abs(e.deltaY) / 100)))
    const next = THREE.MathUtils.clamp(extent + sign * steps * STEP_EXTENT, MIN_EXTENT, MAX_EXTENT)
    setExtent(next)
  }, [extent])

  const onOverlayWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const sign = Math.sign(e.deltaY)
    if (sign === 0) return
    const steps = Math.max(1, Math.min(5, Math.round(Math.abs(e.deltaY) / 100)))
    const next = THREE.MathUtils.clamp(extent + sign * steps * STEP_EXTENT, MIN_EXTENT, MAX_EXTENT)
    setExtent(next)
  }, [extent])

  const containerStyle: React.CSSProperties = {
    width: width,
    height: height,
    border: '2px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '8px',
    overflow: 'hidden',
    background: 'rgba(0, 0, 0, 0.8)',
    position: 'relative',
    ...style
  }

  return (
    <div
      className={`minimap ${className}`}
      style={containerStyle}
      onWheel={onMinimapWheel}
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {/* WebGL canvas */}
      <canvas
        ref={webglCanvasRef}
        width={width}
        height={height}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'block',
          width: '100%',
          height: '100%',
          zIndex: 0
        }}
      />
      {/* 2D overlay for pips */}
      <canvas
        ref={overlayCanvasRef}
        width={width}
        height={height}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'block',
          width: '100%',
          height: '100%',
          // Capture pointer events so clicks/wheel don't hit the 3D canvas behind
          pointerEvents: 'auto',
          cursor: 'crosshair',
          zIndex: 1
        }}
        onClick={onOverlayClick}
        onWheel={onOverlayWheel}
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
      />
      {/* Compass control (RS3-like): full compass rotates with camera yaw; click recenters facing North */}
      <div
        title={'Click to face North'}
        onClick={(e) => {
          e.preventDefault(); e.stopPropagation();
          const cam = cameraRef.current
          if (cam) { cam.up.set(0, 0, -1) }
          // Reorient main camera to face North (RS3-style) using camera system directly
          try {
            const camSys = (world as any).getSystem?.('client-camera-system') || (world as any)['client-camera-system']
            if (camSys && typeof camSys.resetCamera === 'function') { camSys.resetCamera() } else { (world as any).emit?.(EventType.CAMERA_RESET) }
          } catch {}
        }}
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onWheel={(e) => { e.preventDefault(); e.stopPropagation(); }}
        style={{
          position: 'absolute',
          top: 6,
          left: 6,
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.6)',
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 10,
          pointerEvents: 'auto'
        }}
      >
        <div style={{
          position: 'relative',
          width: 28,
          height: 28,
          transform: `rotate(${yawDeg}deg)`
        }}>
          {/* Rotating ring */}
          <div style={{
            position: 'absolute', left: 0, top: 0, right: 0, bottom: 0,
            borderRadius: '50%', border: '1px solid rgba(255,255,255,0.5)'
          }} />
          {/* N marker at top of compass (rotates with ring) */}
          <div style={{
            position: 'absolute', left: '50%', top: 3, transform: 'translateX(-50%)',
            fontSize: 11, color: '#ff4444', fontWeight: 600, textShadow: '0 1px 1px rgba(0,0,0,0.8)'
          }}>N</div>
          {/* S/E/W faint labels */}
          <div style={{ position: 'absolute', left: '50%', bottom: 3, transform: 'translateX(-50%)', fontSize: 9, color: 'rgba(255,255,255,0.7)' }}>S</div>
          <div style={{ position: 'absolute', top: '50%', left: 3, transform: 'translateY(-50%)', fontSize: 9, color: 'rgba(255,255,255,0.7)' }}>W</div>
          <div style={{ position: 'absolute', top: '50%', right: 3, transform: 'translateY(-50%)', fontSize: 9, color: 'rgba(255,255,255,0.7)' }}>E</div>
        </div>
      </div>
      {/* Run toggle (RS3-like) */}
      <div
        title={runMode ? 'Running (click to walk)' : 'Walking (click to run)'}
        onClick={(e) => {
          e.preventDefault(); e.stopPropagation();
          const pl = ((world as any).getPlayer?.() || (world as any).entities?.player) as PlayerLocal | undefined
          if (!pl) return
          if (typeof pl.toggleRunMode === 'function') {
            pl.toggleRunMode()
          } else {
            ;(pl as any).runMode = !(pl as any).runMode
          }
          setRunMode((pl as any).runMode === true)
        }}
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}
        onWheel={(e) => { e.preventDefault(); e.stopPropagation() }}
        style={{
        position: 'absolute',
          top: 6,
          right: 6,
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.6)',
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          fontSize: 12,
          lineHeight: '14px',
          cursor: 'pointer',
          zIndex: 10,
          pointerEvents: 'auto',
          userSelect: 'none'
        }}
      >
        {/* Circular stamina bar */}
        <svg width={40} height={40} style={{ display: 'block', pointerEvents: 'none' }}>
          <circle cx={20} cy={20} r={16} stroke="rgba(255,255,255,0.3)" strokeWidth={2} fill="none" />
          {
            (() => {
              const pl = world.entities.player as unknown as PlayerLocal | undefined
              const energy = pl && typeof pl.stamina === 'number' ? pl.stamina : (runMode ? 100 : 100)
              const pct = Math.max(0, Math.min(100, energy)) / 100
              const radius = 16
              const circumference = 2 * Math.PI * radius
              const dash = pct * circumference
              const gap = circumference - dash
              return (
                <circle cx={20} cy={20} r={radius} stroke={runMode ? '#00ff88' : '#ffa500'} strokeWidth={3}
                  fill="none" strokeDasharray={`${dash} ${gap}`} transform="rotate(-90 20 20)" />
              )
            })()
          }
          {
            (() => {
              const pl = world.entities.player as unknown as PlayerLocal | undefined
              const energy = pl && typeof pl.stamina === 'number' ? Math.round(pl.stamina) : 100
              return <text x={20} y={23} textAnchor="middle" fontSize={12} fill="#fff">{`${energy}%`}</text>
            })()
          }
        </svg>
      </div>
      {/* Removed label text */}
    </div>
  )
}