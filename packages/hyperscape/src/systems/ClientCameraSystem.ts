/**
 * Core Camera System
 * camera system that supports multiple control modes:
 * - First Person (pointer lock, WASD movement)
 * - Third Person/MMO(right-click drag, click-to-move)
 * - Top-down/RTS (pan, zoom, click-to-move)
 */

import THREE from '../extras/three';
import { SystemBase } from './SystemBase';

import type { CameraTarget, System, World } from '../types';
import { EventType } from '../types/events';
import { clamp } from '../utils';
// CameraTarget interface moved to shared types

// Define TerrainSystem interface for type checking
interface TerrainSystem extends System {
  getHeightAt(x: number, z: number): number;
  getNormalAt(x: number, z: number): { x: number; y: number; z: number };
}

interface DampedSettings {
  dampingFactor?: number
  minDistance?: number
}

export class ClientCameraSystem extends SystemBase {
  private camera: THREE.PerspectiveCamera | null = null;
  private target: CameraTarget | null = null;
  private canvas: HTMLCanvasElement | null = null;
  
  // Camera state for orbit controls
  private spherical = new THREE.Spherical(6, Math.PI * 0.3, 0); // radius, phi, theta
  private cameraPosition = new THREE.Vector3();
  private cameraOffset = new THREE.Vector3(0, 1.8, 0); // Offset from player position (adjusted for terrain + 0.1 height)
  
  // Control settings
  private readonly settings = {
      minDistance: 3,
      maxDistance: 20,
      minPolarAngle: Math.PI * 0.1,
      maxPolarAngle: Math.PI * 0.8,
      rotateSpeed: 1.0,
      zoomSpeed: 1.0,
      panSpeed: 2.0,
      dampingFactor: 0.05
  };
  
  // Mouse state
  private mouseState = {
    rightDown: false,
    middleDown: false,
    leftDown: false,
    lastPosition: new THREE.Vector2(),
    delta: new THREE.Vector2()
  };
  
  // Collision detection
  private raycaster = new THREE.Raycaster();
  private tempDirection = new THREE.Vector3();
  private tempOrigin = new THREE.Vector3();
  
  // Bound event handlers for cleanup
  private boundHandlers = {
    contextMenu: (e: Event) => e.preventDefault(),
    mouseDown: this.onMouseDown.bind(this),
    mouseMove: this.onMouseMove.bind(this),
    mouseUp: this.onMouseUp.bind(this),
    mouseWheel: this.onMouseWheel.bind(this),
    mouseLeave: this.onMouseLeave.bind(this),
    keyDown: this.onKeyDown.bind(this)
  };

  constructor(world: World) {
    super(world, { name: 'client-camera', dependencies: { required: [], optional: [] }, autoCleanup: true });
  }

  async init(): Promise<void> {
    if (!this.world.isClient) return;
    
    // Listen for camera events via event bus (typed)
    this.subscribe(EventType.CAMERA_SET_TARGET, (data: { target: { position: THREE.Vector3 } }) => this.onSetTarget({ target: { position: data.target.position } as CameraTarget }));
    this.subscribe(EventType.CAMERA_RESET, () => this.resetCamera());

    // Listen for player events
    this.subscribe(EventType.PLAYER_AVATAR_READY, (data: { playerId: string; avatar: unknown; camHeight: number }) => this.onAvatarReady({ playerId: data.playerId, avatar: (data.avatar as { base?: THREE.Object3D } ).base ?? ({} as THREE.Object3D), camHeight: data.camHeight }));
    
    // Don't detect camera mode here - wait until systems are fully loaded
  }
  
  start(): void {
    if (!this.world.isClient) return;
    this.tryInitialize();
    this.detachCameraFromRig();
  }

  private detachCameraFromRig(): void {
    if (!this.camera || !this.world.stage?.scene) return;
    
    // Remove camera from rig if it's attached
    if (this.camera.parent === this.world.rig) {
      console.log('[ClientCameraSystem] Detaching camera from world.rig to make it independent');
      
      // Get world position and rotation before removing from parent
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      this.camera.getWorldPosition(worldPos);
      this.camera.getWorldQuaternion(worldQuat);
      
      // Remove from rig
      if (this.world.rig && this.world.rig.remove) {
        this.world.rig.remove(this.camera);
      }
      
      // Add directly to scene
      this.world.stage.scene.add(this.camera);
      
      // Restore world transform
      this.camera.position.copy(worldPos);
      this.camera.quaternion.copy(worldQuat);
      
      console.log('[ClientCameraSystem] Camera is now independent from rig transforms');
    } else if (this.camera.parent && this.camera.parent !== this.world.stage.scene) {
      console.warn('[ClientCameraSystem] Camera has unexpected parent:', this.camera.parent);
    }
  }

  private tryInitialize(): void {
    this.camera = this.world.camera;
    this.canvas = this.world.graphics?.renderer?.domElement ?? null;

    if (!this.camera || !this.canvas) {
      setTimeout(() => this.tryInitialize(), 100);
      return;
    }

    // Ensure camera is detached from rig once it's available
    this.detachCameraFromRig();

    this.setupEventListeners();
  
    
    // Try to follow local player - check once, then rely on player:ready event
    this.initializePlayerTarget();
      }

  private initializePlayerTarget(): void {
    const localPlayer = this.world.getPlayer();
    if (localPlayer && localPlayer.id) {
      this.logger.info(`Setting player as camera target: ${localPlayer.id}`);
      this.onSetTarget({ target: localPlayer });
      
        this.initializeCameraPosition();
    } else {
      this.logger.info('No local player found yet, waiting for player:ready event');
    }
  }
  
  private setupEventListeners(): void {
    if (!this.canvas) return;

    this.canvas.addEventListener('contextmenu', this.boundHandlers.contextMenu as EventListener);
    this.canvas.addEventListener('mousedown', this.boundHandlers.mouseDown as EventListener);
    this.canvas.addEventListener('mousemove', this.boundHandlers.mouseMove as EventListener);
    this.canvas.addEventListener('mouseup', this.boundHandlers.mouseUp as EventListener);
    this.canvas.addEventListener('wheel', this.boundHandlers.mouseWheel as EventListener);
    this.canvas.addEventListener('mouseleave', this.boundHandlers.mouseLeave as EventListener);
    document.addEventListener('keydown', this.boundHandlers.keyDown as EventListener);
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button === 2) { // Right mouse button
      // Don't start orbit if the event was already handled (by resource interaction)
      if (!event.defaultPrevented) {
        this.mouseState.rightDown = true;
        this.canvas!.style.cursor = 'grabbing';
      }
    } else if (event.button === 1) { // Middle mouse button
      this.mouseState.middleDown = true;
      this.canvas!.style.cursor = 'move';
      event.preventDefault();
    } else if (event.button === 0) { // Left mouse button
      this.mouseState.leftDown = true;
      // Click-to-move is handled by InteractionSystem to avoid duplication
      // Do not call preventDefault here to allow click event to reach InteractionSystem
    }

    this.mouseState.lastPosition.set(event.clientX, event.clientY);
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.mouseState.rightDown && !this.mouseState.middleDown) return;

    this.mouseState.delta.set(
      event.clientX - this.mouseState.lastPosition.x,
      event.clientY - this.mouseState.lastPosition.y
    );

    if (this.mouseState.rightDown) {
      // Rotate camera around target in orbit style
      this.spherical.theta -= this.mouseState.delta.x * this.settings.rotateSpeed * 0.01;
      this.spherical.phi -= this.mouseState.delta.y * this.settings.rotateSpeed * 0.01;
      this.spherical.phi = clamp(
        this.spherical.phi,
        this.settings.minPolarAngle,
        this.settings.maxPolarAngle
      );
    }

    if (this.mouseState.middleDown) {
      this.panCamera(this.mouseState.delta.x, this.mouseState.delta.y);
      // Do NOT modify spherical on pan; panning should not flip camera
    }

    this.mouseState.lastPosition.set(event.clientX, event.clientY);
  }

  private onMouseUp(event: MouseEvent): void {
    if (event.button === 2) {
      this.mouseState.rightDown = false;
    }
    if (event.button === 1) {
      this.mouseState.middleDown = false;
    }
    if (event.button === 0) {
      this.mouseState.leftDown = false;
    }

    if (!this.mouseState.rightDown && !this.mouseState.middleDown) {
      this.canvas!.style.cursor = 'default';
    }
  }

  private onMouseWheel(event: WheelEvent): void {
    event.preventDefault();
    
    const zoomDelta = event.deltaY * this.settings.zoomSpeed * 0.001;
    this.spherical.radius += zoomDelta;
    
    this.spherical.radius = clamp(this.spherical.radius, this.settings.minDistance, this.settings.maxDistance);
  }

  private onMouseLeave(_event: MouseEvent): void {
    this.mouseState.rightDown = false;
    this.mouseState.middleDown = false;
    this.mouseState.leftDown = false;
    if (this.canvas) {
      this.canvas.style.cursor = 'default';
    }
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.code === 'Home' || event.code === 'NumpadHome') {
      this.resetCamera();
      event.preventDefault();
    }
  }

  private panCamera(deltaX: number, deltaY: number): void {
    if (!this.camera || !this.target) return;

    // Simple pan: move the camera offset in world space based on current camera orientation
    const cameraRight = new THREE.Vector3();
    const cameraForward = new THREE.Vector3();

    // Get camera right vector
    cameraRight.setFromMatrixColumn(this.camera.matrix, 0).normalize();
    
    // Get camera forward vector projected on XZ plane
    this.camera.getWorldDirection(cameraForward);
    cameraForward.y = 0;
    cameraForward.normalize();

    const panSpeed = this.settings.panSpeed * 0.01;
    
    // Apply pan to camera offset
    this.cameraOffset.x -= deltaX * panSpeed * cameraRight.x + deltaY * panSpeed * cameraForward.x;
    this.cameraOffset.z -= deltaX * panSpeed * cameraRight.z + deltaY * panSpeed * cameraForward.z;
  }

  private resetCamera(): void {
    if (!this.target) return;

    this.spherical.radius = 8;
    this.spherical.theta = 0;
    this.spherical.phi = Math.PI * 0.4;
    this.cameraOffset.set(0, 1.8, 0); // Standard offset for player at terrain level
  }

  private onSetTarget(event: { target: CameraTarget }): void {
    this.target = event.target;
    this.logger.info('Target set', this.target.position);
    
    if (this.target) {
      this.initializeCameraPosition();
    }
  }
  
  private onAvatarReady(event: { playerId: string; avatar: THREE.Object3D; camHeight: number }): void {
    // Use avatar height directly without extra offset since player is at terrain level
    this.cameraOffset.y = event.camHeight || 1.6;
    
    const localPlayer = this.world.getPlayer();
    if (localPlayer && event.playerId === localPlayer.id && !this.target) {
      this.onSetTarget({ target: localPlayer });
    }
  }

  private initializeCameraPosition(): void {
    if (!this.target || !this.camera) return;

    const targetPos = this.target.position as unknown as { x: number; y: number; z: number };
    if (!targetPos) return;

    // Ensure camera is independent before positioning
    this.detachCameraFromRig();

    // Set up orbit center in world space
    const orbitCenter = new THREE.Vector3(targetPos.x, targetPos.y + this.cameraOffset.y, targetPos.z);
    
    // Position camera based on spherical coordinates in world space
    this.cameraPosition.setFromSpherical(this.spherical);
    this.cameraPosition.add(orbitCenter);
    
    // Set camera world position directly (no parent transforms)
    this.camera.position.copy(this.cameraPosition);
    this.camera.lookAt(orbitCenter);
    
    // Force update matrices since camera has no parent
    this.camera.updateMatrixWorld(true);
  }

  update(_deltaTime: number): void {
    if(!this.target || !this.target.position) return;
    if(!this.camera) return;
    
    // Get target position in world space
    const targetPos = this.target.position;
    
    // Optionally validate player terrain position (commented out to avoid errors)
    // this.validatePlayerOnTerrain(targetPos);

    // Calculate orbit center in world space (player position + offset)
    // This is the point the camera orbits around
    const orbitCenter = new THREE.Vector3();
    orbitCenter.copy(targetPos);
    orbitCenter.y += this.cameraOffset.y; // Add vertical offset

    // Calculate camera position from spherical coordinates
    // The camera orbits around the orbit center in world space
    // The spherical coordinates are relative to the orbit center, not any parent transform
    this.cameraPosition.setFromSpherical(this.spherical);
    this.cameraPosition.add(orbitCenter);

    // Handle camera collisions
    this.handleCameraCollisions();

    // Apply camera movement with damping
    // Since camera is now in world space (no parent), we directly set its position
    const dampingFactor = (this.settings as DampedSettings).dampingFactor ?? 0.1;
      
    this.camera.position.lerp(this.cameraPosition, dampingFactor);
    
    // Camera always looks at the orbit center (player + offset)
    // This keeps the player centered regardless of avatar rotation
    this.camera.lookAt(orbitCenter);
    
    // Update camera matrices since it has no parent transform to inherit from
    this.camera.updateMatrixWorld(true);

    const terrain = this.world.getSystem('terrain') as TerrainSystem;
    if (terrain && terrain.getHeightAt) {
      const groundY = terrain.getHeightAt(this.camera.position.x, this.camera.position.z);
      if (Number.isFinite(groundY) && this.camera.position.y < groundY + 1) {
        this.camera.position.y = groundY + 1;
      }
      const normal = terrain.getNormalAt(this.camera.position.x, this.camera.position.z);
      const slopeFactor = 1 - normal.y;
      const dynamicOffset = 1 + slopeFactor * 0.5;
      if (this.camera.position.y < groundY + dynamicOffset) {
        this.camera.position.y = groundY + dynamicOffset;
      }
    }
  }

  private handleCameraCollisions(): void {
    if (!this.camera || !this.target) return;

    const targetPos = this.target.position;
    const orbitCenter = new THREE.Vector3(targetPos.x, targetPos.y + this.cameraOffset.y, targetPos.z);

    this.tempDirection.set(
      this.cameraPosition.x - orbitCenter.x,
      this.cameraPosition.y - orbitCenter.y, 
      this.cameraPosition.z - orbitCenter.z
    ).normalize();
    
    this.tempOrigin.copy(orbitCenter);
    const desiredDistance = this.spherical.radius;
    const mask = this.world.createLayerMask('environment');
    const hit = this.world.raycast(this.tempOrigin, this.tempDirection, desiredDistance, mask);
    if (hit && hit.distance < desiredDistance) {
      const safeDistance = Math.max(hit.distance - 0.5, (this.settings as DampedSettings).minDistance ?? 1.5);
      this.cameraPosition.copy(orbitCenter);
      this.cameraPosition.addScaledVector(this.tempDirection, safeDistance);
    }
  }

  private validatePlayerOnTerrain(playerPos: THREE.Vector3 | { x: number; y: number; z: number }): void {
    // Get terrain system
    const terrainSystem = this.world.getSystem('terrain') as unknown as TerrainSystem

    // Get player coordinates
    const px = 'x' in playerPos ? playerPos.x : (playerPos as THREE.Vector3).x;
    const py = 'y' in playerPos ? playerPos.y : (playerPos as THREE.Vector3).y;
    const pz = 'z' in playerPos ? playerPos.z : (playerPos as THREE.Vector3).z;

    // Get terrain height at player position
    const terrainHeight = terrainSystem.getHeightAt(px, pz);
    
    // Check if terrain height is valid
    if (!isFinite(terrainHeight) || isNaN(terrainHeight)) {
      const errorMsg = `[CRITICAL] Invalid terrain height at player position: x=${px}, z=${pz}, terrainHeight=${terrainHeight}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Check if player is properly positioned on terrain
    // Allow some tolerance for player height above terrain (0.0 to 5.0 units)
    const heightDifference = py - terrainHeight;
    
    if (heightDifference < -0.5) {
      const errorMsg = `[CRITICAL] Player is BELOW terrain! Player Y: ${py}, Terrain Height: ${terrainHeight}, Difference: ${heightDifference}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
    
    if (heightDifference > 10.0) {
      const errorMsg = `[CRITICAL] Player is FLOATING above terrain! Player Y: ${py}, Terrain Height: ${terrainHeight}, Difference: ${heightDifference}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Additional check: if player Y is exactly 0 or very close to 0, might indicate spawn issue
    if (Math.abs(py) < 0.01 && Math.abs(terrainHeight) > 1.0) {
      const errorMsg = `[CRITICAL] Player Y position is near zero (${py}) but terrain height is ${terrainHeight} - likely spawn failure!`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Log successful validation periodically (every 60 frames)
    if (Math.random() < 0.0167) { // ~1/60 chance
      console.log(`[ClientCameraSystem] Player terrain validation OK - Player Y: ${py.toFixed(2)}, Terrain: ${terrainHeight.toFixed(2)}, Diff: ${heightDifference.toFixed(2)}`);
    }
  }

  // Public API methods for testing and external access
  public setTarget(target: CameraTarget): void {
    this.target = target;
    this.emitTypedEvent(EventType.CAMERA_TARGET_CHANGED, { target });
  }

  public getCameraInfo(): { 
    camera: THREE.PerspectiveCamera | null; 
    target: CameraTarget | null;
    offset: number[];
    position: number[] | null;
    isControlling: boolean;
    spherical: { radius: number; phi: number; theta: number };
  } {
    return {
      camera: this.camera,
      target: this.target,
      offset: this.cameraOffset.toArray() as number[],
      position: this.camera?.position.toArray() || null,
      isControlling: this.mouseState.rightDown || this.mouseState.middleDown,
      spherical: { radius: this.spherical.radius, phi: this.spherical.phi, theta: this.spherical.theta }
    };
  }

  destroy(): void {
    if (this.canvas) {
      this.canvas.removeEventListener('contextmenu', this.boundHandlers.contextMenu as EventListener);
      this.canvas.removeEventListener('mousedown', this.boundHandlers.mouseDown as EventListener);
      this.canvas.removeEventListener('mousemove', this.boundHandlers.mouseMove as EventListener);
      this.canvas.removeEventListener('mouseup', this.boundHandlers.mouseUp as EventListener);
      this.canvas.removeEventListener('wheel', this.boundHandlers.mouseWheel as EventListener);
      this.canvas.removeEventListener('mouseleave', this.boundHandlers.mouseLeave as EventListener);
      document.removeEventListener('keydown', this.boundHandlers.keyDown as EventListener);
      this.canvas.style.cursor = 'default';
    }
    
    this.camera = null;
    this.target = null;
    this.canvas = null;
  }

  // Required System lifecycle methods
  preTick(): void {}
  preFixedUpdate(): void {}
  fixedUpdate(_dt: number): void {}
  postFixedUpdate(): void {}
  preUpdate(): void {}
  postUpdate(): void {}
  lateUpdate(): void {}
  postLateUpdate(): void {}
  commit(): void {}
  postTick(): void {}
}