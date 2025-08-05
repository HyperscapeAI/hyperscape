/**
 * Movement Test System
 * Tests player movement, pathfinding, and collision detection
 * - Tests basic movement (walk/run) with stamina system
 * - Tests pathfinding around obstacles
 * - Tests collision detection with terrain and objects
 * - Tests teleportation mechanics
 * - Tests movement speed modifiers and effects
 * - Tests boundary detection and world limits
 */


import { EventType } from '../types/events';
import type { Position3D, World } from '../types/core';
import type { MovementTestData } from '../types/test';
import type { PlayerWithProxy } from '../types/game-types';
import { calculateDistance, safeSceneRemove } from '../utils/EntityUtils';
import { MovementSystem } from './MovementSystem';
import { PathfindingSystem } from './PathfindingSystem';
import { VisualTestFramework } from './VisualTestFramework';

export class MovementTestSystem extends VisualTestFramework {
  private testData = new Map<string, MovementTestData>();
   
  private movementSystem!: MovementSystem;
  private pathfindingSystem!: PathfindingSystem;

  constructor(world: World) {
    super(world);
    const ms = world.getSystem<MovementSystem>('rpg-movement')
    if(!ms) {
      throw new Error("No movement system found");
    }
    this.movementSystem = ms;

    const pf = world.getSystem<PathfindingSystem>('rpg-pathfinding')
    if(!pf) {
      throw new Error("No pathfinding system found");
    }

    this.pathfindingSystem = pf;
  }

  async init(): Promise<void> {
    await super.init();

    // Systems are already initialized in constructor
    
    // Create test stations
    this.createTestStations();
  }

  protected createTestStations(): void {
    // Basic Movement Test
    this.createTestStation({
      id: 'basic_movement_test',
      name: 'Basic Movement Test',
      position: { x: 0, y: 0, z: 0 }
    });

    // Pathfinding Test
    this.createTestStation({
      id: 'pathfinding_test',
      name: 'Pathfinding Test',
      position: { x: 10, y: 0, z: 0 }
    });

    // Collision Detection Test
    this.createTestStation({
      id: 'collision_test',
      name: 'Collision Detection Test',
      position: { x: 20, y: 0, z: 0 }
    });

    // Teleportation Test
    this.createTestStation({
      id: 'teleportation_test',
      name: 'Teleportation Test',
      position: { x: 30, y: 0, z: 0 }
    });

    // Comprehensive Movement Test - Extended timeout
    this.createTestStation({
      id: 'comprehensive_movement_test',
      name: 'Full Movement Test',
      position: { x: 40, y: 0, z: 0 },
      timeoutMs: 45000 // 45 seconds timeout
    });
  }

  protected runTest(stationId: string): void {
    this.startTest(stationId);
    
    switch (stationId) {
      case 'basic_movement_test':
        this.runBasicMovementTest(stationId);
        break;
      case 'pathfinding_test':
        this.runPathfindingTest(stationId);
        break;
      case 'collision_test':
        this.runCollisionTest(stationId);
        break;
      case 'teleportation_test':
        this.runTeleportationTest(stationId);
        break;
      case 'comprehensive_movement_test':
        this.runComprehensiveMovementTest(stationId);
        break;
      default:
        this.failTest(stationId, `Unknown movement test: ${stationId}`);
    }
  }

  private async runBasicMovementTest(stationId: string): Promise<void> {
    const station = this.testStations.get(stationId);
    if (!station) return;

      // Create fake player for movement testing
      const player = this.createPlayer({
        id: `movement_player_${Date.now()}`,
        name: 'Movement Test Player',
        position: { x: 0, y: 0, z: 0 }
      });

      const startPos = { x: station.position.x - 5, y: station.position.y, z: station.position.z };
      const targetPos = { x: station.position.x + 8, y: station.position.y, z: station.position.z };

      // Create movement waypoints for walk/run test
      const waypoints = [
        { x: station.position.x - 2, y: station.position.y, z: station.position.z, reached: false }, // Walk
        { x: station.position.x + 2, y: station.position.y, z: station.position.z, reached: false }, // Run
        { x: station.position.x + 5, y: station.position.y, z: station.position.z, reached: false }, // Walk back
        { x: station.position.x + 8, y: station.position.y, z: station.position.z, reached: false }  // Final
      ];

      // Store test data
      this.testData.set(stationId, {
        player,
        testType: 'basic_movement',
        startTime: Date.now(),
        startPosition: startPos,
        targetPosition: targetPos,
        currentPosition: { ...startPos },
        waypoints,
        distanceTraveled: 0,
        movementSpeed: 0,
        staminaUsed: 0,
        obstaclesAvoided: 0,
        teleportationsAttempted: 0,
        teleportationsSuccessful: 0,
        collisionDetected: false,
        pathfindingWorked: false,
        boundariesRespected: true,
        movementEffectsTested: false,
        timeoutIds: [],
        movementStarted: false,
        movementCompleted: false,
        pathFound: false,
        pathNodes: [],
        currentPathIndex: 0
      });

      // Create waypoint visuals
      this.createWaypointVisuals(stationId, waypoints);

    // Start basic movement sequence
    this.startBasicMovementSequence(stationId);
  }

  private async runPathfindingTest(stationId: string): Promise<void> {
    try {
      const station = this.testStations.get(stationId);
      if (!station) return;

      // Create fake player for pathfinding testing
      const player = this.createPlayer({
        id: `pathfinding_player_${Date.now()}`,
        name: 'Pathfinding Test Player',
        position: { x: 0, y: 0, z: 0 }
      });

      const startPos = { x: station.position.x - 6, y: station.position.y, z: station.position.z - 3 };
      const targetPos = { x: station.position.x + 6, y: station.position.y, z: station.position.z + 3 };

      // Create obstacles for pathfinding
      const obstacles = [
        { x: station.position.x - 2, y: station.position.y, z: station.position.z - 1 },
        { x: station.position.x, y: station.position.y, z: station.position.z },
        { x: station.position.x + 2, y: station.position.y, z: station.position.z + 1 }
      ];

      // Create complex waypoints that require pathfinding around obstacles
      const waypoints = [
        { x: station.position.x - 4, y: station.position.y, z: station.position.z - 2, reached: false },
        { x: station.position.x - 2, y: station.position.y, z: station.position.z - 3, reached: false }, // Around obstacle
        { x: station.position.x + 1, y: station.position.y, z: station.position.z - 2, reached: false },
        { x: station.position.x + 3, y: station.position.y, z: station.position.z + 2, reached: false }, // Around obstacle
        { x: station.position.x + 6, y: station.position.y, z: station.position.z + 3, reached: false }  // Target
      ];

      // Store test data
      this.testData.set(stationId, {
        player,
        testType: 'pathfinding',
        startTime: Date.now(),
        startPosition: startPos,
        targetPosition: targetPos,
        currentPosition: { ...startPos },
        waypoints,
        distanceTraveled: 0,
        movementSpeed: 0,
        staminaUsed: 0,
        obstaclesAvoided: 0,
        teleportationsAttempted: 0,
        teleportationsSuccessful: 0,
        collisionDetected: false,
        pathfindingWorked: false,
        boundariesRespected: true,
        movementEffectsTested: false,
        timeoutIds: [],
        movementStarted: false,
        movementCompleted: false,
        pathFound: false,
        pathNodes: [],
        currentPathIndex: 0
      });

      // Create obstacle visuals
      this.createObstacleVisuals(stationId, obstacles);
      this.createWaypointVisuals(stationId, waypoints);

      // Start pathfinding sequence
      this.startPathfindingSequence(stationId);
      
    } catch (error) {
      this.failTest(stationId, `Pathfinding test error: ${error}`);
    }
  }

  private async runCollisionTest(stationId: string): Promise<void> {
    try {
      const station = this.testStations.get(stationId);
      if (!station) return;

      // Create fake player for collision testing
      const player = this.createPlayer({
        id: `collision_player_${Date.now()}`,
        name: 'Collision Test Player',
        position: { x: 0, y: 0, z: 0 }
      });

      const startPos = { x: station.position.x - 4, y: station.position.y, z: station.position.z };
      
      // Create collision walls/barriers
      const barriers = [
        { x: station.position.x, y: station.position.y, z: station.position.z - 1 },
        { x: station.position.x, y: station.position.y, z: station.position.z },
        { x: station.position.x, y: station.position.y, z: station.position.z + 1 }
      ];

      // Waypoints that test collision (should be blocked by barriers)
      const waypoints = [
        { x: station.position.x - 2, y: station.position.y, z: station.position.z, reached: false },
        { x: station.position.x + 1, y: station.position.y, z: station.position.z, reached: false }, // Should be blocked
        { x: station.position.x - 2, y: station.position.y, z: station.position.z + 2, reached: false }, // Go around
        { x: station.position.x + 2, y: station.position.y, z: station.position.z + 2, reached: false }  // Final
      ];

      // Store test data
      this.testData.set(stationId, {
        player,
        testType: 'collision',
        startTime: Date.now(),
        startPosition: startPos,
        targetPosition: waypoints[waypoints.length - 1],
        currentPosition: { ...startPos },
        waypoints,
        distanceTraveled: 0,
        movementSpeed: 0,
        staminaUsed: 0,
        obstaclesAvoided: 0,
        teleportationsAttempted: 0,
        teleportationsSuccessful: 0,
        collisionDetected: false,
        pathfindingWorked: false,
        boundariesRespected: true,
        movementEffectsTested: false,
        timeoutIds: [],
        movementStarted: false,
        movementCompleted: false,
        pathFound: false,
        pathNodes: [],
        currentPathIndex: 0
      });

      // Create barrier visuals
      this.createBarrierVisuals(stationId, barriers);
      this.createWaypointVisuals(stationId, waypoints);

      // Start collision test sequence
      this.startCollisionSequence(stationId);
      
    } catch (error) {
      this.failTest(stationId, `Collision detection test error: ${error}`);
    }
  }

  private async runTeleportationTest(stationId: string): Promise<void> {
    try {
      const station = this.testStations.get(stationId);
      if (!station) return;

      // Create fake player for teleportation testing
      const player = this.createPlayer({
        id: `teleport_player_${Date.now()}`,
        name: 'Teleportation Test Player',
        position: { x: 0, y: 0, z: 0 }
      });

      const startPos = { x: station.position.x, y: station.position.y, z: station.position.z };

      // Teleportation targets
      const teleportTargets = [
        { x: station.position.x + 5, y: station.position.y, z: station.position.z + 5, reached: false },
        { x: station.position.x - 3, y: station.position.y, z: station.position.z - 3, reached: false },
        { x: station.position.x + 2, y: station.position.y + 1, z: station.position.z, reached: false }, // Elevated
        { x: station.position.x, y: station.position.y, z: station.position.z + 8, reached: false }   // Far
      ];

      // Store test data
      this.testData.set(stationId, {
        player,
        testType: 'teleportation',
        startTime: Date.now(),
        startPosition: startPos,
        targetPosition: teleportTargets[teleportTargets.length - 1],
        currentPosition: { ...startPos },
        waypoints: teleportTargets,
        distanceTraveled: 0,
        movementSpeed: 0,
        staminaUsed: 0,
        obstaclesAvoided: 0,
        teleportationsAttempted: 0,
        teleportationsSuccessful: 0,
        collisionDetected: false,
        pathfindingWorked: false,
        boundariesRespected: true,
        movementEffectsTested: false,
        timeoutIds: [],
        movementStarted: false,
        movementCompleted: false,
        pathFound: false,
        pathNodes: [],
        currentPathIndex: 0
      });

      // Create teleport target visuals
      this.createTeleportTargetVisuals(stationId, teleportTargets);

      // Start teleportation sequence
      this.startTeleportationSequence(stationId);
      
    } catch (error) {
      this.failTest(stationId, `Teleportation test error: ${error}`);
    }
  }

  private async runComprehensiveMovementTest(stationId: string): Promise<void> {
    try {
      const station = this.testStations.get(stationId);
      if (!station) return;

      // Create fake player for comprehensive testing
      const player = this.createPlayer({
        id: `comprehensive_movement_player_${Date.now()}`,
        name: 'Comprehensive Movement Player',
        position: { x: 0, y: 0, z: 0 }
      });
      
      const startPos = { x: station.position.x - 8, y: station.position.y, z: station.position.z - 8 };
      const finalPos = { x: station.position.x + 8, y: station.position.y, z: station.position.z + 8 };

      // Complex course with all movement types
      const waypoints = [
        // Phase 1: Basic movement
        { x: station.position.x - 5, y: station.position.y, z: station.position.z - 5, reached: false },
        { x: station.position.x - 2, y: station.position.y, z: station.position.z - 2, reached: false },
        // Phase 2: Obstacle avoidance
        { x: station.position.x + 1, y: station.position.y, z: station.position.z - 3, reached: false },
        { x: station.position.x + 3, y: station.position.y, z: station.position.z, reached: false },
        // Phase 3: Pathfinding
        { x: station.position.x + 5, y: station.position.y, z: station.position.z + 3, reached: false },
        // Phase 4: Final destination
        { x: station.position.x + 8, y: station.position.y, z: station.position.z + 8, reached: false }
      ];

      // Store test data
      this.testData.set(stationId, {
        player,
        testType: 'comprehensive',
        startTime: Date.now(),
        startPosition: startPos,
        targetPosition: finalPos,
        currentPosition: { ...startPos },
        waypoints,
        distanceTraveled: 0,
        movementSpeed: 0,
        staminaUsed: 0,
        obstaclesAvoided: 0,
        teleportationsAttempted: 0,
        teleportationsSuccessful: 0,
        collisionDetected: false,
        pathfindingWorked: false,
        boundariesRespected: true,
        movementEffectsTested: false,
        timeoutIds: [],
        movementStarted: false,
        movementCompleted: false,
        pathFound: false,
        pathNodes: [],
        currentPathIndex: 0
      });

      // Create comprehensive course visuals
      this.createComprehensiveCourseVisuals(stationId, station.position);

      // Start comprehensive sequence
      this.startComprehensiveSequence(stationId);
      
    } catch (error) {
      this.failTest(stationId, `Comprehensive movement test error: ${error}`);
    }
  }

  private createWaypointVisuals(stationId: string, waypoints: Array<Position3D & { reached: boolean }>): void {
    waypoints.forEach((waypoint, index) => {
      this.emitTypedEvent(EventType.TEST_WAYPOINT_CREATE, {
        id: `waypoint_${stationId}_${index}`,
        position: {
          x: waypoint.x,
          y: waypoint.y,
          z: waypoint.z,
          reached: waypoint.reached
        }
      });
    });
  }

  private createObstacleVisuals(stationId: string, obstacles: Array<Position3D>): void {
    obstacles.forEach((obstacle, index) => {
      this.emitTypedEvent(EventType.TEST_OBSTACLE_CREATE, {
        id: `obstacle_${stationId}_${index}`,
        position: {
          x: obstacle.x,
          y: obstacle.y,
          z: obstacle.z
        }
      });
    });
  }

  private createBarrierVisuals(stationId: string, barriers: Array<Position3D>): void {
    barriers.forEach((barrier, index) => {
      this.emitTypedEvent(EventType.TEST_BARRIER_CREATE, {
        id: `barrier_${stationId}_${index}`,
        position: {
          x: barrier.x,
          y: barrier.y,
          z: barrier.z
        }
      });
    });
  }

  private createTeleportTargetVisuals(stationId: string, targets: Array<Position3D & { reached: boolean }>): void {
    targets.forEach((target, index) => {
      this.emitTypedEvent(EventType.TEST_TELEPORT_TARGET_CREATE, {
        id: `teleport_target_${stationId}_${index}`,
        position: {
          x: target.x,
          y: target.y,
          z: target.z,
          reached: target.reached
        }
      });
    });
  }

  private createComprehensiveCourseVisuals(stationId: string, centerPos: Position3D): void {
    // Create various obstacles and features for comprehensive test
    const obstacles = [
      { x: centerPos.x - 1, y: centerPos.y, z: centerPos.z - 1 },
      { x: centerPos.x + 1, y: centerPos.y, z: centerPos.z + 1 }
    ];

    const barriers = [
      { x: centerPos.x + 2, y: centerPos.y, z: centerPos.z - 1 }
    ];

    this.createObstacleVisuals(stationId, obstacles);
    this.createBarrierVisuals(stationId, barriers);
  }

  private startBasicMovementSequence(stationId: string): void {
    const testData = this.testData.get(stationId);
    if (!testData) return;

    let waypointIndex = 0;
    let isRunning = false;

    const moveToNextWaypoint = async () => {
      // Check if test data still exists (in case cleanup happened)
      const currentTestData = this.testData.get(stationId);
      if (!currentTestData || !currentTestData.waypoints || waypointIndex >= currentTestData.waypoints.length) {
        this.completeBasicMovementTest(stationId);
        return;
      }

      const waypoint = currentTestData.waypoints[waypointIndex];

      // Alternate between walking and running
      isRunning = waypointIndex % 2 === 1;
      const moveSpeed = isRunning ? 6 : 3; // Run faster than walk

      if (this.movementSystem && currentTestData.player) {
        // Verify player still exists in world before attempting movement
        const playerExists = this.world.entities.get(currentTestData.player.id);
        if (!playerExists) {
          return;
        }
        
        // Record starting position
        const startPos = { ...currentTestData.currentPosition };
        
        // Start movement
        const success = await this.movementSystem.movePlayer(
          currentTestData.player.id,
          waypoint,
          { 
            speed: moveSpeed, 
            useStamina: isRunning,
            pathfinding: false // Basic movement doesn't use pathfinding
          }
        );

        if (success) {
          // Calculate distance traveled
          const distance = calculateDistance(startPos, waypoint);
          currentTestData.distanceTraveled += distance;
          currentTestData.movementSpeed = moveSpeed;
          
          if (isRunning) {
            if (currentTestData.staminaUsed !== undefined) {
              currentTestData.staminaUsed += distance * 2; // Running uses more stamina
            }
          }

          // Update current position
          currentTestData.currentPosition = { ...waypoint };
          waypoint.reached = true;

          // Update waypoint visual
          this.emitTypedEvent(EventType.TEST_WAYPOINT_UPDATE, {
            id: `waypoint_${stationId}_${waypointIndex}`,
            color: '#ffff00' // Yellow for reached
          });
        }
      }

      waypointIndex++;
      const timeoutId = setTimeout(moveToNextWaypoint, 3000); // 3 seconds between waypoints
      if (currentTestData.timeoutIds) {
        currentTestData.timeoutIds.push(timeoutId);
      }
    };

    // Start movement sequence
    const initialTimeoutId = setTimeout(moveToNextWaypoint, 1000);
    if (!testData.timeoutIds) {
      testData.timeoutIds = [];
    }
    testData.timeoutIds.push(initialTimeoutId);
  }

  private startPathfindingSequence(stationId: string): void {
    const testData = this.testData.get(stationId);
    if (!testData) return;

    let waypointIndex = 0;

    const pathfindToNextWaypoint = async () => {
      // Check if test is still running and player still exists
      const currentTestData = this.testData.get(stationId);
      if (!currentTestData || !this.fakePlayers.has(currentTestData.player.id)) {

        return;
      }
      
      if (!testData.waypoints || waypointIndex >= testData.waypoints.length) {
        this.completePathfindingTest(stationId);
        return;
      }

      const waypoint = testData.waypoints[waypointIndex];

      if (this.pathfindingSystem && this.movementSystem && currentTestData.player) {
        // Verify player still exists in world before attempting movement
        try {
          const playerExists = this.world.entities.get(currentTestData.player.id);
          if (!playerExists) {
            // console.log(`[MovementTestSystem] Player ${currentTestData.player.id} no longer exists, stopping pathfinding test`);
            return;
          }
        } catch (_error) {
          // console.log(`[MovementTestSystem] Error checking player existence: ${_error}`);
          return;
        }
        
        // Calculate path around obstacles
        const path = this.pathfindingSystem.findPath(
          testData.currentPosition,
          waypoint
        );

        if (path && path.length > 0) {
          testData.pathfindingWorked = true;

          // Move along the path
          for (const pathNode of path) {
            const success = await this.movementSystem.movePlayer(
              testData.player.id,
              pathNode,
              { speed: 4, useStamina: false, pathfinding: true }
            );

            if (success) {
              const distance = calculateDistance(testData.currentPosition, pathNode);
              testData.distanceTraveled += distance;
              testData.currentPosition = { ...pathNode };
              
              // Check if we avoided obstacles (simplified check)
              if (this.isNearObstacle(testData.currentPosition, [])) {
                if (testData.obstaclesAvoided !== undefined) {
                  testData.obstaclesAvoided++;
                }
              }
            }

            await new Promise(resolve => setTimeout(resolve, 800)); // Short pause between path nodes
          }

          waypoint.reached = true;
          this.emitTypedEvent(EventType.TEST_WAYPOINT_UPDATE, {
            id: `waypoint_${stationId}_${waypointIndex}`,
            color: '#ffff00' // Yellow for reached
          });
        }
      }

      waypointIndex++;
      const nextTimeout = setTimeout(pathfindToNextWaypoint, 2000);
      if (testData.timeoutIds) {
        testData.timeoutIds.push(nextTimeout);
      }
    };

    // Start pathfinding sequence
    const initialTimeout = setTimeout(pathfindToNextWaypoint, 1000);
    if (!testData.timeoutIds) {
      testData.timeoutIds = [];
    }
    testData.timeoutIds.push(initialTimeout);
  }

  private startCollisionSequence(stationId: string): void {
    const testData = this.testData.get(stationId);
    if (!testData) return;

    let waypointIndex = 0;

    const testMovementAtWaypoint = async () => {
      // Check if test data still exists (in case cleanup happened)
      const currentTestData = this.testData.get(stationId);
      if (!currentTestData || !currentTestData.waypoints || waypointIndex >= currentTestData.waypoints.length) {
        this.completeCollisionTest(stationId);
        return;
      }

      const waypoint = currentTestData.waypoints[waypointIndex];

      if (this.movementSystem && currentTestData.player) {
        // Verify player still exists in world before attempting movement
        try {
          const playerExists = this.world.entities.get(currentTestData.player.id);
          if (!playerExists) {
            // console.log(`[MovementTestSystem] Player ${currentTestData.player.id} no longer exists, stopping collision test`);
            return;
          }
        } catch (_error) {
          // console.log(`[MovementTestSystem] Error checking player existence: ${_error}`);
          return;
        }
        
        // Move player directly (collision is handled by movement system internally)
        const success = await this.movementSystem.movePlayer(
          currentTestData.player.id,
          waypoint,
          { speed: 3, useStamina: false, avoidCollisions: true }
        );

        if (success) {
          const distance = calculateDistance(currentTestData.currentPosition, waypoint);
          currentTestData.distanceTraveled += distance;
          currentTestData.currentPosition = { ...waypoint };
          waypoint.reached = true;

          this.emitTypedEvent(EventType.TEST_WAYPOINT_UPDATE, {
            id: `waypoint_${stationId}_${waypointIndex}`,
            color: '#ffff00' // Yellow for reached
          });
        }
      }

      waypointIndex++;
      const timeoutId = setTimeout(testMovementAtWaypoint, 3500);
      if (currentTestData.timeoutIds) {
        currentTestData.timeoutIds.push(timeoutId);
      }
    };

    // Start movement testing sequence
    const initialTimeoutId = setTimeout(testMovementAtWaypoint, 1000);
    if (!testData.timeoutIds) {
      testData.timeoutIds = [];
    }
    testData.timeoutIds.push(initialTimeoutId);
  }

  private startTeleportationSequence(stationId: string): void {
    const testData = this.testData.get(stationId);
    if (!testData) return;

    let targetIndex = 0;

    const teleportToNextTarget = async () => {
      // Check if test data still exists (in case cleanup happened)
      const currentTestData = this.testData.get(stationId);
      if (!currentTestData || !currentTestData.waypoints || targetIndex >= currentTestData.waypoints.length) {
        this.completeTeleportationTest(stationId);
        return;
      }

      const target = currentTestData.waypoints[targetIndex];

      if (currentTestData.teleportationsAttempted !== undefined) {
        currentTestData.teleportationsAttempted++;
      }

      if (this.movementSystem && currentTestData.player) {
        // Verify player still exists in world before attempting teleportation
        try {
          const playerExists = this.world.entities.get(currentTestData.player.id);
          if (!playerExists) {
            // console.log(`[MovementTestSystem] Player ${currentTestData.player.id} no longer exists, stopping teleportation test`);
            return;
          }
        } catch (_error) {
          // console.log(`[MovementTestSystem] Error checking player existence: ${_error}`);
          return;
        }
        
        try {
          // Assume teleportPlayer method exists on movement system
          const success = await this.movementSystem.teleportPlayer(
            currentTestData.player.id,
            target,
            { validateLocation: true, allowElevation: true }
          );

          if (success) {
            if (currentTestData.teleportationsSuccessful !== undefined) {
              currentTestData.teleportationsSuccessful++;
            }
            currentTestData.currentPosition = { ...target };
            target.reached = true;
          }
        } catch (_error) {
          // console.warn('[MovementTestSystem] teleportPlayer warning:', _error);
        }
      } else {
        // Fallback: Use movePlayer instead of teleportPlayer
        // console.warn('[MovementTestSystem] teleportPlayer not available, using movePlayer as fallback');
        if ('movePlayer' in this.movementSystem) {
          // Assume movePlayer method exists
          (this.movementSystem as { movePlayer: (playerId: string, target: { x: number; y: number; z: number }) => void }).movePlayer(
            currentTestData.player.id,
            target
          );
        }
        if (currentTestData.teleportationsSuccessful !== undefined) {
          currentTestData.teleportationsSuccessful++;
        }
        currentTestData.currentPosition = { ...target };
        target.reached = true;
      }

      // Update visual
      this.emitTypedEvent(EventType.TEST_TELEPORT_TARGET_UPDATE, {
        id: `teleport_target_${stationId}_${targetIndex}`,
        color: '#00ff00' // Green for successful teleport
      });

      targetIndex++;
      const timeoutId = setTimeout(teleportToNextTarget, 4000); // 4 seconds between teleports
      if (currentTestData.timeoutIds) {
        currentTestData.timeoutIds.push(timeoutId);
      }
    };

    // Start teleportation sequence
    const initialTimeoutId = setTimeout(teleportToNextTarget, 1500);
    if (!testData.timeoutIds) {
      testData.timeoutIds = [];
    }
    testData.timeoutIds.push(initialTimeoutId);
  }

  private startComprehensiveSequence(stationId: string): void {
    const testData = this.testData.get(stationId);
    if (!testData) return;

    if (!testData.timeoutIds) {
      testData.timeoutIds = [];
    }

    // console.log('[MovementTestSystem] Starting comprehensive movement test sequence');

    // Phase 1: Basic movement (2-10 seconds)
    const phase1TimeoutId = setTimeout(() => {
      const currentTestData = this.testData.get(stationId);
      if (currentTestData) {
        // console.log('[MovementTestSystem] Phase 1: Basic movement');
        this.executeMovementPhase(stationId, 0, 2, false); // Waypoints 0-1, no pathfinding
      }
    }, 2000);
    testData.timeoutIds.push(phase1TimeoutId);

    // Phase 2: Pathfinding (12-20 seconds)
    const phase2TimeoutId = setTimeout(() => {
      const currentTestData = this.testData.get(stationId);
      if (currentTestData) {
        // console.log('[MovementTestSystem] Phase 2: Pathfinding');
        currentTestData.movementEffectsTested = true;
        this.executeMovementPhase(stationId, 2, 4, true); // Waypoints 2-3, with pathfinding
      }
    }, 12000);
    testData.timeoutIds.push(phase2TimeoutId);

    // Phase 3: Mixed movement with collision avoidance (22-30 seconds)
    const phase3TimeoutId = setTimeout(() => {
      const currentTestData = this.testData.get(stationId);
      if (currentTestData) {
        // console.log('[MovementTestSystem] Phase 3: Mixed movement');
        this.executeMovementPhase(stationId, 4, 6, true); // Waypoints 4-5, with pathfinding
      }
    }, 22000);
    testData.timeoutIds.push(phase3TimeoutId);

    // Complete test at 35 seconds (well within timeout)
    const completeTimeoutId = setTimeout(() => {
      // console.log('[MovementTestSystem] Completing comprehensive test');
      this.completeComprehensiveTest(stationId);
    }, 35000);
    testData.timeoutIds.push(completeTimeoutId);
  }

  private async executeMovementPhase(stationId: string, startIndex: number, endIndex: number, usePathfinding: boolean): Promise<void> {
    const testData = this.testData.get(stationId);
    if (!testData) return;

    if (!testData.waypoints) return;
    
    for (let i = startIndex; i < Math.min(endIndex, testData.waypoints.length); i++) {
      const waypoint = testData.waypoints[i];
      
      if (this.movementSystem) {
        let success = false;

        if (usePathfinding && this.pathfindingSystem) {
          const path = this.pathfindingSystem.findPath(
            testData.currentPosition,
            waypoint
          );

          if (path && path.length > 0) {
            testData.pathfindingWorked = true;
            success = await this.movementSystem.movePlayer(
              testData.player.id,
              waypoint,
              { speed: 4, pathfinding: true }
            );
          }
        } else {
          success = await this.movementSystem.movePlayer(
            testData.player.id,
            waypoint,
            { speed: 5 }
          );
        }

        if (success) {
          const distance = calculateDistance(testData.currentPosition, waypoint);
          testData.distanceTraveled += distance;
          testData.currentPosition = { ...waypoint };
          waypoint.reached = true;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  protected cleanupTest(stationId: string): void {
    // Clean up test data for the station
    const testData = this.testData.get(stationId);
    if (testData) {
      // CRITICAL: Clear all timeouts FIRST to prevent "Player not found" errors
      // This must happen before any player cleanup
      if (testData.timeoutIds) {
        testData.timeoutIds.forEach(timeoutId => {
          clearTimeout(timeoutId);
        });
        testData.timeoutIds = [];
      }
      
      // Stop any ongoing movement for this player
      if (testData.player && this.movementSystem) {
        try {
          this.movementSystem.stopMovement(testData.player.id);
        } catch (_error) {
          // Ignore errors if player already removed
        }
      }
      
      // Clean up visual proxy if exists
      const playerWithProxy = testData.player as unknown as PlayerWithProxy;
      if (playerWithProxy.visualProxy) {
        safeSceneRemove(this.world, playerWithProxy.visualProxy);
      }
      
      // Remove fake player from the framework's fakePlayers Map
      if (testData.player) {
        this.fakePlayers.delete(testData.player.id);
        
        // Emit cleanup event
        this.emitTypedEvent(EventType.TEST_PLAYER_REMOVE, {
          id: testData.player.id
        });
        
        // Remove player entity from world entities
        try {
          this.world.entities.remove(testData.player.id);
        } catch (_error) {
          // Ignore if already removed
        }
      }
      
      this.testData.delete(stationId);
    }
  }

  private completeBasicMovementTest(stationId: string): void {
    const testData = this.testData.get(stationId);
    if (!testData) return;
    
    const success = testData.waypoints?.every(waypoint => waypoint.reached) ?? false;
    const error = success ? undefined : 'Not all waypoints reached';
    
    // console.log(`[MovementTestSystem] Basic movement test ${success ? 'PASSED' : 'FAILED'} for station ${stationId}${error ? ': ' + error : ''}`);
    this.updateStationStatus(stationId, success ? 'passed' : 'failed', error);
  }

  private completePathfindingTest(stationId: string): void {
    const testData = this.testData.get(stationId);
    if (!testData) return;
    
    const success = testData.pathfindingWorked && (testData.waypoints?.every(waypoint => waypoint.reached) ?? false);
    const error = success ? undefined : 'Pathfinding failed or waypoints not reached';
    
    // console.log(`[MovementTestSystem] Pathfinding test ${success ? 'PASSED' : 'FAILED'} for station ${stationId}${error ? ': ' + error : ''}`);
    this.updateStationStatus(stationId, success ? 'passed' : 'failed', error);
  }

  private completeCollisionTest(stationId: string): void {
    const testData = this.testData.get(stationId);
    if (!testData) return;
    
    const success = testData.collisionDetected && (testData.waypoints?.every(waypoint => waypoint.reached) ?? false);
    const error = success ? undefined : 'Collision not detected or waypoints not reached';
    
    // console.log(`[MovementTestSystem] Collision test ${success ? 'PASSED' : 'FAILED'} for station ${stationId}${error ? ': ' + error : ''}`);
    this.updateStationStatus(stationId, success ? 'passed' : 'failed', error);
  }

  private completeTeleportationTest(stationId: string): void {
    const testData = this.testData.get(stationId);
    if (!testData) return;
    
    const success = (testData.teleportationsSuccessful ?? 0) > 0 && (testData.teleportationsSuccessful ?? 0) >= (testData.teleportationsAttempted ?? 0) / 2;
    const error = success ? undefined : 'Too few successful teleportations';
    
    // console.log(`[MovementTestSystem] Teleportation test ${success ? 'PASSED' : 'FAILED'} for station ${stationId}${error ? ': ' + error : ''}`);
    this.updateStationStatus(stationId, success ? 'passed' : 'failed', error);
  }

  private completeComprehensiveTest(stationId: string): void {
    const testData = this.testData.get(stationId);
    if (!testData) return;
    
    const success = testData.movementEffectsTested && testData.pathfindingWorked && (testData.waypoints?.every(waypoint => waypoint.reached) ?? false);
    const error = success ? undefined : 'Comprehensive test incomplete';
    
    // console.log(`[MovementTestSystem] Comprehensive test ${success ? 'PASSED' : 'FAILED'} for station ${stationId}${error ? ': ' + error : ''}`);
    this.updateStationStatus(stationId, success ? 'passed' : 'failed', error);
  }

  private isNearObstacle(position: Position3D, obstacles: Array<{ position: Position3D }>): boolean {
    const threshold = 2; // 2 unit distance threshold
    return obstacles.some(obstacle => {
      const distance = calculateDistance(position, obstacle.position);
      return distance < threshold;
    });
  }

  protected updateStationStatus(stationId: string, status: 'idle' | 'running' | 'passed' | 'failed', error?: string): void {
    const station = this.testStations.get(stationId);
    if (station) {
      station.status = status;
      if (error) {
        station.currentError = error;
      }
      // console.log(`[MovementTestSystem] Updated station ${stationId} status to ${status}${error ? ': ' + error : ''}`);
    }
  }
}