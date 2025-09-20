/**
 * Unit tests for DeltaCompressionSystem to ensure proper encoding/decoding
 * Specifically tests the Y position encoding bug that caused positive values to become negative
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DeltaCompressionSystem } from './DeltaCompressionSystem';
import type { World } from '../World';
import * as THREE from 'three';

// Mock minimal world for testing
const createMockWorld = (isServer: boolean = true): World => {
  return {
    isServer,
    emit: () => {},
    on: () => {},
    off: () => {},
    network: null,
    getSystem: () => null
  } as unknown as World;
};

describe('DeltaCompressionSystem', () => {
  let system: DeltaCompressionSystem;
  let serverWorld: World;
  let clientWorld: World;

  beforeEach(() => {
    serverWorld = createMockWorld(true);
    clientWorld = createMockWorld(false);
  });

  describe('Y Position Encoding Bug Prevention', () => {
    it('should correctly encode and decode positive Y positions', () => {
      system = new DeltaCompressionSystem(serverWorld);
      
      // Test the exact value that was causing issues
      const testCases = [
        43.869,  // The exact value from the bug report
        10.0,
        50.0, 
        100.5,
        -5.0,   // Should handle negative correctly too
        0.0,
        200.0
      ];

      for (const originalY of testCases) {
        const entityId = `test-entity-${originalY}`;
        
        // Compress the entity state
        const compressed = system.compressEntityState(entityId, {
          position: new THREE.Vector3(0, originalY, 0),
          rotation: new THREE.Quaternion(0, 0, 0, 1),
          velocity: new THREE.Vector3(0, 0, 0),
          state: 0
        }, Date.now());

        expect(compressed).toBeDefined();
        if (!compressed) continue;

        // Decompress and check Y value
        const decompressed = system.decompressEntityState(compressed);
        expect(decompressed).toBeDefined();
        if (!decompressed) continue;

        // The decompressed Y should be very close to the original
        const tolerance = 0.01; // Allow small quantization error
        expect(Math.abs(decompressed.position.y - originalY)).toBeLessThan(tolerance);
        
        // Specifically check it didn't flip sign
        if (originalY > 0) {
          expect(decompressed.position.y).toBeGreaterThan(0);
        } else if (originalY < 0) {
          expect(decompressed.position.y).toBeLessThan(0);
        }
      }
    });

    it('should never turn positive Y into negative Y', () => {
      system = new DeltaCompressionSystem(serverWorld);
      
      // Test a range of positive Y values
      for (let y = 0.1; y <= 100; y += 10) {
        // Use unique entity ID for each test to ensure full packets
        const entityId = `test-y-${y}`;
        const compressed = system.compressEntityState(entityId, {
          position: new THREE.Vector3(0, y, 0),
          rotation: new THREE.Quaternion(0, 0, 0, 1),
          velocity: new THREE.Vector3(0, 0, 0),
          state: 0
        }, Date.now());

        const decompressed = system.decompressEntityState(compressed!);
        expect(decompressed?.position.y).toBeGreaterThan(0);
        
        // Check it's not in the -21.xxx range that was the bug signature
        expect(decompressed?.position.y).not.toBeCloseTo(-21.667, 1);
      }
    });

    it('should handle the exact bug case: 43.869 should not become -21.667', () => {
      system = new DeltaCompressionSystem(serverWorld);
      
      const compressed = system.compressEntityState('player-1', {
        position: new THREE.Vector3(0, 43.869, 0),
        rotation: new THREE.Quaternion(0, 0, 0, 1),
        velocity: new THREE.Vector3(0, 0, 0),
        state: 0
      }, Date.now());

      const decompressed = system.decompressEntityState(compressed!);
      
      // Should be close to original value
      expect(decompressed?.position.y).toBeCloseTo(43.869, 1);
      
      // Should NOT be the corrupted value
      expect(decompressed?.position.y).not.toBeCloseTo(-21.667, 1);
      expect(decompressed?.position.y).not.toBeCloseTo(-21.692, 1);
    });

    it('should properly encode deltas between snapshots', () => {
      system = new DeltaCompressionSystem(serverWorld);
      
      // Create initial snapshot
      const firstPos = { x: 0, y: 50, z: 0 };
      system.compressEntityState('entity-1', {
        position: new THREE.Vector3(firstPos.x, firstPos.y, firstPos.z),
        rotation: new THREE.Quaternion(0, 0, 0, 1),
        velocity: new THREE.Vector3(0, 0, 0),
        state: 0
      }, 1000);

      // Create delta with small Y change
      const secondPos = { x: 1, y: 51.5, z: 2 };
      const deltaPacket = system.compressEntityState('entity-1', {
        position: new THREE.Vector3(secondPos.x, secondPos.y, secondPos.z),
        rotation: new THREE.Quaternion(0, 0, 0, 1),
        velocity: new THREE.Vector3(0, 0, 0),
        state: 0
      }, 2000);

      const decompressed = system.decompressEntityState(deltaPacket!);
      
      // Delta should preserve positive Y
      expect(decompressed?.position.y).toBeCloseTo(51.5, 1);
      expect(decompressed?.position.y).toBeGreaterThan(0);
    });

    it('should validate packets on server (if validation is enabled)', () => {
      system = new DeltaCompressionSystem(serverWorld);
      
      // The createFullPacket method should validate on server
      // This test ensures validation would catch encoding errors
      const testPosition = { x: 10, y: 43.869, z: 20 };
      
      // This should not throw because encoding is now fixed
      expect(() => {
        system.compressEntityState('test-validation', {
          position: new THREE.Vector3(testPosition.x, testPosition.y, testPosition.z),
          rotation: new THREE.Quaternion(0, 0, 0, 1),
          velocity: new THREE.Vector3(0, 0, 0),
          state: 0
        }, Date.now());
      }).not.toThrow();
    });
  });

  describe('General compression tests', () => {
    it('should compress and decompress position correctly', () => {
      system = new DeltaCompressionSystem(clientWorld);
      
      const originalPos = new THREE.Vector3(123.456, 78.901, -45.678);
      const compressed = system.compressEntityState('test', {
        position: originalPos,
        rotation: new THREE.Quaternion(0, 0, 0, 1),
        velocity: new THREE.Vector3(0, 0, 0),
        state: 0
      }, Date.now());

      const decompressed = system.decompressEntityState(compressed!);
      
      // Check all components with reasonable tolerance
      expect(decompressed?.position.x).toBeCloseTo(originalPos.x, 1);
      expect(decompressed?.position.y).toBeCloseTo(originalPos.y, 1);
      expect(decompressed?.position.z).toBeCloseTo(originalPos.z, 1);
    });

    it('should handle edge case values', () => {
      system = new DeltaCompressionSystem(serverWorld);
      
      const edgeCases = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-999, 999, 0),
        new THREE.Vector3(0.001, 0.001, 0.001),
        new THREE.Vector3(32.767, 32.767, 32.767), // Near signed 16-bit limit / 1000
      ];

      for (const pos of edgeCases) {
        const compressed = system.compressEntityState(`edge-${pos.y}`, {
          position: pos,
          rotation: new THREE.Quaternion(0, 0, 0, 1),
          velocity: new THREE.Vector3(0, 0, 0),
          state: 0
        }, Date.now());

        const decompressed = system.decompressEntityState(compressed!);
        
        // All values should be preserved within quantization tolerance
        expect(decompressed?.position.x).toBeCloseTo(pos.x, 1);
        expect(decompressed?.position.y).toBeCloseTo(pos.y, 1);
        expect(decompressed?.position.z).toBeCloseTo(pos.z, 1);
      }
    });
  });
});
