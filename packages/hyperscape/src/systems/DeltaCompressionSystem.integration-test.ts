/**
 * Integration test for DeltaCompressionSystem to verify the Y=-21.667 bug is fixed
 * This test simulates the exact conditions that caused the bug in production
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DeltaCompressionSystem } from './DeltaCompressionSystem';
import type { World } from '../World';
import * as THREE from 'three';

// Mock world
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

describe('DeltaCompressionSystem Integration Tests', () => {
  describe('Production Bug Verification: Y=43.869 should not become -21.667', () => {
    it('should handle the exact production scenario correctly', () => {
      // Simulate server encoding
      const serverSystem = new DeltaCompressionSystem(createMockWorld(true));
      
      // The exact Y position that was causing problems
      const problematicY = 43.86920781138462; // From production logs
      
      // Encode on server
      const serverPacket = serverSystem.compressEntityState('player-production', {
        position: new THREE.Vector3(0, problematicY, 0),
        rotation: new THREE.Quaternion(0, 0, 0, 1),
        velocity: new THREE.Vector3(0, 0, 0),
        state: 0
      }, Date.now());
      
      expect(serverPacket).toBeDefined();
      
      // Simulate client decoding (as if packet was sent over network)
      const clientSystem = new DeltaCompressionSystem(createMockWorld(false));
      const clientDecoded = clientSystem.decompressEntityState(serverPacket!);
      
      expect(clientDecoded).toBeDefined();
      expect(clientDecoded!.position.y).toBeCloseTo(problematicY, 2);
      expect(clientDecoded!.position.y).toBeGreaterThan(0);
      expect(clientDecoded!.position.y).not.toBeCloseTo(-21.667, 1);
      expect(clientDecoded!.position.y).not.toBeCloseTo(-21.692, 1);
    });

    it('should verify the raw bytes are correct', () => {
      const serverSystem = new DeltaCompressionSystem(createMockWorld(true));
      
      const y = 43.869;
      const quantized = Math.round(y * 1000); // 43869
      
      // Check that quantized value would overflow 16-bit signed
      expect(quantized).toBe(43869);
      expect(quantized).toBeGreaterThan(32767); // Max signed 16-bit
      
      // Encode
      const packet = serverSystem.compressEntityState('test-bytes', {
        position: new THREE.Vector3(0, y, 0),
        rotation: new THREE.Quaternion(0, 0, 0, 1),
        velocity: new THREE.Vector3(0, 0, 0),
        state: 0
      }, Date.now());
      
      // Check packet data
      expect(packet).toBeDefined();
      expect(packet!.data).toBeDefined();
      
      // Read Y position from packet (offset 4 since X is first 4 bytes)
      const view = new DataView(packet!.data.buffer, packet!.data.byteOffset, packet!.data.byteLength);
      const yQuantized = view.getInt32(4, true); // Y is at offset 4 (after X)
      const yDecoded = yQuantized / 1000;
      
      expect(yQuantized).toBe(43869);
      expect(yDecoded).toBeCloseTo(43.869, 3);
    });

    it('should handle multiple sequential updates without corruption', () => {
      const serverSystem = new DeltaCompressionSystem(createMockWorld(true));
      const clientSystem = new DeltaCompressionSystem(createMockWorld(false));
      
      const positions = [
        10.0,    // Normal position
        43.869,  // Problematic position  
        50.0,    // Another position
        43.869,  // Back to problematic
        100.5    // Large position
      ];
      
      for (let i = 0; i < positions.length; i++) {
        const y = positions[i];
        const timestamp = Date.now() + i * 100;
        
        // Server encodes
        const packet = serverSystem.compressEntityState('player-sequential', {
          position: new THREE.Vector3(i, y, i * 2),
          rotation: new THREE.Quaternion(0, 0, 0, 1),
          velocity: new THREE.Vector3(0, 0, 0),
          state: 0
        }, timestamp);
        
        // Client decodes
        const decoded = clientSystem.decompressEntityState(packet!);
        
        expect(decoded).toBeDefined();
        expect(decoded!.position.y).toBeCloseTo(y, 2);
        expect(decoded!.position.y).not.toBeCloseTo(-21.667, 1);
        
        // Store snapshot on client for delta compression
        clientSystem.decompressEntityState(packet!); // This stores the snapshot internally
      }
    });

    it('should handle large delta movements correctly', () => {
      const serverSystem = new DeltaCompressionSystem(createMockWorld(true));
      
      // First position
      const packet1 = serverSystem.compressEntityState('player-delta', {
        position: new THREE.Vector3(0, 10, 0),
        rotation: new THREE.Quaternion(0, 0, 0, 1),
        velocity: new THREE.Vector3(0, 0, 0),
        state: 0
      }, 1000);
      
      // Large jump in Y (delta = 60)
      const packet2 = serverSystem.compressEntityState('player-delta', {
        position: new THREE.Vector3(0, 70, 0),
        rotation: new THREE.Quaternion(0, 0, 0, 1),
        velocity: new THREE.Vector3(0, 0, 0),
        state: 0  
      }, 2000);
      
      const clientSystem = new DeltaCompressionSystem(createMockWorld(false));
      
      // Decode first packet (full snapshot)
      const decoded1 = clientSystem.decompressEntityState(packet1!);
      expect(decoded1!.position.y).toBeCloseTo(10, 2);
      
      // Decode second packet (might be delta)
      const decoded2 = clientSystem.decompressEntityState(packet2!);
      expect(decoded2!.position.y).toBeCloseTo(70, 2);
      expect(decoded2!.position.y).not.toBeCloseTo(-25.536, 1); // Should not be corrupted
    });

    it('should validate packet sizes are correct', () => {
      const serverSystem = new DeltaCompressionSystem(createMockWorld(true));
      
      const packet = serverSystem.compressEntityState('size-test', {
        position: new THREE.Vector3(1, 2, 3),
        rotation: new THREE.Quaternion(0.1, 0.2, 0.3, 0.9),
        velocity: new THREE.Vector3(4, 5, 6),
        state: 42
      }, Date.now());
      
      // Full packet should be: 3*4 (pos) + 4*2 (rot) + 3*4 (vel) + 1 (state) = 33 bytes
      expect(packet!.data.length).toBe(33);
      
      // Verify structure
      const view = new DataView(packet!.data.buffer, packet!.data.byteOffset, packet!.data.byteLength);
      
      // Position (32-bit)
      expect(view.getInt32(0, true) / 1000).toBeCloseTo(1, 2);
      expect(view.getInt32(4, true) / 1000).toBeCloseTo(2, 2); 
      expect(view.getInt32(8, true) / 1000).toBeCloseTo(3, 2);
      
      // Rotation (16-bit) at offset 12
      expect(view.getInt16(12, true) / 10000).toBeCloseTo(0.1, 2);
      expect(view.getInt16(14, true) / 10000).toBeCloseTo(0.2, 2);
      expect(view.getInt16(16, true) / 10000).toBeCloseTo(0.3, 2);
      expect(view.getInt16(18, true) / 10000).toBeCloseTo(0.9, 2);
      
      // Velocity (32-bit) at offset 20
      expect(view.getInt32(20, true) / 1000).toBeCloseTo(4, 2);
      expect(view.getInt32(24, true) / 1000).toBeCloseTo(5, 2);
      expect(view.getInt32(28, true) / 1000).toBeCloseTo(6, 2);
      
      // State (8-bit) at offset 32
      expect(view.getUint8(32)).toBe(42);
    });
  });
});





