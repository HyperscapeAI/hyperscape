import { isBoolean } from 'lodash-es'
import type { ControlBinding, Entity, World } from '../../types'
import { ControlPriorities } from '../extras/ControlPriorities'
import { System } from './System'

interface UIState {
  visible: boolean
  active: boolean
  app: Entity | null
  pane: string | null
}



export class ClientUI extends System {
  state: UIState
  lastAppPane: string
  control: ControlBinding | null
  
  constructor(world: World) {
    super(world)
    this.state = {
      visible: true,
      active: false,
      app: null,
      pane: null,
    }
    this.lastAppPane = 'app'
    this.control = null
  }

  start() {
    this.control = (this.world.controls?.bind({ priority: ControlPriorities.CORE_UI }) as ControlBinding) || null
  }

  update() {
    if (!this.control) return
    
    if (this.control.escape?.pressed) {
      if (this.state.pane) {
        this.state.pane = null
        this.broadcast()
      } else if (this.state.app) {
        this.state.app = null
        this.broadcast()
      }
    }
    if (
      this.control.keyZ?.pressed &&
      !this.control.metaLeft?.down &&
      !this.control.ctrlLeft?.down &&
      !this.control.shiftLeft?.down
    ) {
      this.state.visible = !this.state.visible
      this.broadcast()
    }
    if (this.control.pointer?.locked && this.state.active) {
      this.state.active = false
      this.broadcast()
    }
    if (!this.control.pointer?.locked && !this.state.active) {
      this.state.active = true
      this.broadcast()
    }
  }

  toggleVisible(value?: boolean) {
    value = isBoolean(value) ? value : !this.state.visible
    if (this.state.visible === value) return
    this.state.visible = value
    this.broadcast()
  }



  broadcast() {
    this.world.emit('ui', { ...this.state })
  }

  destroy() {
    this.control?.release()
    this.control = null
  }
}
