/**
 * MovementValidationSystem - Runtime validation of movement, animation, and networking
 * Runs continuous checks to ensure all movement systems are working correctly
 */

import { System } from './System'
import type { World } from '../World'
import { PlayerLocal } from '../entities/PlayerLocal'
import { PlayerRemote } from '../entities/PlayerRemote'
import { PlayerEntity } from '../entities/PlayerEntity'
import * as THREE from 'three'

interface ValidationResult {
  category: string
  test: string
  passed: boolean
  error?: string
  details?: any
  timestamp: number
}

interface MovementMetrics {
  localPlayer?: {
    position: THREE.Vector3
    rotation: THREE.Quaternion
    emote: string
    moving: boolean
    velocity?: THREE.Vector3
    lastUpdate: number
  }
  remotePlayers: Map<string, {
    position: THREE.Vector3
    rotation: THREE.Quaternion
    emote: string
    lastUpdate: number
  }>
  serverPlayers: Map<string, {
    position: THREE.Vector3
    health: number
    lastUpdate: number
  }>
}

export class MovementValidationSystem extends System {
  private validationResults: ValidationResult[] = []
  private metrics: MovementMetrics = {
    remotePlayers: new Map(),
    serverPlayers: new Map()
  }
  private lastValidationRun = 0
  private validationInterval = 1000 // Run validations every second
  private networkLatencyHistory: number[] = []
  private isRunning = false
  private systemStartTime = 0

  override start(): void {
    console.log('[MovementValidation] System started - running continuous validation')
    this.isRunning = true
    this.systemStartTime = Date.now()
    
    // Listen to network events for latency tracking
    this.world.on('network:ping', this.trackNetworkLatency.bind(this))
    this.world.on('entityModified', this.trackEntityUpdate.bind(this))
  }

  override update(delta: number): void {
    if (!this.isRunning) return

    const now = Date.now()
    
    // Update metrics continuously
    this.updateMetrics()

    // Run validations periodically
    if (now - this.lastValidationRun > this.validationInterval) {
      this.runValidations()
      this.lastValidationRun = now
    }

    // Log failures immediately
    const recentFailures = this.validationResults.filter(
      r => !r.passed && (now - r.timestamp) < 5000
    )
    if (recentFailures.length > 0) {
      console.warn('[MovementValidation] Recent failures detected:', recentFailures)
    }
  }

  private updateMetrics(): void {
    // Track local player
    const localPlayer = this.findLocalPlayer()
    if (localPlayer) {
      const velocity = localPlayer.capsule?.getLinearVelocity()
      this.metrics.localPlayer = {
        position: localPlayer.node?.position.clone() || new THREE.Vector3(),
        rotation: localPlayer.base?.quaternion.clone() || localPlayer.node?.quaternion.clone() || new THREE.Quaternion(),
        emote: localPlayer.emote || 'idle',
        moving: localPlayer.moving,
        velocity: velocity ? new THREE.Vector3(velocity.x, velocity.y, velocity.z) : undefined,
        lastUpdate: Date.now()
      }
    }

    // Track remote players
    for (const entity of this.world.entities.items.values()) {
      if (entity instanceof PlayerRemote) {
        this.metrics.remotePlayers.set(entity.id, {
          position: entity.node?.position.clone() || new THREE.Vector3(),
          rotation: entity.base?.quaternion.clone() || entity.node?.quaternion.clone() || new THREE.Quaternion(),
          emote: (entity.data.emote as string) || 'idle',
          lastUpdate: Date.now()
        })
      }
    }

    // Track server-side player entities
    for (const entity of this.world.entities.items.values()) {
      if (entity instanceof PlayerEntity) {
        this.metrics.serverPlayers.set(entity.id, {
          position: new THREE.Vector3(
            entity.position.x,
            entity.position.y,
            entity.position.z
          ),
          health: entity.getHealth(),
          lastUpdate: Date.now()
        })
      }
    }
  }

  private runValidations(): void {
    const timestamp = Date.now()

    // 1. Local Player Movement Validation
    this.validateLocalPlayerMovement(timestamp)

    // 2. Animation State Validation
    this.validateAnimationStates(timestamp)

    // 3. Network Sync Validation
    this.validateNetworkSync(timestamp)

    // 4. Rotation Validation
    this.validateRotation(timestamp)

    // 5. Physics Validation
    this.validatePhysics(timestamp)

    // Print summary every 10 seconds
    if (this.validationResults.length % 10 === 0) {
      this.printValidationSummary()
    }
  }

  private validateLocalPlayerMovement(timestamp: number): void {
    const localPlayer = this.findLocalPlayer()
    if (!localPlayer) {
      // Don't spam errors if player hasn't been created yet
      // This is common during initialization
      if (Date.now() - this.systemStartTime > 5000) {
        // Only log error if we've been running for more than 5 seconds
        this.addResult('LocalPlayer', 'Existence', false, 'No local player found', timestamp)
      }
      return
    }

    // Test 1: Position is valid
    const pos = localPlayer.position
    const posValid = Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)
    this.addResult('LocalPlayer', 'Position Valid', posValid, 
      posValid ? undefined : 'Invalid position values', timestamp)

    // Test 2: When moving, velocity should be non-zero
    if (localPlayer.moving && localPlayer.capsule) {
      const velocity = localPlayer.capsule.getLinearVelocity()
      const speed = velocity ? Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z) : 0
      const hasVelocity = speed > 0.01
      this.addResult('LocalPlayer', 'Movement Velocity', hasVelocity,
        hasVelocity ? undefined : `Moving but velocity is ${speed.toFixed(3)}`, timestamp)
    }

    // Test 3: When stopped, should not be rotating
    if (!localPlayer.moving && localPlayer.base) {
      const prevRotation = this.metrics.localPlayer?.rotation
      if (prevRotation) {
        const rotationDelta = prevRotation.angleTo(localPlayer.base.quaternion)
        const notRotating = rotationDelta < 0.01
        this.addResult('LocalPlayer', 'Stopped Rotation', notRotating,
          notRotating ? undefined : `Rotating ${rotationDelta.toFixed(3)} rad while stopped`, timestamp)
      }
    }

    // Test 4: Click target handling
    if (localPlayer.clickMoveTarget) {
      const distance = localPlayer.position.distanceTo(localPlayer.clickMoveTarget)
      const isApproaching = distance < 100 // Should be within reasonable range
      this.addResult('LocalPlayer', 'Target Distance', isApproaching,
        isApproaching ? undefined : `Target too far: ${distance.toFixed(1)}m`, timestamp)
    }
  }

  private validateAnimationStates(timestamp: number): void {
    const localPlayer = this.findLocalPlayer()
    if (!localPlayer) return

    // Test 1: Animation matches movement state
    const expectedEmote = localPlayer.moving ? 
      (localPlayer.running ? 'run' : 'walk') : 'idle'
    const animationCorrect = localPlayer.emote === expectedEmote
    this.addResult('Animation', 'Local State Match', animationCorrect,
      animationCorrect ? undefined : `Expected ${expectedEmote}, got ${localPlayer.emote}`, timestamp)

    // Test 2: Remote players have valid animations
    for (const [id, metrics] of this.metrics.remotePlayers) {
      const validEmote = ['idle', 'walk', 'run', 'float', 'fall'].includes(metrics.emote)
      this.addResult('Animation', `Remote ${id} Valid`, validEmote,
        validEmote ? undefined : `Invalid emote: ${metrics.emote}`, timestamp)
    }
  }

  private validateNetworkSync(timestamp: number): void {
    // Test 1: Network messages are being sent
    const localPlayer = this.findLocalPlayer()
    if (localPlayer && localPlayer.moving) {
      const lastState = (localPlayer as any).lastState
      const isSending = lastState && lastState.p && lastState.e
      this.addResult('Network', 'Sending Updates', isSending,
        isSending ? undefined : 'Not sending network updates', timestamp)
    }

    // Test 2: Remote players are receiving updates
    for (const [id, metrics] of this.metrics.remotePlayers) {
      const age = timestamp - metrics.lastUpdate
      const isRecent = age < 5000 // Should update within 5 seconds
      this.addResult('Network', `Remote ${id} Updates`, isRecent,
        isRecent ? undefined : `Last update ${age}ms ago`, timestamp)
    }

    // Test 3: Latency is reasonable
    if (this.networkLatencyHistory.length > 0) {
      const avgLatency = this.networkLatencyHistory.reduce((a, b) => a + b, 0) / this.networkLatencyHistory.length
      const latencyOk = avgLatency < 200 // Should be under 200ms
      this.addResult('Network', 'Latency', latencyOk,
        latencyOk ? undefined : `High latency: ${avgLatency.toFixed(0)}ms`, timestamp)
    }
  }

  private validateRotation(timestamp: number): void {
    const localPlayer = this.findLocalPlayer()
    if (!localPlayer || !localPlayer.base) return

    // Test 1: Rotation quaternion is normalized
    const quat = localPlayer.base.quaternion
    const magnitude = Math.sqrt(quat.x * quat.x + quat.y * quat.y + quat.z * quat.z + quat.w * quat.w)
    const isNormalized = Math.abs(magnitude - 1) < 0.01
    this.addResult('Rotation', 'Quaternion Normalized', isNormalized,
      isNormalized ? undefined : `Magnitude: ${magnitude}`, timestamp)

    // Test 2: Only Y-axis rotation (no tilting)
    const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ')
    const noTilt = Math.abs(euler.x) < 0.1 && Math.abs(euler.z) < 0.1
    this.addResult('Rotation', 'No Tilt', noTilt,
      noTilt ? undefined : `Tilt detected: x=${euler.x.toFixed(2)}, z=${euler.z.toFixed(2)}`, timestamp)
  }

  private validatePhysics(timestamp: number): void {
    const localPlayer = this.findLocalPlayer()
    if (!localPlayer || !localPlayer.capsule) return

    // Test 1: Physics body exists and is active
    const hasPhysics = localPlayer.capsule !== null
    this.addResult('Physics', 'Body Exists', hasPhysics, undefined, timestamp)

    // Test 2: Position sync between visual and physics
    if (localPlayer.base && localPlayer.capsule) {
      const pose = localPlayer.capsule.getGlobalPose()
      if (pose?.p) {
        const physicsPos = new THREE.Vector3(pose.p.x, pose.p.y, pose.p.z)
        const visualPos = localPlayer.base.position
        const syncDistance = physicsPos.distanceTo(visualPos)
        const isSync = syncDistance < 0.1
        this.addResult('Physics', 'Position Sync', isSync,
          isSync ? undefined : `Desync by ${syncDistance.toFixed(3)}m`, timestamp)
      }
    }
  }

  private findLocalPlayer(): PlayerLocal | null {
    // Try multiple ways to find the local player
    
    // Method 1: Check if entities system has a player property
    if (this.world.entities.player && this.world.entities.player instanceof PlayerLocal) {
      return this.world.entities.player as PlayerLocal
    }
    
    // Method 2: Check the items map
    if (this.world.entities.items) {
      for (const entity of this.world.entities.items.values()) {
        if (entity instanceof PlayerLocal) {
          return entity
        }
      }
    }
    
    // Method 3: Check network ID match
    const networkId = this.world.network?.id
    if (networkId && this.world.entities.items) {
      for (const entity of this.world.entities.items.values()) {
        if (entity.data?.owner === networkId && entity.data?.type === 'player') {
          // This is the local player but might not be instanceof PlayerLocal yet
          // due to how the entity system works
          return entity as PlayerLocal
        }
      }
    }
    
    return null
  }

  private trackNetworkLatency(data: { latency: number }): void {
    this.networkLatencyHistory.push(data.latency)
    if (this.networkLatencyHistory.length > 10) {
      this.networkLatencyHistory.shift()
    }
  }

  private trackEntityUpdate(data: any): void {
    // Track when entities are updated over network
    if (data.id && this.metrics.remotePlayers.has(data.id)) {
      const metrics = this.metrics.remotePlayers.get(data.id)!
      metrics.lastUpdate = Date.now()
    }
  }

  private addResult(category: string, test: string, passed: boolean, error?: string, timestamp?: number): void {
    this.validationResults.push({
      category,
      test,
      passed,
      error,
      timestamp: timestamp || Date.now()
    })

    // Keep only last 100 results
    if (this.validationResults.length > 100) {
      this.validationResults.shift()
    }
  }

  private printValidationSummary(): void {
    const categories = new Map<string, { passed: number, failed: number }>()
    
    for (const result of this.validationResults) {
      if (!categories.has(result.category)) {
        categories.set(result.category, { passed: 0, failed: 0 })
      }
      const cat = categories.get(result.category)!
      if (result.passed) {
        cat.passed++
      } else {
        cat.failed++
      }
    }

    console.log('[MovementValidation] === VALIDATION SUMMARY ===')
    for (const [category, stats] of categories) {
      const total = stats.passed + stats.failed
      const rate = total > 0 ? (stats.passed / total * 100).toFixed(1) : '0'
      console.log(`  ${category}: ${stats.passed}/${total} passed (${rate}%)`)
    }

    // List recent failures
    const recentFailures = this.validationResults
      .filter(r => !r.passed)
      .slice(-5)
    
    if (recentFailures.length > 0) {
      console.log('[MovementValidation] Recent failures:')
      for (const failure of recentFailures) {
        console.log(`  - ${failure.category}/${failure.test}: ${failure.error}`)
      }
    }
  }

  getValidationReport(): {
    summary: Record<string, { passed: number, failed: number, rate: number }>
    recentFailures: ValidationResult[]
    metrics: MovementMetrics
  } {
    const summary: Record<string, { passed: number, failed: number, rate: number }> = {}
    
    for (const result of this.validationResults) {
      if (!summary[result.category]) {
        summary[result.category] = { passed: 0, failed: 0, rate: 0 }
      }
      if (result.passed) {
        summary[result.category].passed++
      } else {
        summary[result.category].failed++
      }
    }

    // Calculate rates
    for (const cat of Object.values(summary)) {
      const total = cat.passed + cat.failed
      cat.rate = total > 0 ? cat.passed / total : 0
    }

    return {
      summary,
      recentFailures: this.validationResults.filter(r => !r.passed).slice(-10),
      metrics: this.metrics
    }
  }

  override destroy(): void {
    this.isRunning = false
    this.validationResults = []
    console.log('[MovementValidation] System destroyed')
  }
}

