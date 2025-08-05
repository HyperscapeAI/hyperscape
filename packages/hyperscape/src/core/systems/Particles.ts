import { EventType } from '../../types/events'
import type { World } from '../World'
import {
  AdditiveBlending,
  Camera,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Texture,
  Vector3
} from '../extras/three'
import { uuid } from '../utils'
import type { ClientLoader } from './ClientLoader'
import type { Stage } from './Stage'
import { System } from './System'

const v1 = new Vector3()
const v2 = new Vector3()
const e1 = new Euler(0, 0, 0, 'YXZ')
const arr1: number[] = []
const arr2: number[] = []

const billboardModeInts: Record<string, number> = {
  full: 0,
  y: 1,
  direction: 2,
}

// Extend window interface properly
interface WindowWithParticles extends Window {
  PARTICLES_PATH?: string;
}

function getWorker(): Worker {
  const particlesPath = (window as WindowWithParticles).PARTICLES_PATH || '/particles.js'
  return new Worker(particlesPath)
}

// Define proper message interfaces
interface ParticleMessageData {
  emitterId: string;
  op?: string;
  n?: number;
  aPosition?: Float32Array;
  aRotation?: Float32Array;
  aDirection?: Float32Array;
  aSize?: Float32Array;
  aColor?: Float32Array;
  aAlpha?: Float32Array;
  aEmissive?: Float32Array;
  aUV?: Float32Array;
  delta?: number;
  camPosition?: number[];
  matrixWorld?: number[];
  value?: boolean;
  [key: string]: unknown;
}

interface ParticleMessage {
  data: ParticleMessageData;
}

interface ParticleEmitter {
  id: string;
  node: EmitterNode;
  isEmitting: boolean;
  update: (delta: number) => void;
  destroy: () => void;
  setEmitting: (value: boolean) => void;
  onMessage: (msg: ParticleMessage) => void;
  send: (msg: Partial<ParticleMessageData>, transfers?: Transferable[]) => void;
}

export class Particles extends System {
  worker: Worker
  uOrientationFull: { value: Quaternion }
  uOrientationY: { value: Quaternion }
  emitters: Map<string, ParticleEmitter>
  
  constructor(world: World) {
    super(world)
    this.worker = getWorker()
    this.uOrientationFull = { value: new Quaternion() }
    this.uOrientationY = { value: new Quaternion() }
    this.emitters = new Map()
  }

  async init(): Promise<void> {
    this.worker.onmessage = this.onMessage
    this.worker.onerror = this.onError
    
    // Set the initial quaternion value after world is initialized
    this.uOrientationFull.value = (this.world.rig as Object3D).quaternion
  }

  start() {
    this.world.on(EventType.XR_SESSION, this.onXRSession)
  }

  register(node: EmitterNode) {
    return createEmitter(this.world, this, node)
  }

  update(delta: number) {
    const quaternion = (this.world.rig as Object3D).quaternion
    
    e1.setFromQuaternion(quaternion)
    e1.x = 0
    e1.z = 0
    this.uOrientationY.value.setFromEuler(e1)

    this.emitters.forEach((emitter) => {
      emitter.update(delta)
    })
  }

  onMessage = (msg: MessageEvent) => {
    const data = msg.data as ParticleMessageData
    const emitter = this.emitters.get(data.emitterId)
    if (emitter) {
      emitter.onMessage({ data })
    }
  }

  onError = (err: ErrorEvent) => {
    throw new Error(`[ParticleSystem] ${err.message}`)
  }

  onXRSession = (session: unknown) => {
    if (session && this.world.xr) {
      this.uOrientationFull.value = (this.world.xr as { camera: Camera }).camera.quaternion
    } else {
      this.uOrientationFull.value = (this.world.rig as Object3D).quaternion
    }
  }
}
interface EmitterNode {
  id: string;
  getConfig: () => Record<string, unknown>;
  _max: number;
  _image: string;
  _billboard: string;
  _lit: boolean;
  _blending: string;
  _onEnd: () => void;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
  emitting: boolean;
  matrixWorld: Matrix4;
}

function createEmitter(world: World, system: Particles, node: EmitterNode): ParticleEmitter {
  const id = uuid()
  const config = node.getConfig()

  const geometry = new PlaneGeometry(1, 1)

  const aPosition = new InstancedBufferAttribute(new Float32Array(node._max * 3), 3)
  aPosition.setUsage(DynamicDrawUsage)
  geometry.setAttribute('aPosition', aPosition)

  const aRotation = new InstancedBufferAttribute(new Float32Array(node._max * 1), 1)
  aRotation.setUsage(DynamicDrawUsage)
  geometry.setAttribute('aRotation', aRotation)

  const aDirection = new InstancedBufferAttribute(new Float32Array(node._max * 3), 3)
  aDirection.setUsage(DynamicDrawUsage)
  geometry.setAttribute('aDirection', aDirection)

  const aSize = new InstancedBufferAttribute(new Float32Array(node._max * 1), 1)
  aSize.setUsage(DynamicDrawUsage)
  geometry.setAttribute('aSize', aSize)

  const aColor = new InstancedBufferAttribute(new Float32Array(node._max * 3), 3)
  aColor.setUsage(DynamicDrawUsage)
  geometry.setAttribute('aColor', aColor)

  const aAlpha = new InstancedBufferAttribute(new Float32Array(node._max * 1), 1)
  aAlpha.setUsage(DynamicDrawUsage)
  geometry.setAttribute('aAlpha', aAlpha)

  const aEmissive = new InstancedBufferAttribute(new Float32Array(node._max * 1), 1)
  aEmissive.setUsage(DynamicDrawUsage)
  geometry.setAttribute('aEmissive', aEmissive)

  const aUV = new InstancedBufferAttribute(new Float32Array(node._max * 4), 4)
  aUV.setUsage(DynamicDrawUsage)
  geometry.setAttribute('aUV', aUV)

  // ping-pong buffers
  const next = {
    aPosition: new Float32Array(node._max * 3),
    aRotation: new Float32Array(node._max * 1),
    aDirection: new Float32Array(node._max * 3),
    aSize: new Float32Array(node._max * 1),
    aColor: new Float32Array(node._max * 3),
    aAlpha: new Float32Array(node._max * 1),
    aEmissive: new Float32Array(node._max * 1),
    aUV: new Float32Array(node._max * 4),
  }

  const texture = new Texture()
  texture.colorSpace = SRGBColorSpace

  const uniforms = {
    uTexture: { value: texture },
    uBillboard: { value: billboardModeInts[node._billboard] || 0 },
    uOrientation: node._billboard === 'full' ? system.uOrientationFull : system.uOrientationY,
  };
  const loader = world.loader as ClientLoader
  if (loader) {
    loader.load('texture', node._image).then((result) => {
      const texture = result as Texture
      texture.colorSpace = SRGBColorSpace
      uniforms.uTexture.value = texture
      // texture.image = t.image
      // texture.needsUpdate = true
    })
  }

  // Create basic material (simplified for strong typing)
  const BaseMaterial = node._lit ? MeshStandardMaterial : MeshBasicMaterial
  const material = new BaseMaterial({
    map: texture,
    ...(node._lit ? { roughness: 1, metalness: 0 } : {}),
    blending: node._blending === 'additive' ? AdditiveBlending : NormalBlending,
    transparent: true,
    color: 'white',
    side: DoubleSide,
    depthWrite: false,
    depthTest: true,
  })
  const mesh = new InstancedMesh(geometry, material, node._max as number) as unknown as InstancedMesh & { _node: EmitterNode }
  mesh._node = node
  mesh.count = 0
  mesh.instanceMatrix.needsUpdate = true
  mesh.frustumCulled = false
  mesh.matrixAutoUpdate = false
  mesh.matrixWorldAutoUpdate = false;
  const stage = world.stage as Stage
  stage.scene.add(mesh)

  const matrixWorld = node.matrixWorld

  let pending = false
  let skippedDelta = 0

  function send(msg: { [key: string]: unknown }, transfers?: Transferable[]) {
    msg.emitterId = id
    if (system.worker) {
      if (transfers) {
        system.worker.postMessage(msg, transfers)
      } else {
        system.worker.postMessage(msg)
      }
    }
  }

  function setEmitting(value: boolean) {
    send({ op: 'emitting', value })
  }

  function onMessage(msg: { data: { [key: string]: unknown } }) {
    const data = msg.data
    if (data.op === 'update') {
      const n = data.n as number

      // Store current arrays in next before replacing
      // BufferAttribute.array is already a typed array, not an ArrayBuffer
      next.aPosition = (aPosition.array as Float32Array).slice()
      next.aRotation = (aRotation.array as Float32Array).slice()
      next.aDirection = (aDirection.array as Float32Array).slice()
      next.aSize = (aSize.array as Float32Array).slice()
      next.aColor = (aColor.array as Float32Array).slice()
      next.aAlpha = (aAlpha.array as Float32Array).slice()
      next.aEmissive = (aEmissive.array as Float32Array).slice()
      next.aUV = (aUV.array as Float32Array).slice()

      aPosition.array = data.aPosition as Float32Array
      aPosition.addUpdateRange(0, n * 3)
      aPosition.needsUpdate = true
      aRotation.array = data.aRotation as Float32Array
      aRotation.addUpdateRange(0, n * 1)
      aRotation.needsUpdate = true
      aDirection.array = data.aDirection as Float32Array
      aDirection.addUpdateRange(0, n * 3)
      aDirection.needsUpdate = true
      aSize.array = data.aSize as Float32Array
      aSize.addUpdateRange(0, n * 1)
      aSize.needsUpdate = true
      aColor.array = data.aColor as Float32Array
      aColor.addUpdateRange(0, n * 3)
      aColor.needsUpdate = true
      aAlpha.array = data.aAlpha as Float32Array
      aAlpha.addUpdateRange(0, n * 1)
      aAlpha.needsUpdate = true
      aEmissive.array = data.aEmissive as Float32Array
      aEmissive.addUpdateRange(0, n * 1)
      aEmissive.needsUpdate = true
      aUV.array = data.aUV as Float32Array
      aUV.addUpdateRange(0, n * 4)
      aUV.needsUpdate = true

      mesh.count = n
      pending = false
    }
    if (data.op === 'end') {
      node._onEnd()
    }
  }

  function update(delta: number) {
    const camPosition = v1.setFromMatrixPosition(world.camera.matrixWorld)
    const worldPosition = v2.setFromMatrixPosition(matrixWorld)

    // draw emitter back-to-front
    const distance = camPosition.distanceTo(worldPosition)
    mesh.renderOrder = -distance

    if (pending) {
      skippedDelta += delta
    } else {
      delta += skippedDelta
      skippedDelta = 0
      const aPosition = next.aPosition
      const aRotation = next.aRotation
      const aDirection = next.aDirection
      const aSize = next.aSize
      const aColor = next.aColor
      const aAlpha = next.aAlpha
      const aEmissive = next.aEmissive
      const aUV = next.aUV
      pending = true
      send(
        {
          op: 'update',
          delta,
          camPosition: camPosition.toArray(arr1),
          matrixWorld: matrixWorld.toArray(arr2),
          aPosition,
          aRotation,
          aDirection,
          aSize,
          aColor,
          aAlpha,
          aEmissive,
          aUV,
        },
        [
          // prettier-ignore
          aPosition.buffer,
          aRotation.buffer,
          aDirection.buffer,
          aSize.buffer,
          aColor.buffer,
          aAlpha.buffer,
          aEmissive.buffer,
          aUV.buffer,
        ]
      )
    }
  }

  function destroy() {
    system.emitters.delete(id)
    if (system.worker) {
      system.worker.postMessage({ op: 'destroy', emitterId: id })
    }
    const stage = world.stage as Stage
    stage.scene.remove(mesh)
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(mat => mat.dispose())
    } else {
      mesh.material.dispose()
    }
    mesh.geometry.dispose()
  }

  const handle = {
    id,
    node,
    send,
    setEmitting,
    onMessage,
    update,
    destroy,
    isEmitting: false
  }
  system.emitters.set(id, handle)
  if (system.worker) {
    system.worker.postMessage({ op: 'create', id, ...config })
  }
  return handle
}
