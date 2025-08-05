/**
 * Performance Monitor System
 * Tracks performance metrics across all systems
 * Reports timing data to MetricsCollector for test reporting
 */

import type { World } from '../types/index';
import { MetricsCollector } from '../utils/MetricsCollector';
import { SystemBase } from './SystemBase';

export class PerformanceMonitor extends SystemBase {
  private metricsCollector: MetricsCollector;
  private renderFrameCount = 0;
  private physicsFrameCount = 0;
  private lastMemoryCheck = 0;
  private memoryCheckInterval = 1000; // Check memory every second
  
  constructor(world: World) {
    super(world, {
      name: 'rpg-performance-monitor',
      dependencies: {
        required: [],
        optional: []
      },
      autoCleanup: true
    });
    this.metricsCollector = MetricsCollector.getInstance();
  }
  
  async init(): Promise<void> {
  }
  
  preUpdate(): void {
    // Start render timing
    this.metricsCollector.startRenderTiming();
  }
  
  update(_dt: number): void {
    // Count render frames
    this.renderFrameCount++;
    
    // Check memory periodically
    const now = Date.now();
    if (now - this.lastMemoryCheck > this.memoryCheckInterval) {
      this.checkMemoryUsage();
      this.lastMemoryCheck = now;
    }
  }
  
  postUpdate(): void {
    // End render timing
    this.metricsCollector.endRenderTiming();
  }
  
  preFixedUpdate(): void {
    // Start physics timing
    this.metricsCollector.startPhysicsTiming();
  }
  
  fixedUpdate(_dt: number): void {
    // Count physics frames
    this.physicsFrameCount++;
  }
  
  postFixedUpdate(): void {
    // End physics timing
    this.metricsCollector.endPhysicsTiming();
  }
  
  private checkMemoryUsage(): void {
    // Try to get memory usage if available
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      // Define proper type for Chrome's performance.memory API
      const memoryInfo = (performance as typeof performance & {
        memory?: {
          usedJSHeapSize?: number;
          totalJSHeapSize?: number;
          jsHeapSizeLimit?: number;
        };
      }).memory;
      if (memoryInfo && memoryInfo.usedJSHeapSize) {
        this.metricsCollector.reportMemoryUsage(memoryInfo.usedJSHeapSize);
      }
    }
  }
  
  getSystemRating(): string {
    const metrics = this.metricsCollector.getMetrics();
    
    let health = 100;
    const features = ['Performance Monitoring', 'Render Timing', 'Physics Timing', 'Memory Tracking'];
    
    // Deduct health based on performance issues
    if (metrics.performance.renderTime && metrics.performance.renderTime > 16.67) {
      health -= 20; // Below 60fps
    }
    if (metrics.performance.physicsTime && metrics.performance.physicsTime > 10) {
      health -= 20; // Physics taking too long
    }
    
    return JSON.stringify({
      health,
      score: health,
      features,
      performance: {
        renderFrames: this.renderFrameCount,
        physicsFrames: this.physicsFrameCount,
        avgRenderTime: metrics.performance.renderTime || 0,
        avgPhysicsTime: metrics.performance.physicsTime || 0,
        memoryUsage: metrics.performance.memoryUsage || 0
      }
    });
  }
  
  destroy(): void {
    // Reset metrics on destroy
    this.metricsCollector.reset();
  }
}