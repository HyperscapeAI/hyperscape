import { System } from './System';
import type { World } from '../World';
import * as THREE from 'three';

interface RaycastTestResult {
  screenX: number;
  screenY: number;
  expectedWorld: THREE.Vector3;
  actualHit: THREE.Vector3 | null;
  playerMoved: boolean;
  finalPosition: THREE.Vector3 | null;
  error: number;
}

export class RaycastTestSystem extends System {
  private groundPlane: THREE.Mesh | null = null;
  private testMarkers: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private testResults: RaycastTestResult[] = [];
  private isRunningTests = false;
  
  constructor(world: World) {
    super(world);
  }

  start(): void {
    console.log('[RaycastTest] Starting raycast test system');
    
    // Use the existing stage ground plane instead of creating our own to avoid z-fighting
    // this.createGroundPlane(); // Commented out to prevent duplicate ground planes
    
    // Start tests after a longer delay to let everything initialize
    setTimeout(() => this.runTests(), 8000);
  }

  private createGroundPlane(): void {
    const geometry = new THREE.PlaneGeometry(100, 100);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0x00ff00, 
      opacity: 0.3, 
      transparent: true,
      side: THREE.DoubleSide 
    });
    
    // Ensure only one test ground exists to avoid z-fighting/jitter
    if (this.world.stage?.scene?.getObjectByName('test-ground-plane')) {
      const existing = this.world.stage.scene.getObjectByName('test-ground-plane')!
      this.world.stage.scene.remove(existing)
    }
    this.groundPlane = new THREE.Mesh(geometry, material);
    this.groundPlane.rotation.x = -Math.PI / 2;
    this.groundPlane.position.y = 0;
    this.groundPlane.name = 'test-ground-plane';
    
    if (this.world.stage?.scene) {
      this.world.stage.scene.add(this.groundPlane);
      console.log('[RaycastTest] Added ground plane at y=0');
      
      // We avoid adding a PhysX collider here to keep test side-effects minimal
    }
  }

  private async runTests(): Promise<void> {
    if (this.isRunningTests) return;
    this.isRunningTests = true;
    
    console.log('[RaycastTest] ========================================');
    console.log('[RaycastTest] Starting comprehensive raycast tests');
    console.log('[RaycastTest] ========================================');
    
    const camera = this.world.camera;
    const canvas = this.world.graphics?.renderer?.domElement;
    
    if (!camera || !canvas) {
      console.error('[RaycastTest] Camera or canvas not found');
      return;
    }
    
    // Log camera info
    console.log(`[RaycastTest] Camera position: (${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`);
    console.log(`[RaycastTest] Camera type: ${camera.type}`);
    if ((camera as any).fov) {
      console.log(`[RaycastTest] Camera FOV: ${(camera as any).fov}`);
    }
    
    // Update camera matrices to ensure proper projection
    camera.updateMatrixWorld(true);
    if ((camera as any).updateProjectionMatrix) {
      (camera as any).updateProjectionMatrix();
    }
    
    // Define test points based on where camera is actually looking
    // Camera is typically at (x, 5.4, 5.6) looking toward negative Z
    const camPos = camera.position;
    const lookDistance = 10; // How far in front of camera to expect hits
    
    const testPoints = [
      { screenX: 640, screenY: 360, name: 'center', expectedWorld: new THREE.Vector3(camPos.x, 0, camPos.z - lookDistance) },
      { screenX: 320, screenY: 360, name: 'left', expectedWorld: new THREE.Vector3(camPos.x - 5, 0, camPos.z - lookDistance) },
      { screenX: 960, screenY: 360, name: 'right', expectedWorld: new THREE.Vector3(camPos.x + 5, 0, camPos.z - lookDistance) },
      { screenX: 640, screenY: 500, name: 'bottom-center', expectedWorld: new THREE.Vector3(camPos.x, 0, camPos.z - 5) },
      { screenX: 640, screenY: 200, name: 'top-center', expectedWorld: new THREE.Vector3(camPos.x, 0, camPos.z - 15) },
    ];
    
    // Test each point
    for (const testPoint of testPoints) {
      await this.testRaycastPoint(testPoint, camera, canvas);
      await this.wait(2000); // Wait between tests
    }
    
    // Print summary
    this.printTestSummary();
    this.isRunningTests = false;
  }

  private async testRaycastPoint(
    testPoint: { screenX: number; screenY: number; name: string; expectedWorld: THREE.Vector3 },
    camera: THREE.Camera,
    canvas: HTMLCanvasElement
  ): Promise<void> {
    console.log(`\n[RaycastTest] Testing ${testPoint.name} at screen (${testPoint.screenX}, ${testPoint.screenY})`);
    
    // Convert screen to NDC
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((testPoint.screenX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((testPoint.screenY - rect.top) / rect.height) * 2 + 1;
    
    console.log(`[RaycastTest] NDC: (${ndcX.toFixed(3)}, ${ndcY.toFixed(3)})`);
    
    // Perform raycast
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    
    // Test against the existing stage ground plane instead of our own
    const stageGroundPlane = this.world.stage?.scene?.getObjectByName('stage-ground');
    const intersects = stageGroundPlane ? this.raycaster.intersectObject(stageGroundPlane) : [];
    
    if (intersects.length > 0) {
      const hit = intersects[0].point;
      console.log(`[RaycastTest] Hit at world: (${hit.x.toFixed(2)}, ${hit.y.toFixed(2)}, ${hit.z.toFixed(2)})`);
      
      // Place a marker at the hit point
      this.placeMarker(hit, 0xff0000);
      
      // Place a marker at the expected point
      this.placeMarker(testPoint.expectedWorld, 0x0000ff);
      
      // Calculate error
      const error = hit.distanceTo(testPoint.expectedWorld);
      console.log(`[RaycastTest] Error from expected: ${error.toFixed(2)} units`);
      
      // Now simulate a click and see if the player moves there
      await this.simulateClickAndVerifyMovement(testPoint.screenX, testPoint.screenY, hit);
      
      this.testResults.push({
        screenX: testPoint.screenX,
        screenY: testPoint.screenY,
        expectedWorld: testPoint.expectedWorld,
        actualHit: hit,
        playerMoved: false, // Will be updated by movement test
        finalPosition: null,
        error: error
      });
    } else {
      console.error(`[RaycastTest] No intersection found for ${testPoint.name}`);
      this.testResults.push({
        screenX: testPoint.screenX,
        screenY: testPoint.screenY,
        expectedWorld: testPoint.expectedWorld,
        actualHit: null,
        playerMoved: false,
        finalPosition: null,
        error: -1
      });
    }
  }

  private async simulateClickAndVerifyMovement(screenX: number, screenY: number, expectedTarget: THREE.Vector3): Promise<void> {
    const player = this.world.getPlayer();
    if (!player) {
      console.error('[RaycastTest] No player found');
      return;
    }
    
    const initialPos = player.position.clone();
    console.log(`[RaycastTest] Player initial position: (${initialPos.x.toFixed(2)}, ${initialPos.y.toFixed(2)}, ${initialPos.z.toFixed(2)})`);
    
    // Simulate click event
    const canvas = this.world.graphics?.renderer?.domElement;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const clickEvent = new MouseEvent('click', {
      clientX: rect.left + screenX,
      clientY: rect.top + screenY,
      bubbles: true
    });
    
    canvas.dispatchEvent(clickEvent);
    console.log(`[RaycastTest] Dispatched click at (${screenX}, ${screenY})`);
    
    // Wait for movement
    await this.wait(3000);
    
    // Check final position
    const finalPos = player.position.clone();
    console.log(`[RaycastTest] Player final position: (${finalPos.x.toFixed(2)}, ${finalPos.y.toFixed(2)}, ${finalPos.z.toFixed(2)})`);
    
    const distanceMoved = initialPos.distanceTo(finalPos);
    const distanceToTarget = finalPos.distanceTo(expectedTarget);
    
    console.log(`[RaycastTest] Distance moved: ${distanceMoved.toFixed(2)} units`);
    console.log(`[RaycastTest] Distance to target: ${distanceToTarget.toFixed(2)} units`);
    
    if (distanceMoved > 0.5) {
      console.log(`[RaycastTest] ✅ Player moved`);
      if (distanceToTarget < 1.0) {
        console.log(`[RaycastTest] ✅ Player reached target`);
      } else {
        console.log(`[RaycastTest] ⚠️ Player did not reach target (off by ${distanceToTarget.toFixed(2)} units)`);
      }
    } else {
      console.log(`[RaycastTest] ❌ Player did not move`);
    }
    
    // Update test result
    if (this.testResults.length > 0) {
      const lastResult = this.testResults[this.testResults.length - 1];
      lastResult.playerMoved = distanceMoved > 0.5;
      lastResult.finalPosition = finalPos;
    }
  }

  private placeMarker(position: THREE.Vector3, color: number): void {
    const geometry = new THREE.SphereGeometry(0.2);
    const material = new THREE.MeshBasicMaterial({ color });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(position);
    
    if (this.world.stage?.scene) {
      this.world.stage.scene.add(marker);
      this.testMarkers.push(marker);
    }
  }

  private printTestSummary(): void {
    console.log('\n[RaycastTest] ========================================');
    console.log('[RaycastTest] TEST SUMMARY');
    console.log('[RaycastTest] ========================================');
    
    let passedRaycast = 0;
    let passedMovement = 0;
    
    for (const result of this.testResults) {
      const raycastPass = result.actualHit !== null && result.error < 2.0;
      const movementPass = result.playerMoved && result.finalPosition && 
                          result.actualHit && result.finalPosition.distanceTo(result.actualHit) < 1.0;
      
      if (raycastPass) passedRaycast++;
      if (movementPass) passedMovement++;
      
      console.log(`\nScreen (${result.screenX}, ${result.screenY}):`);
      console.log(`  Raycast: ${raycastPass ? '✅' : '❌'} (error: ${result.error.toFixed(2)})`);
      console.log(`  Movement: ${movementPass ? '✅' : '❌'}`);
      if (result.actualHit) {
        console.log(`  Hit: (${result.actualHit.x.toFixed(2)}, ${result.actualHit.y.toFixed(2)}, ${result.actualHit.z.toFixed(2)})`);
      }
      if (result.finalPosition) {
        console.log(`  Final: (${result.finalPosition.x.toFixed(2)}, ${result.finalPosition.y.toFixed(2)}, ${result.finalPosition.z.toFixed(2)})`);
      }
    }
    
    console.log(`\n[RaycastTest] Overall: ${passedRaycast}/${this.testResults.length} raycasts passed`);
    console.log(`[RaycastTest] Overall: ${passedMovement}/${this.testResults.length} movements passed`);
    
    // Export results to window for external testing
    if (typeof window !== 'undefined') {
      (window as any).__raycastTestResults = this.testResults;
    }
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop(): void {
    // Clean up markers
    for (const marker of this.testMarkers) {
      if (marker.parent) {
        marker.parent.remove(marker);
      }
    }
    this.testMarkers = [];
    
    // No need to remove ground plane since we're using the stage's ground plane
    // if (this.groundPlane && this.groundPlane.parent) {
    //   this.groundPlane.parent.remove(this.groundPlane);
    // }
  }
}
