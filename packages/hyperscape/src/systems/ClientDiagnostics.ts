import { System } from './System'
import type { World } from '../World'
import * as THREE from 'three'

/**
 * ClientDiagnostics - Real-time diagnostics for what's actually happening in the client
 * Reports on avatar visibility, position, scene graph, etc.
 */
export class ClientDiagnostics extends System {
  private lastReportTime: number = 0
  private reportInterval: number = 2000 // Report every 2 seconds
  private player: any = null
  
  override start(): void {
    console.log('[ClientDiagnostics] 🔍 Starting client diagnostics system')
    
    // Start diagnostics after a delay
    setTimeout(() => {
      this.findPlayer()
    }, 2000)
  }
  
  private findPlayer(): void {
    // Look for local player
    const entities = this.world.entities as any
    if (entities.items && entities.items instanceof Map) {
      for (const [_id, entity] of entities.items) {
        if ((entity as any).isLocal && (entity as any).isPlayer) {
          this.player = entity
          console.log('[ClientDiagnostics] Found local player:', this.player.id)
          this.runDiagnostics()
          return
        }
      }
    }
    
    // Try again
    setTimeout(() => this.findPlayer(), 1000)
  }
  
  private runDiagnostics(): void {
    if (!this.player) return
    
    console.log('[ClientDiagnostics] ========== DIAGNOSTIC REPORT ==========')
    
    // 1. Player position
    console.log(`[ClientDiagnostics] Player position: (${this.player.position.x.toFixed(2)}, ${this.player.position.y.toFixed(2)}, ${this.player.position.z.toFixed(2)})`)
    
    // 2. Base status
    const base = this.player.base
    if (base) {
      console.log(`[ClientDiagnostics] Base exists: YES`)
      console.log(`[ClientDiagnostics] Base position: (${base.position.x.toFixed(2)}, ${base.position.y.toFixed(2)}, ${base.position.z.toFixed(2)})`)
      console.log(`[ClientDiagnostics] Base visible: ${base.visible}`)
      console.log(`[ClientDiagnostics] Base children count: ${base.children ? base.children.length : 0}`)
      
      // Check if base is in scene
      let parent = base.parent
      let depth = 0
      let inScene = false
      while (parent && depth < 10) {
        if (parent === this.world.stage?.scene) {
          inScene = true
          break
        }
        parent = parent.parent
        depth++
      }
      console.log(`[ClientDiagnostics] Base in scene: ${inScene ? 'YES at depth ' + depth : 'NO'}`)
    } else {
      console.log('[ClientDiagnostics] Base exists: NO ❌')
    }
    
    // 3. Avatar status
    const avatar = this.player._avatar || this.player.avatar
    if (avatar) {
      console.log('[ClientDiagnostics] Avatar exists: YES')
      console.log(`[ClientDiagnostics] Avatar type: ${avatar.constructor?.name || typeof avatar}`)
      
      if (avatar.position) {
        console.log(`[ClientDiagnostics] Avatar position: (${avatar.position.x.toFixed(2)}, ${avatar.position.y.toFixed(2)}, ${avatar.position.z.toFixed(2)})`)
      }
      
      if ('visible' in avatar) {
        console.log(`[ClientDiagnostics] Avatar visible: ${avatar.visible}`)
      }
      
      // Check avatar parent
      if (avatar.parent) {
        console.log(`[ClientDiagnostics] Avatar parent: ${avatar.parent === base ? 'base' : avatar.parent.name || 'unknown'}`)
      } else {
        console.log('[ClientDiagnostics] Avatar parent: NONE ❌')
      }
      
      // Check if avatar is in scene
      let parent = avatar.parent
      let depth = 0
      let inScene = false
      while (parent && depth < 10) {
        if (parent === this.world.stage?.scene) {
          inScene = true
          break
        }
        parent = parent.parent
        depth++
      }
      console.log(`[ClientDiagnostics] Avatar in scene: ${inScene ? 'YES at depth ' + depth : 'NO ❌'}`)
      
      // Check for VRM components
      if (avatar.vrm) {
        console.log('[ClientDiagnostics] Avatar has VRM data: YES')
      }
      
      // Check children (meshes)
      if (avatar.children) {
        console.log(`[ClientDiagnostics] Avatar children: ${avatar.children.length}`)
        let meshCount = 0
        avatar.traverse((child: any) => {
          if (child.isMesh) meshCount++
        })
        console.log(`[ClientDiagnostics] Avatar mesh count: ${meshCount}`)
      }
    } else {
      console.log('[ClientDiagnostics] Avatar exists: NO ❌')
      console.log('[ClientDiagnostics] Avatar URL:', this.player.avatarUrl || 'not set')
    }
    
    // 4. Physics capsule
    const capsule = this.player.capsule
    if (capsule) {
      console.log('[ClientDiagnostics] Physics capsule: EXISTS')
      if (capsule.getGlobalPose) {
        const pose = capsule.getGlobalPose()
        if (pose) {
          console.log(`[ClientDiagnostics] Capsule position: (${pose.p.x.toFixed(2)}, ${pose.p.y.toFixed(2)}, ${pose.p.z.toFixed(2)})`)
        }
      }
    } else {
      console.log('[ClientDiagnostics] Physics capsule: NOT CREATED')
    }
    
    // 5. Movement state
    console.log(`[ClientDiagnostics] Moving: ${this.player.moving}`)
    console.log(`[ClientDiagnostics] Click target: ${this.player.clickMoveTarget ? `(${this.player.clickMoveTarget.x.toFixed(2)}, ${this.player.clickMoveTarget.z.toFixed(2)})` : 'none'}`)
    
    // 6. Camera
    const camera = this.world.camera
    if (camera) {
      console.log(`[ClientDiagnostics] Camera position: (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`)
    }
    
    // 7. Scene stats
    if (this.world.stage?.scene) {
      let totalObjects = 0
      let totalMeshes = 0
      let totalVisible = 0
      
      this.world.stage.scene.traverse((obj: any) => {
        totalObjects++
        if (obj.isMesh) {
          totalMeshes++
          if (obj.visible) totalVisible++
        }
      })
      
      console.log(`[ClientDiagnostics] Scene objects: ${totalObjects}, Meshes: ${totalMeshes}, Visible: ${totalVisible}`)
    }
    
    console.log('[ClientDiagnostics] ========================================')
    
    // Schedule next report
    setTimeout(() => this.runDiagnostics(), 5000)
  }
  
  override update(_delta: number): void {
    // Diagnostics run on timer, not every frame
  }
}
