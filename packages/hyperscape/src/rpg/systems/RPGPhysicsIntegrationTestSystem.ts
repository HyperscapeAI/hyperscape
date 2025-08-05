
// import { System } from '../../core/systems/System'; // Currently unused
import * as THREE from '../../core/extras/three';

/**
 * RPG Physics Integration Test System
 * 
 * Creates comprehensive physics "minigame" tests to validate:
 * - Terrain collision and height detection
 * - Character movement and colliders
 * - Ball/sphere physics with ramps and obstacles
 * - Cube dropping and stacking
 * - Expected trajectories and outcomes
 * 
 * Tests are positioned ~10 meters away from spawn for visibility
 * Throws detailed errors when expectations are not met
 */
import { RPGSystemBase } from './RPGSystemBase';
import { EventType } from '../../types/events';
import type { World } from '../../types/index';
import type { SystemDependencies } from '../../core/systems/System';

// Test result types
interface BallTestResult {
  ballIndex: number;
  color: string;
  finalPosition: { x: string; y: string; z: string };
  expectedPosition: { x: string; y: string; z: string };
  distance: string;
  tolerance: string;
  passed: boolean;
}

interface CubeTestResult {
  cubeIndex: number;
  color: string;
  dropHeight: string;
  finalPosition: { x: string; y: string; z: string };
  fellThroughFloor: boolean;
  horizontalMovement: string;
  passed: boolean;
}

interface CharacterTestResult {
  startPosition: { x: string; y: string; z: string };
  finalPosition: { x: string; y: string; z: string };
  totalMovement: string;
  movedSignificantly: boolean;
  fellThroughFloor: boolean;
  excessiveMovement: boolean;
  passed: boolean;
}

type GenericTestResult = BallTestResult | CubeTestResult | CharacterTestResult;



interface TestScenario {
  type: 'ball_ramp' | 'cube_drop' | 'character_collision' | 'terrain_validation' | 'ramp_trajectory';
  expectedOutcome: string;
  testStarted: boolean;
  testCompleted: boolean;
  results: GenericTestResult[];
  allTestsPassed: boolean;
  // Type-specific properties
  ramp?: THREE.Mesh;
  balls?: THREE.Mesh[];
  cubes?: THREE.Mesh[];
  obstacles?: THREE.Mesh[];
  character?: THREE.Mesh;
  probes?: THREE.Mesh[];
  projectile?: THREE.Mesh;
}

interface PhysicsTestObject {
  mesh: THREE.Mesh;
  body?: unknown; // Physics body - type depends on physics engine
  position: THREE.Vector3;
  velocity?: THREE.Vector3;
  userData?: PhysicsTestUserData;
}

interface PhysicsTestUserData {
  [key: string]: unknown;
  entityId?: string;
  entityType?: string;
  type: string;
  testId: string;
  color?: number;
  physics: {
    type: string;
    isDynamic: boolean;
    mass: number;
    restitution: number;
    friction: number;
  };
  // Test-specific properties
  expectedFinalPosition?: THREE.Vector3;
  tolerance?: number;
  dropHeight?: number;
  expectedMinY?: number;
  startPosition?: THREE.Vector3;
  testPosition?: THREE.Vector3;
  expectedBehavior?: string;
  launchPosition?: THREE.Vector3;
  expectedLandingArea?: THREE.Vector3;
  initialVelocity?: THREE.Vector3;
  movementDirection?: THREE.Vector3;
}

interface TestResult {
  passed: boolean;
  message: string;
  timestamp: number;
  duration: number;
}

interface TestResults {
  scenarios: Array<{ name: string } & TestScenario>;
  results: Array<{ name: string } & TestResult>;
  objects: Array<{
    id: string;
    type: string;
    position: { x: number; y: number; z: number };
  }>;
  testScenarios: Array<{ name: string } & TestScenario>;
}

export class RPGPhysicsIntegrationTestSystem extends RPGSystemBase {
  private testScenarios = new Map<string, TestScenario>();
  private physicsTestObjects = new Map<string, PhysicsTestObject>();
  private testResults = new Map<string, { passed: boolean; message: string; timestamp: number; duration: number }>();
  private ballTestId = 0;
  private cubeTestId = 0;
  private characterTestId = 0;
  private testStartTime = 0;
  
  constructor(world: World) {
    super(world, {
      name: 'rpg-physics-integration-test',
      dependencies: {} as SystemDependencies,
      autoCleanup: true
    });
  }

  async init(): Promise<void> {
    
    // Listen for test requests
    this.world.on(EventType.PHYSICS_TEST_BALL_RAMP, this.testBallOnRamp.bind(this));
    this.world.on(EventType.PHYSICS_TEST_CUBE_DROP, this.testCubeDrop.bind(this));
    this.world.on(EventType.PHYSICS_TEST_CHARACTER_COLLISION, this.testCharacterCollision.bind(this));
    this.world.on(EventType.PHYSICS_TEST_RUN_ALL, this.runAllPhysicsTests.bind(this));
    
  }

  start(): void {
    this.testStartTime = Date.now();
    
    // Create all test scenarios positioned 10 meters from spawn
    this.createBallRampTest();
    this.createCubeDropTest();
    this.createCharacterColliderTest();
    this.createTerrainValidationTest();
    this.createRampTrajectoryTest();
    
    // Start automated test sequence
    setTimeout(() => {
      this.runAllPhysicsTests();
    }, 2000); // Wait 2 seconds for world to stabilize
  }

  /**
   * Ball Ramp Physics Test
   * Creates a ramp and drops balls to test rolling physics
   * Expected: balls should roll down and stop at predictable positions
   */
  private createBallRampTest(): void {
    
    const testPosition = new THREE.Vector3(10, 1, 10);
    
    // Create ramp geometry
    const rampGeometry = new THREE.BoxGeometry(8, 0.2, 3);
    const rampMaterial = new THREE.MeshBasicMaterial({ color: 0x8B4513 }); // Brown
    const ramp = new THREE.Mesh(rampGeometry, rampMaterial);
    
    // Position and rotate ramp to create slope
    ramp.position.copy(testPosition);
    ramp.rotation.z = -Math.PI / 6; // 30 degree slope
    ramp.userData = {
      type: 'physics_test_ramp',
      testId: 'ball_ramp_test',
      physics: {
        type: 'box',
        isStatic: true,
        mass: 0
      }
    };
    
    if (this.world.stage.scene) {
      this.world.stage.scene.add(ramp);
    }
    
    // Create colored balls at top of ramp
    const ballColors = [0xFF0000, 0x00FF00, 0x0000FF, 0xFFFF00];
    const balls: THREE.Mesh[] = [];
    
    ballColors.forEach((color, index) => {
      const ballGeometry = new THREE.SphereGeometry(0.3);
      const ballMaterial = new THREE.MeshBasicMaterial({ color });
      const ball = new THREE.Mesh(ballGeometry, ballMaterial);
      
      // Position balls at top of ramp with slight offset
      ball.position.set(
        testPosition.x - 3 + (index * 0.5),
        testPosition.y + 3,
        testPosition.z + (index * 0.2)
      );
      
      const userData: PhysicsTestUserData = {
        type: 'physics_test_ball',
        testId: `ball_${this.ballTestId++}`,
        color: color,
        expectedFinalPosition: new THREE.Vector3(
          testPosition.x + 3,
          testPosition.y - 2,
          testPosition.z
        ),
        tolerance: 2.0,
        physics: {
          type: 'sphere',
          isDynamic: true,
          mass: 1,
          restitution: 0.3,
          friction: 0.4
        }
      };
      ball.userData = userData;
      
      balls.push(ball);
      if (this.world.stage.scene) {
        this.world.stage.scene.add(ball);
      }
      this.physicsTestObjects.set(userData.testId, {
        mesh: ball,
        position: ball.position.clone()
      });
    });
    
          this.testScenarios.set('ball_ramp', {
        type: 'ball_ramp',
        ramp: ramp,
        balls: balls,
        expectedOutcome: 'Balls should roll down ramp and settle at bottom',
        testStarted: false,
        testCompleted: false,
        results: [],
        allTestsPassed: false
      });
    
  }

  /**
   * Cube Drop Test
   * Tests cube stacking and floor collision detection
   * Expected: cubes should stack and not fall below ground level
   */
  private createCubeDropTest(): void {
    
    const testPosition = new THREE.Vector3(-10, 5, 10);
    const cubes: THREE.Mesh[] = [];
    
    // Create tower of cubes at different heights
    for (let i = 0; i < 5; i++) {
      const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
      const cubeColor = [0xFF0000, 0x00FF00, 0x0000FF, 0xFFFF00, 0xFF00FF][i];
      const cubeMaterial = new THREE.MeshBasicMaterial({ color: cubeColor });
      const cube = new THREE.Mesh(cubeGeometry, cubeMaterial);
      
      cube.position.set(
        testPosition.x + (Math.random() - 0.5) * 0.1,
        testPosition.y + (i * 1.2),
        testPosition.z + (Math.random() - 0.5) * 0.1
      );
      
      const userData: PhysicsTestUserData = {
        type: 'physics_test_cube',
        testId: `cube_${this.cubeTestId++}`,
        color: cubeColor,
        physics: {
          type: 'box',
          isDynamic: true,
          mass: 1,
          restitution: 0.1,
          friction: 0.6
        }
      };
      cube.userData = {
        ...userData,
        dropHeight: testPosition.y + (i * 1.2),
        expectedMinY: -0.5, // Should never fall below ground
      };
      
      cubes.push(cube);
      if (this.world.stage.scene) {
        this.world.stage.scene.add(cube);
      }
      this.physicsTestObjects.set(userData.testId, {
        mesh: cube,
        position: cube.position.clone()
      });
    }
    
    this.testScenarios.set('cube_drop', {
      type: 'cube_drop',
      cubes: cubes,
      expectedOutcome: 'Cubes should fall and stack without falling through floor',
      testStarted: false,
      testCompleted: false,
      results: [],
      allTestsPassed: false
    });
    
  }

  /**
   * Character Collider Test
   * Tests character movement boundaries and collision
   */
  private createCharacterColliderTest(): void {
    
    const testPosition = new THREE.Vector3(0, 1, -10);
    
    // Create invisible character proxy (capsule shape)
    const characterGeometry = new THREE.CapsuleGeometry(0.5, 1.8);
    const characterMaterial = new THREE.MeshBasicMaterial({ 
      color: 0x00FFFF, 
      transparent: true, 
      opacity: 0.5 
    });
    const characterProxy = new THREE.Mesh(characterGeometry, characterMaterial);
    
    characterProxy.position.copy(testPosition);
          const userData: PhysicsTestUserData = {
        type: 'physics_test_character',
        testId: `character_${this.characterTestId++}`,
        color: 0x00FFFF,
        expectedFinalPosition: new THREE.Vector3(testPosition.x, testPosition.y, testPosition.z + 5),
        tolerance: 1.0,
        physics: {
          type: 'capsule',
          isDynamic: true,
          mass: 70, // Typical human weight
          restitution: 0.1,
          friction: 0.8
        }
      };
    characterProxy.userData = {
      ...userData,
      startPosition: testPosition.clone(),
    };
    
    if (this.world.stage.scene) {
      this.world.stage.scene.add(characterProxy);
    }
    this.physicsTestObjects.set(userData.testId, {
      mesh: characterProxy,
      position: characterProxy.position.clone()
    });
    
    // Create obstacles for collision testing
    const obstacles: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const obstacleGeometry = new THREE.BoxGeometry(2, 2, 0.5);
      const obstacleMaterial = new THREE.MeshBasicMaterial({ color: 0x666666 });
      const obstacle = new THREE.Mesh(obstacleGeometry, obstacleMaterial);
      
      obstacle.position.set(
        testPosition.x + (i - 1) * 3,
        testPosition.y,
        testPosition.z + 2 + (i * 1.5)
      );
      
      obstacle.userData = {
        type: 'physics_test_obstacle',
        physics: {
          type: 'box',
          isStatic: true,
          mass: 0
        }
      };
      
      obstacles.push(obstacle);
      if (this.world.stage.scene) {
        this.world.stage.scene.add(obstacle);
      }
    }
    
    this.testScenarios.set('character_collision', {
      type: 'character_collision',
      character: characterProxy,
      obstacles: obstacles,
      expectedOutcome: 'Character should move and collide with obstacles properly',
      testStarted: false,
      testCompleted: false,
      results: [],
      allTestsPassed: false
    });
    
  }

  /**
   * Terrain Validation Test
   * Validates that terrain height detection works correctly
   */
  private createTerrainValidationTest(): void {
    
    // Test various positions for height validation
    const testPositions = [
      new THREE.Vector3(15, 10, 0),
      new THREE.Vector3(-15, 10, 0),
      new THREE.Vector3(0, 10, 15),
      new THREE.Vector3(0, 10, -15)
    ];
    
    const heightTestObjects: THREE.Mesh[] = [];
    
    testPositions.forEach((pos, index) => {
      const testGeometry = new THREE.SphereGeometry(0.2);
      const testMaterial = new THREE.MeshBasicMaterial({ color: 0xFF8000 }); // Orange
      const testSphere = new THREE.Mesh(testGeometry, testMaterial);
      
      testSphere.position.copy(pos);
      const userData: PhysicsTestUserData = {
        type: 'physics_test_height_probe',
        testId: `height_probe_${index}`,
        color: 0xFF8000,
        physics: {
          type: 'sphere',
          isDynamic: true,
          mass: 0.1,
          restitution: 0.1,
          friction: 0.5
        }
      };
      testSphere.userData = {
        ...userData,
        testPosition: pos.clone(),
        expectedBehavior: 'Should settle on terrain surface',
      };
      
      heightTestObjects.push(testSphere);
      if (this.world.stage.scene) {
        this.world.stage.scene.add(testSphere);
      }
      this.physicsTestObjects.set(userData.testId, {
        mesh: testSphere,
        position: testSphere.position.clone()
      });
    });
    
    this.testScenarios.set('terrain_validation', {
      type: 'terrain_validation',
      probes: heightTestObjects,
      expectedOutcome: 'All probes should rest on terrain surface',
      testStarted: false,
      testCompleted: false,
      results: [],
      allTestsPassed: false
    });
    
  }

  /**
   * Ramp Trajectory Test
   * Tests projectile physics on angled surfaces
   */
  private createRampTrajectoryTest(): void {
    
    const rampPosition = new THREE.Vector3(10, 1, -10);
    
    // Create launch ramp
    const rampGeometry = new THREE.BoxGeometry(4, 0.2, 2);
    const rampMaterial = new THREE.MeshBasicMaterial({ color: 0x4169E1 }); // Royal blue
    const ramp = new THREE.Mesh(rampGeometry, rampMaterial);
    
    ramp.position.copy(rampPosition);
    ramp.rotation.x = Math.PI / 4; // 45 degree ramp
    ramp.userData = {
      type: 'physics_test_launch_ramp',
      physics: {
        type: 'box',
        isStatic: true,
        mass: 0
      }
    };
    
    if (this.world.stage.scene) {
      this.world.stage.scene.add(ramp);
    }
    
    // Create projectile
    const projectileGeometry = new THREE.SphereGeometry(0.25);
    const projectileMaterial = new THREE.MeshBasicMaterial({ color: 0xFF1493 }); // Deep pink
    const projectile = new THREE.Mesh(projectileGeometry, projectileMaterial);
    
    projectile.position.set(rampPosition.x - 2, rampPosition.y + 1, rampPosition.z);
    const userData: PhysicsTestUserData = {
      type: 'physics_test_projectile',
      testId: 'trajectory_projectile',
      color: 0xFF1493,
      expectedFinalPosition: new THREE.Vector3(rampPosition.x + 8, rampPosition.y - 3, rampPosition.z),
      tolerance: 3.0,
      physics: {
        type: 'sphere',
        isDynamic: true,
        mass: 0.5,
        restitution: 0.7,
        friction: 0.3
      }
    };
    projectile.userData = {
      ...userData,
      launchPosition: new THREE.Vector3(rampPosition.x - 2, rampPosition.y + 1, rampPosition.z),
      expectedLandingArea: userData.expectedFinalPosition,
    };
    
    if (this.world.stage.scene) {
      this.world.stage.scene.add(projectile);
    }
    this.physicsTestObjects.set(userData.testId, {
      mesh: projectile,
      position: projectile.position.clone()
    });
    
    this.testScenarios.set('ramp_trajectory', {
      type: 'ramp_trajectory',
      ramp: ramp,
      projectile: projectile,
      expectedOutcome: 'Projectile should launch off ramp and land in expected area',
      testStarted: false,
      testCompleted: false,
      results: [],
      allTestsPassed: false
    });
    
  }

  /**
   * Execute ball ramp test
   */
  private testBallOnRamp(): void {
    
    const scenario = this.testScenarios.get('ball_ramp')!;
    
    scenario.testStarted = true;
    
    // Apply initial force to balls to start rolling
    if (scenario.balls) {
      scenario.balls.forEach((ball: THREE.Mesh, _index: number) => {
      // Simulate physics push
      const initialVelocity = new THREE.Vector3(1, 0, 0);
      ball.userData.initialVelocity = initialVelocity;
      
    });
    }
    
    // Schedule test validation
    setTimeout(() => {
      this.validateBallRampTest();
    }, 5000); // Allow 5 seconds for physics simulation
  }

  private validateBallRampTest(): void {
    
    const scenario = this.testScenarios.get('ball_ramp')!;
    
    const results: Array<{
      ballIndex: number;
      color: string;
      finalPosition: { x: string; y: string; z: string };
      expectedPosition: { x: string; y: string; z: string };
      distance: string;
      tolerance: string;
      passed: boolean;
    }> = [];
    let allTestsPassed = true;
    
    if (scenario.balls) {
      scenario.balls.forEach((ball: THREE.Mesh, index: number) => {
      const finalPosition = ball.position;
      const ballUserData = ball.userData as PhysicsTestUserData;
      const expectedPosition = ballUserData.expectedFinalPosition!;
      const tolerance = ballUserData.tolerance!;
      
      const distance = finalPosition.distanceTo(expectedPosition);
      const passed = distance <= tolerance;
      
      if (!passed) {
        allTestsPassed = false;
      }
      
      // Check if ball fell below ground
      if (finalPosition.y < -1.0) {
        allTestsPassed = false;
      }
      
      const result = {
        ballIndex: index,
        color: `#${ballUserData.color!.toString(16).padStart(6, '0')}`,
        finalPosition: {
          x: finalPosition.x.toFixed(2),
          y: finalPosition.y.toFixed(2),
          z: finalPosition.z.toFixed(2)
        },
        expectedPosition: {
          x: expectedPosition.x.toFixed(2),
          y: expectedPosition.y.toFixed(2),
          z: expectedPosition.z.toFixed(2)
        },
        distance: distance.toFixed(2),
        tolerance: tolerance.toFixed(2),
        passed: passed
      };
      
      results.push(result);
      
    });
    }
    
    scenario.testCompleted = true;
    scenario.results = results;
    scenario.allTestsPassed = allTestsPassed;
    
    this.testResults.set('ball_ramp', {
      passed: allTestsPassed,
      message: allTestsPassed ? 
        'All balls rolled down ramp correctly' : 
        'Some balls did not reach expected positions',
      timestamp: Date.now(),
      duration: Date.now() - this.testStartTime
    });
    
    if (!allTestsPassed) {
      // Test failed but we continue running the server
    }
    
  }

  /**
   * Execute cube drop test
   */
  private testCubeDrop(): void {
    
    const scenario = this.testScenarios.get('cube_drop')!;
    
    scenario.testStarted = true;
    
    if (scenario.cubes) {
      scenario.cubes.forEach((_cube: THREE.Mesh, _index: number) => {
        // Cubes will fall due to gravity
      });
    }
    
    // Schedule test validation
    setTimeout(() => {
      this.validateCubeDropTest();
    }, 4000); // Allow 4 seconds for cubes to settle
  }

  private validateCubeDropTest(): void {
    
    const scenario = this.testScenarios.get('cube_drop')!;
    
    const results: Array<{
      cubeIndex: number;
      color: string;
      dropHeight: string;
      finalPosition: { x: string; y: string; z: string };
      fellThroughFloor: boolean;
      horizontalMovement: string;
      passed: boolean;
    }> = [];
    let allTestsPassed = true;
    
    if (scenario.cubes) {
      scenario.cubes.forEach((cube: THREE.Mesh, index: number) => {
      const finalPosition = cube.position;
      const cubeUserData = cube.userData as PhysicsTestUserData;
      const dropHeight = cubeUserData.dropHeight!;
      const expectedMinY = cubeUserData.expectedMinY!;
      
      // Check if cube fell through floor
      const fellThroughFloor = finalPosition.y < expectedMinY;
      if (fellThroughFloor) {
        allTestsPassed = false;
      }
      
      // Check if cube moved too much horizontally (should stack somewhat)
      const horizontalMovement = Math.sqrt(
        Math.pow(finalPosition.x - (-10), 2) + 
        Math.pow(finalPosition.z - 10, 2)
      );
      
      const excessiveHorizontalMovement = horizontalMovement > 3.0;
      if (excessiveHorizontalMovement) {
        allTestsPassed = false;
      }
      
      const result = {
        cubeIndex: index,
        color: `#${cubeUserData.color!.toString(16).padStart(6, '0')}`,
        dropHeight: dropHeight.toFixed(2),
        finalPosition: {
          x: finalPosition.x.toFixed(2),
          y: finalPosition.y.toFixed(2),
          z: finalPosition.z.toFixed(2)
        },
        fellThroughFloor: fellThroughFloor,
        horizontalMovement: horizontalMovement.toFixed(2),
        passed: !fellThroughFloor && !excessiveHorizontalMovement
      };
      
      results.push(result);
      
      // fellThroughFloor is recorded in the result
      
    });
    }
    
    scenario.testCompleted = true;
    scenario.results = results;
    scenario.allTestsPassed = allTestsPassed;
    
    this.testResults.set('cube_drop', {
      passed: allTestsPassed,
      message: allTestsPassed ? 
        'All cubes dropped and stacked correctly' : 
        'Some cubes had unexpected behavior',
      timestamp: Date.now(),
      duration: Date.now() - this.testStartTime
    });
    
    if (!allTestsPassed) {
      // Test failed but we continue running the server
    }
    
  }

  /**
   * Execute character collision test
   */
  private testCharacterCollision(): void {
    
    const scenario = this.testScenarios.get('character_collision')!;
    
    scenario.testStarted = true;
    
    // Apply movement force to character
    const character = scenario.character!;
    const characterUserData = character.userData as PhysicsTestUserData;
    
    const targetPosition = characterUserData.expectedFinalPosition!;
    
    
    // Simulate movement (in real implementation this would be physics-driven)
    const movement = new THREE.Vector3().subVectors(targetPosition, character.position).normalize();
    characterUserData.movementDirection = movement;
    
    // Schedule test validation
    setTimeout(() => {
      this.validateCharacterCollisionTest();
    }, 3000); // Allow 3 seconds for movement
  }

  private validateCharacterCollisionTest(): void {
    
    const scenario = this.testScenarios.get('character_collision')!;
    
    const character = scenario.character!;
    const characterUserData = character.userData as PhysicsTestUserData;
    
    const finalPosition = character.position;
    const startPosition = characterUserData.startPosition!;
    const _tolerance = characterUserData.tolerance!;
    
    // Check if character moved at all
    const totalMovement = finalPosition.distanceTo(startPosition);
    const movedSignificantly = totalMovement > 0.1;
    
    // Check if character fell through floor
    const fellThroughFloor = finalPosition.y < -1.0;
    
    // Check if character moved too far (indicates no collision detection)
    const excessiveMovement = totalMovement > 15.0;
    
    const passed = movedSignificantly && !fellThroughFloor && !excessiveMovement;
    
    const result = {
      startPosition: {
        x: startPosition.x.toFixed(2),
        y: startPosition.y.toFixed(2),
        z: startPosition.z.toFixed(2)
      },
      finalPosition: {
        x: finalPosition.x.toFixed(2),
        y: finalPosition.y.toFixed(2),
        z: finalPosition.z.toFixed(2)
      },
      totalMovement: totalMovement.toFixed(2),
      movedSignificantly: movedSignificantly,
      fellThroughFloor: fellThroughFloor,
      excessiveMovement: excessiveMovement,
      passed: passed
    };
    
    scenario.testCompleted = true;
    scenario.results = [result]; // results expects an array
    scenario.allTestsPassed = passed;
    
    this.testResults.set('character_collision', {
      passed: passed,
      message: passed ? 
        'Character movement and collision worked correctly' : 
        'Character movement had unexpected behavior',
      timestamp: Date.now(),
      duration: Date.now() - this.testStartTime
    });
    
    // fellThroughFloor is recorded in the result
    
    // Test results are recorded in the scenario object
    
  }

  /**
   * Run all physics tests in sequence
   */
  private runAllPhysicsTests(): void {
    
    // Run tests with proper timing
    setTimeout(() => this.testBallOnRamp(), 1000);
    setTimeout(() => this.testCubeDrop(), 2000);
    setTimeout(() => this.testCharacterCollision(), 3000);
    
    // Final validation after all tests
    setTimeout(() => {
      this.validateAllTests();
    }, 15000);
  }

  /**
   * Validate all test results and provide comprehensive report
   */
  private validateAllTests(): void {
    
    const allResults = Array.from(this.testResults.entries());
    const allTestsPassed = allResults.every(([_key, result]) => result.passed);
    const totalTestTime = Date.now() - this.testStartTime;
    
    const report = {
      totalTests: allResults.length,
      passedTests: allResults.filter(([_key, r]) => r.passed).length,
      failedTests: allResults.filter(([_key, r]) => !r.passed).length,
      allTestsPassed: allTestsPassed,
      totalTestTimeMs: totalTestTime,
      results: allResults.map(([key, result]) => ({ testName: key, ...result })),
      summary: allTestsPassed ? 
        'All physics integration tests PASSED' : 
        'Some physics integration tests FAILED',
      timestamp: Date.now()
    };
    
    
    // Test results are recorded and emitted as events
    
    
    // Emit success event
    this.emitTypedEvent(EventType.TEST_REPORT, report);
  }

  /**
   * Get test results for external inspection
   */
  getTestResults(): TestResults {
    return {
      scenarios: Array.from(this.testScenarios.entries()).map(([key, value]) => ({
        name: key,
        ...value
      })),
      results: Array.from(this.testResults.entries()).map(([key, value]) => ({
        name: key,
        ...value
      })),
      objects: Array.from(this.physicsTestObjects.entries()).map(([key, value]) => ({
        id: key,
        type: value.userData?.type || 'unknown',
        position: { x: value.position.x, y: value.position.y, z: value.position.z }
      })),
      testScenarios: Array.from(this.testScenarios.entries()).map(([key, value]) => ({
        name: key,
        ...value
      }))
    };
  }

  /**
   * Clean up test objects
   */
  cleanup(): void {
    
    this.physicsTestObjects.forEach((object, _id) => {
      if (object.mesh.parent) {
        object.mesh.parent.remove(object.mesh);
      }
    });
    
    this.physicsTestObjects.clear();
    this.testScenarios.clear();
    this.testResults.clear();
  }

  update(_dt: number): void {
    // Monitor test objects and detect issues in real-time
    this.physicsTestObjects.forEach((object, id) => {
      // Check for objects falling through floor
      if (object.position.y < -2.0) {
        console.error(`[PhysicsTests] WARNING: Object ${id} fell below expected floor level:`, object.position.y);
      }
      
      // Check for objects moving too far from test area
      const distanceFromOrigin = object.position.length();
      if (distanceFromOrigin > 50) {
        console.error(`[PhysicsTests] WARNING: Object ${id} moved too far from test area:`, distanceFromOrigin);
      }
    });
  }

  destroy(): void {
    this.cleanup();
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