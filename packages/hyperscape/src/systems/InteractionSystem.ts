import { System } from './System';
import type { World } from '../World';
import * as THREE from 'three';

const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();

/**
 * InteractionSystem - Handles click-to-move with visual feedback
 */
export class InteractionSystem extends System {
  private canvas: HTMLCanvasElement | null = null;
  private targetMarker: THREE.Mesh | null = null;
  private targetPosition: THREE.Vector3 | null = null;
  
  constructor(world: World) {
    super(world);
  }
  
  override start(): void {
    this.canvas = this.world.graphics?.renderer?.domElement ?? null;
    if (!this.canvas) return;
    
    // Bind once so we can remove correctly on destroy
    this.onCanvasClick = this.onCanvasClick.bind(this);
    this.onRightClick = this.onRightClick.bind(this);
    
    // Use regular bubbling phase (false) so resource clicks can prevent movement
    // ResourceInteractionSystem uses capture phase, so it runs first
    this.canvas.addEventListener('click', this.onCanvasClick, false);
    this.canvas.addEventListener('contextmenu', this.onRightClick, false);
    
    // Create target marker (visual indicator)
    this.createTargetMarker();
    
    console.log('[InteractionSystem] Click-to-move enabled with visual feedback');
  }
  
  private createTargetMarker(): void {
    // Create a circle marker for the target position
    const geometry = new THREE.RingGeometry(0.3, 0.5, 32);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x00ff00, 
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7
    });
    this.targetMarker = new THREE.Mesh(geometry, material);
    this.targetMarker.rotation.x = -Math.PI / 2; // Lay flat on ground
    this.targetMarker.position.y = 0.01; // Slightly above ground to avoid z-fighting
    this.targetMarker.visible = false;
    
    const scene = this.world.stage?.scene;
    if (scene) {
      scene.add(this.targetMarker);
    }
  }
  
  private onRightClick = (event: MouseEvent): void => {
    event.preventDefault();
    // Cancel movement on right click
    this.clearTarget();
  };
  
  private clearTarget(): void {
    if (this.targetMarker) {
      this.targetMarker.visible = false;
    }
    this.targetPosition = null;
    
    // Send cancel movement to server
    if (this.world.network?.send) {
      this.world.network.send('moveRequest', {
        target: null,
        cancel: true
      });
    }
    console.log('[InteractionSystem] Movement cancelled');
  }
  
  private onCanvasClick = (event: MouseEvent): void => {
    if (event.button !== 0) return; // Left click only
    if (!this.canvas || !this.world.camera) return;
    
    // Check if event was already handled by another system (e.g., ResourceInteractionSystem)
    if (event.defaultPrevented) {
      console.log('[InteractionSystem] Click already handled by another system');
      return;
    }
    
    // Now prevent default for our handling
    event.preventDefault();
    
    // Calculate mouse position
    const rect = this.canvas.getBoundingClientRect();
    _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Raycast to find click position
    _raycaster.setFromCamera(_mouse, this.world.camera);
    
    // Try to intersect with terrain first
    const scene = this.world.stage?.scene;
    const terrain = scene?.children.find(obj => obj.name === 'terrain');
    let target: THREE.Vector3 | null = null;
    
    if (terrain) {
      const intersects = _raycaster.intersectObject(terrain, true);
      if (intersects.length > 0) {
        target = intersects[0].point;
      }
    }
    
    // Fallback to ground plane at Y=0
    if (!target) {
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      target = new THREE.Vector3();
      _raycaster.ray.intersectPlane(plane, target);
    }
    
    if (target) {
      console.log(`[InteractionSystem] Click at (${target.x.toFixed(1)}, ${target.y.toFixed(1)}, ${target.z.toFixed(1)})`);
      
      // Clear any previous target
      if (this.targetMarker && this.targetMarker.visible) {
        // Hide old marker immediately
        this.targetMarker.visible = false;
      }
      
      // Update target position and show NEW marker
      this.targetPosition = target.clone();
      if (this.targetMarker) {
        this.targetMarker.position.set(target.x, target.y + 0.01, target.z);
        this.targetMarker.visible = true;
      }
      
      // ONLY send move request to server - no local movement!
      // Server is completely authoritative for movement
      if (this.world.network?.send) {
        this.world.network.send('moveRequest', {
          target: [target.x, target.y, target.z],
          runMode: event.shiftKey,
          cancel: false  // Explicitly not cancelling
        });
        console.log('[InteractionSystem] Sent move request to server (server-authoritative)');
      }
    }
  };
  
  override update(): void {
    // Animate target marker
    if (this.targetMarker && this.targetMarker.visible) {
      const time = Date.now() * 0.001;
      // Pulse effect
      const scale = 1 + Math.sin(time * 4) * 0.1;
      this.targetMarker.scale.set(scale, scale, scale);
      // Rotation effect
      this.targetMarker.rotation.z = time * 2;
      
      // Hide marker when player reaches target
      const player = this.world.entities.player;
      if (player && this.targetPosition) {
        const distance = player.position.distanceTo(this.targetPosition);
        if (distance < 0.5) {
          this.targetMarker.visible = false;
          this.targetPosition = null;
        }
      }
    }
  }
  
  override destroy(): void {
    if (this.canvas) {
      this.canvas.removeEventListener('click', this.onCanvasClick);
      this.canvas.removeEventListener('contextmenu', this.onRightClick);
    }
    const scene = this.world.stage?.scene;
    if (this.targetMarker && scene) {
      scene.remove(this.targetMarker);
      this.targetMarker.geometry.dispose();
      (this.targetMarker.material as THREE.Material).dispose();
    }
  }
}
