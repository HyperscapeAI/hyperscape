import { System } from './System'
import { Logger } from '../utils/Logger'
import * as THREE from 'three'
import type { Entity } from '../entities/Entity'
import { createNodeClientWorld } from '../createNodeClientWorld'
import type { World as ClientWorld } from '../World'

interface BotBehavior {
  name: string
  weight: number // Probability weight
  canExecute: () => boolean
  execute: () => void
  cooldown: number // Milliseconds before can execute again
  lastExecuted: number
}

interface BotStats {
  distanceTraveled: number
  entitiesEncountered: number
  actionsPerformed: number
  startTime: number
  errors: number
}

/**
 * ServerBot - Autonomous bot that moves around and tests interactions
 * Simulates a real player to stress-test server systems
 */
export class ServerBot extends System {
  private bot: Entity | null = null
  private behaviors: BotBehavior[] = []
  private currentBehavior: BotBehavior | null = null
  private isActive: boolean = false
  private stats: BotStats = {
    distanceTraveled: 0,
    entitiesEncountered: 0,
    actionsPerformed: 0,
    startTime: 0,
    errors: 0
  }
  private lastPosition: THREE.Vector3 = new THREE.Vector3()
  private moveTarget: THREE.Vector3 | null = null
  private updateInterval: number = 100 // Update every 100ms
  private lastUpdate: number = 0
  private dwellUntil: number = 0
  private clientWorld: ClientWorld | null = null
  private _tempVec3 = new THREE.Vector3();
  
  override start(): void {
    Logger.info('[ServerBot] 🤖 Initializing server bot system...')
    
    // Start bot shortly after server start to make tests deterministic
    setTimeout(() => {
      this.spawnBot()
    }, 2000)
  }
  
  private async spawnBot(): Promise<void> {
    Logger.info('[ServerBot] Spawning autonomous bot (node client)...')
    try {
      const port = process.env.PORT || '4444'
      const wsUrl = `ws://127.0.0.1:${port}/ws`
      const clientWorld = createNodeClientWorld()
      await clientWorld.init({ wsUrl, name: '🤖 Server Bot' })
      this.clientWorld = clientWorld
      
      // Get reference to the bot's player entity after connection
      // Note: The player entity is created after the snapshot is received
      await new Promise(resolve => setTimeout(resolve, 500)) // Wait for entity creation
      this.bot = this.clientWorld.entities.player as Entity | null
      
      this.stats.startTime = Date.now()
      // Initialize behaviors
      this.initializeBehaviors()
      this.isActive = true
      Logger.info('[ServerBot] Client connected, starting behavior loop')
      // Kick off an immediate movement so observers can see displacement quickly
      try {
        this.sprintBehavior()
      } catch {}
      this.behaviorLoop()
    } catch (error) {
      Logger.error('[ServerBot] Failed to start node client bot:', error instanceof Error ? error : new Error(String(error)))
      this.stats.errors++
    }
  }
  
  private initializeBehaviors(): void {
    this.behaviors = [
      {
        name: 'Wander',
        weight: 5,
        canExecute: () => Date.now() >= this.dwellUntil,
        execute: () => this.wanderBehavior(),
        cooldown: 2000,
        lastExecuted: 0
      },
      {
        name: 'Explore',
        weight: 3,
        canExecute: () => !this.moveTarget && Date.now() >= this.dwellUntil,
        execute: () => this.exploreBehavior(),
        cooldown: 5000,
        lastExecuted: 0
      },
      {
        name: 'Sprint',
        weight: 2,
        canExecute: () => Math.random() < 0.3 && Date.now() >= this.dwellUntil,
        execute: () => this.sprintBehavior(),
        cooldown: 10000,
        lastExecuted: 0
      },
      {
        name: 'Interact',
        weight: 4,
        canExecute: () => this.hasNearbyEntities() && Date.now() >= this.dwellUntil,
        execute: () => this.interactBehavior(),
        cooldown: 3000,
        lastExecuted: 0
      },
      {
        name: 'Idle',
        weight: 1,
        canExecute: () => true,
        execute: () => this.idleBehavior(),
        cooldown: 1000,
        lastExecuted: 0
      },
      {
        name: 'Jump',
        weight: 2,
        canExecute: () => Math.random() < 0.2 && Date.now() >= this.dwellUntil,
        execute: () => this.jumpBehavior(),
        cooldown: 2000,
        lastExecuted: 0
      },
      {
        name: 'Circle',
        weight: 1,
        canExecute: () => Math.random() < 0.1 && Date.now() >= this.dwellUntil,
        execute: () => this.circleBehavior(),
        cooldown: 8000,
        lastExecuted: 0
      }
    ]
  }
  
  private behaviorLoop(): void {
    if (!this.isActive || !this.bot) {
      return
    }
    
    // Select and execute behavior
    const now = Date.now()
    const availableBehaviors = this.behaviors.filter(b => 
      b.canExecute() && (now - b.lastExecuted) > b.cooldown
    )
    
    if (availableBehaviors.length > 0) {
      // Weighted random selection
      const totalWeight = availableBehaviors.reduce((sum, b) => sum + b.weight, 0)
      let random = Math.random() * totalWeight
      
      for (const behavior of availableBehaviors) {
        random -= behavior.weight
        if (random <= 0) {
          this.currentBehavior = behavior
          behavior.lastExecuted = now
          behavior.execute()
          this.stats.actionsPerformed++
          Logger.info(`[ServerBot] Executing behavior: ${behavior.name}`)
          break
        }
      }
    }
    
    // Schedule next behavior
    setTimeout(() => this.behaviorLoop(), 3000 + Math.random() * 2000)
  }
  
  // Behavior implementations
  private wanderBehavior(): void {
    const angle = Math.random() * Math.PI * 2
    const distance = 5 + Math.random() * 10
    const origin = this.getClientPlayerPosition()
    const targetX = origin.x + Math.cos(angle) * distance
    const targetZ = origin.z + Math.sin(angle) * distance
    const target = this._tempVec3.set(targetX, 0, targetZ)
    this.sendMoveRequest(target, false)
    Logger.info(`[ServerBot] Wandering to (${target.x.toFixed(1)}, ${target.z.toFixed(1)})`)
  }
  
  private exploreBehavior(): void {
    // Move to a distant location
    const origin = this.getClientPlayerPosition()
    const targetX = origin.x + (Math.random() * 100 - 50)
    const targetZ = origin.z + (Math.random() * 100 - 50)
    const target = this._tempVec3.set(targetX, 0, targetZ)
    this.sendMoveRequest(target, false)
    Logger.info(`[ServerBot] Exploring to (${target.x.toFixed(1)}, ${target.z.toFixed(1)})`)
  }
  
  private sprintBehavior(): void {
    // Move quickly in a direction
    const angle = Math.random() * Math.PI * 2
    const distance = 20 + Math.random() * 20
    const origin = this.getClientPlayerPosition()
    const targetX = origin.x + Math.cos(angle) * distance
    const targetZ = origin.z + Math.sin(angle) * distance
    const target = this._tempVec3.set(targetX, 0, targetZ)
    this.sendMoveRequest(target, true)
    Logger.info(`[ServerBot] Sprinting to (${target.x.toFixed(1)}, ${target.z.toFixed(1)})`)
  }
  
  private interactBehavior(): void {
    // For now, just wander towards a nearby random offset
    const origin = this.getClientPlayerPosition()
    const target = this._tempVec3.copy(origin).add(new THREE.Vector3((Math.random()-0.5)*8, 0, (Math.random()-0.5)*8))
    this.sendMoveRequest(target, false)
  }
  
  private idleBehavior(): void {
    Logger.info('[ServerBot] Idling...')
    this.moveTarget = null
  }
  
  private jumpBehavior(): void {
    Logger.info('[ServerBot] Jumping!')
    // In a real implementation, this would trigger a jump animation/physics
    
    // Continue current movement
    if (!this.moveTarget) {
      this.wanderBehavior()
    }
  }
  
  private circleBehavior(): void {
    // Move in a circle pattern around current position
    const radius = 10
    const steps = 8
    const angle = (Math.PI * 2) / steps
    const origin = this.getClientPlayerPosition()
    const currentAngle = Math.atan2(origin.z, origin.x)
    const nextAngle = currentAngle + angle
    const targetX = origin.x + Math.cos(nextAngle) * radius
    const targetZ = origin.z + Math.sin(nextAngle) * radius
    const target = this._tempVec3.set(targetX, 0, targetZ)
    this.sendMoveRequest(target, false)
    Logger.info(`[ServerBot] Moving in circle to (${target.x.toFixed(1)}, ${target.z.toFixed(1)})`)
  }
  
  // Helper methods
  private getClientPlayerPosition(): THREE.Vector3 {
    if (!this.clientWorld?.entities?.player) {
      return this._tempVec3.set(0, 0, 0)
    }
    const player = this.clientWorld.entities.player
    if ('node' in player && player.node && player.node.position) {
      const position = player.node.position.clone()
      
      // VALIDATION: Check for invalid Y positions that indicate encoding errors
      if (position.y < -20 && position.y > -22) {
        // This specific range (-20 to -22) is a signature of the bit encoding bug
        Logger.error('[ServerBot] CRITICAL: Detected corrupted Y position!');
        Logger.error(`  Current Y: ${position.y}`);
        Logger.error('  This indicates a network packet encoding error');
        Logger.error('  Expected positive Y value but received negative');
        this.stats.errors++;
        
        // Throw error to fail fast and alert developers
        throw new Error(`ServerBot detected corrupted position Y=${position.y} - likely packet encoding bug!`);
      }
      
      // Additional validation for reasonable position ranges
      if (position.y < -100 || position.y > 500) {
        Logger.warn(`[ServerBot] Unusual Y position detected: ${position.y}`);
        this.stats.errors++;
      }
      
      return position
    }
    return this._tempVec3.set(0, 0, 0)
  }

  private sendMoveRequest(target: THREE.Vector3, sprint: boolean = false): void {
    if (!this.clientWorld) return
    
    // Send move command through the client world's network system
    // Try multiple ways to find the network system
    const network = this.clientWorld.getSystem('network') || 
                   this.clientWorld.getSystem('ClientNetwork') ||
                   this.clientWorld.getSystem('Network') ||
                   (this.clientWorld as { network?: unknown }).network;
                   
    if (!network) {
      Logger.error('[ServerBot] Cannot find network system in client world');
      return;
    }
    
    if (typeof network === 'object' && network !== null && 'send' in network) {
      const net = network as { send?: (method: string, data: unknown) => void }
      if (net.send) {
        // Send the move request
        net.send('moveRequest', {
          target: [target.x, target.y, target.z],
          runMode: sprint
        })
        
        // Also send input packet for compatibility
        net.send('input', {
          type: 'click',
          target: [target.x, target.y, target.z],
          runMode: sprint
        })
        
        Logger.info(`[ServerBot] ✅ Sent move request to (${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)}) sprint=${sprint}`)
      } else {
        Logger.error('[ServerBot] Network system has no send method');
      }
    } else {
      Logger.error('[ServerBot] Network system found but has no send property');
    }
    
    // Store the move target for tracking
    this.moveTarget = target.clone()
    this.stats.actionsPerformed++
  }

  private hasNearbyEntities(): boolean {
    return this.getNearbyEntities().length > 0
  }
  
  private getNearbyEntities(): Entity[] {
    // Not implemented for client-driven bot; could be added via server query
    return []
  }
  
  override update(_delta: number): void {
    if (!this.isActive) return
    
    // Track actual movement
    if (this.bot && this.lastPosition) {
      const currentPos = this.getClientPlayerPosition()
      const distance = this.lastPosition.distanceTo(currentPos)
      if (distance > 0.01) { // Only count significant movement
        this.stats.distanceTraveled += distance
        this.lastPosition.copy(currentPos)
        
        // Log movement occasionally
        if (Math.random() < 0.05) { // 5% chance
          Logger.info(`[ServerBot] Moving - Current pos: (${currentPos.x.toFixed(1)}, ${currentPos.z.toFixed(1)}), Distance traveled: ${this.stats.distanceTraveled.toFixed(1)}m`)
        }
      }
    } else if (this.bot) {
      // Initialize last position
      this.lastPosition = this.getClientPlayerPosition()
    }
    
    // Stats print
    if (Math.random() < 0.001) this.printStats()
  }
  
  private printStats(): void {
    const runtime = (Date.now() - this.stats.startTime) / 1000
    Logger.info('[ServerBot] ============ BOT STATS ============')
    Logger.info(`[ServerBot] Runtime: ${runtime.toFixed(1)}s`)
    Logger.info(`[ServerBot] Distance traveled: ${this.stats.distanceTraveled.toFixed(1)} units`)
    Logger.info(`[ServerBot] Actions performed: ${this.stats.actionsPerformed}`)
    Logger.info(`[ServerBot] Entities encountered: ${this.stats.entitiesEncountered}`)
    Logger.info(`[ServerBot] Errors: ${this.stats.errors}`)
    
    const pos = this.getClientPlayerPosition()
    if (pos) {
      Logger.info(`[ServerBot] Current position: (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})`)
    }
    Logger.info('[ServerBot] ===================================')
  }
  
  private respawnBot(): void {
    Logger.info('[ServerBot] Respawning bot...')
    
    // Clean up client world
    if (this.clientWorld) {
      try { this.clientWorld.destroy() } catch { /* ignore */ }
      this.clientWorld = null
    }
    
    // Reset stats
    this.stats = {
      distanceTraveled: 0,
      entitiesEncountered: 0,
      actionsPerformed: 0,
      startTime: 0,
      errors: 0
    }
    
    // Spawn new bot client
    void this.spawnBot()
  }
  
  override destroy(): void {
    this.isActive = false
    this.bot = null
  }
}
