import THREE from './three'

export class BufferedLerpVector3 {
  value: THREE.Vector3
  rate: number
  previous: THREE.Vector3
  current: THREE.Vector3
  time: number
  snapToken: unknown | null
  buffer: Array<{ value: THREE.Vector3; time: number }>
  maxBufferSize: number
  constructor(value: THREE.Vector3, rate: number) {
    this.value = value
    this.rate = rate // receive rate eg 1/5 for 5hz
    this.previous = new THREE.Vector3().copy(this.value)
    this.current = new THREE.Vector3().copy(this.value)
    this.time = 0
    this.snapToken = null
    this.buffer = []
    this.maxBufferSize = 10
  }

  push(value: THREE.Vector3 | number[], snapToken: unknown = null): void {
    if (this.snapToken !== snapToken) {
      this.snapToken = snapToken
      if (Array.isArray(value)) {
        this.previous.set(value[0] || 0, value[1] || 0, value[2] || 0)
        this.current.set(value[0] || 0, value[1] || 0, value[2] || 0)
        this.value.set(value[0] || 0, value[1] || 0, value[2] || 0)
      } else {
        this.previous.copy(value)
        this.current.copy(value)
        this.value.copy(value)
      }
      this.buffer = []
    } else {
      const newVector = new THREE.Vector3()
      if (Array.isArray(value)) {
        newVector.set(value[0] || 0, value[1] || 0, value[2] || 0)
      } else {
        newVector.copy(value)
      }
      this.buffer.push({
        value: newVector,
        time: performance.now()
      })
      
      // Limit buffer size
      if (this.buffer.length > this.maxBufferSize) {
        this.buffer.shift()
      }
      
      this.previous.copy(this.current)
      if (Array.isArray(value)) {
        this.current.set(value[0] || 0, value[1] || 0, value[2] || 0)
      } else {
        this.current.copy(value)
      }
    }
    this.time = 0
  }

  pushArray(value: number[], snapToken: unknown = null): void {
    const vec = new THREE.Vector3().fromArray(value)
    this.push(vec, snapToken)
  }

  update(delta: number): this {
    this.time += delta
    let alpha = this.time / this.rate
    if (alpha > 1) alpha = 1
    
    // Use buffer for smoother interpolation if available
    if (this.buffer.length > 1) {
      const now = performance.now()
      const recent = this.buffer.filter(item => now - item.time < this.rate * 1000)
      
      if (recent.length > 0) {
        const target = recent[recent.length - 1].value
        this.value.lerpVectors(this.previous, target, alpha)
      } else {
        this.value.lerpVectors(this.previous, this.current, alpha)
      }
    } else {
      this.value.lerpVectors(this.previous, this.current, alpha)
    }
    
    return this
  }

  snap(): void {
    this.previous.copy(this.current)
    this.value.copy(this.current)
    this.time = 0
    this.buffer = []
  }

  clear(): void {
    this.previous.copy(this.value)
    this.current.copy(this.value)
    this.time = 0
    this.buffer = []
  }
}