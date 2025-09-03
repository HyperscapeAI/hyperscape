import React, { useEffect, useRef, useState } from 'react';
import { Entity } from '../../entities/Entity';
import THREE from '../../extras/three';
import type { EntityPip, MinimapProps } from '../../types/ui-types';

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

  // Initialize minimap renderer and camera
  useEffect(() => {
    const webglCanvas = webglCanvasRef.current
    const overlayCanvas = overlayCanvasRef.current
    if (!webglCanvas || !overlayCanvas) return

    // Create orthographic camera for overhead view - much higher up
    const camera = new THREE.OrthographicCamera(
      -zoom, zoom, zoom, -zoom, 0.1, 2000
    )
    camera.position.set(0, 500, 0) // Much higher for better overview
    camera.lookAt(0, 0, 0)
    camera.up.set(0, 0, -1) // Z up for top-down view
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
  }, [width, height, zoom])

  // Use the actual world scene instead of creating a separate one
  useEffect(() => {
    if (!world.stage.scene) return
    
    // Use the world's actual scene for minimap rendering
    sceneRef.current = world.stage.scene
    
    // No cleanup needed - we're using the world's scene
  }, [world])

  // Update camera position based on player position
  useEffect(() => {
    if (!world.entities.player || !cameraRef.current) return

    const updateCameraPosition = () => {
      const player = world.entities.player as Entity
      if (cameraRef.current && player) {
        cameraRef.current.position.x = player.node.position.x
        cameraRef.current.position.z = player.node.position.z
        cameraRef.current.lookAt(
          player.node.position.x, 
          0, 
          player.node.position.z
        )
      }
    }

    updateCameraPosition()
    
    // Update every frame
    const intervalId = setInterval(updateCameraPosition, 100)
    
    return () => clearInterval(intervalId)
  }, [world])

  // Collect entity data for pips
  useEffect(() => {
    if (!world.entities) return

    const updateEntityPips = () => {
      const pips: EntityPip[] = []
      
      // Add player pip (guard against undefined during early init)
      const player = world.entities.player as Entity | undefined
      if (player && player.node && player.node.position) {
        pips.push({
          id: 'local-player',
          type: 'player',
          position: player.node.position,
          color: '#00ff00' // Green for local player
        })
      }

      // Add other players using entities system for reliable positions
      if (world.entities && typeof world.entities.getAllPlayers === 'function') {
        const players = world.entities.getAllPlayers()
        players.forEach((otherPlayer) => {
          // Find the actual entity to read its THREE position
          if (!player || otherPlayer.id !== player.id) {
            const otherEntity = world.entities.get(otherPlayer.id)
            if (otherEntity && otherEntity.node && otherEntity.node.position) {
              pips.push({
                id: otherPlayer.id,
                type: 'player',
                position: new THREE.Vector3(otherEntity.node.position.x, 0, otherEntity.node.position.z),
                color: '#0088ff' // Blue for other players
              })
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
      if (world.entities && typeof world.entities.getAll === 'function') {
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

    updateEntityPips()
    const intervalId = setInterval(updateEntityPips, 200)
    
    return () => clearInterval(intervalId)
  }, [world])

  // Render pips on canvas
  useEffect(() => {
    const overlayCanvas = overlayCanvasRef.current
    if (!overlayCanvas) return

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
                  radius = pip.id === 'local-player' ? 5 : 4
                  borderWidth = pip.id === 'local-player' ? 2 : 1
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
      }
    }

    const intervalId = setInterval(render, 100) // ~10 FPS - reduce GPU stalls while maintaining smooth updates
    
    return () => clearInterval(intervalId)
  }, [entityPips, width, height])

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
    <div className={`minimap ${className}`} style={containerStyle}>
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
          height: '100%'
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
          pointerEvents: 'none'
        }}
      />
      <div style={{
        position: 'absolute',
        top: '4px',
        left: '4px',
        fontSize: '10px',
        color: 'rgba(255, 255, 255, 0.8)',
        textShadow: '1px 1px 1px rgba(0, 0, 0, 0.8)',
        pointerEvents: 'none'
      }}>
        Minimap
      </div>
    </div>
  )
}