import { System } from './System'
import { Logger } from '../utils/Logger'
import type { World } from '../World'
import * as THREE from 'three'

/**
 * AvatarFix - Ensures avatars are properly attached to the scene
 * Fixes the issue where Avatar nodes aren't being added to Three.js scene graph
 */
export class AvatarFix extends System {
  private checkInterval: number = 1000 // Check every second
  private lastCheck: number = 0
  
  override start(): void {
    Logger.info('[AvatarFix] Starting avatar attachment fix system')
  }
  
  override update(delta: number): void {
    const now = Date.now()
    if (now - this.lastCheck < this.checkInterval) {
      return
    }
    this.lastCheck = now
    
    // Find local player
    const player = this.world.entities?.player
    if (!player) return
    
    // Check if avatar exists but isn't in scene
    const avatar = (player as any)._avatar || (player as any).avatar
    if (!avatar) return
    
    const base = (player as any).base
    if (!base) return
    
    // Check if avatar is already in scene
    let inScene = false
    if (avatar.parent) {
      let parent = avatar.parent
      let depth = 0
      while (parent && depth < 10) {
        if (parent === this.world.stage?.scene) {
          inScene = true
          break
        }
        parent = parent.parent
        depth++
      }
    }
    
    if (!inScene) {
      Logger.info('[AvatarFix] Avatar not in scene, attempting to fix...')
      
      // If avatar is a Node with an instance, get the Three.js object
      if (avatar.instance) {
        Logger.info('[AvatarFix] Avatar has instance property')
        // If the instance exposes move() we assume it manages its own scene graph
        if (typeof avatar.instance.move === 'function') {
          Logger.info('[AvatarFix] Instance uses move(); cleaning up any frozen avatar under base and skipping reparent')
          // Remove any VRM/Avatar objects that might have been added under base previously
          if (base && Array.isArray(base.children)) {
            const toRemove: THREE.Object3D[] = []
            for (const child of base.children) {
              let looksLikeVRM = false
              if ((child as any).userData && (child as any).userData.vrm) {
                looksLikeVRM = true
              } else if (typeof child.traverse === 'function') {
                child.traverse((o: any) => {
                  if (o?.userData?.vrm) looksLikeVRM = true
                })
              }
              if (looksLikeVRM) {
                toRemove.push(child)
              }
            }
            for (const obj of toRemove) {
              base.remove(obj)
              Logger.info('[AvatarFix] Removed duplicate/frozen avatar object from base')
            }
          }
          return
        }
        
        // The instance might have a root or model property
        const avatarObject = avatar.instance.root || 
                            avatar.instance.model || 
                            avatar.instance.scene ||
                            avatar.instance
        
        if (avatarObject && avatarObject.isObject3D) {
          Logger.info('[AvatarFix] Found Three.js object in avatar instance')
          
          // Remove from any existing parent
          if (avatarObject.parent) {
            avatarObject.parent.remove(avatarObject)
          }
          
          // Do NOT add to base; VRM factory already adds vrm.scene to world.stage.scene
          Logger.info('[AvatarFix] Skipping add to base; instance manages its own scene')
          
          // Make visible
          avatarObject.visible = true
          if (avatarObject.traverse) {
            avatarObject.traverse((child: any) => {
              if (child.isMesh) {
                child.visible = true
                child.frustumCulled = false // Ensure it renders
              }
            })
          }
          
          // Count meshes
          let meshCount = 0;
          if (avatarObject.traverse) {
            avatarObject.traverse((child: any) => {
              if (child.isMesh) {
                meshCount++;
              }
            });
          }
          Logger.info(`[AvatarFix] Avatar has ${meshCount} meshes`);
          
          // Store reference for easier access
          (player as any)._avatarObject = avatarObject
        }
      } else if (avatar.children && avatar.children.length > 0) {
        // Avatar might have Three.js children
        Logger.info('[AvatarFix] Avatar has children, checking...')
        
        for (const child of avatar.children) {
          if (child && child.isObject3D) {
            Logger.info('[AvatarFix] Found Three.js child in avatar')
            
            // Remove from avatar node
            if (child.parent === avatar) {
              avatar.remove(child)
            }
            
            // Add to base
            base.add(child)
            child.visible = true
            
            Logger.info('[AvatarFix] Added avatar child to base')
          }
        }
      } else {
        // Try to find any Three.js objects in the avatar
        Logger.info('[AvatarFix] Searching for Three.js objects in avatar...')
        
        const keys = Object.keys(avatar)
        for (const key of keys) {
          const value = avatar[key]
          if (value && value.isObject3D) {
            Logger.info(`[AvatarFix] Found Three.js object at avatar.${key}`)
            
            // Add to base
            if (value.parent) {
              value.parent.remove(value)
            }
            base.add(value)
            value.visible = true
            
            Logger.info('[AvatarFix] Added found object to base')
            break
          }
        }
      }
      
      // Final check
      const baseChildren = base.children ? base.children.length : 0
      Logger.info(`[AvatarFix] Base now has ${baseChildren} children`)
      
      // Check if any children have meshes
      let totalMeshes = 0
      if (base.children) {
        for (const child of base.children) {
          if (child.traverse) {
            child.traverse((obj: any) => {
              if (obj.isMesh) totalMeshes++
            })
          }
        }
      }
      Logger.info(`[AvatarFix] Total meshes in base: ${totalMeshes}`)
    }
  }
}
