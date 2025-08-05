/**
 * Network-specific type definitions
 */

import type { EntityData } from './index';
import type { Vector3, Quaternion } from './index';

// Base message type
export interface NetworkMessage<T = unknown> {
  type: string;
  data: T;
  timestamp: number;
  senderId?: string;
  reliable?: boolean;
}

// Specific message data types
export interface EntityAddedData {
  data: EntityData;
}

export interface EntityRemovedData {
  entityId: string;
}

export interface EntityModifiedData {
  entityId: string;
  updates: Partial<EntityData>;
}

export interface EntitySnapshotData {
  id: string;
  position: Vector3;
  rotation: Quaternion;
  velocity?: Vector3;
}

export interface WorldSnapshotData {
  entities: EntitySnapshotData[];
  timestamp: number;
}

export interface FullWorldStateData {
  entities: Array<{
    id: string;
    data: EntityData;
  }>;
  timestamp: number;
}

// Type-safe message type map
export interface NetworkMessageMap {
  entityAdded: NetworkMessage<EntityAddedData>;
  entityRemoved: NetworkMessage<EntityRemovedData>;
  entityModified: NetworkMessage<EntityModifiedData>;
  snapshot: NetworkMessage<WorldSnapshotData>;
  spawnModified: NetworkMessage<FullWorldStateData>;
}

// Type helper for message handlers
export type MessageHandler<K extends keyof NetworkMessageMap> = (message: NetworkMessageMap[K]) => void;

// Connection interface
export interface NetworkConnection {
  id: string;
  latency: number;
  connected: boolean;
  
  send<K extends keyof NetworkMessageMap>(message: NetworkMessageMap[K]): void;
  send(message: NetworkMessage): void;
  disconnect(): void;
}