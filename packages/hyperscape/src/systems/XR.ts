import * as THREE from '../extras/three'
import { System } from './System'
import type { World } from '../types'

import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js'

/**
 * XR System
 *
 * - Runs on the client.
 * - Keeps track of XR sessions
 *
 */
export class XR extends System {
  session: XRSession | null
  camera: THREE.Camera | null
  controller1Model: THREE.Object3D | null
  controller2Model: THREE.Object3D | null
  supportsVR: boolean
  supportsAR: boolean
  controllerModelFactory: XRControllerModelFactory

  constructor(world: World) {
    super(world)
    this.session = null
    this.camera = null
    this.controller1Model = null
    this.controller2Model = null
    this.supportsVR = false
    this.supportsAR = false
    this.controllerModelFactory = new XRControllerModelFactory()
  }

  override async init() {
    // Strong type assumption - we're in a browser environment with XR support
    this.supportsVR = await navigator.xr!.isSessionSupported('immersive-vr')
    this.supportsAR = await navigator.xr!.isSessionSupported('immersive-ar')
  }

  async enter() {
    // Strong type assumption - XR is available when enter() is called
    const session = await navigator.xr!.requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'],
    })
    try {
      session.updateTargetFrameRate(72)
    } catch (_err) {
      console.error(_err)
      console.error('xr session.updateTargetFrameRate(72) failed')
    }
    // Get the local player and unmount avatar for XR
    const localPlayer = this.world.entities.getLocalPlayer()!
    if (localPlayer.avatar) {
      // Strong type assumption - avatar has unmount method
      (localPlayer.avatar as { unmount(): void }).unmount()
    }
    // Strong type assumption - graphics renderer and XR are available
    this.world.graphics!.renderer!.xr.setSession(session)
    this.camera = this.world.graphics!.renderer!.xr.getCamera()
      
    // Strong type assumption - controllers are available in XR session
    const grip1 = this.world.graphics!.renderer!.xr.getControllerGrip(0)
    this.controller1Model = grip1 as unknown as THREE.Object3D
    const model1 = this.controllerModelFactory.createControllerModel(grip1)
    if (model1) {
      this.controller1Model.add(model1)
    }
    this.world.rig!.add(this.controller1Model)

    const grip2 = this.world.graphics!.renderer!.xr.getControllerGrip(1)
    this.controller2Model = grip2 as unknown as THREE.Object3D
    const model2 = this.controllerModelFactory.createControllerModel(grip2)
    if (model2) {
      this.controller2Model.add(model2)
    }
    this.world.rig!.add(this.controller2Model)

    session.addEventListener('end', this.onSessionEnd)
    this.session = session
    this.world.emit('xrSession', session)
  }

  onSessionEnd = () => {
    // Get the local player and remount avatar after XR
    const localPlayer = this.world.entities.getLocalPlayer()!
    if (localPlayer.avatar) {
      // Strong type assumption - avatar has mount method
      (localPlayer.avatar as { mount(): void }).mount()
    }
    this.world.camera!.position.set(0, 0, 0)
    this.world.camera!.rotation.set(0, 0, 0)
    this.world.rig!.remove(this.controller1Model!)
    this.world.rig!.remove(this.controller2Model!)
    this.session = null
    this.camera = null
    this.controller1Model = null
    this.controller2Model = null
    this.world.emit('xrSession', null)
  }
}
