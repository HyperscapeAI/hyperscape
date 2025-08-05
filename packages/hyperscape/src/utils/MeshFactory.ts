/**
 * Mesh Factory Utility
 * 
 * Centralizes mesh creation logic to eliminate duplicate geometry/material creation
 * across entities and systems. Provides consistent visual styles and reduces
 * maintenance burden.
 */

import * as THREE from '../extras/three';

export interface MeshOptions {
  color?: number;
  emissive?: number;
  emissiveIntensity?: number;
  wireframe?: boolean;
  transparent?: boolean;
  opacity?: number;
  size?: { x: number; y: number; z: number }
  radius?: number;
  height?: number;
}

export class MeshFactory {
  
  /**
   * Create a character mesh (capsule geometry) for players and humanoid mobs
   */
  static createCharacterMesh(options: MeshOptions = {}): THREE.Mesh {
    const {
      color = 0x4169e1,
      emissive = 0x1a3470,
      emissiveIntensity = 0.2,
      radius = 0.4,
      height = 1.2
    } = options;

    const geometry = new THREE.CapsuleGeometry(radius, height, 4, 8);
    const material = new THREE.MeshPhongMaterial({
      color,
      emissive,
      emissiveIntensity
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  /**
   * Create a mob mesh (box geometry) for non-humanoid enemies
   */
  static createMobMesh(options: MeshOptions = {}): THREE.Mesh {
    const {
      color = 0x8b4513,
      emissive = 0x2d1608,
      emissiveIntensity = 0.1,
      size = { x: 0.8, y: 0.8, z: 0.8 }
    } = options;

    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const material = new THREE.MeshPhongMaterial({
      color,
      emissive,
      emissiveIntensity
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  /**
   * Create an item mesh (smaller box or sphere geometry) for ground items
   */
  static createItemMesh(options: MeshOptions = {}): THREE.Mesh {
    const {
      color = 0xffd700,
      emissive = 0x332200,
      emissiveIntensity = 0.3,
      size = { x: 0.3, y: 0.3, z: 0.3 }
    } = options;

    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const material = new THREE.MeshPhongMaterial({
      color,
      emissive,
      emissiveIntensity
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = false; // Items typically don't receive shadows
    
    return mesh;
  }

  /**
   * Create a test cube mesh for visual testing systems
   */
  static createTestCube(options: MeshOptions = {}): THREE.Mesh {
    const {
      color = 0xff0000,
      size = { x: 1, y: 1, z: 1 },
      wireframe = false,
      transparent = false,
      opacity = 1.0
    } = options;

    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const material = new THREE.MeshBasicMaterial({
      color,
      wireframe,
      transparent,
      opacity
    });

    const mesh = new THREE.Mesh(geometry, material);
    // Test cubes typically don't need shadows
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    
    return mesh;
  }

  /**
   * Create a resource mesh (tree, rock, etc.) for gathering resources
   */
  static createResourceMesh(options: MeshOptions = {}): THREE.Mesh {
    const {
      color = 0x228b22,
      emissive = 0x0a2e0a,
      emissiveIntensity = 0.1,
      size = { x: 1.0, y: 2.0, z: 1.0 }
    } = options;

    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const material = new THREE.MeshPhongMaterial({
      color,
      emissive,
      emissiveIntensity
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  /**
   * Create a building/structure mesh for NPCs, banks, stores
   */
  static createBuildingMesh(options: MeshOptions = {}): THREE.Mesh {
    const {
      color = 0x8b7355,
      emissive = 0x1f1a13,
      emissiveIntensity = 0.05,
      size = { x: 2.0, y: 3.0, z: 2.0 }
    } = options;

    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const material = new THREE.MeshPhongMaterial({
      color,
      emissive,
      emissiveIntensity
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  /**
   * Create a sphere mesh for special effects, indicators, etc.
   */
  static createSphereMesh(options: MeshOptions = {}): THREE.Mesh {
    const {
      color = 0x00ffff,
      emissive = 0x003333,
      emissiveIntensity = 0.2,
      radius = 0.5,
      transparent = false,
      opacity = 1.0
    } = options;

    const geometry = new THREE.SphereGeometry(radius, 16, 16);
    const material = new THREE.MeshPhongMaterial({
      color,
      emissive,
      emissiveIntensity,
      transparent,
      opacity
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    return mesh;
  }

  /**
   * Apply common mesh properties for game objects
   */
  static setupGameMesh(mesh: THREE.Mesh, name?: string): THREE.Mesh {
    if (name) {
      mesh.name = name;
    }
    
    // Common frustum culling settings
    mesh.frustumCulled = true;
    
    // Set up user data for raycasting/selection
    mesh.userData = {
      isGameObject: true,
      createdAt: Date.now()
    };
    
    return mesh;
  }

  /**
   * Create a mesh with glowing effect for special items/indicators
   */
  static createGlowingMesh(baseMesh: THREE.Mesh, glowColor: number = 0xffffff): THREE.Group {
    const group = new THREE.Group();
    
    // Add the base mesh
    group.add(baseMesh);
    
    // Create glow effect (slightly larger transparent mesh)
    const glowGeometry = baseMesh.geometry.clone();
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide
    });
    
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    glowMesh.scale.multiplyScalar(1.1);
    group.add(glowMesh);
    
    return group;
  }
}