/**
 * Core Camera System
 * camera system that supports multiple control modes:
 * - First Person (pointer lock, WASD movement)
 * - Third Person/MMO(right-click drag, click-to-move)
 * - Top-down/RTS (pan, zoom, click-to-move)
 */

import * as THREE from '../extras/three';
import { toTHREEVector3 } from '../extras/three';
import { System } from './System';

import type { CameraTarget, World } from '../types';
import { EventType } from '../types/events';
import { clamp } from '../utils';
import { hasSystem } from '../utils/SystemUtils';

export enum CameraMode {
  FIRST_PERSON = 'first_person',
  THIRD_PERSON = 'third_person', 
  TOP_DOWN = 'top_down'
}

// CameraTarget interface moved to shared types

export class ClientCameraSystem extends System {
  private camera: THREE.PerspectiveCamera | null = null;
  private target: CameraTarget | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private mode: CameraMode = CameraMode.FIRST_PERSON;
  
  // Camera state for different modes
  private spherical = new THREE.Spherical(6, Math.PI * 0.3, 0); // radius, phi, theta
  private targetPosition = new THREE.Vector3();
  private cameraPosition = new THREE.Vector3();
  private lookAtTarget = new THREE.Vector3();
  private cameraOffset = new THREE.Vector3(0, 2, 0);
  
  // Control settings
  private readonly settings = {
    firstPerson: {
      lookSpeed: 0.1,
      panSpeed: 0.4,
      zoomSpeed: 2,
      minZoom: 1,
      maxZoom: 8
    },
    thirdPerson: {
      minDistance: 3,
      maxDistance: 20,
      minPolarAngle: Math.PI * 0.1,
      maxPolarAngle: Math.PI * 0.8,
      rotateSpeed: 1.0,
      zoomSpeed: 1.0,
      panSpeed: 2.0,
      dampingFactor: 0.05
    },
    topDown: {
      minDistance: 10,
      maxDistance: 50,
      panSpeed: 3.0,
      zoomSpeed: 2.0,
      rotateSpeed: 0.5
    }
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
    super(world);
  }

  async init(): Promise<void> {
    if (!this.world.isClient) return;
    
    // Listen for camera events
    this.world.on(EventType.CAMERA_SET_MODE, this.setCameraMode.bind(this));
    this.world.on(EventType.CAMERA_SET_TARGET, this.onSetTarget.bind(this));
    this.world.on(EventType.CAMERA_RESET, this.resetCamera.bind(this));
    
    // Listen for player events
    this.world.on(EventType.PLAYER_AVATAR_READY, this.onAvatarReady.bind(this));
    
    // Don't detect camera mode here - wait until systems are fully loaded
  }
  
  start(): void {
    this.tryInitialize();
  }
  
  private detectCameraMode(): void {
    // Check if we have systems - if so, default to third person
    if (hasSystem(this.world, 'rpg-player') || hasSystem(this.world, 'rpg-movement') || hasSystem(this.world, 'rpg-entity-manager')) {
      console.log('[ClientCameraSystem] systems detected, switching to third person mode');
      this.setCameraMode({ mode: CameraMode.THIRD_PERSON });
    } else {
      console.log('[ClientCameraSystem] No systems detected, using first person mode');
      this.setCameraMode({ mode: CameraMode.FIRST_PERSON });
    }
  }

  private tryInitialize(): void {
    this.camera = this.world.camera;
    this.canvas = (this.world as World & { graphics?: { renderer?: { domElement: HTMLCanvasElement } } }).graphics?.renderer?.domElement || null;

    if (!this.camera || !this.canvas) {
      setTimeout(() => this.tryInitialize(), 100);
      return;
    }

    this.setupEventListeners();
    
    // Detect camera mode with longer delay to ensure systems are loaded
    setTimeout(() => {
      this.detectCameraMode();
    }, 1000);
    
    // Try to follow local player - check once, then rely on player:ready event
    this.initializePlayerTarget();
    
    console.log(`[ClientCameraSystem] Initialized in ${this.mode} mode`);
  }

  private initializePlayerTarget(): void {
    try {
      const localPlayer = this.world.getPlayer();
      if (localPlayer && localPlayer.id) {
        console.log('[ClientCameraSystem] Setting player as camera target:', localPlayer.id);
        this.onSetTarget({ target: localPlayer });
        
        if (this.mode === CameraMode.THIRD_PERSON) {
          this.initializeCameraPosition();
        }
      } else {
        console.log('[ClientCameraSystem] No local player found yet, waiting for player:ready event');
      }
    } catch (error) {
      console.log('[ClientCameraSystem] Error getting local player, waiting for player:ready event:', error);
    }
  }
  
  private setupEventListeners(): void {
    if (!this.canvas) return;

    this.canvas.addEventListener('contextmenu', this.boundHandlers.contextMenu);
    this.canvas.addEventListener('mousedown', this.boundHandlers.mouseDown);
    this.canvas.addEventListener('mousemove', this.boundHandlers.mouseMove);
    this.canvas.addEventListener('mouseup', this.boundHandlers.mouseUp);
    this.canvas.addEventListener('wheel', this.boundHandlers.mouseWheel);
    this.canvas.addEventListener('mouseleave', this.boundHandlers.mouseLeave);
    document.addEventListener('keydown', this.boundHandlers.keyDown);
  }

  private setCameraMode(event: { mode: CameraMode }): void {
    const oldMode = this.mode;
    this.mode = event.mode;
    
    if (oldMode !== this.mode) {
      this.onCameraModeChanged(oldMode, this.mode);
      console.log(`[ClientCameraSystem] Camera mode changed: ${oldMode} -> ${this.mode}`);
    }
  }
  
  private onCameraModeChanged(oldMode: CameraMode, newMode: CameraMode): void {
    // Handle mode-specific setup
    switch (newMode) {
      case CameraMode.FIRST_PERSON: {
        // Pointer lock disabled for UI
        break;
      }
        
      case CameraMode.THIRD_PERSON: {
        // Pointer lock already disabled for UI
        break;
      }
        
      case CameraMode.TOP_DOWN:
        // Set up top-down view
        this.spherical.phi = Math.PI * 0.05; // Very high angle
        this.spherical.radius = 20;
        break;
    }
  }

  private onMouseDown(event: MouseEvent): void {
    if (this.mode === CameraMode.FIRST_PERSON) return; // Handled by pointer lock

    if (event.button === 2) { // Right mouse button
      this.mouseState.rightDown = true;
      this.canvas!.style.cursor = 'grabbing';
    } else if (event.button === 1) { // Middle mouse button
      this.mouseState.middleDown = true;
      this.canvas!.style.cursor = 'move';
      event.preventDefault();
    } else if (event.button === 0) { // Left mouse button
      this.mouseState.leftDown = true;
      this.handleLeftClick(event);
    }

    this.mouseState.lastPosition.set(event.clientX, event.clientY);
  }

  private onMouseMove(event: MouseEvent): void {
    if (this.mode === CameraMode.FIRST_PERSON) return;

    if (!this.mouseState.rightDown && !this.mouseState.middleDown) return;

    this.mouseState.delta.set(
      event.clientX - this.mouseState.lastPosition.x,
      event.clientY - this.mouseState.lastPosition.y
    );

    if (this.mouseState.rightDown) {
      // Rotate camera around target
      this.spherical.theta -= this.mouseState.delta.x * this.settings.thirdPerson.rotateSpeed * 0.01;
      this.spherical.phi += this.mouseState.delta.y * this.settings.thirdPerson.rotateSpeed * 0.01;
      
      this.spherical.phi = clamp(
        this.spherical.phi, 
        this.settings.thirdPerson.minPolarAngle, 
        this.settings.thirdPerson.maxPolarAngle
      );
    }

    if (this.mouseState.middleDown) {
      this.panCamera(this.mouseState.delta.x, this.mouseState.delta.y);
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
    
    const settings = this.mode === CameraMode.THIRD_PERSON 
      ? this.settings.thirdPerson 
      : this.settings.topDown;
    
    const zoomDelta = event.deltaY * settings.zoomSpeed * 0.001;
    this.spherical.radius += zoomDelta;
    
    this.spherical.radius = clamp(this.spherical.radius, settings.minDistance, settings.maxDistance);
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

  private handleLeftClick(event: MouseEvent): void {
    if (this.mode === CameraMode.FIRST_PERSON) return;
    
    // Emit click-to-move event for movement systems
    const rect = this.canvas!.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    
    this.world.emit(EventType.CAMERA_CLICK_WORLD, {
      screenPosition: { x: event.clientX, y: event.clientY },
      normalizedPosition: mouse,
      target: this.target
    });
  }

  private panCamera(deltaX: number, deltaY: number): void {
    if (!this.camera || !this.target) return;

    const cameraRight = new THREE.Vector3();
    const cameraUp = new THREE.Vector3();
    
    cameraRight.setFromMatrixColumn(this.camera.matrix, 0);
    cameraUp.setFromMatrixColumn(this.camera.matrix, 1);
    
    const panVector = new THREE.Vector3();
    const panSpeed = this.mode === CameraMode.THIRD_PERSON 
      ? this.settings.thirdPerson.panSpeed 
      : this.settings.topDown.panSpeed;
      
    panVector.addScaledVector(cameraRight, -deltaX * panSpeed * 0.01);
    panVector.addScaledVector(cameraUp, deltaY * panSpeed * 0.01);
    
    this.cameraOffset.add(panVector);
  }

  private resetCamera(): void {
    if (!this.target) return;

    switch (this.mode) {
      case CameraMode.FIRST_PERSON:
        // Reset to default first person
        break;
        
      case CameraMode.THIRD_PERSON:
        this.spherical.radius = 8;
        this.spherical.theta = 0;
        this.spherical.phi = Math.PI * 0.4;
        this.cameraOffset.set(0, 2, 0);
        break;
        
      case CameraMode.TOP_DOWN:
        this.spherical.radius = 20;
        this.spherical.theta = 0;
        this.spherical.phi = Math.PI * 0.05;
        this.cameraOffset.set(0, 0, 0);
        break;
    }
  }

  private onSetTarget(event: { target: CameraTarget }): void {
    this.target = event.target;
    console.log('[ClientCameraSystem] Target set:', this.target);
    
    if (this.target && this.mode !== CameraMode.FIRST_PERSON) {
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

    const targetPos = this.target.position || this.target.position;
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
    if (!this.camera || !this.target || this.mode === CameraMode.FIRST_PERSON) return;

    const targetPos = this.target.position || this.target.position;
    if (!targetPos) return;

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
    this.lookAtTarget.y += 1.7; // Look at head level

    // Apply camera movement with damping
    const dampingFactor = this.mode === CameraMode.THIRD_PERSON 
      ? this.settings.thirdPerson.dampingFactor 
      : 0.1;
      
    this.camera.position.lerp(this.cameraPosition, dampingFactor);
    const lookAtVector = toTHREEVector3(new THREE.Vector3(this.lookAtTarget.x, this.lookAtTarget.y, this.lookAtTarget.z));
    this.camera.lookAt(lookAtVector);
    
    // Update world rig position to match camera
    if (this.world.rig) {
      this.world.rig.position.copy(this.camera.position);
      this.world.rig.quaternion.copy(this.camera.quaternion);
    }
    
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
    this.raycaster.set(toTHREEVector3(this.tempOrigin), toTHREEVector3(this.tempDirection));
    
    // Get world geometry for collision testing
    const scene = this.world.stage.scene;
    const worldObjects = scene?.children.filter((child) => 
      child.userData?.collision === true || 
      child.userData?.type === 'terrain' ||
      child.userData?.type === 'building'
    ) || [];
    
    if (worldObjects.length > 0) {
      const intersects = this.raycaster.intersectObjects(worldObjects, true);
      
      if (intersects.length > 0) {
        const hit = intersects[0];
        const hitDistance = hit.distance;
        const desiredDistance = this.spherical.radius;
        
        if (hitDistance < desiredDistance) {
          const safeDistance = Math.max(hitDistance - 0.5, this.settings.thirdPerson.minDistance);
          this.cameraPosition.copy(this.targetPosition);
          this.cameraPosition.addScaledVector(this.tempDirection, safeDistance);
        }
      }
    }
  }

  // Public API methods for testing and external access
  public setTarget(target: CameraTarget): void {
    this.target = target;
    this.world.emit(EventType.CAMERA_TARGET_CHANGED, { target });
  }
  
  public setMode(mode: CameraMode): void {
    this.setCameraMode({ mode });
  }

  public getCameraInfo(): { 
    camera: THREE.PerspectiveCamera | null; 
    mode: CameraMode; 
    target: CameraTarget | null;
    offset: number[];
    position: number[] | null;
    isControlling: boolean;
  } {
    return {
      camera: this.camera,
      mode: this.mode,
      target: this.target,
      offset: this.cameraOffset.toArray() as number[],
      position: this.camera?.position.toArray() || null,
      isControlling: this.mouseState.rightDown || this.mouseState.middleDown
    };
  }

  destroy(): void {
    if (this.canvas) {
      this.canvas.removeEventListener('contextmenu', this.boundHandlers.contextMenu);
      this.canvas.removeEventListener('mousedown', this.boundHandlers.mouseDown);
      this.canvas.removeEventListener('mousemove', this.boundHandlers.mouseMove);
      this.canvas.removeEventListener('mouseup', this.boundHandlers.mouseUp);
      this.canvas.removeEventListener('wheel', this.boundHandlers.mouseWheel);
      this.canvas.removeEventListener('mouseleave', this.boundHandlers.mouseLeave);
      document.removeEventListener('keydown', this.boundHandlers.keyDown);
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