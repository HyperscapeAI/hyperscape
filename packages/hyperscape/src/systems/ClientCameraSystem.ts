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
  private spherical = new THREE.Spherical(6, Math.PI * 0.3, 0); // current radius, phi, theta
  private targetSpherical = new THREE.Spherical(6, Math.PI * 0.3, 0); // target spherical for smoothing
  private effectiveRadius = 6; // collision-adjusted radius used only for positioning
  private targetPosition = new THREE.Vector3();
  private smoothedTarget = new THREE.Vector3();
  private cameraPosition = new THREE.Vector3();
  private lookAtTarget = new THREE.Vector3();
  private cameraOffset = new THREE.Vector3(0, 2, 0);
  
  // Control settings
  private readonly settings = {
      // RS3-like zoom bounds
      minDistance: 2.5,
      maxDistance: 15.0,
      // RS3-like pitch limits: ~10° to ~80°
      minPolarAngle: Math.PI * 0.18,
      maxPolarAngle: Math.PI * 0.45,
      // RS3-like feel
      rotateSpeed: 0.9,
      zoomSpeed: 1.2,
      panSpeed: 2.0,
      // Separate damping for crisp zoom vs smooth rotation
      rotationDampingFactor: 0.12,
      zoomDampingFactor: 0.22,
      cameraLerpFactor: 0.15,
      invertY: false,
      // Discrete zoom step per wheel notch (world units)
      zoomStep: 0.8
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

    this.canvas.addEventListener('mousedown', this.boundHandlers.mouseDown as EventListener);
    this.canvas.addEventListener('mousemove', this.boundHandlers.mouseMove as EventListener);
    this.canvas.addEventListener('mouseup', this.boundHandlers.mouseUp as EventListener);
    this.canvas.addEventListener('wheel', this.boundHandlers.mouseWheel as EventListener);
    this.canvas.addEventListener('mouseleave', this.boundHandlers.mouseLeave as EventListener);
    document.addEventListener('keydown', this.boundHandlers.keyDown as EventListener);
  }

  private onMouseDown(event: MouseEvent): void {
    if (event.button === 2) { // Right mouse button (no orbit in RS3 default)
      this.mouseState.rightDown = true;
      // Do not change cursor; InteractionSystem handles menu
    } else if (event.button === 1) { // Middle mouse button (orbit)
      this.mouseState.middleDown = true;
      // RS3: MMB drag orbits as well
      this.canvas!.style.cursor = 'grabbing';
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

    // RS3: ONLY MMB-drag orbits; RMB opens context menu, LMB selects/moves
    if (this.mouseState.middleDown) {
      const invert = (this.settings as unknown as { invertY?: boolean }).invertY === true ? -1 : 1;
      // RS3-like: keep rotation responsive when fully zoomed out
      const minR = (this.settings as unknown as { minDistance?: number }).minDistance ?? 2.5;
      const maxR = (this.settings as unknown as { maxDistance?: number }).maxDistance ?? 15.0;
      const r = THREE.MathUtils.clamp(this.spherical.radius, minR, maxR);
      const t = (r - minR) / (maxR - minR); // 0 at min zoom, 1 at max zoom
      const speedScale = THREE.MathUtils.lerp(1.0, 1.3, t); // slightly faster when zoomed out
      const inputScale = this.settings.rotateSpeed * 0.01 * speedScale;
      this.targetSpherical.theta -= this.mouseState.delta.x * inputScale;
      this.targetSpherical.phi -= invert * this.mouseState.delta.y * inputScale;
      this.targetSpherical.phi = clamp(
        this.targetSpherical.phi,
        this.settings.minPolarAngle,
        this.settings.maxPolarAngle
      );
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
    
    // RS3: crisp notched zoom with smoothing toward target
    const sign = Math.sign(event.deltaY);
    if (sign !== 0) {
      // Heuristic for multiple notches (trackpads may send many small deltas)
      const steps = Math.max(1, Math.min(5, Math.round(Math.abs(event.deltaY) / 100)));
      this.targetSpherical.radius += sign * steps * (this.settings as unknown as { zoomStep?: number }).zoomStep!;
    }
    this.targetSpherical.radius = clamp(this.targetSpherical.radius, this.settings.minDistance, this.settings.maxDistance);
    // Snap effective radius to user zoom immediately; collisions will temporarily override below
    this.effectiveRadius = this.targetSpherical.radius;
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

    this.targetSpherical.radius = 8;
    this.targetSpherical.theta = 0;
    this.targetSpherical.phi = Math.PI * 0.4;
    this.spherical.radius = this.targetSpherical.radius;
    this.spherical.theta = this.targetSpherical.theta;
    this.spherical.phi = this.targetSpherical.phi;
    // RS3 shoulder/head height
    this.cameraOffset.set(0, 1.8, 0);
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
    
    this.effectiveRadius = this.spherical.radius;
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

    // Calculate and smooth target position to damp tiny physics jitter
    this.targetPosition.copy(targetPos);
    this.targetPosition.add(this.cameraOffset);
    if (this.smoothedTarget.lengthSq() === 0) {
      this.smoothedTarget.copy(this.targetPosition);
    } else {
      const targetLerp = 0.15;
      this.smoothedTarget.lerp(this.targetPosition, targetLerp);
    }

    // Smooth spherical toward target for RS3-like inertia
    const rotationDamping = (this.settings as unknown as { rotationDampingFactor?: number }).rotationDampingFactor ?? 0.12;
    const zoomDamping = (this.settings as unknown as { zoomDampingFactor?: number }).zoomDampingFactor ?? 0.22;
    // Keep radius lerp snappy to avoid perceived zoom drift
    this.spherical.radius += (this.targetSpherical.radius - this.spherical.radius) * zoomDamping;
    this.spherical.phi += (this.targetSpherical.phi - this.spherical.phi) * rotationDamping;
    // Interpolate theta via shortest arc
    const dTheta = this.shortestAngleDelta(this.spherical.theta, this.targetSpherical.theta);
    this.spherical.theta += dTheta * rotationDamping;

    // Hard clamp after smoothing to enforce strict RS3-like limits
    this.spherical.radius = clamp(
      this.spherical.radius,
      (this.settings as unknown as { minDistance?: number }).minDistance ?? 2.5,
      (this.settings as unknown as { maxDistance?: number }).maxDistance ?? 15.0
    );

    // Collision-aware effective radius (does not change stored zoom)
    const desiredDistance = this.spherical.radius;
    const collisionDamping = 0.3;
    const isOrbiting = this.mouseState.middleDown === true;
    if (isOrbiting) {
      // RS3: while rotating around the character, keep exact user-set distance
      this.effectiveRadius = desiredDistance;
    } else {
      const collidedDistance = this.computeCollisionAdjustedDistance(desiredDistance);
      const targetEffective = Math.min(desiredDistance, collidedDistance);
      // If no collision limiting, lock effective radius exactly to desired to avoid perceived drift
      if (Math.abs(collidedDistance - desiredDistance) < 1e-2) {
        this.effectiveRadius = desiredDistance;
      } else {
        this.effectiveRadius += (targetEffective - this.effectiveRadius) * collisionDamping;
      }
    }

    // Calculate camera position from spherical coordinates using effective radius
    const tempSpherical = new THREE.Spherical(this.effectiveRadius, this.spherical.phi, this.spherical.theta);
    this.cameraPosition.setFromSpherical(tempSpherical);
    this.cameraPosition.add(this.smoothedTarget);

    // No direct camera collision position mutation; handled via effectiveRadius smoothing

    // Calculate look-at target
    this.lookAtTarget.copy(this.smoothedTarget);
    // Avoid camera aiming underground: use max of target y and camera y - radius
    const minLookY = Math.min(this.targetPosition.y, this.cameraPosition.y - 0.5);
    this.lookAtTarget.y = Math.max(targetPos.y + 1.7, minLookY);

    // Apply camera movement with damping
    const cameraLerp = (this.settings as unknown as { cameraLerpFactor?: number }).cameraLerpFactor ?? 0.15;
    this.camera.position.lerp(this.cameraPosition, cameraLerp);
    const lookAtVector = toTHREEVector3(new THREE.Vector3(this.lookAtTarget.x, this.lookAtTarget.y, this.lookAtTarget.z));
    this.camera.lookAt(lookAtVector);
    
    // Do not update world rig here; this can conflict with controls or fallback
    
    this.camera.updateMatrixWorld();
  }

  private shortestAngleDelta(a: number, b: number): number {
    let delta = (b - a) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  }

  private computeCollisionAdjustedDistance(desiredDistance: number): number {
    if (!this.camera || !this.target) return desiredDistance;

    // Direction from target to current ideal camera position
    this.tempDirection.set(
      this.cameraPosition.x - this.targetPosition.x,
      this.cameraPosition.y - this.targetPosition.y,
      this.cameraPosition.z - this.targetPosition.z
    ).normalize();

    this.tempOrigin.set(this.targetPosition.x, this.targetPosition.y, this.targetPosition.z);
    const mask = this.world.createLayerMask('environment');
    const hit = this.world.raycast(this.tempOrigin, this.tempDirection, desiredDistance, mask);
    if (hit && hit.distance < desiredDistance) {
      const minDist = (this.settings as unknown as { minDistance?: number }).minDistance ?? 1.5;
      const margin = 0.4;
      return Math.max(Math.min(desiredDistance, hit.distance - margin), minDist);
    }
    return desiredDistance;
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