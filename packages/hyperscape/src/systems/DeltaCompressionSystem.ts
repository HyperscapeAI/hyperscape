/**
 * Delta Compression System
 * Reduces network bandwidth by sending only changes
 */

import { System } from './System';
import type { World } from '../World';
import type { NetworkSystem } from '../types/system-interfaces';
import * as THREE from 'three';

const _v3_1 = new THREE.Vector3()
const _v3_2 = new THREE.Vector3()
const _q_1 = new THREE.Quaternion()

interface EntitySnapshot {
  id: string;
  position: Float32Array;
  rotation: Float32Array;
  velocity: Float32Array;
  state: number;
  timestamp: number;
  sequence: number;
}

interface DeltaPacket {
  id: string;
  sequence: number;
  baseSequence: number;
  fields: number; // Bitmask of changed fields
  data: Uint8Array;
}

// Field flags for delta compression
enum DeltaFields {
  POSITION_X = 1 << 0,
  POSITION_Y = 1 << 1,
  POSITION_Z = 1 << 2,
  ROTATION_X = 1 << 3,
  ROTATION_Y = 1 << 4,
  ROTATION_Z = 1 << 5,
  ROTATION_W = 1 << 6,
  VELOCITY_X = 1 << 7,
  VELOCITY_Y = 1 << 8,
  VELOCITY_Z = 1 << 9,
  STATE = 1 << 10,
}

/**
 * Implements delta compression for network packets
 */
export class DeltaCompressionSystem extends System {
  private snapshots: Map<string, EntitySnapshot[]> = new Map();
  private maxSnapshots: number = 60; // Keep 1 second at 60Hz
  private quantizationScale: number = 1000; // Position precision
  private rotationScale: number = 32767; // Rotation precision (16-bit)
  private enabled: boolean;
  
  // Metrics
  private metrics = {
    totalBytes: 0,
    compressedBytes: 0,
    compressionRatio: 1.0,
    packetsCompressed: 0,
    packetsFull: 0
  };
  
  constructor(world: World) {
    super(world);
    // Enable unless explicitly disabled. Supports server and browser envs
    const env = (typeof process !== 'undefined' ? (process.env || {}) : {}) as Record<string, string | undefined>;
    const gEnv = (globalThis as unknown as { env?: Record<string, string> }).env || {};
    const flag = env.DELTA_COMPRESSION ?? gEnv.DELTA_COMPRESSION;
    // Disable delta compression for now - conflicts with interpolation system
    // TODO: Integrate delta compression with interpolation for bandwidth savings
    this.enabled = false; // flag !== 'false';
  }
  
  override start(): void {
    console.log('[DeltaCompression] Starting delta compression system');
    
    // Intercept outgoing packets for compression
    if (this.world.isServer && this.enabled) {
      this.interceptServerPackets();
    } else {
      this.interceptClientPackets();
    }
  }
  
  /**
   * Compress entity state into delta packet
   */
  public compressEntityState(
    entityId: string,
    currentState: {
      position: THREE.Vector3;
      rotation: THREE.Quaternion;
      velocity: THREE.Vector3;
      state: number;
    },
    sequence: number
  ): DeltaPacket | null {
    // Get previous snapshots
    let snapshots = this.snapshots.get(entityId);
    if (!snapshots) {
      snapshots = [];
      this.snapshots.set(entityId, snapshots);
    }
    
    // Create current snapshot
    const snapshot: EntitySnapshot = {
      id: entityId,
      position: new Float32Array([
        currentState.position.x,
        currentState.position.y,
        currentState.position.z
      ]),
      rotation: new Float32Array([
        currentState.rotation.x,
        currentState.rotation.y,
        currentState.rotation.z,
        currentState.rotation.w
      ]),
      velocity: new Float32Array([
        currentState.velocity.x,
        currentState.velocity.y,
        currentState.velocity.z
      ]),
      state: currentState.state,
      timestamp: performance.now(),
      sequence
    };
    
    // Store snapshot
    snapshots.push(snapshot);
    while (snapshots.length > this.maxSnapshots) {
      snapshots.shift();
    }
    
    // Find best base snapshot for delta
    const baseSnapshot = this.findBestBaseSnapshot(snapshots, sequence);
    
    if (!baseSnapshot) {
      // Send full snapshot
      this.metrics.packetsFull++;
      return this.createFullPacket(snapshot);
    }
    
    // Create delta packet
    const delta = this.createDeltaPacket(baseSnapshot, snapshot);
    
    if (delta) {
      this.metrics.packetsCompressed++;
      this.updateMetrics(snapshot, delta);
      return delta;
    }
    
    // Delta failed (likely due to overflow), fall back to full packet
    this.metrics.packetsFull++;
    return this.createFullPacket(snapshot);
  }
  
  /**
   * Decompress delta packet into entity state
   */
  public decompressEntityState(packet: DeltaPacket): {
    position: THREE.Vector3;
    rotation: THREE.Quaternion;
    velocity: THREE.Vector3;
    state: number;
  } | null {
    // If this is a full packet (no base), decode absolute values
    if (packet.baseSequence === -1) {
      // IMPORTANT: Use packet.data directly, not packet.data.buffer
      // because packet.data might be a view with an offset into a larger buffer
      const view = new DataView(packet.data.buffer, packet.data.byteOffset, packet.data.byteLength);
      let offset = 0;
      // Read 32-bit positions (to handle values that would overflow 16-bit)
      const px = view.getInt32(offset, true) / this.quantizationScale; offset += 4;
      const py = view.getInt32(offset, true) / this.quantizationScale; offset += 4;
      const pz = view.getInt32(offset, true) / this.quantizationScale; offset += 4;
      const rx = view.getInt16(offset, true) / this.rotationScale; offset += 2;
      const ry = view.getInt16(offset, true) / this.rotationScale; offset += 2;
      const rz = view.getInt16(offset, true) / this.rotationScale; offset += 2;
      const rw = view.getInt16(offset, true) / this.rotationScale; offset += 2;
      // Read 32-bit velocities
      const vx = view.getInt32(offset, true) / this.quantizationScale; offset += 4;
      const vy = view.getInt32(offset, true) / this.quantizationScale; offset += 4;
      const vz = view.getInt32(offset, true) / this.quantizationScale; offset += 4;
      const st = view.getUint8(offset);

      const result = {
        position: new THREE.Vector3(px, py, pz),
        rotation: new THREE.Quaternion(rx, ry, rz, rw),
        velocity: new THREE.Vector3(vx, vy, vz),
        state: st
      };

      // Store snapshot for future deltas
      this.storeSnapshot(packet.id, {
        id: packet.id,
        position: new Float32Array([px, py, pz]),
        rotation: new Float32Array([rx, ry, rz, rw]),
        velocity: new Float32Array([vx, vy, vz]),
        state: st,
        timestamp: performance.now(),
        sequence: packet.sequence
      });

      return result;
    }

    // Delta packet path requires a base snapshot
    const snapshots = this.snapshots.get(packet.id);
    if (!snapshots) return null;
    const baseSnapshot = snapshots.find(s => s.sequence === packet.baseSequence);
    if (!baseSnapshot) return null;
    
    // Apply delta to base
    const result = {
      position: new THREE.Vector3(
        baseSnapshot.position[0],
        baseSnapshot.position[1],
        baseSnapshot.position[2]
      ),
      rotation: new THREE.Quaternion(
        baseSnapshot.rotation[0],
        baseSnapshot.rotation[1],
        baseSnapshot.rotation[2],
        baseSnapshot.rotation[3]
      ),
      velocity: new THREE.Vector3(
        baseSnapshot.velocity[0],
        baseSnapshot.velocity[1],
        baseSnapshot.velocity[2]
      ),
      state: baseSnapshot.state
    };
    
    // Read delta data - handle potential buffer offsets
    const view = new DataView(packet.data.buffer, packet.data.byteOffset, packet.data.byteLength);
    let offset = 0;
    
    // Apply position deltas (relative to base)
    if (packet.fields & DeltaFields.POSITION_X) {
      result.position.x += view.getInt16(offset, true) / this.quantizationScale;
      offset += 2;
    }
    if (packet.fields & DeltaFields.POSITION_Y) {
      result.position.y += view.getInt16(offset, true) / this.quantizationScale;
      offset += 2;
    }
    if (packet.fields & DeltaFields.POSITION_Z) {
      result.position.z += view.getInt16(offset, true) / this.quantizationScale;
      offset += 2;
    }
    
    // Apply rotation deltas
    if (packet.fields & DeltaFields.ROTATION_X) {
      result.rotation.x = view.getInt16(offset, true) / this.rotationScale;
      offset += 2;
    }
    if (packet.fields & DeltaFields.ROTATION_Y) {
      result.rotation.y = view.getInt16(offset, true) / this.rotationScale;
      offset += 2;
    }
    if (packet.fields & DeltaFields.ROTATION_Z) {
      result.rotation.z = view.getInt16(offset, true) / this.rotationScale;
      offset += 2;
    }
    if (packet.fields & DeltaFields.ROTATION_W) {
      result.rotation.w = view.getInt16(offset, true) / this.rotationScale;
      offset += 2;
    }
    
    // Apply velocity values (absolute, not deltas)
    if (packet.fields & DeltaFields.VELOCITY_X) {
      result.velocity.x = view.getInt16(offset, true) / this.quantizationScale;
      offset += 2;
    }
    if (packet.fields & DeltaFields.VELOCITY_Y) {
      result.velocity.y = view.getInt16(offset, true) / this.quantizationScale;
      offset += 2;
    }
    if (packet.fields & DeltaFields.VELOCITY_Z) {
      result.velocity.z = view.getInt16(offset, true) / this.quantizationScale;
      offset += 2;
    }
    
    // Apply state delta
    if (packet.fields & DeltaFields.STATE) {
      result.state = view.getUint8(offset);
      offset += 1;
    }
    // Persist the new snapshot for subsequent deltas
    this.storeSnapshot(packet.id, {
      id: packet.id,
      position: new Float32Array([result.position.x, result.position.y, result.position.z]),
      rotation: new Float32Array([result.rotation.x, result.rotation.y, result.rotation.z, result.rotation.w]),
      velocity: new Float32Array([result.velocity.x, result.velocity.y, result.velocity.z]),
      state: result.state,
      timestamp: performance.now(),
      sequence: packet.sequence
    });

    return result;
  }
  
  /**
   * Find best base snapshot for delta compression
   */
  private findBestBaseSnapshot(
    snapshots: EntitySnapshot[],
    _currentSequence: number
  ): EntitySnapshot | null {
    // Find most recent acknowledged snapshot
    // For now, use the previous snapshot
    if (snapshots.length < 2) return null;
    
    return snapshots[snapshots.length - 2];
  }
  
  /**
   * Create delta packet from two snapshots
   */
  private createDeltaPacket(
    base: EntitySnapshot,
    current: EntitySnapshot
  ): DeltaPacket | null {
    // Check if any delta would overflow 16-bit
    const maxDelta = 32.767; // Max value that fits in signed 16-bit after quantization
    
    // Check for overflow in any position component
    for (let i = 0; i < 3; i++) {
      const delta = Math.abs(current.position[i] - base.position[i]);
      if (delta > maxDelta) {
        // Delta too large, force full packet
        return null;
      }
    }
    
    // Check for overflow in velocity components
    for (let i = 0; i < 3; i++) {
      const delta = Math.abs(current.velocity[i] - base.velocity[i]);
      if (delta > maxDelta) {
        return null;
      }
    }
    
    let fields = 0;
    const data: number[] = [];
    
    // Check position changes
    const posThreshold = 0.01; // 1cm
    if (Math.abs(current.position[0] - base.position[0]) > posThreshold) {
      fields |= DeltaFields.POSITION_X;
      const quantized = Math.round((current.position[0] - base.position[0]) * this.quantizationScale);
      // Store as signed 16-bit integer (little-endian)
      const tempView = new DataView(new ArrayBuffer(2));
      tempView.setInt16(0, quantized, true);
      data.push(tempView.getUint8(0), tempView.getUint8(1));
    }
    if (Math.abs(current.position[1] - base.position[1]) > posThreshold) {
      fields |= DeltaFields.POSITION_Y;
      const quantized = Math.round((current.position[1] - base.position[1]) * this.quantizationScale);
      // Store as signed 16-bit integer (little-endian)
      const tempView = new DataView(new ArrayBuffer(2));
      tempView.setInt16(0, quantized, true);
      data.push(tempView.getUint8(0), tempView.getUint8(1));
    }
    if (Math.abs(current.position[2] - base.position[2]) > posThreshold) {
      fields |= DeltaFields.POSITION_Z;
      const quantized = Math.round((current.position[2] - base.position[2]) * this.quantizationScale);
      // Store as signed 16-bit integer (little-endian)
      const tempView = new DataView(new ArrayBuffer(2));
      tempView.setInt16(0, quantized, true);
      data.push(tempView.getUint8(0), tempView.getUint8(1));
    }
    
    // Check rotation changes
    const rotThreshold = 0.001;
    if (Math.abs(current.rotation[0] - base.rotation[0]) > rotThreshold) {
      fields |= DeltaFields.ROTATION_X;
      const quantized = Math.round(current.rotation[0] * this.rotationScale);
      // Store as signed 16-bit integer (little-endian)
      const tempView = new DataView(new ArrayBuffer(2));
      tempView.setInt16(0, quantized, true);
      data.push(tempView.getUint8(0), tempView.getUint8(1));
    }
    if (Math.abs(current.rotation[1] - base.rotation[1]) > rotThreshold) {
      fields |= DeltaFields.ROTATION_Y;
      const quantized = Math.round(current.rotation[1] * this.rotationScale);
      // Store as signed 16-bit integer (little-endian)
      const tempView = new DataView(new ArrayBuffer(2));
      tempView.setInt16(0, quantized, true);
      data.push(tempView.getUint8(0), tempView.getUint8(1));
    }
    if (Math.abs(current.rotation[2] - base.rotation[2]) > rotThreshold) {
      fields |= DeltaFields.ROTATION_Z;
      const quantized = Math.round(current.rotation[2] * this.rotationScale);
      // Store as signed 16-bit integer (little-endian)
      const tempView = new DataView(new ArrayBuffer(2));
      tempView.setInt16(0, quantized, true);
      data.push(tempView.getUint8(0), tempView.getUint8(1));
    }
    if (Math.abs(current.rotation[3] - base.rotation[3]) > rotThreshold) {
      fields |= DeltaFields.ROTATION_W;
      const quantized = Math.round(current.rotation[3] * this.rotationScale);
      // Store as signed 16-bit integer (little-endian)
      const tempView = new DataView(new ArrayBuffer(2));
      tempView.setInt16(0, quantized, true);
      data.push(tempView.getUint8(0), tempView.getUint8(1));
    }
    
    // Check velocity changes
    const velThreshold = 0.1;
    if (Math.abs(current.velocity[0] - base.velocity[0]) > velThreshold) {
      fields |= DeltaFields.VELOCITY_X;
      const quantized = Math.round(current.velocity[0] * this.quantizationScale);
      // Store as signed 16-bit integer (little-endian)
      const tempView = new DataView(new ArrayBuffer(2));
      tempView.setInt16(0, quantized, true);
      data.push(tempView.getUint8(0), tempView.getUint8(1));
    }
    if (Math.abs(current.velocity[1] - base.velocity[1]) > velThreshold) {
      fields |= DeltaFields.VELOCITY_Y;
      const quantized = Math.round(current.velocity[1] * this.quantizationScale);
      // Store as signed 16-bit integer (little-endian)
      const tempView = new DataView(new ArrayBuffer(2));
      tempView.setInt16(0, quantized, true);
      data.push(tempView.getUint8(0), tempView.getUint8(1));
    }
    if (Math.abs(current.velocity[2] - base.velocity[2]) > velThreshold) {
      fields |= DeltaFields.VELOCITY_Z;
      const quantized = Math.round(current.velocity[2] * this.quantizationScale);
      // Store as signed 16-bit integer (little-endian)
      const tempView = new DataView(new ArrayBuffer(2));
      tempView.setInt16(0, quantized, true);
      data.push(tempView.getUint8(0), tempView.getUint8(1));
    }
    
    // Check state change
    if (current.state !== base.state) {
      fields |= DeltaFields.STATE;
      data.push(current.state);
    }
    
    return {
      id: current.id,
      sequence: current.sequence,
      baseSequence: base.sequence,
      fields,
      data: new Uint8Array(data)
    };
  }
  
  /**
   * Create full packet (no compression)
   */
  private createFullPacket(snapshot: EntitySnapshot): DeltaPacket {
    // Use 32-bit for positions to avoid overflow: 3*4 + 4*2 + 3*4 + 1 = 33 bytes
    const buffer = new ArrayBuffer(33); 
    const view = new DataView(buffer);
    let offset = 0;
    
    // Pack positions using 32-bit integers to avoid overflow
    for (let i = 0; i < 3; i++) {
      const quantized = Math.round(snapshot.position[i] * this.quantizationScale);
      view.setInt32(offset, quantized, true); // 32-bit signed integer
      offset += 4;
    }
    
    for (let i = 0; i < 4; i++) {
      const quantized = Math.round(snapshot.rotation[i] * this.rotationScale);
      view.setInt16(offset, quantized, true); // little-endian
      offset += 2;
    }
    
    // Pack velocities using 32-bit integers to avoid overflow
    for (let i = 0; i < 3; i++) {
      const quantized = Math.round(snapshot.velocity[i] * this.quantizationScale);
      view.setInt32(offset, quantized, true); // 32-bit signed integer
      offset += 4;
    }
    
    view.setUint8(offset, snapshot.state);
    
    const packet = {
      id: snapshot.id,
      sequence: snapshot.sequence,
      baseSequence: -1, // Full snapshot
      fields: 0x7FF, // All fields
      data: new Uint8Array(buffer)
    };
    
    // VALIDATION: Verify packet can be decoded correctly on server
    if (this.world.isServer) {
      const decoded = this.decompressEntityState(packet);
      if (decoded) {
        // Check Y position specifically
        const yDiff = Math.abs(decoded.position.y - snapshot.position[1]);
        if (yDiff > 0.1) {
          console.error('[DeltaCompression] CRITICAL: Packet encoding error!');
          console.error(`  Original Y: ${snapshot.position[1]}`);
          console.error(`  Decoded Y: ${decoded.position.y}`);
          console.error(`  Difference: ${yDiff}`);
          throw new Error(`DeltaCompression packet validation failed: Y position corrupted (${snapshot.position[1]} -> ${decoded.position.y})`);
        }
        
        // Check if any position went negative when it shouldn't
        if (snapshot.position[1] > 0 && decoded.position.y < 0) {
          throw new Error(`DeltaCompression turned positive Y=${snapshot.position[1]} into negative Y=${decoded.position.y}!`);
        }
      }
    }
    
    return packet;
  }
  
  /**
   * Intercept server packets for compression
   */
  private interceptServerPackets(): void {
    const network = this.world.network as NetworkSystem & {
      send: (name: string, data: unknown, ...args: unknown[]) => void
    }
    if (!network?.send) return;
    
    const originalSend = network.send.bind(network);
    
    network.send = (name: string, data: unknown, ...args: unknown[]) => {
      const entityData = data as { 
        id?: string; 
        changes?: { 
          p?: number[]; 
          q?: number[]; 
          v?: number[]; 
          s?: number 
        } 
      };
      if (name === 'entityModified' && entityData.changes?.p) {
        // Compress entity update
        const compressed = this.compressEntityState(
          entityData.id || '',
          {
            position: _v3_1.set(
              entityData.changes.p[0],
              entityData.changes.p[1],
              entityData.changes.p[2],
            ),
            rotation: entityData.changes.q
              ? _q_1.set(
                  entityData.changes.q[0],
                  entityData.changes.q[1],
                  entityData.changes.q[2],
                  entityData.changes.q[3],
                )
              : _q_1.identity(),
            velocity: entityData.changes.v
              ? _v3_2.set(
                  entityData.changes.v[0],
                  entityData.changes.v[1],
                  entityData.changes.v[2],
                )
              : _v3_2.set(0, 0, 0),
            state: entityData.changes.s || 0,
          },
          Date.now(),
        );
        
        if (compressed) {
          // Send compressed packet instead
          originalSend('deltaUpdate', compressed, ...args);
          return;
        }
      }
      
      // Send original packet
      originalSend(name, data, ...args);
    };
  }
  
  /**
   * Intercept client packets for decompression
   */
  private interceptClientPackets(): void {
    // Listen for compressed packets
    this.world.on('deltaUpdate', (packet: DeltaPacket) => {
      const decompressed = this.decompressEntityState(packet);
      if (decompressed) {
        // Route through client network handler so local player also applies authoritative transforms
        const network = this.world.network as unknown as { enqueue: (method: string, data: unknown) => void };
        network.enqueue('entityModified', {
          id: packet.id,
          changes: {
            p: [decompressed.position.x, decompressed.position.y, decompressed.position.z],
            q: [decompressed.rotation.x, decompressed.rotation.y, decompressed.rotation.z, decompressed.rotation.w],
            v: [decompressed.velocity.x, decompressed.velocity.y, decompressed.velocity.z],
            s: decompressed.state
          }
        });
      }
    });
  }
  
  /**
   * Update compression metrics
   */
  private updateMetrics(full: EntitySnapshot, compressed: DeltaPacket): void {
    const fullSize = 3 * 4 + 4 * 4 + 3 * 4 + 1; // Position + Rotation + Velocity + State in bytes
    const compressedSize = compressed.data.length + 4; // Data + header
    
    this.metrics.totalBytes += fullSize;
    this.metrics.compressedBytes += compressedSize;
    this.metrics.compressionRatio = this.metrics.totalBytes / Math.max(1, this.metrics.compressedBytes);
  }

  /**
   * Store a snapshot for client-side decompression chain
   */
  private storeSnapshot(entityId: string, snapshot: EntitySnapshot): void {
    let arr = this.snapshots.get(entityId);
    if (!arr) {
      arr = [];
      this.snapshots.set(entityId, arr);
    }
    arr.push(snapshot);
    
    
    while (arr.length > this.maxSnapshots) {
      arr.shift();
    }
  }
  
  /**
   * Get compression statistics
   */
  public getStats() {
    return {
      ...this.metrics,
      snapshotCount: this.snapshots.size,
      averageSnapshots: Array.from(this.snapshots.values())
        .reduce((sum, s) => sum + s.length, 0) / Math.max(1, this.snapshots.size)
    };
  }
  
  /**
   * Clear snapshots for entity
   */
  public clearEntity(entityId: string): void {
    this.snapshots.delete(entityId);
  }
  
  /**
   * Clear all snapshots
   */
  public clearAll(): void {
    this.snapshots.clear();
  }
}

