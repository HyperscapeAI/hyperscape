import { System } from './System'
import type { World } from '../types'

export class NodeEnvironment extends System {
  model: unknown = null
  skys: unknown[] = []
  sky: unknown = null
  skyN: number = 0
  bgUrl: string | null = null
  hdrUrl: string | null = null
  base: unknown
  constructor(world: World) {
    super(world)

    this.model = null
    this.skys = []
    this.sky = null
    this.skyN = 0
    this.bgUrl = null
    this.hdrUrl = null
  }

  async init(options: unknown): Promise<void> {
    this.base = (options as Record<string, unknown>).baseEnvironment
  }
}
