// Vitest Setup for Game Engine Testing
// Configures the test environment for Hyperscape game engine tests



import { vi } from 'vitest'
import THREE from '../extras/three'

// Verify Three.js is on globalThis
if (!globalThis.THREE) {
  globalThis.THREE = THREE
}

// Polyfill for WebAssembly in Node.js test environment
// eslint-disable-next-line no-undef
if (typeof WebAssembly !== 'undefined' && !WebAssembly.instantiateStreaming) {
  // eslint-disable-next-line no-undef
  WebAssembly.instantiateStreaming = async (source, importObject) => {
    const response = await source;
    if (!response) {
      throw new TypeError('source cannot be null');
    }
    const buffer = await response.arrayBuffer();
    // eslint-disable-next-line no-undef
    const result = await WebAssembly.instantiate(buffer, importObject);
    return result;
  };
}

// Mock WebGL context for Three.js
const mockWebGLContext = {
  canvas: null,
  drawingBufferWidth: 1024,
  drawingBufferHeight: 768,
  getParameter: vi.fn(),
  getExtension: vi.fn(),
  createShader: vi.fn(),
  createProgram: vi.fn(),
  attachShader: vi.fn(),
  linkProgram: vi.fn(),
  useProgram: vi.fn(),
  createBuffer: vi.fn(),
  bindBuffer: vi.fn(),
  bufferData: vi.fn(),
  enableVertexAttribArray: vi.fn(),
  vertexAttribPointer: vi.fn(),
  drawElements: vi.fn(),
  drawArrays: vi.fn(),
  clear: vi.fn(),
  clearColor: vi.fn(),
  viewport: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  depthMask: vi.fn(),
  depthFunc: vi.fn(),
  frontFace: vi.fn(),
  cullFace: vi.fn(),
  blendFunc: vi.fn(),
  pixelStorei: vi.fn(),
  activeTexture: vi.fn(),
  bindTexture: vi.fn(),
  createTexture: vi.fn(),
  texImage2D: vi.fn(),
  texParameteri: vi.fn(),
  generateMipmap: vi.fn(),
  createFramebuffer: vi.fn(),
  bindFramebuffer: vi.fn(),
  createRenderbuffer: vi.fn(),
  bindRenderbuffer: vi.fn(),
  renderbufferStorage: vi.fn(),
  framebufferRenderbuffer: vi.fn(),
  framebufferTexture2D: vi.fn(),
  checkFramebufferStatus: vi.fn(() => 36053), // FRAMEBUFFER_COMPLETE
  deleteTexture: vi.fn(),
  deleteBuffer: vi.fn(),
  deleteFramebuffer: vi.fn(),
  deleteRenderbuffer: vi.fn(),
  deleteProgram: vi.fn(),
  deleteShader: vi.fn(),
  getShaderParameter: vi.fn(() => true),
  getProgramParameter: vi.fn(() => true),
  getShaderInfoLog: vi.fn(() => ''),
  getProgramInfoLog: vi.fn(() => ''),
  shaderSource: vi.fn(),
  compileShader: vi.fn(),
  getAttribLocation: vi.fn(() => 0),
  getUniformLocation: vi.fn(() => ({})),
  uniformMatrix4fv: vi.fn(),
  uniformMatrix3fv: vi.fn(),
  uniform4fv: vi.fn(),
  uniform3fv: vi.fn(),
  uniform2fv: vi.fn(),
  uniform1fv: vi.fn(),
  uniform4f: vi.fn(),
  uniform3f: vi.fn(),
  uniform2f: vi.fn(),
  uniform1f: vi.fn(),
  uniform1i: vi.fn(),
  VERTEX_SHADER: 35633,
  FRAGMENT_SHADER: 35632,
  COMPILE_STATUS: 35713,
  LINK_STATUS: 35714,
  ARRAY_BUFFER: 34962,
  ELEMENT_ARRAY_BUFFER: 34963,
  STATIC_DRAW: 35044,
  DYNAMIC_DRAW: 35048,
  FLOAT: 5126,
  UNSIGNED_SHORT: 5123,
  UNSIGNED_INT: 5125,
  TRIANGLES: 4,
  DEPTH_TEST: 2929,
  LEQUAL: 515,
  COLOR_BUFFER_BIT: 16384,
  DEPTH_BUFFER_BIT: 256,
  TEXTURE_2D: 3553,
  RGBA: 6408,
  UNSIGNED_BYTE: 5121,
  TEXTURE_WRAP_S: 10242,
  TEXTURE_WRAP_T: 10243,
  TEXTURE_MIN_FILTER: 10241,
  TEXTURE_MAG_FILTER: 10240,
  NEAREST: 9728,
  LINEAR: 9729,
  LINEAR_MIPMAP_LINEAR: 9987,
  CLAMP_TO_EDGE: 33071,
  REPEAT: 10497,
  FRAMEBUFFER: 36160,
  COLOR_ATTACHMENT0: 36064,
  DEPTH_ATTACHMENT: 36096,
  RENDERBUFFER: 36161,
  DEPTH_COMPONENT16: 33189,
}

// Mock HTMLCanvasElement.getContext
const _originalGetContext = HTMLCanvasElement.prototype.getContext
HTMLCanvasElement.prototype.getContext = function(contextType: string, ..._args: unknown[]) {
  if (contextType === 'webgl' || contextType === 'experimental-webgl') {
    return mockWebGLContext as unknown
  }
  if (contextType === '2d') {
    return {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      arc: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(1024 * 768 * 4),
        width: 1024,
        height: 768,
        colorSpace: 'srgb' as unknown
      })),
      putImageData: vi.fn(),
      createImageData: vi.fn(),
      measureText: vi.fn(() => ({ width: 100 })),
      fillText: vi.fn(),
      strokeText: vi.fn(),
    } as unknown as CanvasRenderingContext2D
  }
  return null
} as typeof HTMLCanvasElement.prototype.getContext

// Mock Performance API
global.performance = {
  now: vi.fn(() => Date.now()),
  mark: vi.fn(),
  measure: vi.fn(),
  getEntriesByName: vi.fn(() => []),
  getEntriesByType: vi.fn(() => []),
  clearMarks: vi.fn(),
  clearMeasures: vi.fn(),
} as unknown as typeof globalThis.performance

// Mock requestAnimationFrame
global.requestAnimationFrame = vi.fn((callback) => {
  return setTimeout(callback, 16) as unknown as number // ~60fps
}) as typeof globalThis.requestAnimationFrame

global.cancelAnimationFrame = vi.fn((id) => {
  clearTimeout(id)
})

// Mock Audio API
global.AudioContext = vi.fn(() => ({
  createOscillator: vi.fn(),
  createGain: vi.fn(),
  createBuffer: vi.fn(),
  createBufferSource: vi.fn(),
  destination: {},
  currentTime: 0,
  sampleRate: 44100,
  state: 'running',
  suspend: vi.fn(),
  resume: vi.fn(),
  close: vi.fn(),
})) as unknown as typeof globalThis.AudioContext

// Mock WebSocket for networking tests
const mockWebSocketClass = function() {
  return {
    send: vi.fn(),
    close: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    readyState: 1, // OPEN
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
  }
} as unknown as { new(): WebSocket }
// Add static constants
;(mockWebSocketClass as unknown as { CONNECTING: number; OPEN: number; CLOSING: number; CLOSED: number }).CONNECTING = 0
;(mockWebSocketClass as unknown as { CONNECTING: number; OPEN: number; CLOSING: number; CLOSED: number }).OPEN = 1
;(mockWebSocketClass as unknown as { CONNECTING: number; OPEN: number; CLOSING: number; CLOSED: number }).CLOSING = 2
;(mockWebSocketClass as unknown as { CONNECTING: number; OPEN: number; CLOSING: number; CLOSED: number }).CLOSED = 3
global.WebSocket = mockWebSocketClass as unknown as typeof globalThis.WebSocket

// Mock File API
const mockFileReaderClass = function() {
  return {
    readAsArrayBuffer: vi.fn(),
    readAsText: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    result: null,
    error: null,
    readyState: 0,
    EMPTY: 0,
    LOADING: 1,
    DONE: 2,
  }
} as unknown as { new(): globalThis.FileReader }
// Add static constants
;(mockFileReaderClass as unknown as { EMPTY: number; LOADING: number; DONE: number }).EMPTY = 0
;(mockFileReaderClass as unknown as { EMPTY: number; LOADING: number; DONE: number }).LOADING = 1
;(mockFileReaderClass as unknown as { EMPTY: number; LOADING: number; DONE: number }).DONE = 2
global.FileReader = mockFileReaderClass as unknown as typeof globalThis.FileReader

// Mock Blob and URL
global.Blob = vi.fn() as unknown as typeof globalThis.Blob

// Create a proper URL class for testing
class MockURL {
  href: string
  pathname: string
  origin: string
  protocol: string
  host: string
  hostname: string
  port: string
  search: string
  hash: string
  username: string
  password: string
  searchParams: URLSearchParams
  
  constructor(url: string, base?: string) {
    // Simple URL resolution for testing
    let resolved = url
    if (base && !url.includes('://')) {
      // Handle relative paths
      if (url.startsWith('./')) {
        const basePath = base.split('/').slice(0, -1).join('/')
        resolved = basePath + '/' + url.substring(2)
      } else if (url.startsWith('/')) {
        resolved = base.split('://')[0] + '://' + base.split('://')[1].split('/')[0] + url
      } else {
        const basePath = base.split('/').slice(0, -1).join('/')
        resolved = basePath + '/' + url
      }
    }
    
    this.href = resolved
    this.pathname = resolved.includes('://') 
      ? '/' + resolved.split('://')[1].split('/').slice(1).join('/') 
      : resolved
    this.origin = ''
    this.protocol = resolved.includes('://') ? resolved.split('://')[0] + ':' : ''
    this.host = ''
    this.hostname = ''
    this.port = ''
    this.search = ''
    this.hash = ''
    this.username = ''
    this.password = ''
    this.searchParams = new URLSearchParams()
  }
  
  toString() {
    return this.href
  }
  
  toJSON() {
    return this.href
  }
  
  static createObjectURL = vi.fn(() => 'blob:mock-url')
  static revokeObjectURL = vi.fn()
  static canParse = vi.fn(() => true)
  static parse = vi.fn()
}

// Use Node.js URL if available, otherwise use our mock
try {
  // Try to use Node's URL implementation
  // eslint-disable-next-line no-undef
  const nodeUrl = require('url').URL
  global.URL = nodeUrl
} catch {
  // Fallback to mock URL for older Node versions
  global.URL = MockURL as unknown as typeof globalThis.URL
}

// Mock fetch for asset loading
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
    text: () => Promise.resolve('mock response'),
    json: () => Promise.resolve({}),
  })
) as unknown as typeof globalThis.fetch

// Console enhancements for test debugging
const originalConsoleLog = console.log
const originalConsoleError = console.error
const originalConsoleWarn = console.warn

// Track game metrics from console output
let gameMetrics = {
  renderTime: 0,
  physicsTime: 0,
  pixelAccuracy: 0,
  geometryValidation: 0,
}

console.log = (...args) => {
  const message = args.join(' ')
  
  // Extract metrics from log messages
  const renderMatch = message.match(/render.*?(\d+\.?\d*)\s*ms/i)
  if (renderMatch) {
    gameMetrics.renderTime = Math.max(gameMetrics.renderTime, parseFloat(renderMatch[1]))
  }
  
  const physicsMatch = message.match(/physics.*?(\d+\.?\d*)\s*ms/i)
  if (physicsMatch) {
    gameMetrics.physicsTime = Math.max(gameMetrics.physicsTime, parseFloat(physicsMatch[1]))
  }
  
  const pixelMatch = message.match(/pixel.*?accuracy.*?(\d+\.?\d*)\s*%/i)
  if (pixelMatch) {
    gameMetrics.pixelAccuracy = Math.max(gameMetrics.pixelAccuracy, parseFloat(pixelMatch[1]))
  }
  
  const geometryMatch = message.match(/geometry.*?validation.*?(\d+\.?\d*)\s*%/i)
  if (geometryMatch) {
    gameMetrics.geometryValidation = Math.max(gameMetrics.geometryValidation, parseFloat(geometryMatch[1]))
  }
  
  originalConsoleLog(...args)
}

console.error = (...args) => {
  // Highlight errors for game engine issues
  originalConsoleError('🔴 GAME ENGINE ERROR:', ...args)
}

// Override console.warn to add prefix (Three.js warnings are already filtered in preload)
console.warn = (...args) => {
  // The preload-three.ts already filters Three.js warnings, so they won't reach here
  // Add our prefix to all warnings that get through
  originalConsoleWarn('⚠️  GAME ENGINE WARNING:', ...args)
}

// Export game metrics for reporters
;(global as unknown as { __GAME_METRICS__: unknown }).__GAME_METRICS__ = gameMetrics

// Setup cleanup
afterEach(() => {
  vi.clearAllMocks()
  
  // Reset game metrics
  gameMetrics = {
    renderTime: 0,
    physicsTime: 0,
    pixelAccuracy: 0,
    geometryValidation: 0,
  }
  ;(global as unknown as { __GAME_METRICS__: unknown }).__GAME_METRICS__ = gameMetrics
})

// Global test utilities
;(global as unknown as { testUtils: unknown }).testUtils = {
  // Create mock Three.js scene
  createMockScene: () => ({
    add: vi.fn(),
    remove: vi.fn(),
    getObjectByName: vi.fn(),
    traverse: vi.fn(),
    children: [],
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    matrix: {},
    matrixWorld: {},
    updateMatrixWorld: vi.fn(),
  }),
  
  // Create mock game world
  createMockWorld: () => ({
    network: {
      isServer: false,
      send: vi.fn(),
      on: vi.fn(),
    },
    players: {
      getAll: vi.fn(() => []),
      get: vi.fn(),
    },
    entities: {
      create: vi.fn(),
      destroy: vi.fn(),
      getAll: vi.fn(() => []),
    },
    chat: {
      send: vi.fn(),
    },
    time: {
      now: () => Date.now(),
      delta: 16.67,
    }
  }),
  
  // Wait for next frame
  waitForFrame: () => new Promise(resolve => requestAnimationFrame(resolve)),
  
  // Wait for multiple frames
  waitForFrames: (count: number) => {
    let remaining = count
    return new Promise(resolve => {
      const step = () => {
        remaining--
        if (remaining <= 0) {
          resolve(undefined)
        } else {
          requestAnimationFrame(step)
        }
      }
      requestAnimationFrame(step)
    })
  },
  
  // Get current game metrics
  getGameMetrics: () => ({ ...(global as unknown as { __GAME_METRICS__: Record<string, unknown> }).__GAME_METRICS__ }),
}

// Mock yoga-layout for tests to avoid WASM loading issues
// Only the failing tests import components that use yoga-layout
vi.mock('yoga-layout', () => {
  const mockNode = {
    setWidth: vi.fn(),
    setHeight: vi.fn(),
    setPosition: vi.fn(),
    setPositionType: vi.fn(),
    setFlexDirection: vi.fn(),
    setJustifyContent: vi.fn(),
    setAlignItems: vi.fn(),
    setAlignContent: vi.fn(),
    setFlexWrap: vi.fn(),
    setDisplay: vi.fn(),
    setFlex: vi.fn(),
    setFlexGrow: vi.fn(),
    setFlexShrink: vi.fn(),
    setFlexBasis: vi.fn(),
    setMargin: vi.fn(),
    setPadding: vi.fn(),
    setBorder: vi.fn(),
    setGap: vi.fn(),
    setMinWidth: vi.fn(),
    setMinHeight: vi.fn(),
    setMaxWidth: vi.fn(),
    setMaxHeight: vi.fn(),
    calculateLayout: vi.fn(),
    getComputedLayout: vi.fn(() => ({
      left: 0,
      top: 0,
      width: 100,
      height: 100
    })),
    getComputedWidth: vi.fn(() => 100),
    getComputedHeight: vi.fn(() => 100),
    getComputedLeft: vi.fn(() => 0),
    getComputedTop: vi.fn(() => 0),
    insertChild: vi.fn(),
    removeChild: vi.fn(),
    getChildCount: vi.fn(() => 0),
    getChild: vi.fn(),
    reset: vi.fn(),
    free: vi.fn(),
    freeRecursive: vi.fn()
  }
  
  const Yoga = {
    Node: {
      create: vi.fn(() => ({ ...mockNode }))
    },
    // Constants
    DISPLAY_FLEX: 0,
    DISPLAY_NONE: 1,
    POSITION_TYPE_RELATIVE: 0,
    POSITION_TYPE_ABSOLUTE: 1,
    FLEX_DIRECTION_COLUMN: 0,
    FLEX_DIRECTION_COLUMN_REVERSE: 1,
    FLEX_DIRECTION_ROW: 2,
    FLEX_DIRECTION_ROW_REVERSE: 3,
    JUSTIFY_FLEX_START: 0,
    JUSTIFY_FLEX_END: 1,
    JUSTIFY_CENTER: 2,
    JUSTIFY_SPACE_BETWEEN: 3,
    JUSTIFY_SPACE_AROUND: 4,
    JUSTIFY_SPACE_EVENLY: 5,
    ALIGN_STRETCH: 0,
    ALIGN_FLEX_START: 1,
    ALIGN_FLEX_END: 2,
    ALIGN_CENTER: 3,
    ALIGN_BASELINE: 4,
    ALIGN_SPACE_BETWEEN: 5,
    ALIGN_SPACE_AROUND: 6,
    ALIGN_SPACE_EVENLY: 7,
    WRAP_NO_WRAP: 0,
    WRAP_WRAP: 1,
    WRAP_WRAP_REVERSE: 2,
    EDGE_LEFT: 0,
    EDGE_TOP: 1,
    EDGE_RIGHT: 2,
    EDGE_BOTTOM: 3,
    EDGE_START: 4,
    EDGE_END: 5,
    EDGE_HORIZONTAL: 6,
    EDGE_VERTICAL: 7,
    EDGE_ALL: 8,
    // Helper functions
    isExperimentalFeatureEnabled: vi.fn(() => false),
    setExperimentalFeatureEnabled: vi.fn()
  }
  
  return { default: Yoga, ...Yoga }
})

console.log('🧪 Test environment initialized for Hyperscape game engine')
console.log('📊 Game metrics tracking enabled')
console.log('🎮 Mock WebGL, Audio, and Network APIs ready')