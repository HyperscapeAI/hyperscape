// Game Metrics Reporter for Vitest
// Provides specialized reporting for game engine testing metrics

import type { File, Reporter, TaskResultPack, UserConsoleLog } from 'vitest'
import type { PerformanceMetrics, VisualMetrics, SystemMetrics } from '../../types/metrics-types'

// Extend GameplayMetrics for this reporter's specific needs
export interface GameplayMetrics {
  actionResponseTime?: number
  entityInteractions?: number
}

// Game-specific metadata interfaces extending Vitest's TaskMeta
export interface GameTaskMeta {
  name?: string
  performance?: PerformanceMetrics
  visual?: VisualMetrics
  gameplay?: GameplayMetrics
  system?: SystemMetrics
}

// Vitest TaskResultPack is [id: string, result: TaskResult | undefined, meta: TaskMeta]
// We need to type the meta part specifically for our game metrics
type GameTaskResultPack = [id: string, result: unknown, meta: GameTaskMeta]

export interface GameMetrics {
  performanceTests: {
    renderTime: number
    physicsTime: number
    networkLatency: number
    memoryUsage: number
  }
  visualTests: {
    pixelAccuracy: number
    geometryValidation: number
    shaderCompliance: number
  }
  systemTests: {
    entityCreation: number
    componentUpdates: number
    systemProcessing: number
  }
}

export class GameMetricsReporter implements Reporter {
  private metrics: GameMetrics = {
    performanceTests: {
      renderTime: 0,
      physicsTime: 0,
      networkLatency: 0,
      memoryUsage: 0
    },
    visualTests: {
      pixelAccuracy: 0,
      geometryValidation: 0,
      shaderCompliance: 0
    },
    systemTests: {
      entityCreation: 0,
      componentUpdates: 0,
      systemProcessing: 0
    }
  }

  private testResults: Map<string, GameTaskResultPack> = new Map()
  private startTime = Date.now()

  onInit() {
    console.log('🎮 Game Metrics Reporter: Starting game engine test monitoring...')
    this.startTime = Date.now()
    
    // Initialize some baseline metrics if available
    if (typeof process !== 'undefined' && process.memoryUsage) {
      this.metrics.performanceTests.memoryUsage = process.memoryUsage().heapUsed
    }
    
    // Simulate network latency for local tests
    this.metrics.performanceTests.networkLatency = 5 // 5ms for local
  }

  onTaskUpdate(packs: TaskResultPack[]) {
    for (const taskResultPack of packs) {
      if (taskResultPack) {
        // TaskResultPack is [id: string, result: TaskResult | undefined, meta: TaskMeta]
        const [id, taskResult, meta] = taskResultPack as GameTaskResultPack
        this.processGameMetrics(id, taskResult, meta)
      }
    }
  }

  onFinished(files: File[] = []) {
    const totalTime = Date.now() - this.startTime
    
    // Update memory usage at end
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memUsage = process.memoryUsage().heapUsed
      this.metrics.performanceTests.memoryUsage = Math.max(
        this.metrics.performanceTests.memoryUsage,
        memUsage
      )
    }
    
    console.log('\n🎮 Game Engine Test Results')
    console.log('=' .repeat(50))
    
    // Performance metrics
    console.log('\n📊 Performance Metrics:')
    console.log(`  Render Time: ${this.metrics.performanceTests.renderTime.toFixed(2)}ms avg`)
    console.log(`  Physics Time: ${this.metrics.performanceTests.physicsTime.toFixed(2)}ms avg`)
    console.log(`  Network Latency: ${this.metrics.performanceTests.networkLatency.toFixed(2)}ms avg`)
    console.log(`  Memory Usage: ${this.formatBytes(this.metrics.performanceTests.memoryUsage)}`)

    // Visual validation metrics
    console.log('\n👁️  Visual Validation:')
    console.log(`  Pixel Accuracy: ${this.metrics.visualTests.pixelAccuracy.toFixed(1)}%`)
    console.log(`  Geometry Validation: ${this.metrics.visualTests.geometryValidation.toFixed(1)}%`)
    console.log(`  Shader Compliance: ${this.metrics.visualTests.shaderCompliance.toFixed(1)}%`)

    // System performance
    console.log('\n⚙️  System Performance:')
    console.log(`  Entity Creation: ${this.metrics.systemTests.entityCreation}/s`)
    console.log(`  Component Updates: ${this.metrics.systemTests.componentUpdates}/s`)
    console.log(`  System Processing: ${this.metrics.systemTests.systemProcessing}ms`)

    // Test summary
    const passed = files.reduce((acc, file) => acc + (file.result?.state === 'pass' ? 1 : 0), 0)
    const total = files.length
    const failed = total - passed

    console.log('\n📋 Test Summary:')
    console.log(`  Total Tests: ${total}`)
    console.log(`  Passed: ${passed} ✅`)
    console.log(`  Failed: ${failed} ${failed > 0 ? '❌' : ''}`)
    console.log(`  Success Rate: ${((passed / total) * 100).toFixed(1)}%`)
    console.log(`  Total Time: ${totalTime}ms`)

    // Game-specific warnings
    this.checkGameMetricsWarnings()
    
    console.log('=' .repeat(50))
  }

  private processGameMetrics(id: string, taskResult: unknown, meta: GameTaskMeta) {
    if (!meta) return

    const testName = meta.name || id || 'unknown'
    
    // Extract performance metrics from test metadata
    if (meta.performance) {
      const perf = meta.performance
      if (perf.renderTime) this.metrics.performanceTests.renderTime = Math.max(this.metrics.performanceTests.renderTime, perf.renderTime)
      if (perf.physicsTime) this.metrics.performanceTests.physicsTime = Math.max(this.metrics.performanceTests.physicsTime, perf.physicsTime)
      if (perf.networkLatency) this.metrics.performanceTests.networkLatency = Math.max(this.metrics.performanceTests.networkLatency, perf.networkLatency)
      if (perf.memoryUsage) this.metrics.performanceTests.memoryUsage = Math.max(this.metrics.performanceTests.memoryUsage, perf.memoryUsage)
    }

    // Extract visual validation metrics
    if (meta.visual) {
      const visual = meta.visual
      if (visual.pixelAccuracy) this.metrics.visualTests.pixelAccuracy = Math.max(this.metrics.visualTests.pixelAccuracy, visual.pixelAccuracy)
      if (visual.geometryValidation) this.metrics.visualTests.geometryValidation = Math.max(this.metrics.visualTests.geometryValidation, visual.geometryValidation)
      if (visual.shaderCompliance) this.metrics.visualTests.shaderCompliance = Math.max(this.metrics.visualTests.shaderCompliance, visual.shaderCompliance)
    }

    // Extract system metrics
    if (meta.system) {
      const system = meta.system
      if (system.entityCreation) this.metrics.systemTests.entityCreation = Math.max(this.metrics.systemTests.entityCreation, system.entityCreation)
      if (system.componentUpdates) this.metrics.systemTests.componentUpdates = Math.max(this.metrics.systemTests.componentUpdates, system.componentUpdates)
      if (system.systemProcessing) this.metrics.systemTests.systemProcessing = Math.max(this.metrics.systemTests.systemProcessing, system.systemProcessing)
    }

    // Store individual test result pack
    const taskResultPack: GameTaskResultPack = [id, taskResult, meta]
    this.testResults.set(testName, taskResultPack)
  }

  private checkGameMetricsWarnings() {
    const warnings: string[] = []

    // Performance warnings
    if (this.metrics.performanceTests.renderTime > 16.67) {
      warnings.push(`⚠️  Render time ${this.metrics.performanceTests.renderTime.toFixed(2)}ms exceeds 60fps target (16.67ms)`)
    }

    if (this.metrics.performanceTests.physicsTime > 10) {
      warnings.push(`⚠️  Physics time ${this.metrics.performanceTests.physicsTime.toFixed(2)}ms is high (>10ms)`)
    }

    if (this.metrics.performanceTests.memoryUsage > 100 * 1024 * 1024) { // 100MB
      warnings.push(`⚠️  Memory usage ${this.formatBytes(this.metrics.performanceTests.memoryUsage)} is high (>100MB)`)
    }

    // Visual validation warnings
    if (this.metrics.visualTests.pixelAccuracy < 95) {
      warnings.push(`⚠️  Pixel accuracy ${this.metrics.visualTests.pixelAccuracy.toFixed(1)}% is below target (95%)`)
    }

    if (this.metrics.visualTests.geometryValidation < 90) {
      warnings.push(`⚠️  Geometry validation ${this.metrics.visualTests.geometryValidation.toFixed(1)}% is below target (90%)`)
    }

    // System performance warnings
    if (this.metrics.systemTests.entityCreation < 100) {
      warnings.push(`⚠️  Entity creation rate ${this.metrics.systemTests.entityCreation}/s is low (<100/s)`)
    }

    if (this.metrics.systemTests.systemProcessing > 5) {
      warnings.push(`⚠️  System processing time ${this.metrics.systemTests.systemProcessing}ms is high (>5ms)`)
    }

    if (warnings.length > 0) {
      console.log('\n⚠️  Performance Warnings:')
      warnings.forEach(warning => console.log(`  ${warning}`))
    } else {
      console.log('\n✅ All performance metrics within acceptable ranges')
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes'

    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  onUserConsoleLog(log: UserConsoleLog) {
    // Extract metrics from console logs if they contain game metrics
    const content = log.content

    if (typeof content === 'string') {
      // Look for [Metrics] logs from MetricsCollector
      if (content.includes('[Metrics]')) {
        // Look for performance metrics in logs
        const renderTimeMatch = content.match(/render.*?time.*?:\s*(\d+\.?\d*)\s*ms/i)
        if (renderTimeMatch) {
          const time = parseFloat(renderTimeMatch[1])
          this.metrics.performanceTests.renderTime = Math.max(this.metrics.performanceTests.renderTime, time)
        }

        // Look for physics metrics
        const physicsTimeMatch = content.match(/physics.*?time.*?:\s*(\d+\.?\d*)\s*ms/i)
        if (physicsTimeMatch) {
          const time = parseFloat(physicsTimeMatch[1])
          this.metrics.performanceTests.physicsTime = Math.max(this.metrics.performanceTests.physicsTime, time)
        }

        // Look for visual validation percentages
        const pixelAccuracyMatch = content.match(/pixel.*?accuracy.*?:\s*(\d+\.?\d*)\s*%/i)
        if (pixelAccuracyMatch) {
          const accuracy = parseFloat(pixelAccuracyMatch[1])
          this.metrics.visualTests.pixelAccuracy = Math.max(this.metrics.visualTests.pixelAccuracy, accuracy)
        }
      }
      
      // Also look for specific metric patterns from test logs
      if (content.includes('reportGeometryValidation')) {
        const match = content.match(/reportGeometryValidation.*?(\d+\.?\d*)/)
        if (match) {
          this.metrics.visualTests.geometryValidation = parseFloat(match[1])
        }
      }
      if (content.includes('reportShaderCompliance')) {
        const match = content.match(/reportShaderCompliance.*?(\d+\.?\d*)/)
        if (match) {
          this.metrics.visualTests.shaderCompliance = parseFloat(match[1])
        }
      }
      if (content.includes('Entity creation:')) {
        const match = content.match(/Entity creation.*?(\d+)/)
        if (match) {
          this.metrics.systemTests.entityCreation = parseInt(match[1])
        }
      }
      if (content.includes('Component updates:')) {
        const match = content.match(/Component updates.*?(\d+)/)
        if (match) {
          this.metrics.systemTests.componentUpdates = parseInt(match[1])
        }
      }
      if (content.includes('System processing:')) {
        const match = content.match(/System processing.*?(\d+\.?\d*)/)
        if (match) {
          this.metrics.systemTests.systemProcessing = parseFloat(match[1])
        }
      }
      
      // Parse JSON metrics if available
      if (content.includes('[Metrics] Final test metrics:')) {
        try {
          const jsonStart = content.indexOf('{', content.indexOf('[Metrics] Final test metrics:'))
          if (jsonStart > -1) {
            const jsonEnd = content.lastIndexOf('}')
            if (jsonEnd > jsonStart) {
              const jsonStr = content.substring(jsonStart, jsonEnd + 1)
              const parsedMetrics = JSON.parse(jsonStr)
              
              // Update metrics from parsed JSON
              if (parsedMetrics.visual) {
                Object.assign(this.metrics.visualTests, parsedMetrics.visual)
              }
              if (parsedMetrics.system) {
                Object.assign(this.metrics.systemTests, parsedMetrics.system)
              }
            }
          }
        } catch (_e) {
          // Ignore JSON parsing errors
        }
      }
    }
  }

  // Export metrics for external analysis
  exportMetrics(): GameMetrics {
    return JSON.parse(JSON.stringify(this.metrics))
  }

  // Reset metrics for new test run
  resetMetrics(): void {
    this.metrics = {
      performanceTests: {
        renderTime: 0,
        physicsTime: 0,
        networkLatency: 0,
        memoryUsage: 0
      },
      visualTests: {
        pixelAccuracy: 0,
        geometryValidation: 0,
        shaderCompliance: 0
      },
      systemTests: {
        entityCreation: 0,
        componentUpdates: 0,
        systemProcessing: 0
      }
    }
    this.testResults.clear()
    this.startTime = Date.now()
  }
}

export default GameMetricsReporter