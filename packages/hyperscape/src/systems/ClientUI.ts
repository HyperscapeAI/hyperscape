import { isBoolean } from 'lodash-es'
import type { ControlBinding, Entity, World } from '../types'
import { ControlPriorities } from '../extras/ControlPriorities'
import { SystemBase } from './SystemBase'
import { EventType } from '../types/events'

interface ClientUIState {
  visible: boolean
  active: boolean
  app: Entity | null
  pane: string | null
}



export class ClientUI extends SystemBase {
  state: ClientUIState
  lastAppPane: string
  control: ControlBinding | null
  
  constructor(world: World) {
    super(world, { name: 'client-ui', dependencies: { required: [], optional: [] }, autoCleanup: true })
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
    // Listen for pane open/close events to control sidebar panes
    this.subscribe(EventType.UI_OPEN_PANE, (d: { pane?: string }) => {
      if (!d?.pane) return
      this.state.pane = d.pane
      this.state.active = true
      this.broadcast()
    })
    this.subscribe(EventType.UI_CLOSE_PANE, (d: { pane?: string }) => {
      // If a specific pane is provided, only close if it matches
      if (!d?.pane || this.state.pane === d.pane) {
        this.state.pane = null
        this.broadcast()
      }
    })
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
    this.emitTypedEvent(EventType.UI_UPDATE, { ...this.state })
  }

  destroy() {
    this.control?.release()
    this.control = null
  }
}
