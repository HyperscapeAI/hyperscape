import THREE from '../extras/three';
import type { World } from '../World';
import { EventType } from '../types/events';
import { SystemBase } from './SystemBase';

interface CubeData {
  position: { x: number; y: number; z: number };
  color: number;
  size: number;
  hasPhysics: boolean;
}

interface StoredCube {
  mesh: THREE.Mesh;
  data: CubeData & { id: string };
}

/**
 * TestPhysicsCube System
 * 
 * Creates a simple cube with physics to test basic 3D rendering and physics integration.
 * This helps verify that systems can create visible objects with physics behavior.
 */
export class TestPhysicsCube extends SystemBase {
  private testCubes = new Map<string, StoredCube>();
  private cubeCounter = 0;
  
  constructor(world: World) {
    super(world, {
      name: 'test-physics-cube',
      dependencies: {
        required: [], // Test physics system can work independently
        optional: [] // Test physics manages its own dependencies
      },
      autoCleanup: true
    });
  }

  async init(): Promise<void> {
    // Listen for cube spawn requests
    this.subscribe(EventType.TEST_SPAWN_CUBE, (data: CubeData) => this.spawnCube(data));
    this.subscribe(EventType.TEST_CLEAR_CUBES, () => this.clearAllCubes());
    
  }

  start(): void {
    
    // Auto-spawn test cubes
    this.spawnTestCubes();
  }

  private spawnTestCubes(): void {
    
    // Spawn a basic red cube at origin
    this.spawnCube({
      position: { x: 0, y: 2, z: 0 },
      color: 0xff0000,
      size: 1,
      hasPhysics: true
    });

    // Spawn additional test cubes
    this.spawnCube({
      position: { x: 3, y: 1, z: 3 },
      color: 0x00ff00,
      size: 0.8,
      hasPhysics: false
    });

    this.spawnCube({
      position: { x: -3, y: 1, z: -3 },
      color: 0x0000ff,
      size: 1.2,
      hasPhysics: true
    });

    // Floating cube for visual reference
    this.spawnCube({
      position: { x: 0, y: 5, z: 0 },
      color: 0xffff00,
      size: 0.5,
      hasPhysics: false
    });
  }

  private spawnCube(data: CubeData): void {

    const cubeId = `test_cube_${this.cubeCounter++}`;
    

    // Create cube geometry and material
    const geometry = new THREE.BoxGeometry(data.size, data.size, data.size);
    const material = new THREE.MeshBasicMaterial({ 
      color: data.color,
      wireframe: false
    });
    
    const cubeMesh = new THREE.Mesh(geometry, material);
    cubeMesh.position.set(data.position.x, data.position.y, data.position.z);
    cubeMesh.userData = {
      id: cubeId,
      type: 'test_cube',
      hasPhysics: data.hasPhysics,
      interactable: true
    };

    // Add to world using helper method
          this.addToWorld(cubeMesh as unknown as THREE.Object3D);

    // Add physics if requested
    if (data.hasPhysics) {
      this.addPhysicsToEntity(cubeId, cubeMesh, data);
    }

    this.testCubes.set(cubeId, {
      mesh: cubeMesh,
      data: {
        id: cubeId,
        position: data.position,
        size: data.size,
        color: data.color,
        hasPhysics: data.hasPhysics
      }
    });

  }

  private addPhysicsToEntity(entityId: string, mesh: THREE.Mesh, data: CubeData): void {
    
    // Add PhysX collider data for raycasting and interaction
    mesh.userData.physx = {
      type: 'box',
      size: { x: data.size, y: data.size, z: data.size },
      collider: true,
      trigger: false,
      interactive: true,
      dynamic: data.hasPhysics
    };
    
    // Add interaction data
    mesh.userData.interactive = true;
    mesh.userData.clickable = true;
    mesh.userData.entityId = entityId;
    mesh.userData.entityType = 'test_cube';
    
    // Emit physics registration event
    this.emitTypedEvent(EventType.PHYSICS_REGISTER, {
      entityId: entityId,
      type: 'box',
      size: data.size,
      position: data.position,
      dynamic: data.hasPhysics
    });
    
  }

  // Test interaction functionality
  testCubeInteraction(): void {
    // Test interaction functionality with all cubes
    for (const _cubeData of this.testCubes.values()) {
      // Cube interaction testing logic here
    }
  }

  // Animate cubes for visual testing
  animateCubes(dt: number): void {
    const time = Date.now() * 0.001;
    
    for (const cubeData of this.testCubes.values()) {
      if (!cubeData.data.hasPhysics && cubeData.mesh) {
        // Simple floating animation for non-physics cubes
        const originalY = cubeData.data.position.y;
        cubeData.mesh.position.y = originalY + Math.sin(time + cubeData.mesh.position.x) * 0.5;
        
        // Rotate cubes slowly
        cubeData.mesh.rotation.x += dt * 0.5;
        cubeData.mesh.rotation.y += dt * 0.3;
      }
    }
  }

  private clearAllCubes(): void {
    for (const cubeId of this.testCubes.keys()) {
      const cube = this.testCubes.get(cubeId);
      if (cube) {
        if (cube.mesh.parent) {
          cube.mesh.parent.remove(cube.mesh);
        }
        cube.mesh.geometry.dispose();
        (cube.mesh.material as THREE.Material).dispose();
      }
    }
    this.testCubes.clear();
  }

  getTestCubes(): Array<{ id: string; position: { x: number; y: number; z: number }; color: number }> {
    return Array.from(this.testCubes.entries()).map(([id, storedCube]) => ({
      id,
      position: storedCube.data.position,
      color: storedCube.data.color
    }));
  }

  getCubeCount(): number {
    return this.testCubes.size;
  }

  spawnRandomCube(): string | null {
    if (this.testCubes.size >= 50) return null;
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    
    // Random position
    const position = {
      x: (Math.random() - 0.5) * 10,
      y: Math.random() * 5 + 1,
      z: (Math.random() - 0.5) * 10
    };
    
    this.spawnCube({
      position,
      color: randomColor,
      size: Math.random() * 1.5 + 0.5,
      hasPhysics: Math.random() > 0.5
    });
    
    return `test_cube_${this.cubeCounter - 1}`;
  }

  update(dt: number): void {
    // Animate the cubes for visual feedback
    this.animateCubes(dt);
  }

  // Helper method for adding objects to world
  private addToWorld(object: THREE.Object3D): boolean {
    this.world.stage.scene.add(object);
    return true;
  }



  /**
   * Cleanup when system is destroyed
   */
  destroy(): void {
    // Clear all test cubes
    this.testCubes.clear();
    
    // Reset counter
    this.cubeCounter = 0;
    
    this.logger.info('[TestPhysicsCube] Test physics cube system destroyed and cleaned up');
    
    // Call parent cleanup
    super.destroy();
  }
}