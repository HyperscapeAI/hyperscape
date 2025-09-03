import { System } from './System'
import { Logger } from '../utils/Logger'
import type { World } from '../World'
import * as THREE from 'three'
import { PlayerEntity } from '../entities/PlayerEntity'
import { PlayerCombatStyle } from '../types/entities'
import type { Entity } from '../entities/Entity'

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
  private bot: PlayerEntity | null = null
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
  
  override start(): void {
    Logger.info('[ServerBot] 🤖 Initializing server bot system...')
    
    // Start bot after delay
    setTimeout(() => {
      this.spawnBot()
    }, 10000)
  }
  
  private spawnBot(): void {
    Logger.info('[ServerBot] Spawning autonomous bot...')
    
    try {
      const botId = 'server-bot-' + Date.now()
      
      // Get random spawn position on terrain
      const xPos = Math.random() * 20 - 10
      const zPos = Math.random() * 20 - 10
      
      // Use TerrainSystem directly like PlayerLocal does
      const terrainSystem = this.world.systems.find(s => s.constructor.name === 'TerrainSystem') as any
      let spawnY = 0
      
      if (terrainSystem && terrainSystem.getHeightAt) {
        const terrainHeight = terrainSystem.getHeightAt(xPos, zPos)
        if (typeof terrainHeight === 'number' && !isNaN(terrainHeight)) {
          spawnY = terrainHeight + 1.8 // Player height offset
          Logger.info(`[ServerBot] Spawning bot on terrain at height: ${spawnY}`)
        } else {
          Logger.warn('[ServerBot] Could not get terrain height, using fallback')
          spawnY = 1.8
        }
      } else {
        Logger.warn('[ServerBot] No terrain system found, using fallback height')
        spawnY = 1.8
      }
      
      Logger.info(`[ServerBot] Spawning bot at (${xPos.toFixed(2)}, ${spawnY.toFixed(2)}, ${zPos.toFixed(2)})`)
      
      const botData = {
        id: botId,
        playerId: botId,
        playerName: '🤖 Server Bot',
        type: 'player',
        name: 'Server Bot',
        owner: botId, // Add owner field for proper entity creation
        level: 10,
        health: 100,
        maxHealth: 100,
        stamina: 100,
        maxStamina: 100,
        combatStyle: PlayerCombatStyle.ATTACK,
        equipment: {},
        inventory: [],
        position: [
          xPos,
          spawnY,
          zPos
        ] as [number, number, number],
        quaternion: [0, 0, 0, 1] as [number, number, number, number],
        skills: {},
        quests: [],
        stats: {
          attack: 10, strength: 10, defence: 10, ranged: 10,
          prayer: 10, magic: 10, runecrafting: 10, hitpoints: 10,
          agility: 10, herblore: 10, thieving: 10, crafting: 10,
          fletching: 10, slayer: 10, hunter: 10, mining: 10,
          smithing: 10, fishing: 10, cooking: 10, firemaking: 10,
          woodcutting: 10, farming: 10, construction: 10
        },
        questPoints: 0,
        totalLevel: 230,
        combatLevel: 30
      }
      
      // Use entities.add with local=true to properly create and broadcast the entity
      this.bot = this.world.entities.add(botData, true) as PlayerEntity
      
      if (!this.bot) {
        throw new Error('Failed to create bot entity')
      }
      
      this.lastPosition.copy(this.bot.position)
      this.stats.startTime = Date.now()
      
      // Initialize behaviors
      this.initializeBehaviors()
      
      this.isActive = true
      Logger.info(`[ServerBot] Bot spawned at (${this.bot.position.x.toFixed(1)}, ${this.bot.position.z.toFixed(1)})`)
      
      // Start behavior loop
      this.behaviorLoop()
      
    } catch (error) {
      Logger.error('[ServerBot] Failed to spawn bot:', error instanceof Error ? error : new Error(String(error)))
      this.stats.errors++
    }
  }
  
  private initializeBehaviors(): void {
    this.behaviors = [
      {
        name: 'Wander',
        weight: 5,
        canExecute: () => true,
        execute: () => this.wanderBehavior(),
        cooldown: 2000,
        lastExecuted: 0
      },
      {
        name: 'Explore',
        weight: 3,
        canExecute: () => !this.moveTarget,
        execute: () => this.exploreBehavior(),
        cooldown: 5000,
        lastExecuted: 0
      },
      {
        name: 'Sprint',
        weight: 2,
        canExecute: () => Math.random() < 0.3,
        execute: () => this.sprintBehavior(),
        cooldown: 10000,
        lastExecuted: 0
      },
      {
        name: 'Interact',
        weight: 4,
        canExecute: () => this.hasNearbyEntities(),
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
        canExecute: () => Math.random() < 0.2,
        execute: () => this.jumpBehavior(),
        cooldown: 2000,
        lastExecuted: 0
      },
      {
        name: 'Circle',
        weight: 1,
        canExecute: () => Math.random() < 0.1,
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
    
    const targetX = this.bot!.position.x + Math.cos(angle) * distance
    const targetZ = this.bot!.position.z + Math.sin(angle) * distance
    
    // Get proper ground height using TerrainSystem directly
    const terrainSystem = this.world.systems.find(s => s.constructor.name === 'TerrainSystem') as any
    let targetY = this.bot!.position.y
    if (terrainSystem && terrainSystem.getHeightAt) {
      const height = terrainSystem.getHeightAt(targetX, targetZ)
      if (typeof height === 'number' && !isNaN(height)) {
        targetY = height + 1.8
      }
    }
    
    this.moveTarget = new THREE.Vector3(targetX, targetY, targetZ)
    Logger.info(`[ServerBot] Wandering to (${this.moveTarget.x.toFixed(1)}, ${this.moveTarget.y.toFixed(1)}, ${this.moveTarget.z.toFixed(1)})`)
  }
  
  private exploreBehavior(): void {
    // Move to a distant location
    const targetX = Math.random() * 100 - 50
    const targetZ = Math.random() * 100 - 50
    
    // Get proper ground height using TerrainSystem directly
    const terrainSystem = this.world.systems.find(s => s.constructor.name === 'TerrainSystem') as any
    let targetY = 1.8
    if (terrainSystem && terrainSystem.getHeightAt) {
      const height = terrainSystem.getHeightAt(targetX, targetZ)
      if (typeof height === 'number' && !isNaN(height)) {
        targetY = height + 1.8
      }
    }
    
    this.moveTarget = new THREE.Vector3(targetX, targetY, targetZ)
    Logger.info(`[ServerBot] Exploring to (${this.moveTarget.x.toFixed(1)}, ${this.moveTarget.y.toFixed(1)}, ${this.moveTarget.z.toFixed(1)})`)
  }
  
  private sprintBehavior(): void {
    // Move quickly in a direction
    const angle = Math.random() * Math.PI * 2
    const distance = 20 + Math.random() * 20
    
    const targetX = this.bot!.position.x + Math.cos(angle) * distance
    const targetZ = this.bot!.position.z + Math.sin(angle) * distance
    
    // Get proper ground height using TerrainSystem directly
    const terrainSystem = this.world.systems.find(s => s.constructor.name === 'TerrainSystem') as any
    let targetY = this.bot!.position.y
    if (terrainSystem && terrainSystem.getHeightAt) {
      const height = terrainSystem.getHeightAt(targetX, targetZ)
      if (typeof height === 'number' && !isNaN(height)) {
        targetY = height + 1.8
      }
    }
    
    this.moveTarget = new THREE.Vector3(targetX, targetY, targetZ)
    Logger.info(`[ServerBot] Sprinting to (${this.moveTarget.x.toFixed(1)}, ${this.moveTarget.y.toFixed(1)}, ${this.moveTarget.z.toFixed(1)})`)
  }
  
  private interactBehavior(): void {
    const nearbyEntities = this.getNearbyEntities()
    if (nearbyEntities.length > 0) {
      const target = nearbyEntities[0]
      Logger.info(`[ServerBot] Interacting with entity: ${target.name} (${target.type})`)
      this.stats.entitiesEncountered++
      
      // Move towards the entity
      this.moveTarget = target.position.clone()
    }
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
    // Move in a circle pattern
    const radius = 10
    const steps = 8
    const angle = (Math.PI * 2) / steps
    const currentAngle = Math.atan2(
      this.bot!.position.z,
      this.bot!.position.x
    )
    const nextAngle = currentAngle + angle
    
    const targetX = Math.cos(nextAngle) * radius
    const targetZ = Math.sin(nextAngle) * radius
    
    // Get proper ground height using TerrainSystem directly
    const terrainSystem = this.world.systems.find(s => s.constructor.name === 'TerrainSystem') as any
    let targetY = 1.8
    if (terrainSystem && terrainSystem.getHeightAt) {
      const height = terrainSystem.getHeightAt(targetX, targetZ)
      if (typeof height === 'number' && !isNaN(height)) {
        targetY = height + 1.8
      }
    }
    
    this.moveTarget = new THREE.Vector3(targetX, targetY, targetZ)
    Logger.info(`[ServerBot] Moving in circle to (${this.moveTarget.x.toFixed(1)}, ${this.moveTarget.y.toFixed(1)}, ${this.moveTarget.z.toFixed(1)})`)
  }
  
  // Helper methods
  private hasNearbyEntities(): boolean {
    return this.getNearbyEntities().length > 0
  }
  
  private getNearbyEntities(): Entity[] {
    const nearbyEntities: Entity[] = []
    const maxDistance = 15
    
    const entities = this.world.entities as any
    if (entities.items && entities.items instanceof Map) {
      for (const [_id, entity] of entities.items) {
        if (entity !== this.bot && entity.position) {
          const distance = this.bot!.position.distanceTo(entity.position)
          if (distance < maxDistance) {
            nearbyEntities.push(entity)
          }
        }
      }
    }
    
    return nearbyEntities
  }
  
  override update(delta: number): void {
    if (!this.isActive || !this.bot) return
    
    const now = Date.now()
    if (now - this.lastUpdate < this.updateInterval) {
      return
    }
    this.lastUpdate = now
    
    // Update movement
    if (this.moveTarget) {
      const distance = this.bot.position.distanceTo(this.moveTarget)
      
      if (distance > 0.5) {
        // Move towards target
        const direction = new THREE.Vector3()
          .subVectors(this.moveTarget, this.bot.position)
        direction.y = 0
        direction.normalize()
        
        const speed = this.currentBehavior?.name === 'Sprint' ? 8 : 4
        const moveDistance = speed * (this.updateInterval / 1000)
        
        const movement = direction.multiplyScalar(moveDistance)
        this.bot.position.add(movement)
        
        // Adjust Y position to follow terrain
        const terrainSystem = this.world.systems.find(s => s.constructor.name === 'TerrainSystem') as any
        if (terrainSystem && terrainSystem.getHeightAt) {
          const height = terrainSystem.getHeightAt(this.bot.position.x, this.bot.position.z)
          if (typeof height === 'number' && !isNaN(height)) {
            this.bot.position.y = height + 1.8
          }
        }
        
        // Calculate quaternion for facing direction
        const forward = new THREE.Vector3(0, 0, -1)
        const q = new THREE.Quaternion().setFromUnitVectors(forward, direction)
        
        // Determine emote based on speed
        const emote = this.currentBehavior?.name === 'Sprint' ? 'run' : 'walk'
        
        // Broadcast to clients using the same format as PlayerLocal
        ;(this.world.network as any)?.send?.('entityModified', {
          id: this.bot.id,
          p: [this.bot.position.x, this.bot.position.y, this.bot.position.z],
          q: [q.x, q.y, q.z, q.w],
          e: emote
        })
        
        // Update stats
        const moved = this.bot.position.distanceTo(this.lastPosition)
        this.stats.distanceTraveled += moved
        this.lastPosition.copy(this.bot.position)
        
      } else {
        // Reached target
        Logger.info(`[ServerBot] Reached target at (${this.moveTarget.x.toFixed(1)}, ${this.moveTarget.z.toFixed(1)})`)
        this.moveTarget = null
        
        // Send idle emote when stopping
        ;(this.world.network as any)?.send?.('entityModified', {
          id: this.bot.id,
          e: 'idle'
        })
      }
    }
    
    // Print stats periodically
    if (Math.random() < 0.001) { // ~0.1% chance per update
      this.printStats()
    }
  }
  
  private printStats(): void {
    const runtime = (Date.now() - this.stats.startTime) / 1000
    Logger.info('[ServerBot] ============ BOT STATS ============')
    Logger.info(`[ServerBot] Runtime: ${runtime.toFixed(1)}s`)
    Logger.info(`[ServerBot] Distance traveled: ${this.stats.distanceTraveled.toFixed(1)} units`)
    Logger.info(`[ServerBot] Actions performed: ${this.stats.actionsPerformed}`)
    Logger.info(`[ServerBot] Entities encountered: ${this.stats.entitiesEncountered}`)
    Logger.info(`[ServerBot] Errors: ${this.stats.errors}`)
    Logger.info(`[ServerBot] Current position: (${this.bot!.position.x.toFixed(1)}, ${this.bot!.position.z.toFixed(1)})`)
    Logger.info('[ServerBot] ===================================')
  }
  
  private respawnBot(): void {
    Logger.info('[ServerBot] Respawning bot...')
    
    // Clean up old bot
    if (this.bot) {
      const entities = this.world.entities as any
      if (entities.items && entities.items instanceof Map) {
        entities.items.delete(this.bot.id)
      }
    }
    
    // Reset stats
    this.stats = {
      distanceTraveled: 0,
      entitiesEncountered: 0,
      actionsPerformed: 0,
      startTime: 0,
      errors: 0
    }
    
    // Spawn new bot
    this.spawnBot()
  }
  
  override destroy(): void {
    this.isActive = false
    
    if (this.bot) {
      const entities = this.world.entities as any
      if (entities.items && entities.items instanceof Map) {
        entities.items.delete(this.bot.id)
      }
      this.bot = null
    }
    
    super.destroy()
  }
}
