/**
 * Unit tests for MovementSimulator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MovementSimulator } from '../../physics/MovementSimulator';
import { MovementConfig } from '../../config/movement';
import { 
  MoveState, 
  InputButtons,
  type PlayerStateSnapshot,
  type InputCommand
} from '../../types/networking';
import * as THREE from 'three';

describe('MovementSimulator', () => {
  let initialState: PlayerStateSnapshot;
  let basicInput: InputCommand;
  
  beforeEach(() => {
    initialState = {
      sequence: 0,
      timestamp: 1000,
      position: new THREE.Vector3(0, 0, 0),
      velocity: new THREE.Vector3(0, 0, 0),
      acceleration: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Quaternion(),
      moveState: MoveState.IDLE,
      grounded: true,
      health: 100,
      effects: {
        speedMultiplier: 1,
        jumpMultiplier: 1,
        gravityMultiplier: 1,
        canMove: true,
        canJump: true,
        activeEffects: []
      }
    };
    
    basicInput = {
      sequence: 1,
      timestamp: 1016,
      deltaTime: 0.016,
      moveVector: new THREE.Vector3(0, 0, 0),
      buttons: 0,
      viewAngles: new THREE.Quaternion()
    };
  });
  
  describe('Ground Movement', () => {
    it('should accelerate forward when moving', () => {
      const input = {
        ...basicInput,
        buttons: InputButtons.FORWARD,
        moveVector: new THREE.Vector3(0, 0, -1)
      };
      
      const newState = MovementSimulator.simulate(
        initialState,
        input,
        MovementConfig
      );
      
      expect(newState.velocity.z).toBeLessThan(0); // Moving forward (negative Z)
      expect(newState.position.z).toBeLessThan(0);
      expect(newState.moveState).toBe(MoveState.WALKING);
    });
    
    it('should reach max speed over time', () => {
      let state = initialState;
      const input = {
        ...basicInput,
        buttons: InputButtons.FORWARD | InputButtons.SPRINT,
        moveVector: new THREE.Vector3(0, 0, -1)
      };
      
      // Simulate for 2 seconds
      for (let i = 0; i < 120; i++) {
        state = MovementSimulator.simulate(state, input, MovementConfig);
      }
      
      const speed = new THREE.Vector2(state.velocity.x, state.velocity.z).length();
      expect(speed).toBeCloseTo(MovementConfig.maxSprintSpeed, 1);
      expect(state.moveState).toBe(MoveState.SPRINTING);
    });
    
    it('should apply friction when stopping', () => {
      // Start with velocity
      const movingState = {
        ...initialState,
        velocity: new THREE.Vector3(0, 0, -5)
      };
      
      const stopInput = {
        ...basicInput,
        buttons: 0,
        moveVector: new THREE.Vector3(0, 0, 0)
      };
      
      const newState = MovementSimulator.simulate(
        movingState,
        stopInput,
        MovementConfig
      );
      
      // Should slow down but not stop immediately
      expect(Math.abs(newState.velocity.z)).toBeLessThan(5);
      expect(Math.abs(newState.velocity.z)).toBeGreaterThan(0);
    });
    
    it('should handle diagonal movement', () => {
      const input = {
        ...basicInput,
        buttons: InputButtons.FORWARD | InputButtons.RIGHT,
        moveVector: new THREE.Vector3(1, 0, -1).normalize()
      };
      
      const newState = MovementSimulator.simulate(
        initialState,
        input,
        MovementConfig
      );
      
      expect(newState.velocity.x).toBeGreaterThan(0); // Moving right
      expect(newState.velocity.z).toBeLessThan(0); // Moving forward
      
      // Diagonal speed should not exceed max speed
      const speed = new THREE.Vector2(newState.velocity.x, newState.velocity.z).length();
      expect(speed).toBeLessThanOrEqual(MovementConfig.maxGroundSpeed * 1.1); // Small tolerance
    });
  });
  
  describe('Jumping', () => {
    it('should jump when grounded', () => {
      const input = {
        ...basicInput,
        buttons: InputButtons.JUMP
      };
      
      const newState = MovementSimulator.simulate(
        initialState,
        input,
        MovementConfig
      );
      
      expect(newState.velocity.y).toBeGreaterThan(0);
      expect(newState.grounded).toBe(false);
      expect(newState.moveState).toBe(MoveState.JUMPING);
    });
    
    it('should not jump when airborne', () => {
      const airborneState = {
        ...initialState,
        grounded: false,
        velocity: new THREE.Vector3(0, 5, 0)
      };
      
      const input = {
        ...basicInput,
        buttons: InputButtons.JUMP
      };
      
      const newState = MovementSimulator.simulate(
        airborneState,
        input,
        MovementConfig
      );
      
      // Velocity should decrease due to gravity, not increase from jump
      expect(newState.velocity.y).toBeLessThan(airborneState.velocity.y);
    });
    
    it('should apply gravity when falling', () => {
      const fallingState = {
        ...initialState,
        grounded: false,
        position: new THREE.Vector3(0, 10, 0),
        velocity: new THREE.Vector3(0, 0, 0)
      };
      
      const newState = MovementSimulator.simulate(
        fallingState,
        basicInput,
        MovementConfig
      );
      
      expect(newState.velocity.y).toBeLessThan(0); // Falling
      expect(newState.moveState).toBe(MoveState.FALLING);
    });
    
    it('should land and stop vertical velocity', () => {
      // Mock world with terrain at y=0
      const mockWorld = {
        getSystem: (name: string) => {
          if (name === 'terrain') {
            return {
              getHeightAt: (_x: number, _z: number) => 0
            };
          }
          return null;
        }
      };
      
      const fallingState = {
        ...initialState,
        grounded: false,
        position: new THREE.Vector3(0, 0.2, 0),
        velocity: new THREE.Vector3(0, -10, 0),
        moveState: MoveState.FALLING
      };
      
      const newState = MovementSimulator.simulate(
        fallingState,
        basicInput,
        MovementConfig,
        mockWorld
      );
      
      expect(newState.grounded).toBe(true);
      expect(newState.velocity.y).toBe(0);
      expect(newState.moveState).toBe(MoveState.IDLE);
    });
  });
  
  describe('Air Control', () => {
    it('should have limited air control', () => {
      const airborneState = {
        ...initialState,
        grounded: false,
        velocity: new THREE.Vector3(0, 0, -5) // Moving forward in air
      };
      
      const strafeInput = {
        ...basicInput,
        buttons: InputButtons.RIGHT,
        moveVector: new THREE.Vector3(1, 0, 0)
      };
      
      const newState = MovementSimulator.simulate(
        airborneState,
        strafeInput,
        MovementConfig
      );
      
      // Should have some lateral movement but limited
      expect(newState.velocity.x).toBeGreaterThan(0);
      // Air acceleration is applied over time, check it's reasonable
      expect(newState.velocity.x).toBeLessThan(MovementConfig.maxAirSpeed);
    });
  });
  
  describe('Status Effects', () => {
    it('should apply speed multiplier', () => {
      const boostedState = {
        ...initialState,
        effects: {
          ...initialState.effects,
          speedMultiplier: 2.0
        }
      };
      
      const input = {
        ...basicInput,
        buttons: InputButtons.FORWARD,
        moveVector: new THREE.Vector3(0, 0, -1)
      };
      
      const normalResult = MovementSimulator.simulate(initialState, input, MovementConfig);
      const boostedResult = MovementSimulator.simulate(boostedState, input, MovementConfig);
      
      expect(Math.abs(boostedResult.velocity.z)).toBeGreaterThan(Math.abs(normalResult.velocity.z));
    });
    
    it('should prevent movement when rooted', () => {
      const rootedState = {
        ...initialState,
        effects: {
          ...initialState.effects,
          canMove: false
        }
      };
      
      const input = {
        ...basicInput,
        buttons: InputButtons.FORWARD,
        moveVector: new THREE.Vector3(0, 0, -1)
      };
      
      const newState = MovementSimulator.simulate(
        rootedState,
        input,
        MovementConfig
      );
      
      expect(newState.velocity.x).toBe(0);
      expect(newState.velocity.z).toBe(0);
      expect(newState.position.equals(rootedState.position)).toBe(true);
    });
    
    it('should prevent jumping when effect disabled', () => {
      const noJumpState = {
        ...initialState,
        effects: {
          ...initialState.effects,
          canJump: false
        }
      };
      
      const input = {
        ...basicInput,
        buttons: InputButtons.JUMP
      };
      
      const newState = MovementSimulator.simulate(
        noJumpState,
        input,
        MovementConfig
      );
      
      expect(newState.velocity.y).toBe(0);
      expect(newState.grounded).toBe(true);
    });
  });
  
  describe('State Validation', () => {
    it('should validate valid states', () => {
      const validState = {
        ...initialState,
        velocity: new THREE.Vector3(5, 0, 5)
      };
      
      expect(MovementSimulator.validateState(validState, MovementConfig)).toBe(true);
    });
    
    it('should reject states with excessive speed', () => {
      const tooFastState = {
        ...initialState,
        velocity: new THREE.Vector3(100, 0, 100) // Way too fast
      };
      
      expect(MovementSimulator.validateState(tooFastState, MovementConfig)).toBe(false);
    });
    
    it('should reject states with NaN values', () => {
      const nanState = {
        ...initialState,
        position: new THREE.Vector3(NaN, 0, 0)
      };
      
      expect(MovementSimulator.validateState(nanState, MovementConfig)).toBe(false);
    });
    
    it('should reject states outside world bounds', () => {
      const outOfBoundsState = {
        ...initialState,
        position: new THREE.Vector3(99999, 0, 0)
      };
      
      expect(MovementSimulator.validateState(outOfBoundsState, MovementConfig)).toBe(false);
    });
  });
  
  describe('Determinism', () => {
    it('should produce identical results for same input', () => {
      const input = {
        ...basicInput,
        buttons: InputButtons.FORWARD | InputButtons.JUMP,
        moveVector: new THREE.Vector3(0.7, 0, -0.7)
      };
      
      const result1 = MovementSimulator.simulate(initialState, input, MovementConfig);
      const result2 = MovementSimulator.simulate(initialState, input, MovementConfig);
      
      expect(result1.position.equals(result2.position)).toBe(true);
      expect(result1.velocity.equals(result2.velocity)).toBe(true);
      expect(result1.moveState).toBe(result2.moveState);
      expect(result1.grounded).toBe(result2.grounded);
    });
    
    it('should handle rapid input changes', () => {
      let state = initialState;
      
      // Rapid direction changes
      const inputs = [
        { ...basicInput, moveVector: new THREE.Vector3(1, 0, 0) },
        { ...basicInput, moveVector: new THREE.Vector3(-1, 0, 0) },
        { ...basicInput, moveVector: new THREE.Vector3(0, 0, 1) },
        { ...basicInput, moveVector: new THREE.Vector3(0, 0, -1) }
      ];
      
      for (const input of inputs) {
        state = MovementSimulator.simulate(state, input, MovementConfig);
        expect(MovementSimulator.validateState(state, MovementConfig)).toBe(true);
      }
    });
  });
});
