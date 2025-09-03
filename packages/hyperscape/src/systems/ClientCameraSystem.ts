/**
 * Core Camera System
 * camera system that supports multiple control modes:
 * - First Person (pointer lock, WASD movement)
 * - Third Person/MMO(right-click drag, click-to-move)
 * - Top-down/RTS (pan, zoom, click-to-move)
 */

import THREE, { toTHREEVector3 } from '../extras/three';
import { SystemBase } from './SystemBase';

import type { CameraTarget, World } from '../types';
import { EventType } from '../types/events';
import { clamp } from '../utils';
import { hasSystem } from '../utils/SystemUtils';
// CameraTarget interface moved to shared types

export class ClientCameraSystem extends SystemBase {
  private camera: THREE.PerspectiveCamera | null = null;
  private target: CameraTarget | null = null;
  private canvas: HTMLCanvasElement | null = null;
  
  // Camera state for different modes
  private spherical = new THREE.Spherical(6, Math.PI * 0.3, 0); // radius, phi, theta
  private targetPosition = new THREE.Vector3();
  private cameraPosition = new THREE.Vector3();
  private lookAtTarget = new THREE.Vector3();
  private cameraOffset = new THREE.Vector3(0, 2, 0);
  
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
  }
  private tryInitialize(): void {
    this.camera = this.world.camera;
    this.canvas = this.world.graphics?.renderer?.domElement ?? null;

    if (!this.camera || !this.canvas) {
      setTimeout(() => this.tryInitialize(), 100);
      return;
    }

    this.setupEventListeners();
  
    
    // Try to follow local player - check once, then rely on player:ready event
    this.initializePlayerTarget();
      }

  private initializePlayerTarget(): void {
    try {
      const localPlayer = this.world.getPlayer();
      if (localPlayer && localPlayer.id) {
        this.logger.info(`Setting player as camera target: ${localPlayer.id}`);
        this.onSetTarget({ target: localPlayer });
        
          this.initializeCameraPosition();
      } else {
        this.logger.info('No local player found yet, waiting for player:ready event');
      }
    } catch (error) {
      this.logger.warn(`Error getting local player, waiting for player:ready event: ${error instanceof Error ? error.message : String(error)}`);
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
      this.mouseState.rightDown = true;
      this.canvas!.style.cursor = 'grabbing';
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
    if (event.button === 2 || this.mouseState.rightDown) {
      this.mouseState.rightDown = false;
    }
    if (event.button === 1 || this.mouseState.middleDown) {
      this.mouseState.middleDown = false;
    }
    if (event.button === 0 || this.mouseState.leftDown) {
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

  private handleLeftClick(_event: MouseEvent): void {}

  private panCamera(deltaX: number, deltaY: number): void {
    if (!this.camera || !this.target) return;

    // Pan along ground plane (XZ) to avoid flipping when dragging
    const worldUp = new THREE.Vector3(0, 1, 0);
    const cameraRight = new THREE.Vector3();
    const cameraDir = new THREE.Vector3();

    // Camera right (column 0)
    cameraRight.setFromMatrixColumn(this.camera.matrix, 0).normalize();
    // Camera forward (projected onto ground plane)
    this.camera.getWorldDirection(cameraDir);
    const cameraForwardOnGround = new THREE.Vector3().copy(cameraDir).projectOnPlane(worldUp).normalize();

    const panSpeed = this.settings.panSpeed * 0.01;
    const panVector = new THREE.Vector3()
      .addScaledVector(cameraRight, -deltaX * panSpeed)
      .addScaledVector(cameraForwardOnGround, -deltaY * panSpeed);

    // Constrain panning to ground plane (no vertical offset)
    panVector.y = 0;
    this.cameraOffset.add(panVector);
  }

  private resetCamera(): void {
    if (!this.target) return;

    this.spherical.radius = 8;
    this.spherical.theta = 0;
    this.spherical.phi = Math.PI * 0.4;
    this.cameraOffset.set(0, 2, 0);
  }

  private onSetTarget(event: { target: CameraTarget }): void {
    this.target = event.target;
    this.logger.info('Target set', this.target.position);
    
    if (this.target) {
      this.initializeCameraPosition();
    }
  }
  
  private onAvatarReady(event: { playerId: string; avatar: THREE.Object3D; camHeight: number }): void {
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

    this.targetPosition.copy(targetPos);
    this.targetPosition.add(this.cameraOffset);
    
    this.cameraPosition.setFromSpherical(this.spherical);
    this.cameraPosition.add(this.targetPosition);
    
    this.camera.position.copy(this.cameraPosition);
    const lookAtVector = toTHREEVector3(new THREE.Vector3(targetPos.x, targetPos.y, targetPos.z));
    this.camera.lookAt(lookAtVector);
    this.camera.updateMatrixWorld();
  }

  update(_deltaTime: number): void {
    if(!this.target || !this.target.position) return;
    const targetPos = this.target.position;

    // Calculate target position
    this.targetPosition.copy(targetPos);
    this.targetPosition.add(this.cameraOffset);

    // Calculate camera position from spherical coordinates
    this.cameraPosition.setFromSpherical(this.spherical);
    this.cameraPosition.add(this.targetPosition);

    // Handle camera collisions
    this.handleCameraCollisions();

    // Calculate look-at target
    this.lookAtTarget.copy(targetPos);
    // Avoid camera aiming underground: use max of target y and camera y - radius
    const minLookY = Math.min(this.targetPosition.y, this.cameraPosition.y - 0.5);
    this.lookAtTarget.y = Math.max(targetPos.y + 1.7, minLookY);

    // Apply camera movement with damping
    const dampingFactor = (this.settings as unknown as { dampingFactor?: number }).dampingFactor ?? 0.1;
      
    this.camera.position.lerp(this.cameraPosition, dampingFactor);
    const lookAtVector = toTHREEVector3(new THREE.Vector3(this.lookAtTarget.x, this.lookAtTarget.y, this.lookAtTarget.z));
    this.camera.lookAt(lookAtVector);
    
    // Do not update world rig here; this can conflict with controls or fallback
    
    this.camera.updateMatrixWorld();
  }

  private handleCameraCollisions(): void {
    if (!this.camera || !this.target) return;

    this.tempDirection.set(
      this.cameraPosition.x - this.targetPosition.x,
      this.cameraPosition.y - this.targetPosition.y, 
      this.cameraPosition.z - this.targetPosition.z
    ).normalize();
    
    this.tempOrigin.set(this.targetPosition.x, this.targetPosition.y, this.targetPosition.z);
    const desiredDistance = this.spherical.radius;
    const mask = this.world.createLayerMask('environment');
    const hit = this.world.raycast(this.tempOrigin, this.tempDirection, desiredDistance, mask);
    if (hit && hit.distance < desiredDistance) {
      const safeDistance = Math.max(hit.distance - 0.5, (this.settings as unknown as { minDistance?: number }).minDistance ?? 1.5);
      this.cameraPosition.copy(this.targetPosition);
      this.cameraPosition.addScaledVector(this.tempDirection, safeDistance);
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