import type { World, WorldOptions, ControlBinding, ButtonEntry } from '../types'
import type { PointerNode, CustomPointerEvent } from '../types/nodes'
import { ControlPriorities } from '../extras/ControlPriorities'
import { System } from './System'


// Browser API type declarations - keeping standard browser API
interface DOMRect {
  width: number;
  height: number;
}



/**
 *
 * This system handles pointer events for world UI interactions.
 *
 */

export class ClientPointer extends System {
  pointerState: PointerState
  ui: { active: boolean; appendChild: (element: HTMLElement) => void; removeChild: (element: HTMLElement) => void; getBoundingClientRect: () => DOMRect } | null = null
  control: ControlBinding | null = null
  screenHit: { node?: PointerNode } | null = null
  
  constructor(world: World) {
    super(world)
    this.pointerState = new PointerState()
  }

  async init(options: WorldOptions & { ui?: { active: boolean; appendChild: (element: HTMLElement) => void; removeChild: (element: HTMLElement) => void; getBoundingClientRect: () => DOMRect } }): Promise<void> {
    this.ui = options.ui || null
  }

  start() {
    this.control = this.world.controls?.bind({
      priority: ControlPriorities.POINTER,
    }) as ControlBinding | null
  }

  update(_delta: number) {
    // Use screen hit for point-and-click interactions
    const hit = this.screenHit;
    this.pointerState.update(hit, this.control?.mouseLeft?.pressed || false, this.control?.mouseLeft?.released || false);
  }

  setScreenHit(screenHit: { node?: PointerNode } | null) {
    this.screenHit = screenHit
    // capture all mouse click events if our pointer is interacting with world UI
    if (this.control?.mouseLeft) {
      (this.control.mouseLeft as ButtonEntry).capture = !!screenHit
    }
  }

  destroy() {
    this.control?.release?.()
    this.control = null
  }
}

const PointerEvents = {
  ENTER: 'pointerenter',
  LEAVE: 'pointerleave',
  DOWN: 'pointerdown',
  UP: 'pointerup',
}

const CURSOR_DEFAULT = 'default'

class CustomPointerEventImpl implements CustomPointerEvent {
  type: string | null
  _propagationStopped: boolean
  
  constructor() {
    this.type = null
    this._propagationStopped = false
  }

  set(type: string) {
    this.type = type
    this._propagationStopped = false
  }

  stopPropagation() {
    this._propagationStopped = true
  }
}

class PointerState {
  activePath: Set<PointerNode>
  event: CustomPointerEvent
  cursor: string
  pressedNodes: Set<PointerNode>
  
  constructor() {
    this.activePath = new Set()
    this.event = new CustomPointerEventImpl()
    this.cursor = CURSOR_DEFAULT
    this.pressedNodes = new Set()
  }

  update(hit: { node?: PointerNode } | null, pointerPressed: boolean, pointerReleased: boolean) {
    const newPath = hit ? this.getAncestorPath(hit) : []
    const oldPath = Array.from(this.activePath)

    // find divergence point
    let i = 0
    while (i < newPath.length && i < oldPath.length && newPath[i] === oldPath[i]) i++

    // pointer leave events bubble up from leaf
    for (let j = oldPath.length - 1; j >= i; j--) {
      if (oldPath[j].onPointerLeave) {
        this.event.set(PointerEvents.LEAVE)
        try {
          oldPath[j].onPointerLeave?.(this.event)
        } catch (err) {
          console.error(err)
        }
        // if (this.event._propagationStopped) break
      }
      this.activePath.delete(oldPath[j])
    }

    // pointer enter events bubble down from divergence
    for (let j = i; j < newPath.length; j++) {
      if (newPath[j].onPointerEnter) {
        this.event.set(PointerEvents.ENTER)
        try {
          newPath[j].onPointerEnter?.(this.event)
        } catch (err) {
          console.error(err)
        }
        if (this.event._propagationStopped) break
      }
      this.activePath.add(newPath[j])
    }

    // set cursor - check from leaf to root for first defined cursor
    let cursor = CURSOR_DEFAULT
    if (newPath.length > 0) {
      for (let i = newPath.length - 1; i >= 0; i--) {
        const nodeCursor = newPath[i].cursor
        if (nodeCursor) {
          cursor = nodeCursor
          break
        }
      }
    }
    if (cursor !== this.cursor) {
      document.body.style.cursor = cursor
      this.cursor = cursor
    }

    // handle pointer down events
    if (pointerPressed) {
      for (let i = newPath.length - 1; i >= 0; i--) {
        const node = newPath[i]
        if (node.onPointerDown) {
          this.event.set(PointerEvents.DOWN)
          try {
            node.onPointerDown(this.event)
          } catch (err) {
            console.error(err)
          }
          this.pressedNodes.add(node)
          if (this.event._propagationStopped) break
        }
      }
    }

    // handle pointer up events
    if (pointerReleased) {
      for (const node of this.pressedNodes) {
        if (node.onPointerUp) {
          this.event.set(PointerEvents.UP)
          try {
            node.onPointerUp(this.event)
          } catch (err) {
            console.error(err)
          }
          if (this.event._propagationStopped) break
        }
      }
      this.pressedNodes.clear()
    }
  }

  getAncestorPath(hit: { node?: PointerNode }): PointerNode[] {
    const path: PointerNode[] = []
    if (!hit?.node) return path
    
    // Check if node has a custom getPath method first
    if (hit.node.getPath) {
      return hit.node.getPath()
    }
    
    // Otherwise build path manually
    let node: PointerNode | undefined = hit.node.resolveHit?.(hit) || hit.node
    while (node) {
      path.unshift(node)
      node = node.parent
    }
    return path
  }
}
