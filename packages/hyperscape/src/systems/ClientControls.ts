import type { ButtonEntry, ControlAction, ControlEntry, ControlsBinding, PointerEntry, ScreenEntry, TouchInfo, ValueEntry, VectorEntry, World, WorldOptions, XRInputSource } from '../types'
import { buttons, codeToProp } from '../extras/buttons'
import THREE from '../extras/three'
import { SystemBase } from './SystemBase'
import { EventType } from '../types/events'

// Interfaces moved to shared types


function asButtonEntry(entry: ControlEntry): ButtonEntry {
  return entry as ButtonEntry;
}

function asVectorEntry(entry: ControlEntry): VectorEntry {
  return entry as VectorEntry;
}

function asValueEntry(entry: ControlEntry): ValueEntry {
  return entry as ValueEntry;
}

// Removed camera entry in favor of unified ClientCameraSystem

// Control and Action interfaces moved to shared types

const LMB = 1 // bitmask
const RMB = 2 // bitmask
const MouseLeft = 'mouseLeft'
const MouseRight = 'mouseRight'
const HandednessLeft = 'left'
const HandednessRight = 'right'

let actionIds = 0

/**
 * Control System
 *
 * - runs on the client
 * - provides a layered priority control system for both input and output
 *
 */

const isBrowser = typeof window !== 'undefined'

export const controlTypes = {
  // key: createButton,
  mouseLeft: createButton,
  mouseRight: createButton,
  touchStick: createVector,
  scrollDelta: createValue,
  pointer: createPointer,
  screen: createScreen,
  xrLeftStick: createVector,
  xrLeftTrigger: createButton,
  xrLeftBtn1: createButton,
  xrLeftBtn2: createButton,
  xrRightStick: createVector,
  xrRightTrigger: createButton,
  xrRightBtn1: createButton,
  xrRightBtn2: createButton,
  touchA: createButton,
  touchB: createButton,
}

export class ClientControls extends SystemBase {
  controls: ControlsBinding[]
  actions: ControlAction[]
  buttonsDown: Set<string>
  isMac: boolean
  pointer: {
    locked: boolean
    shouldLock: boolean
    coords: THREE.Vector3
    position: THREE.Vector3
    delta: THREE.Vector3
  }
  touches: Map<number, TouchInfo>
  screen: {
    width: number
    height: number
  }
  scroll: {
    delta: number
  }
  xrSession: XRSession | null
  viewport: HTMLElement | undefined
  lmbDown: boolean = false
  rmbDown: boolean = false
  
  constructor(world: World) {
    super(world, { name: 'client-controls', dependencies: { required: [], optional: [] }, autoCleanup: true })
    this.controls = []
    this.actions = []
    this.buttonsDown = new Set()
    this.isMac = typeof navigator !== 'undefined' ? /Mac/.test(navigator.platform) : false;
    this.pointer = {
      locked: false,
      shouldLock: false,
      coords: new THREE.Vector3(), // [0,0] to [1,1]
      position: new THREE.Vector3(), // [0,0] to [viewportWidth,viewportHeight]
      delta: new THREE.Vector3(), // position delta (pixels)
    }
    this.touches = new Map() // id -> { id, position, delta, prevPosition }
    this.screen = {
      width: 0,
      height: 0,
    }
    this.scroll = {
      delta: 0,
    }
    this.xrSession = null
  }

  start() {
    this.subscribe(EventType.XR_SESSION, (session: XRSession | null) => this.onXRSession(session))
  }

  preFixedUpdate() {
    // mouse wheel delta
    for (const control of this.controls) {
      const scrollDelta = control.entries.scrollDelta
      if (scrollDelta) {
        const valueEntry = asValueEntry(scrollDelta)
        valueEntry.value = this.scroll.delta
        if (valueEntry.capture) break
      }
    }
    // xr
    if (this.xrSession) {
      this.xrSession.inputSources?.forEach((src: XRInputSource) => {
        // left
        if (src.gamepad && src.handedness === HandednessLeft) {
          for (const control of this.controls) {
            const xrLeftStick = control.entries.xrLeftStick
            if (xrLeftStick) {
              const vectorEntry = asVectorEntry(xrLeftStick)
              vectorEntry.value.x = src.gamepad.axes[2]
              vectorEntry.value.z = src.gamepad.axes[3]
              if (vectorEntry.capture) break
            }
            const xrLeftTrigger = control.entries.xrLeftTrigger
            if (xrLeftTrigger) {
              const buttonEntry = asButtonEntry(xrLeftTrigger)
              const down = src.gamepad.buttons[0].pressed
              if (down && !buttonEntry.down) {
                buttonEntry.pressed = true
                buttonEntry.onPress?.()
              }
              if (!down && buttonEntry.down) {
                buttonEntry.released = true
                buttonEntry.onRelease?.()
              }
              buttonEntry.down = down
            }
            const xrLeftBtn1 = control.entries.xrLeftBtn1
            if (xrLeftBtn1) {
              const buttonEntry = asButtonEntry(xrLeftBtn1)
              const down = src.gamepad.buttons[4].pressed
              if (down && !buttonEntry.down) {
                buttonEntry.pressed = true
                buttonEntry.onPress?.()
              }
              if (!down && buttonEntry.down) {
                buttonEntry.released = true
                buttonEntry.onRelease?.()
              }
              buttonEntry.down = down
            }
            const xrLeftBtn2 = control.entries.xrLeftBtn2
            if (xrLeftBtn2) {
              const buttonEntry = asButtonEntry(xrLeftBtn2)
              const down = src.gamepad.buttons[5].pressed
              if (down && !buttonEntry.down) {
                buttonEntry.pressed = true
                buttonEntry.onPress?.()
              }
              if (!down && buttonEntry.down) {
                buttonEntry.released = true
                buttonEntry.onRelease?.()
              }
              buttonEntry.down = down
            }
          }
        }
        // right
        if (src.gamepad && src.handedness === HandednessRight) {
          for (const control of this.controls) {
            const xrRightStick = control.entries.xrRightStick
            if (xrRightStick) {
              const vectorEntry = asVectorEntry(xrRightStick)
              vectorEntry.value.x = src.gamepad.axes[2]
              vectorEntry.value.z = src.gamepad.axes[3]
              if (vectorEntry.capture) break
            }
            const xrRightTrigger = control.entries.xrRightTrigger
            if (xrRightTrigger) {
              const buttonEntry = asButtonEntry(xrRightTrigger)
              const down = src.gamepad.buttons[0].pressed
              if (down && !buttonEntry.down) {
                buttonEntry.pressed = true
                buttonEntry.onPress?.()
              }
              if (!down && buttonEntry.down) {
                buttonEntry.released = true
                buttonEntry.onRelease?.()
              }
              buttonEntry.down = down
            }
            const xrRightBtn1 = control.entries.xrRightBtn1
            if (xrRightBtn1) {
              const buttonEntry = asButtonEntry(xrRightBtn1)
              const down = src.gamepad.buttons[4].pressed
              if (down && !buttonEntry.down) {
                buttonEntry.pressed = true
                buttonEntry.onPress?.()
              }
              if (!down && buttonEntry.down) {
                buttonEntry.released = true
                buttonEntry.onRelease?.()
              }
              buttonEntry.down = down
            }
            const xrRightBtn2 = control.entries.xrRightBtn2
            if (xrRightBtn2) {
              const buttonEntry = asButtonEntry(xrRightBtn2)
              const down = src.gamepad.buttons[5].pressed
              if (down && !buttonEntry.down) {
                buttonEntry.pressed = true
                buttonEntry.onPress?.()
              }
              if (!down && buttonEntry.down) {
                buttonEntry.released = true
                buttonEntry.onRelease?.()
              }
              buttonEntry.down = down
            }
          }
        }
      })
    }
  }

  postLateUpdate() {
    // clear pointer delta
    this.pointer.delta.set(0, 0, 0)
    // clear scroll delta
    this.scroll.delta = 0
    // clear buttons
    for (const control of this.controls) {
      for (const key in control.entries) {
        const value = control.entries[key]
        // Assume it's a button entry if we're clearing pressed/released states
        const buttonEntry = asButtonEntry(value)
        buttonEntry.pressed = false
        buttonEntry.released = false
      }
    }
    // Camera handled exclusively by ClientCameraSystem; no writes here
    // clear touch deltas
    for (const [_id, info] of this.touches) {
      info.delta.set(0, 0, 0)
    }
  }

  async init(options: WorldOptions & { viewport?: HTMLElement }): Promise<void> {
    if (!isBrowser) return
    this.viewport = options.viewport
    if (!this.viewport) return
    
    this.screen.width = this.viewport.offsetWidth
    this.screen.height = this.viewport.offsetHeight
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    this.viewport.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointermove', this.onPointerMove)
    this.viewport.addEventListener('touchstart', this.onTouchStart)
    this.viewport.addEventListener('touchmove', this.onTouchMove)
    this.viewport.addEventListener('touchend', this.onTouchEnd)
    this.viewport.addEventListener('touchcancel', this.onTouchEnd)
    this.viewport.addEventListener('pointerup', this.onPointerUp)
    this.viewport.addEventListener('wheel', this.onScroll, { passive: false })
    document.body.addEventListener('contextmenu', this.onContextMenu)
    window.addEventListener('resize', this.onResize)
    window.addEventListener('focus', this.onFocus)
    window.addEventListener('blur', this.onBlur)
  }

  bind(options: {
    priority?: number;
    onRelease?: () => void;
    onTouch?: (info: TouchInfo) => boolean;
    onTouchEnd?: (info: TouchInfo) => boolean;
  } = {}) {
    const self = this
    const entries: Record<string, ControlEntry> = {}
    const control = {
      options,
      entries,
      actions: null,
      api: {
        setActions(value) {
          if (value !== null && !Array.isArray(value)) {
            throw new Error('[control] actions must be null or array')
          }
          control.actions = value
          if (value) {
            for (const action of value) {
              action.id = ++actionIds
            }
          }
          self.buildActions()
        },
        release: () => {
          const idx = this.controls.indexOf(control)
          if (idx === -1) return
          this.controls.splice(idx, 1)
          options.onRelease?.()
        },
      },
    }
    // insert at correct priority level
    // - 0 is lowest priority generally for player controls
    // - apps use higher priority
    // - global systems use highest priority over everything
    const priority = options.priority ?? 0
    const idx = this.controls.findIndex(c => (c.options.priority ?? 0) <= priority)
    if (idx === -1) {
      this.controls.push(control)
    } else {
      this.controls.splice(idx, 0, control)
    }
    // return proxy api
    return new Proxy(control, {
      get(target, prop) {
        // Handle symbols
        if (typeof prop === 'symbol') {
          return undefined
        }
        // internal property
        if (prop in target.api) {
          return target.api[prop]
        }
        // existing item
        if (prop in entries) {
          return entries[prop]
        }
        // new button item
        if (buttons.has(prop)) {
          entries[prop] = createButton(self, control, prop)
          return entries[prop]
        }
        // new item based on type
        const createType = controlTypes[prop as keyof typeof controlTypes]
        if (createType) {
          entries[prop] = createType(self, control, prop)
          return entries[prop]
        }
        return undefined
      },
    })
  }

  releaseAllButtons() {
    // release all down buttons because they can get stuck
    for (const control of this.controls) {
      for (const key in control.entries) {
        const value = control.entries[key]
        // Assume it's a button entry if we're checking for down state
        const buttonEntry = asButtonEntry(value)
        if (buttonEntry.down) {
          buttonEntry.released = true
          buttonEntry.down = false
          buttonEntry.onRelease?.()
        }
      }
    }
  }

  buildActions() {
    this.actions = []
    for (const control of this.controls) {
      const actions = control.actions
      if (actions) {
        for (const action of actions) {
          // ignore if already existing
          if (action.type !== 'custom') {
            const idx = this.actions.findIndex(a => a.type === action.type)
            if (idx !== -1) continue
          }
          this.actions.push(action)
        }
      }
    }
    this.emit('actions', this.actions)
  }

  setTouchBtn(prop, down) {
    if (down) {
      this.buttonsDown.add(prop)
      for (const control of this.controls) {
        const button = control.entries[prop]
        if (button) {
          const buttonEntry = asButtonEntry(button)
          buttonEntry.pressed = true
          buttonEntry.down = true
          const capture = buttonEntry.onPress?.()
          if (capture || buttonEntry.capture) break
        }
      }
    } else {
      this.buttonsDown.delete(prop)
      for (const control of this.controls) {
        const button = control.entries[prop]
        if (button) {
          const buttonEntry = asButtonEntry(button)
          if (buttonEntry.down) {
            buttonEntry.down = false
            buttonEntry.released = true
            buttonEntry.onRelease?.()
          }
        }
      }
    }
  }

  simulateButton(prop, pressed) {
    if (pressed) {
      if (this.buttonsDown.has(prop)) return
      this.buttonsDown.add(prop)
      for (const control of this.controls) {
        const button = control.entries[prop]
        if (button) {
          const buttonEntry = asButtonEntry(button)
          buttonEntry.pressed = true
          buttonEntry.down = true
          const capture = buttonEntry.onPress?.()
          if (capture || buttonEntry.capture) break
        }
        const capture = control.onButtonPress?.(prop, 'simulated')
        if (capture) break
      }
    } else {
      if (!this.buttonsDown.has(prop)) return
      this.buttonsDown.delete(prop)
      for (const control of this.controls) {
        const button = control.entries[prop]
        if (button) {
          const buttonEntry = asButtonEntry(button)
          if (buttonEntry.down) {
            buttonEntry.down = false
            buttonEntry.released = true
            buttonEntry.onRelease?.()
          }
        }
      }
    }
  }

  onKeyDown = (e) => {
    if (e.defaultPrevented) return
    if (e.repeat) return
    if (this.isInputFocused()) return
    const code = e.code
    if (code === 'Tab') {
      // prevent default focus switching behavior
      e.preventDefault()
    }
    const prop = codeToProp[code]
    const _text = e.key
    this.buttonsDown.add(prop)
    for (const control of this.controls) {
      const button = control.entries[prop]
      if (button) {
        const buttonEntry = asButtonEntry(button)
        buttonEntry.pressed = true
        buttonEntry.down = true
        const capture = buttonEntry.onPress?.()
        if (capture || buttonEntry.capture) break
      }
    }
  }

  onKeyUp = (e) => {
    if (e.repeat) return
    if (this.isInputFocused()) return
    const code = e.code
    if (code === 'MetaLeft' || code === 'MetaRight') {
      // releasing a meta key while another key is down causes browsers not to ever
      // trigger onKeyUp, so we just have to force all keys up
      return this.releaseAllButtons()
    }
    const prop = codeToProp[code]
    this.buttonsDown.delete(prop)
    for (const control of this.controls) {
      const button = control.entries[prop]
      if (button) {
        const buttonEntry = asButtonEntry(button)
        if (buttonEntry.down) {
          buttonEntry.down = false
          buttonEntry.released = true
          buttonEntry.onRelease?.()
        }
      }
    }
  }

  onPointerDown = (e) => {
    if (e.isCoreUI) return
    this.checkPointerChanges(e)
  }

  onPointerMove = (e) => {
    if (e.isCoreUI) return
    if (!this.viewport) return
    // this.checkPointerChanges(e)
    const rect = this.viewport.getBoundingClientRect()
    const offsetX = e.pageX - rect.left
    const offsetY = e.pageY - rect.top
    this.pointer.coords.x = Math.max(0, Math.min(1, offsetX / rect.width)) // prettier-ignore
    this.pointer.coords.y = Math.max(0, Math.min(1, offsetY / rect.height)) // prettier-ignore
    this.pointer.position.x = offsetX
    this.pointer.position.y = offsetY
    this.pointer.delta.x += e.movementX
    this.pointer.delta.y += e.movementY
  }

  onPointerUp = (e) => {
    if (e.isCoreUI) return
    this.checkPointerChanges(e)
  }

  checkPointerChanges(e) {
    const lmb = !!(e.buttons & LMB)
    // left mouse down
    if (!this.lmbDown && lmb) {
      this.lmbDown = true
      this.buttonsDown.add(MouseLeft)
      for (const control of this.controls) {
        const button = control.entries.mouseLeft
        if (button) {
          const buttonEntry = asButtonEntry(button)
          buttonEntry.down = true
          buttonEntry.pressed = true
          const capture = buttonEntry.onPress?.()
          if (capture || buttonEntry.capture) break
        }
      }
    }
    // left mouse up
    if (this.lmbDown && !lmb) {
      this.lmbDown = false
      this.buttonsDown.delete(MouseLeft)
      for (const control of this.controls) {
        const button = control.entries.mouseLeft
        if (button) {
          const buttonEntry = asButtonEntry(button)
          buttonEntry.down = false
          buttonEntry.released = true
          buttonEntry.onRelease?.()
        }
      }
    }
    const rmb = !!(e.buttons & RMB)
    // right mouse down
    if (!this.rmbDown && rmb) {
      this.rmbDown = true
      this.buttonsDown.add(MouseRight)
      for (const control of this.controls) {
        const button = control.entries.mouseRight
        if (button) {
          const buttonEntry = asButtonEntry(button)
          buttonEntry.down = true
          buttonEntry.pressed = true
          const capture = buttonEntry.onPress?.()
          if (capture || buttonEntry.capture) break
        }
      }
    }
    // right mouse up
    if (this.rmbDown && !rmb) {
      this.rmbDown = false
      this.buttonsDown.delete(MouseRight)
      for (const control of this.controls) {
        const button = control.entries.mouseRight
        if (button) {
          const buttonEntry = asButtonEntry(button)
          buttonEntry.down = false
          buttonEntry.released = true
          buttonEntry.onRelease?.()
        }
      }
    }
  }

  async lockPointer() {
    // Pointer lock disabled for UI
    return false
  }

  unlockPointer() {
    // Pointer lock disabled for UI
    this.pointer.shouldLock = false
    this.pointer.locked = false
  }

  onPointerLockChange = (_e: Event) => {
    // Pointer lock disabled for UI
  }

  onPointerLockStart() {
    // Pointer lock disabled for UI
  }

  onPointerLockEnd() {
    // Pointer lock disabled for UI
  }

  onScroll = (e) => {
    if (e.isCoreUI) return
    // Don't prevent default - let other systems handle scroll too
    // e.preventDefault() // REMOVED to allow camera zoom
    let delta = e.shiftKey ? e.deltaX : e.deltaY
    if (!this.isMac) delta = -delta
    this.scroll.delta += delta
  }

  onContextMenu = (e) => {
    e.preventDefault()
  }

  onTouchStart = (e) => {
    if (e.isCoreUI) return
    e.preventDefault()
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]
      const info = {
        id: touch.identifier,
        position: new THREE.Vector3(touch.clientX, touch.clientY, 0),
        prevPosition: new THREE.Vector3(touch.clientX, touch.clientY, 0),
        delta: new THREE.Vector3(),
      }
      this.touches.set(info.id, info)
      for (const control of this.controls) {
        const consume = control.options.onTouch?.(info)
        if (consume) break
      }
    }
  }

  onTouchMove = (e) => {
    if (e.isCoreUI) return
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]
      const info = this.touches.get(touch.identifier)
      if (!info) continue
      const currentX = touch.clientX
      const currentY = touch.clientY
      info.delta.x += currentX - info.prevPosition.x
      info.delta.y += currentY - info.prevPosition.y
      info.position.x = currentX
      info.position.y = currentY
      info.prevPosition.x = currentX
      info.prevPosition.y = currentY
    }
  }

  onTouchEnd = (e) => {
    if (e.isCoreUI) return
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i]
      const info = this.touches.get(touch.identifier)
      for (const control of this.controls) {
        const consume = control.options.onTouchEnd?.(info!)
        if (consume) break
      }
      this.touches.delete(touch.identifier)
    }
  }

  onResize = () => {
    this.screen.width = this.viewport?.offsetWidth || 0
    this.screen.height = this.viewport?.offsetHeight || 0
  }

  onFocus = () => {
    this.releaseAllButtons()
  }

  onBlur = () => {
    this.releaseAllButtons()
  }

  onXRSession = session => {
    this.xrSession = session
  }

  isInputFocused() {
    return document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA'
  }

  destroy() {
    if (!isBrowser) return
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    this.viewport?.removeEventListener('pointerdown', this.onPointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    this.viewport?.removeEventListener('touchstart', this.onTouchStart)
    this.viewport?.removeEventListener('touchmove', this.onTouchMove)
    this.viewport?.removeEventListener('touchend', this.onTouchEnd)
    this.viewport?.removeEventListener('touchcancel', this.onTouchEnd)
    this.viewport?.removeEventListener('pointerup', this.onPointerUp)
    this.viewport?.removeEventListener('wheel', this.onScroll)
    document.body.removeEventListener('contextmenu', this.onContextMenu)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('focus', this.onFocus)
    window.removeEventListener('blur', this.onBlur)
  }

  // Plugin support methods
  goto(x: number, y: number, z?: number): void {
    this.logger.info(`goto: ${x}, ${y}, ${z || 0}`)
  }

  async followEntity(entityId: string): Promise<void> {
    this.logger.info(`followEntity: ${entityId}`)
  }

  stopAll(): void {
    this.logger.info('stopAll')
  }

  stopAllActions(): void {
    this.logger.info('stopAllActions')
  }

  getIsWalkingRandomly(): boolean {
    // Implementation for checking if walking randomly
    return false
  }

  stopRandomWalk(): void {
    this.logger.info('stopRandomWalk')
  }

  startRandomWalk(interval?: number, maxDistance?: number): void {
    this.logger.info(`startRandomWalk: interval=${interval}, maxDistance=${maxDistance}`)
  }

  setKey(key: string, value: boolean): void {
    this.logger.info(`setKey: ${key} = ${value}`)
  }
}

function createButton(_controls: ClientControls, _control: ControlsBinding, prop: string): ButtonEntry {
  const down = _controls.buttonsDown.has(prop)
  const pressed = down
  const released = false
  return {
    $button: true,
    down,
    pressed,
    released,
    capture: false,
    onPress: null,
    onRelease: null,
  }
}

function createVector(_controls: ClientControls, _control: ControlsBinding, _prop: string): VectorEntry {
  return {
    $vector: true,
    value: new THREE.Vector3(),
    capture: false,
  }
}

function createValue(_controls: ClientControls, _control: ControlsBinding, _prop: string): ValueEntry {
  return {
    $value: true,
    value: null,
    capture: false,
  }
}

function createPointer(controls: ClientControls, _control: ControlsBinding, _prop: string): PointerEntry {
  const coords = new THREE.Vector3() // [0,0] to [1,1]
  const position = new THREE.Vector3() // [0,0] to [viewportWidth,viewportHeight]
  const delta = new THREE.Vector3() // position delta (pixels)
  return {
    $pointer: true,
    get coords() {
      return coords.copy(controls.pointer.coords)
    },
    get position() {
      return position.copy(controls.pointer.position)
    },
    get delta() {
      return delta.copy(controls.pointer.delta)
    },
    get locked() {
      return controls.pointer.locked
    },
    lock() {
      // Pointer lock disabled for UI
    },
    unlock() {
      // Pointer lock disabled for UI
    },
  } as PointerEntry
}

function createScreen(controls: ClientControls, _control: ControlsBinding): ScreenEntry {
  return {
    $screen: true,
    get width() {
      return controls.screen.width
    },
    get height() {
      return controls.screen.height
    },
  }
}

// Removed createCamera; unified camera system manages camera state
