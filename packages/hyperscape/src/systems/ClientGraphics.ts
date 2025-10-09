import {
  EffectComposer,
  EffectPass,
  RenderPass,
  SelectiveBloomEffect
} from 'postprocessing'
import THREE from '../extras/three'

import type { World } from '../World'
import type { WorldOptions } from '../types'
import { EventType } from '../types/events'
import { System } from './System'

let renderer: THREE.WebGLRenderer | undefined
function getRenderer() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance',
      antialias: true,
      // logarithmicDepthBuffer: true,
      // reverseDepthBuffer: true,
    })
  }
  return renderer
}

// Export shared renderer for use by other systems
export function getSharedRenderer(): THREE.WebGLRenderer | undefined {
  return renderer
}

/**
 * Graphics System
 *
 * - Runs on the client
 * - Supports renderer, shadows, postprocessing, etc
 * - Renders to the viewport
 *
 */
export class ClientGraphics extends System {
  // Properties
  renderer!: THREE.WebGLRenderer
  viewport!: HTMLElement
  maxAnisotropy!: number
  usePostprocessing!: boolean
  composer!: EffectComposer
  renderPass!: RenderPass
  bloom!: SelectiveBloomEffect
  bloomPass!: EffectPass
  effectPass!: EffectPass
  resizer!: ResizeObserver
  xrWidth: number | null = null
  xrHeight: number | null = null
  xrDimensionsNeeded: boolean = false
  xrSession: XRSession | null = null
  width: number = 0
  height: number = 0
  aspect: number = 0
  worldToScreenFactor: number = 0

  constructor(world: World) {
    // Reuse System since ClientGraphics doesn't use SystemBase helpers heavily; but keep name for logs
    super(world)
  }

  override async init(options: WorldOptions & { viewport?: HTMLElement }): Promise<void> {
    if (!options.viewport) {
      throw new Error('ClientGraphics requires viewport in options')
    }
    const { viewport } = options
    this.viewport = viewport
    this.width = this.viewport.offsetWidth
    this.height = this.viewport.offsetHeight
    this.aspect = this.width / this.height
    this.renderer = getRenderer()
    // Guard: only resize when dimensions actually changed to avoid ResizeObserver loops
    this.renderer.setSize(this.width, this.height)
    this.renderer.setClearColor(0xffffff, 0)
    this.renderer.setPixelRatio(this.world.prefs?.dpr || 1)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    if (this.renderer.xr) {
      this.renderer.xr.enabled = true
      this.renderer.xr.setReferenceSpaceType('local-floor')
      this.renderer.xr.setFoveation(0)
    }
    this.maxAnisotropy = this.renderer.capabilities.getMaxAnisotropy()
    THREE.Texture.DEFAULT_ANISOTROPY = this.maxAnisotropy
    this.usePostprocessing = this.world.prefs?.postprocessing ?? true
    const context = this.renderer.getContext()
    const maxMultisampling = (context as WebGL2RenderingContext).MAX_SAMPLES ? 
      context.getParameter((context as WebGL2RenderingContext).MAX_SAMPLES) : 8
    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: Math.min(8, maxMultisampling),
    })
    this.renderPass = new RenderPass(this.world.stage.scene, this.world.camera)
    this.composer.addPass(this.renderPass)
    this.bloom = new SelectiveBloomEffect(this.world.stage.scene, this.world.camera as unknown as THREE.Camera, {
      intensity: 0.8,
      luminanceThreshold: 0.1,
      luminanceSmoothing: 0.1,
      radius: 0.7,
      mipmapBlur: true,
      levels: 4,
    })
    this.bloom.inverted = true
    this.bloom.selection.layer = 14 // NO_BLOOM layer
    this.bloomPass = new EffectPass(this.world.camera as unknown as THREE.Camera, this.bloom)
    this.bloomPass.enabled = this.world.prefs?.bloom ?? true
    this.composer.addPass(this.bloomPass)
    this.effectPass = new EffectPass(
      this.world.camera as unknown as THREE.Camera
      // new VignetteEffect({
      //   darkness: 0.4,
      // })
      // new NoiseEffect({
      //   premultiply: true,
      // })
    )
    this.composer.addPass(this.effectPass)
    this.world.prefs?.on('change', this.onPrefsChange)
    // Debounced resize with strict size change detection
    let resizePending = false
    this.resizer = new ResizeObserver((entries) => {
      if (resizePending) return
      
      const entry = entries[0]
      if (!entry) return
      
      const newWidth = Math.floor(entry.contentRect.width)
      const newHeight = Math.floor(entry.contentRect.height)
      
      // Only resize if dimensions actually changed by at least 1 pixel
      if (newWidth !== this.width || newHeight !== this.height) {
        resizePending = true
        requestAnimationFrame(() => {
          resizePending = false
          this.resize(newWidth, newHeight)
        })
      }
    })
    // Set ID for Cypress tests
    this.renderer.domElement.id = 'hyperscape-world-canvas'
    // Avoid appending twice
    if (this.renderer.domElement.parentElement !== this.viewport) {
      // Detach from any previous parent to avoid duplicate canvases
      if (this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement)
      }
      this.viewport.appendChild(this.renderer.domElement)
    }
    // Temporarily disable ResizeObserver to prevent camera matrix corruption
    // this.resizer.observe(this.viewport)
  }

  override start() {
    this.world.on(EventType.XR_SESSION, this.onXRSession)
  }

  resize(width: number, height: number) {
    // Guard: ensure graphics system is fully initialized
    if (!this.renderer || !this.composer) {
      return
    }
    
    // Prevent unnecessary resize operations
    if (width === this.width && height === this.height) {
      return
    }
    
    console.log(`[ClientGraphics] Resizing from ${this.width}x${this.height} to ${width}x${height}`)
    
    this.width = width
    this.height = height
    this.aspect = this.width / this.height
    if ('aspect' in this.world.camera) {
      ;(this.world.camera as unknown as { aspect: number }).aspect = this.aspect
    }
    if ('updateProjectionMatrix' in this.world.camera) {
      (this.world.camera as { updateProjectionMatrix: () => void }).updateProjectionMatrix()
    }
    this.renderer.setSize(this.width, this.height)
    this.composer.setSize(this.width, this.height)
    this.emit(EventType.GRAPHICS_RESIZE, { width: this.width, height: this.height })
    this.render()
  }

  render() {
    if (this.renderer.xr?.isPresenting || !this.usePostprocessing) {
      this.renderer.render(this.world.stage.scene, this.world.camera as unknown as THREE.Camera)
    } else {
      this.composer.render()
    }
    if (this.xrDimensionsNeeded) {
      this.updateXRDimensions()
    }
  }

  override commit() {
    this.render()
  }

  override preTick() {
    const fov = this.world.camera.fov
    const fovRadians = THREE.MathUtils.degToRad(fov)
    const rendererHeight = this.xrHeight || this.height
    this.worldToScreenFactor = (Math.tan(fovRadians / 2) * 2) / rendererHeight
  }

  onPrefsChange = (changes: { dpr?: { value: number }; postprocessing?: { value: boolean }; bloom?: { value: boolean } }) => {
    // dpr
    if (changes.dpr) {
      this.renderer.setPixelRatio(changes.dpr.value)
      this.resize(this.width, this.height)
    }
    // postprocessing
    if (changes.postprocessing) {
      this.usePostprocessing = changes.postprocessing.value
    }
    // bloom
    if (changes.bloom) {
      this.bloomPass.enabled = changes.bloom.value
    }
  }

  onXRSession = (session: XRSession | null) => {
    if (session) {
      this.xrSession = session
      this.xrWidth = null
      this.xrHeight = null
      this.xrDimensionsNeeded = true
    } else {
      this.xrSession = null
      this.xrWidth = null
      this.xrHeight = null
      this.xrDimensionsNeeded = false
    }
  }

  updateXRDimensions() {
    const referenceSpace = this.renderer.xr?.getReferenceSpace()
    if (!referenceSpace) return
    const frame = this.renderer.xr?.getFrame()
    const pose = frame.getViewerPose(referenceSpace)
    if (pose && pose.views.length > 0) {
      const view = pose.views[0]
      if (view) {
        const projectionMatrix = view.projectionMatrix
        if (projectionMatrix) {
          // Extract FOV information from projection matrix
          // const fovFactor = projectionMatrix[5] // Approximation of FOV scale
          // Access render state for framebuffer dimensions
          const renderState = this.xrSession?.renderState as { baseLayer?: unknown; layers?: unknown[] } | undefined
          const baseLayer = renderState?.baseLayer || (renderState?.layers && renderState.layers[0])
          this.xrWidth = (baseLayer as { framebufferWidth: number }).framebufferWidth
          this.xrHeight = (baseLayer as { framebufferHeight: number }).framebufferHeight
          this.xrDimensionsNeeded = false
        }
      }
    }
  }

  override destroy() {
    this.resizer.disconnect()
    // Unsubscribe from prefs changes
    this.world.prefs?.off('change', this.onPrefsChange)
    // Remove XR session listener
    this.world.off(EventType.XR_SESSION, this.onXRSession)
    // Ensure animation loop is stopped
    this.renderer.setAnimationLoop?.(null as unknown as (() => void))
    // Dispose postprocessing composer and effects if available
    try { (this.composer as unknown as { dispose?: () => void })?.dispose?.() } catch {}
    try { (this.bloom as unknown as { dispose?: () => void })?.dispose?.() } catch {}
    // Remove and dispose renderer
    if (this.renderer?.domElement?.parentElement === this.viewport) {
      this.viewport.removeChild(this.renderer.domElement)
    }
    // Do not dispose the shared renderer globally to avoid breaking other systems during hot reloads
  }
}

