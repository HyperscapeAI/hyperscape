import {
  EffectComposer,
  EffectPass,
  RenderPass,
  SelectiveBloomEffect
} from 'postprocessing'
import * as THREE from '../extras/three'

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
    this.bloom = new SelectiveBloomEffect(this.world.stage.scene, this.world.camera, {
      intensity: 0.8,
      luminanceThreshold: 0.1,
      luminanceSmoothing: 0.1,
      radius: 0.7,
      mipmapBlur: true,
      levels: 4,
    })
    this.bloom.inverted = true
    this.bloom.selection.layer = 14 // NO_BLOOM layer
    this.bloomPass = new EffectPass(this.world.camera, this.bloom)
    this.bloomPass.enabled = this.world.prefs?.bloom ?? true
    this.composer.addPass(this.bloomPass)
    this.effectPass = new EffectPass(
      this.world.camera
      // new VignetteEffect({
      //   darkness: 0.4,
      // })
      // new NoiseEffect({
      //   premultiply: true,
      // })
    )
    this.composer.addPass(this.effectPass)
    this.world.prefs?.on('change', this.onPrefsChange)
    this.resizer = new ResizeObserver(() => {
      this.resize(this.viewport.offsetWidth, this.viewport.offsetHeight)
    })
    // Set ID for Cypress tests
    this.renderer.domElement.id = 'hyperscape-world-canvas'
    this.viewport.appendChild(this.renderer.domElement)
    this.resizer.observe(this.viewport)
  }

  override start() {
    if ('on' in this.world) {
      // Assume on method exists on world
      (this.world as { on: (event: string, handler: (session: XRSession | null) => void) => void }).on('xrSession', this.onXRSession)
    }
  }

  resize(width: number, height: number) {
    this.width = width
    this.height = height
    this.aspect = this.width / this.height
    this.world.camera.aspect = this.aspect
    this.world.camera.updateProjectionMatrix()
    this.renderer.setSize(this.width, this.height)
    this.composer.setSize(this.width, this.height)
    this.emit(EventType.GRAPHICS_RESIZE, { width: this.width, height: this.height })
    this.render()
  }

  render() {
    try {
      
      if (this.renderer.xr?.isPresenting || !this.usePostprocessing) {
        this.renderer.render(this.world.stage.scene, this.world.camera)
      } else {
        this.composer.render()
      }
      if (this.xrDimensionsNeeded) {
        this.updateXRDimensions()
      }
    } catch (error) {
      console.error('[ClientGraphics] Render error:', error);
      // If postprocessing is causing issues, fall back to regular rendering
      if (this.usePostprocessing && (error as Error).message.includes('test')) {
        console.warn('[ClientGraphics] Disabling postprocessing due to error');
        this.usePostprocessing = false;
        // Try to render without postprocessing
        try {
          this.renderer.render(this.world.stage.scene, this.world.camera);
        } catch (fallbackError) {
          console.error('[ClientGraphics] Fallback render also failed:', fallbackError);
        }
      }
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
          const renderState = this.xrSession?.renderState
          const baseLayer = renderState?.baseLayer || renderState?.layers?.[0]
          if (baseLayer && 'framebufferWidth' in baseLayer && 'framebufferHeight' in baseLayer) {
            this.xrWidth = (baseLayer as { framebufferWidth: number }).framebufferWidth
            this.xrHeight = (baseLayer as { framebufferHeight: number }).framebufferHeight
            this.xrDimensionsNeeded = false
          }
        }
      }
    }
  }

  override destroy() {
    this.resizer.disconnect()
    this.viewport.removeChild(this.renderer.domElement)
  }
}

