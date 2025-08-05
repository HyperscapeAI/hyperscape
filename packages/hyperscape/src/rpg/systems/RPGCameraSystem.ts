/**
 * RPG Camera System
 * Overrides default Hyperscape camera controls with MMORPG-style controls:
 * - Right-click drag to rotate camera around player
 * - Mouse wheel to zoom in/out
 * - Middle mouse button drag to pan
 * - Smooth camera following
 * - Collision avoidance
 */

import * as THREE from '../../core/extras/three'
import type { World } from '../../core/World'
import { EventType } from '../../types/events'
import type { ClientControlsSystem, ClientUISystem } from '../../types/system-interfaces'
import { RPGSystemBase } from './RPGSystemBase'

// Custom player target interface - simplified to only what we need
interface PlayerTarget {
  position: THREE.Vector3
  playerId: string
  data: { id: string }
  base: THREE.Object3D
}

interface RendererWithDomElement {
  domElement: HTMLCanvasElement
}

// These interfaces are no longer needed as we use strong typing from system-interfaces

export class RPGCameraSystem extends RPGSystemBase {
  private camera!: THREE.PerspectiveCamera
  private target!: PlayerTarget // Player to follow
  private canvas!: HTMLCanvasElement

  // Orbit camera controls
  private spherical = new THREE.Spherical()
  private targetPosition = new THREE.Vector3()
  private cameraPosition = new THREE.Vector3()
  private lookAtTarget = new THREE.Vector3()

  // Camera settings
  private readonly MIN_DISTANCE = 3
  private readonly MAX_DISTANCE = 20
  private readonly MIN_POLAR_ANGLE = Math.PI * 0.1 // 18 degrees from top
  private readonly MAX_POLAR_ANGLE = Math.PI * 0.8 // 144 degrees from top
  private readonly ROTATE_SPEED = 1.0
  private readonly ZOOM_SPEED = 1.0
  private readonly PAN_SPEED = 2.0
  private readonly DAMPING_FACTOR = 0.05

  // Mouse state
  private isRightMouseDown = false
  private isMiddleMouseDown = false
  private mouseLastPosition = new THREE.Vector2()
  private mouseDelta = new THREE.Vector2()

  // Camera offset and targeting
  private cameraOffset = new THREE.Vector3(0, 2, 0) // Look at point above player

  // Raycaster for collision detection
  private raycaster = new THREE.Raycaster()

  // Working vectors to avoid creating new instances - use pure THREE.js vectors
  private _workingVector1 = new THREE.Vector3()
  private _workingVector2 = new THREE.Vector3()
  private _workingVector3 = new THREE.Vector3()

  // Bound event handlers
  private boundHandlers = {
    onMouseDown: this.onMouseDown.bind(this),
    onMouseMove: this.onMouseMove.bind(this),
    onMouseUp: this.onMouseUp.bind(this),
    onMouseWheel: this.onMouseWheel.bind(this),
    onKeyDown: this.onKeyDown.bind(this),
    onMouseLeave: this.onMouseLeave.bind(this),
  }

  constructor(world: World) {
    super(world, {
      name: 'rpg-camera',
      dependencies: {
        required: [],
        optional: ['client-graphics', 'client-controls'],
      },
      autoCleanup: true,
    })
  }

  async init(): Promise<void> {
    // Subscribe to events with auto-cleanup using new event system
    this.subscribe<{ playerId: string; avatar: { base: THREE.Object3D }; camHeight: number; isFallback: boolean }>(
      EventType.PLAYER_AVATAR_READY,
      event => {
        this.onAvatarReady(event.data)
      }
    )
    this.subscribe<{
      player: {
        id: string
        base: THREE.Object3D
        avatar: { base: THREE.Object3D }
        mesh: THREE.Object3D
        position: THREE.Vector3
      }
    }>(EventType.CAMERA_SET_TARGET, event => {
      this.setTarget(event.data)
    })
    this.subscribe(EventType.CAMERA_RESET, _event => this.resetCamera())
  }

  start(): void {
    this.tryInitialize()
  }

  private tryInitialize(): void {
    // Get canvas from graphics renderer
    if (this.world.graphics?.renderer && 'domElement' in this.world.graphics.renderer) {
      this.canvas = (this.world.graphics.renderer as RendererWithDomElement).domElement
    }

    if (!this.canvas) {
      console.warn('[RPGCameraSystem] Canvas not available yet')
      return
    }

    // Get camera from world
    if (this.world.stage.scene && !this.camera) {
      // Find camera in the scene
      this.world.stage.scene.traverse(child => {
        if (child instanceof THREE.PerspectiveCamera) {
          this.camera = child
        }
      })

      if (!this.camera) {
        // Create camera if none exists
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
        this.world.stage.scene.add(this.camera)
      }
    }

    if (!this.camera) {
      console.warn('[RPGCameraSystem] Camera not available')
      return
    }

    // Controls integration - note: ClientControls doesn't have enabled property
    // If needed, specific control behaviors can be managed through the controls system

    // Set up initial camera position
    this.spherical.set(8, Math.PI * 0.4, 0)
    this.setupEventListeners()

    // Register with UI system if available
    const uiSystem = this.world.getSystem<ClientUISystem>('ui')
    if (uiSystem && 'registerCameraSystem' in uiSystem) {
      uiSystem.registerCameraSystem(this)
    }
  }

  private onAvatarReady(data: {
    playerId: string
    avatar: { base: THREE.Object3D }
    camHeight: number
    isFallback: boolean
  }): void {
    // Use the base object and cast to PlayerTarget with required properties
    const target = data.avatar.base as unknown as PlayerTarget
    target.playerId = data.playerId
    target.data = { id: data.playerId }
    target.base = data.avatar.base
    this.target = target
  }

  private setupEventListeners(): void {
    if (!this.canvas) return

    // Mouse controls
    this.canvas.addEventListener('mousedown', this.boundHandlers.onMouseDown)
    this.canvas.addEventListener('mousemove', this.boundHandlers.onMouseMove)
    this.canvas.addEventListener('mouseup', this.boundHandlers.onMouseUp)
    this.canvas.addEventListener('wheel', this.boundHandlers.onMouseWheel)
    this.canvas.addEventListener('mouseleave', this.boundHandlers.onMouseLeave)

    // Keyboard controls
    window.addEventListener('keydown', this.boundHandlers.onKeyDown)

    // Prevent context menu on right click
    this.canvas.addEventListener('contextmenu', e => e.preventDefault())
  }

  private onMouseDown(event: MouseEvent): void {
    this.mouseLastPosition.set(event.clientX, event.clientY)

    if (event.button === 2) {
      // Right mouse button
      this.isRightMouseDown = true
      this.canvas.style.cursor = 'grabbing'
    } else if (event.button === 1) {
      // Middle mouse button
      this.isMiddleMouseDown = true
      this.canvas.style.cursor = 'move'
      event.preventDefault()
    }
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.canvas || !this.camera) return

    this.mouseDelta.set(event.clientX - this.mouseLastPosition.x, event.clientY - this.mouseLastPosition.y)

    if (this.isRightMouseDown) {
      // Rotate camera around target
      this.spherical.theta -= this.mouseDelta.x * 0.01 * this.ROTATE_SPEED
      this.spherical.phi += this.mouseDelta.y * 0.01 * this.ROTATE_SPEED
      this.spherical.phi = THREE.MathUtils.clamp(this.spherical.phi, this.MIN_POLAR_ANGLE, this.MAX_POLAR_ANGLE)
    } else if (this.isMiddleMouseDown) {
      // Pan camera
      this.panCamera(this.mouseDelta.x, this.mouseDelta.y)
    }

    this.mouseLastPosition.set(event.clientX, event.clientY)
  }

  private onMouseUp(event: MouseEvent): void {
    if (!this.canvas) return

    if (event.button === 2) {
      this.isRightMouseDown = false
    } else if (event.button === 1) {
      this.isMiddleMouseDown = false
    }

    this.canvas.style.cursor = 'default'
  }

  private onMouseWheel(event: WheelEvent): void {
    if (!this.camera) return

    event.preventDefault()

    // Zoom camera
    const zoomDelta = event.deltaY * 0.001 * this.ZOOM_SPEED
    this.spherical.radius += zoomDelta
    this.spherical.radius = THREE.MathUtils.clamp(this.spherical.radius, this.MIN_DISTANCE, this.MAX_DISTANCE)
  }

  private onKeyDown(event: KeyboardEvent): void {
    switch (event.code) {
      case 'KeyR':
        if (event.ctrlKey) {
          this.resetCamera()
          event.preventDefault()
        }
        break
    }
  }

  private onMouseLeave(_event: MouseEvent): void {
    // Reset mouse state when leaving canvas
    this.isRightMouseDown = false
    this.isMiddleMouseDown = false

    if (this.canvas) {
      this.canvas.style.cursor = 'default'
    }
  }

  private panCamera(deltaX: number, deltaY: number): void {
    if (!this.camera) return

    // Calculate pan direction based on camera orientation
    const panVector = new THREE.Vector3()
    const rightVector = new THREE.Vector3()
    const upVector = new THREE.Vector3(0, 1, 0)

    // Get camera's right vector - use working vectors for THREE.js compatibility
    this._workingVector1.set(panVector.x, panVector.y, panVector.z)
    this.camera.getWorldDirection(this._workingVector1)
    this._workingVector2.set(rightVector.x, rightVector.y, rightVector.z)
    this._workingVector2.crossVectors(upVector, this._workingVector1).normalize()
    rightVector.set(this._workingVector2.x, this._workingVector2.y, this._workingVector2.z)

    // Calculate pan offset
    const panSpeed = this.PAN_SPEED * 0.01
    const panOffset = new THREE.Vector3()
      .addScaledVector(rightVector, -deltaX * panSpeed)
      .addScaledVector(upVector, deltaY * panSpeed)

    this.cameraOffset.add(panOffset)
  }

  private resetCamera(): void {
    if (!this.target) return

    // Reset to default camera position
    this.spherical.set(8, Math.PI * 0.4, 0)
    this.cameraOffset.set(0, 2, 0)
  }

  private setTarget(data: { player: { id: string; mesh: THREE.Object3D; position: THREE.Vector3; base?: THREE.Object3D } }): void {
    const baseObject = data.player.base || data.player.mesh
    
    // Create a proper PlayerTarget with only the properties we need
    this.target = {
      position: baseObject.position,
      playerId: data.player.id,
      data: { id: data.player.id },
      base: baseObject
    }
  }

  update(_deltaTime: number): void {
    // Get target position
    this.targetPosition.copy(this.target.position)
    this.targetPosition.add(this.cameraOffset)

    // Update camera position using spherical coordinates
    this.cameraPosition.setFromSpherical(this.spherical)
    this.cameraPosition.add(this.targetPosition)

    // Handle camera collisions
    this.handleCameraCollisions()

    // Smooth camera movement
    this.camera.position.lerp(this.cameraPosition, this.DAMPING_FACTOR)

    // Look at target - use working vector for THREE.js compatibility
    this._workingVector3.set(this.lookAtTarget.x, this.lookAtTarget.y, this.lookAtTarget.z)
    this.camera.lookAt(this._workingVector3)

    // Update camera matrix
    this.camera.updateMatrixWorld()
  }

  private handleCameraCollisions(): void {
    // Cast ray from target to desired camera position
    const direction = new THREE.Vector3().subVectors(this.cameraPosition, this.targetPosition).normalize()

    // Set raycaster with working vectors for THREE.js compatibility
    this._workingVector1.set(this.targetPosition.x, this.targetPosition.y, this.targetPosition.z)
    this._workingVector2.set(direction.x, direction.y, direction.z)
    this.raycaster.set(this._workingVector1, this._workingVector2)
    this.raycaster.far = this.spherical.radius

    // Get intersectable objects (terrain, buildings, etc.)
    const intersects = this.raycaster.intersectObjects(this.world.stage.scene.children, true)

    // Filter out the target itself and UI elements
    const validIntersects = intersects.filter(intersect => {
      const object = intersect.object
      // Check if target is an ancestor of the intersected object
      let parent = object.parent
      let hasTargetAsAncestor = false
      while (parent) {
        if (parent === this.target.base) {
          hasTargetAsAncestor = true
          break
        }
        parent = parent.parent
      }
      return object !== this.target.base && !hasTargetAsAncestor && !object.userData?.isUI
    })

    if (validIntersects.length > 0) {
      // Collision detected, move camera closer
      const closestHit = validIntersects[0]
      const newDistance = Math.max(this.MIN_DISTANCE, closestHit.distance - 0.5)

      this.cameraPosition.copy(this.targetPosition)
      this.cameraPosition.addScaledVector(direction, newDistance)
    }
  }

  getCameraInfo(): {
    hasCamera: boolean
    hasTarget: boolean
    targetId: string
    position: number[]
    spherical: { radius: number; phi: number; theta: number }
    offset: number[]
  } {
    return {
      hasCamera: true,
      hasTarget: true,
      targetId: this.target.playerId,
      position: this.camera.position.toArray(),
      spherical: {
        radius: this.spherical.radius,
        phi: this.spherical.phi,
        theta: this.spherical.theta,
      },
      offset: Array.from(this.cameraOffset.toArray()),
    }
  }

  setEnabled(enabled: boolean): void {
    if (enabled) {
      this.setupEventListeners()
    } else {
      // Remove event listeners
      if (this.canvas) {
        this.canvas.removeEventListener('mousedown', this.boundHandlers.onMouseDown)
        this.canvas.removeEventListener('mousemove', this.boundHandlers.onMouseMove)
        this.canvas.removeEventListener('mouseup', this.boundHandlers.onMouseUp)
        this.canvas.removeEventListener('wheel', this.boundHandlers.onMouseWheel)
        this.canvas.removeEventListener('mouseleave', this.boundHandlers.onMouseLeave)
      }
      window.removeEventListener('keydown', this.boundHandlers.onKeyDown)
    }
  }

  destroy(): void {
    // Remove event listeners
    this.setEnabled(false)

    // Reset camera controls - assume controls exist
    const controls = this.world.controls as unknown as ClientControlsSystem
    controls.setEnabled(true)

    // Unregister from UI system - assume it exists
    const uiSystem = this.world.ui as unknown as ClientUISystem
    uiSystem.unregisterCameraSystem(this)

    // Clear references handled by autoCleanup

    // Call parent cleanup (handles event listeners, timers, etc.)
    super.destroy()
  }
}
