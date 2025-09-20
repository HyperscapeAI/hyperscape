/**
 * Network simulator for testing multiplayer movement
 * Simulates various network conditions including latency, jitter, and packet loss
 */

import { EventEmitter } from 'events';

export interface NetworkConditions {
  /** Base latency in milliseconds (one-way) */
  latency: number;
  
  /** Jitter in milliseconds (random variation in latency) */
  jitter: number;
  
  /** Packet loss rate (0-1, where 0.1 = 10% loss) */
  packetLoss: number;
  
  /** Packet duplication rate (0-1) */
  packetDuplication: number;
  
  /** Packet reordering rate (0-1) */
  packetReordering: number;
  
  /** Bandwidth limit in bytes/second (0 = unlimited) */
  bandwidth: number;
}

interface QueuedPacket<T> {
  data: T;
  timestamp: number;
  deliveryTime: number;
  size: number;
}

/**
 * Simulates network conditions for testing
 */
export class NetworkSimulator extends EventEmitter {
  private conditions: NetworkConditions = {
    latency: 0,
    jitter: 0,
    packetLoss: 0,
    packetDuplication: 0,
    packetReordering: 0,
    bandwidth: 0
  };
  
  private packetQueue: QueuedPacket<unknown>[] = [];
  private bandwidthUsed: number = 0;
  private bandwidthResetTime: number = 0;
  private packetsSent: number = 0;
  private packetsReceived: number = 0;
  private packetsLost: number = 0;
  private bytesTransferred: number = 0;
  
  constructor() {
    super();
    this.startProcessing();
  }
  
  /**
   * Set network conditions
   */
  setConditions(conditions: Partial<NetworkConditions>): void {
    this.conditions = { ...this.conditions, ...conditions };
    this.emit('conditionsChanged', this.conditions);
  }
  
  /**
   * Simulate sending data over network
   */
  async send<T>(data: T, reliable: boolean = false): Promise<T | null> {
    this.packetsSent++;
    
    // Calculate packet size (rough estimate)
    const size = JSON.stringify(data).length;
    this.bytesTransferred += size;
    
    // Check bandwidth limit
    if (this.conditions.bandwidth > 0) {
      const now = Date.now();
      if (now > this.bandwidthResetTime) {
        this.bandwidthUsed = 0;
        this.bandwidthResetTime = now + 1000; // Reset every second
      }
      
      if (this.bandwidthUsed + size > this.conditions.bandwidth) {
        // Bandwidth exceeded, delay packet
        const delay = ((this.bandwidthUsed + size - this.conditions.bandwidth) / this.conditions.bandwidth) * 1000;
        await this.delay(delay);
      }
      
      this.bandwidthUsed += size;
    }
    
    // Simulate packet loss
    if (!reliable && Math.random() < this.conditions.packetLoss) {
      this.packetsLost++;
      this.emit('packetLost', data);
      return null;
    }
    
    // Calculate delivery time with latency and jitter
    const jitter = (Math.random() - 0.5) * 2 * this.conditions.jitter;
    const deliveryDelay = Math.max(0, this.conditions.latency + jitter);
    
    const packet: QueuedPacket<T> = {
      data: this.cloneData(data),
      timestamp: Date.now(),
      deliveryTime: Date.now() + deliveryDelay,
      size
    };
    
    // Simulate packet duplication
    if (Math.random() < this.conditions.packetDuplication) {
      const duplicatePacket = { ...packet, deliveryTime: packet.deliveryTime + Math.random() * 50 };
      this.packetQueue.push(duplicatePacket);
    }
    
    // Simulate packet reordering
    if (Math.random() < this.conditions.packetReordering) {
      packet.deliveryTime += Math.random() * 100; // Delay some packets
    }
    
    this.packetQueue.push(packet);
    
    // Wait for delivery
    await this.delay(deliveryDelay);
    
    // Packet might have been processed by now
    const delivered = this.packetQueue.find(p => p === packet) as QueuedPacket<T> | undefined;
    if (delivered) {
      this.packetQueue = this.packetQueue.filter(p => p !== packet);
      this.packetsReceived++;
      return delivered.data;
    }
    
    return null;
  }
  
  /**
   * Simulate receiving data (for bidirectional testing)
   */
  async receive<T>(data: T): Promise<T | null> {
    return this.send(data);
  }
  
  /**
   * Process queued packets
   */
  private startProcessing(): void {
    setInterval(() => {
      const now = Date.now();
      const ready = this.packetQueue.filter(p => p.deliveryTime <= now);
      
      for (const packet of ready) {
        this.packetQueue = this.packetQueue.filter(p => p !== packet);
        this.packetsReceived++;
        this.emit('packetDelivered', packet.data);
      }
    }, 1);
  }
  
  /**
   * Get current statistics
   */
  getStats(): NetworkStats {
    return {
      packetsSent: this.packetsSent,
      packetsReceived: this.packetsReceived,
      packetsLost: this.packetsLost,
      packetLossRate: this.packetsSent > 0 ? this.packetsLost / this.packetsSent : 0,
      averageLatency: this.conditions.latency,
      bytesTransferred: this.bytesTransferred,
      queuedPackets: this.packetQueue.length
    };
  }
  
  /**
   * Reset statistics
   */
  resetStats(): void {
    this.packetsSent = 0;
    this.packetsReceived = 0;
    this.packetsLost = 0;
    this.bytesTransferred = 0;
  }
  
  /**
   * Clear all queued packets
   */
  flush(): void {
    this.packetQueue = [];
  }
  
  /**
   * Helper to delay execution
   */
  protected delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Clone data to prevent reference issues
   */
  protected cloneData<T>(data: T): T {
    return JSON.parse(JSON.stringify(data));
  }
}

export interface NetworkStats {
  packetsSent: number;
  packetsReceived: number;
  packetsLost: number;
  packetLossRate: number;
  averageLatency: number;
  bytesTransferred: number;
  queuedPackets: number;
}

/**
 * Preset network conditions
 */
export class NetworkPresets {
  static readonly PERFECT: NetworkConditions = {
    latency: 0,
    jitter: 0,
    packetLoss: 0,
    packetDuplication: 0,
    packetReordering: 0,
    bandwidth: 0
  };
  
  static readonly LAN: NetworkConditions = {
    latency: 1,
    jitter: 0.5,
    packetLoss: 0,
    packetDuplication: 0,
    packetReordering: 0,
    bandwidth: 0
  };
  
  static readonly BROADBAND: NetworkConditions = {
    latency: 20,
    jitter: 5,
    packetLoss: 0.001,
    packetDuplication: 0.0001,
    packetReordering: 0.001,
    bandwidth: 0
  };
  
  static readonly CABLE: NetworkConditions = {
    latency: 50,
    jitter: 10,
    packetLoss: 0.01,
    packetDuplication: 0.001,
    packetReordering: 0.01,
    bandwidth: 0
  };
  
  static readonly DSL: NetworkConditions = {
    latency: 100,
    jitter: 20,
    packetLoss: 0.02,
    packetDuplication: 0.002,
    packetReordering: 0.02,
    bandwidth: 200000 // 200 KB/s
  };
  
  static readonly MOBILE_3G: NetworkConditions = {
    latency: 200,
    jitter: 50,
    packetLoss: 0.05,
    packetDuplication: 0.01,
    packetReordering: 0.05,
    bandwidth: 50000 // 50 KB/s
  };
  
  static readonly MOBILE_4G: NetworkConditions = {
    latency: 80,
    jitter: 20,
    packetLoss: 0.02,
    packetDuplication: 0.005,
    packetReordering: 0.02,
    bandwidth: 500000 // 500 KB/s
  };
  
  static readonly SATELLITE: NetworkConditions = {
    latency: 600,
    jitter: 100,
    packetLoss: 0.1,
    packetDuplication: 0.02,
    packetReordering: 0.1,
    bandwidth: 100000 // 100 KB/s
  };
  
  static readonly POOR: NetworkConditions = {
    latency: 300,
    jitter: 100,
    packetLoss: 0.15,
    packetDuplication: 0.05,
    packetReordering: 0.15,
    bandwidth: 25000 // 25 KB/s
  };
}

/**
 * Network simulator with recording capabilities
 */
export class RecordingNetworkSimulator extends NetworkSimulator {
  private recording: NetworkEvent[] = [];
  private isRecording: boolean = false;
  
  startRecording(): void {
    this.isRecording = true;
    this.recording = [];
  }
  
  stopRecording(): NetworkEvent[] {
    this.isRecording = false;
    return this.recording;
  }
  
  async send<T>(data: T, reliable: boolean = false): Promise<T | null> {
    if (this.isRecording) {
      this.recording.push({
        type: 'send',
        timestamp: Date.now(),
        data: this.cloneData(data),
        reliable
      });
    }
    
    return super.send(data, reliable);
  }
  
  /**
   * Replay recorded network events
   */
  async replay(events: NetworkEvent[]): Promise<void> {
    for (const event of events) {
      if (event.type === 'send') {
        await this.send(event.data, event.reliable);
      }
      // Add delay to match original timing
      if (events.indexOf(event) < events.length - 1) {
        const nextEvent = events[events.indexOf(event) + 1];
        const delay = nextEvent.timestamp - event.timestamp;
        await this.delay(delay);
      }
    }
  }
}

interface NetworkEvent {
  type: 'send' | 'receive';
  timestamp: number;
  data: unknown;
  reliable?: boolean;
}
