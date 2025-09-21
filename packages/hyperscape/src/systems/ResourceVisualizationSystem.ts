/**
 * Resource Visualization System
 * Creates visible 3D meshes for resources like trees, rocks, etc.
 * This ensures resources are actually visible in the world for interaction
 */

import THREE from '../extras/three';
import { SystemBase } from './SystemBase';
import type { World } from '../types';
import { EventType } from '../types/events';
import type { Position3D } from '../types/base-types';
import { Logger } from '../utils/Logger';

interface VisualResource {
  id: string;
  type: string;
  position: Position3D;
  mesh: THREE.Mesh;
}

export class ResourceVisualizationSystem extends SystemBase {
  private resources = new Map<string, VisualResource>();
  private resourceModels: Record<string, THREE.BufferGeometry> = {};
  private materials: Record<string, THREE.Material> = {};
  
  constructor(world: World) {
    super(world, { 
      name: 'resource-visualization', 
      dependencies: { required: [], optional: ['stage'] },
      autoCleanup: true 
    });
  }

  async init(): Promise<void> {
    // Create basic geometries for different resource types
    this.createResourceModels();
    
    // Listen for resource spawn events
    this.subscribe(EventType.RESOURCE_SPAWN_POINTS_REGISTERED, (data: {
      spawnPoints: Array<{
        position: Position3D;
        type: string;
        subType: string;
        id: string;
      }>;
    }) => {
      data.spawnPoints.forEach(point => {
        this.createResourceMesh(point);
      });
    });

    // Listen for test tree creation
    this.subscribe(EventType.TEST_TREE_CREATE, (data: {
      id: string;
      position: Position3D;
      type: string;
      color?: string;
      size?: { x: number; y: number; z: number };
    }) => {
      this.createTreeMesh(data);
    });

    // Listen for resource depletion
    this.subscribe(EventType.RESOURCE_DEPLETED, (data: { resourceId: string }) => {
      this.hideResource(data.resourceId);
    });

    // Listen for resource respawn
    this.subscribe(EventType.RESOURCE_RESPAWNED, (data: { resourceId: string }) => {
      this.showResource(data.resourceId);
    });

    // Listen for test tree removal
    this.subscribe(EventType.TEST_TREE_REMOVE, (data: { id: string }) => {
      this.removeResource(data.id);
    });
  }

  private createResourceModels(): void {
    // Tree model - cylinder trunk + cone leaves
    const treeGroup = new THREE.BufferGeometry();
    
    // Simple tree using basic shapes
    const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.7, 4, 8);
    const leavesGeometry = new THREE.ConeGeometry(2, 3, 8);
    
    // Store geometries
    this.resourceModels.tree = trunkGeometry;
    this.resourceModels.leaves = leavesGeometry;
    
    // Rock model - irregular dodecahedron
    this.resourceModels.rock = new THREE.DodecahedronGeometry(1, 0);
    
    // Fishing spot - torus to represent ripples
    this.resourceModels.fishing = new THREE.TorusGeometry(2, 0.2, 4, 16);
    
    // Create materials
    this.materials.trunk = new THREE.MeshLambertMaterial({ 
      color: 0x8B4513 // Brown
    });
    
    this.materials.leaves = new THREE.MeshLambertMaterial({ 
      color: 0x228B22 // Forest green
    });
    
    this.materials.oak_leaves = new THREE.MeshLambertMaterial({ 
      color: 0x9ACD32 // Yellow-green
    });
    
    this.materials.rock = new THREE.MeshLambertMaterial({ 
      color: 0x808080 // Gray
    });
    
    this.materials.water = new THREE.MeshLambertMaterial({ 
      color: 0x4682B4, // Steel blue
      transparent: true,
      opacity: 0.7
    });
  }

  private createResourceMesh(spawnPoint: {
    position: Position3D;
    type: string;
    subType: string;
    id: string;
  }): void {
    let mesh: THREE.Mesh;
    
    if (spawnPoint.type === 'tree' || spawnPoint.subType?.includes('tree')) {
      mesh = this.createTreeMeshInternal(
        spawnPoint.subType || 'normal_tree',
        spawnPoint.position
      );
    } else if (spawnPoint.type === 'rock' || spawnPoint.subType?.includes('rock')) {
      mesh = this.createRockMesh(spawnPoint.position);
    } else if (spawnPoint.type === 'fish' || spawnPoint.subType?.includes('fish')) {
      mesh = this.createFishingSpotMesh(spawnPoint.position);
    } else {
      // Default to tree for unknown types
      mesh = this.createTreeMeshInternal('normal_tree', spawnPoint.position);
    }
    
    mesh.userData.resourceId = spawnPoint.id;
    mesh.userData.resourceType = spawnPoint.type;
    mesh.userData.clickable = true; // Mark as clickable for interaction
    mesh.name = `resource_${spawnPoint.id}`;
    
    // Add to scene
    if (this.world.stage?.scene) {
      this.world.stage.scene.add(mesh);
    }
    
    // Store reference
    this.resources.set(spawnPoint.id, {
      id: spawnPoint.id,
      type: spawnPoint.type,
      position: spawnPoint.position,
      mesh
    });
  }

  private createTreeMeshInternal(treeType: string, position: Position3D): THREE.Mesh {
    // Create a group to hold trunk and leaves
    const treeGroup = new THREE.Group();
    
    // Create trunk
    const trunk = new THREE.Mesh(
      this.resourceModels.tree,
      this.materials.trunk
    );
    trunk.position.y = 2; // Half height of trunk
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    
    // Create leaves based on tree type
    const leavesMaterial = treeType === 'oak_tree' 
      ? this.materials.oak_leaves 
      : this.materials.leaves;
      
    const leaves = new THREE.Mesh(
      this.resourceModels.leaves,
      leavesMaterial
    );
    leaves.position.y = 5; // Above trunk
    leaves.castShadow = true;
    leaves.receiveShadow = true;
    
    treeGroup.add(trunk);
    treeGroup.add(leaves);
    
    // Convert group to single mesh for simplicity
    const combinedGeometry = new THREE.BoxGeometry(3, 6, 3); // Simplified bounding box
    const combinedMesh = new THREE.Mesh(combinedGeometry, this.materials.leaves);
    
    // Actually, let's just use the group directly by wrapping it
    const wrapperMesh = new THREE.Mesh();
    wrapperMesh.add(treeGroup);
    
    wrapperMesh.position.set(
      position.x,
      position.y || 0,
      position.z
    );
    
    return wrapperMesh;
  }

  private createTreeMesh(data: {
    id: string;
    position: Position3D;
    type: string;
    color?: string;
    size?: { x: number; y: number; z: number };
  }): void {
    // For test trees, create a colored box as specified
    const size = data.size || { x: 2, y: 5, z: 2 }; // Slightly bigger for easier clicking
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const material = new THREE.MeshLambertMaterial({ 
      color: data.color || 0x228B22 
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      data.position.x,
      (data.position.y || 0) + size.y / 2, // Place on ground
      data.position.z
    );
    
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.resourceId = data.id;
    mesh.userData.resourceType = 'tree';
    mesh.userData.clickable = true; // Mark as clickable for interaction system
    mesh.name = `test_tree_${data.id}`;
    
    // Add to scene
    if (this.world.stage?.scene) {
      this.world.stage.scene.add(mesh);
    }
    
    // Store reference
    this.resources.set(data.id, {
      id: data.id,
      type: data.type,
      position: data.position,
      mesh
    });
  }

  private createRockMesh(position: Position3D): THREE.Mesh {
    const mesh = new THREE.Mesh(
      this.resourceModels.rock,
      this.materials.rock
    );
    
    mesh.position.set(
      position.x,
      (position.y || 0) + 0.5,
      position.z
    );
    
    // Random rotation for variety
    mesh.rotation.x = Math.random() * Math.PI;
    mesh.rotation.y = Math.random() * Math.PI * 2;
    
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  private createFishingSpotMesh(position: Position3D): THREE.Mesh {
    const mesh = new THREE.Mesh(
      this.resourceModels.fishing,
      this.materials.water
    );
    
    mesh.position.set(
      position.x,
      position.y || 0,
      position.z
    );
    
    mesh.rotation.x = Math.PI / 2; // Lay flat
    
    return mesh;
  }

  private hideResource(resourceId: string): void {
    const resource = this.resources.get(resourceId);
    if (resource && resource.mesh) {
      resource.mesh.visible = false;
    }
  }

  private showResource(resourceId: string): void {
    const resource = this.resources.get(resourceId);
    if (resource && resource.mesh) {
      resource.mesh.visible = true;
    }
  }

  private removeResource(resourceId: string): void {
    const resource = this.resources.get(resourceId);
    if (resource && resource.mesh) {
      if (this.world.stage?.scene) {
        this.world.stage.scene.remove(resource.mesh);
      }
      
      // Dispose of geometry and material
      if (resource.mesh.geometry) {
        resource.mesh.geometry.dispose();
      }
      if (resource.mesh.material) {
        if (Array.isArray(resource.mesh.material)) {
          resource.mesh.material.forEach(mat => mat.dispose());
        } else {
          resource.mesh.material.dispose();
        }
      }
      
      this.resources.delete(resourceId);
    }
  }

  update(_deltaTime: number): void {
    // Could add animation here (e.g., slight sway for trees)
  }

  destroy(): void {
    // Clean up all resources
    for (const [id, resource] of this.resources) {
      this.removeResource(id);
    }
    
    // Dispose of shared geometries
    for (const geometry of Object.values(this.resourceModels)) {
      geometry.dispose();
    }
    
    // Dispose of shared materials
    for (const material of Object.values(this.materials)) {
      material.dispose();
    }
    
    this.resources.clear();
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

