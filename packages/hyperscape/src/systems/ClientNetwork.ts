// moment removed; use native Date
import { emoteUrls } from '../extras/playerEmotes'
import THREE from '../extras/three'
import { readPacket, writePacket } from '../packets'
import { storage } from '../storage'
import type { ChatMessage, EntityData, SnapshotData, World, WorldOptions } from '../types'
import { uuid } from '../utils'
import { hashFile } from '../utils-client'
import { SystemBase } from './SystemBase'

// SnapshotData interface moved to shared types

/**
 * Client Network System
 *
 * - runs on the client
 * - provides abstract network methods matching ServerNetwork
 *
 */
export class ClientNetwork extends SystemBase {
  ids: number
  ws: WebSocket | null
  apiUrl: string | null
  id: string | null
  isClient: boolean
  isServer: boolean
  queue: Array<[string, unknown]>
  serverTimeOffset: number
  maxUploadSize: number
  
  constructor(world: World) {
    super(world, { name: 'client-network', dependencies: { required: [], optional: [] }, autoCleanup: true })
    this.ids = -1
    this.ws = null
    this.apiUrl = null
    this.id = null
    this.isClient = true
    this.isServer = false
    this.queue = []
    this.serverTimeOffset = 0
    this.maxUploadSize = 0
  }

  async init(options: WorldOptions): Promise<void> {
    const wsUrl = (options as { wsUrl?: string }).wsUrl
    const name = (options as { name?: string }).name
    const avatar = (options as { avatar?: string }).avatar
    const authToken = storage?.get('authToken') || ''
    let url = `${wsUrl}?authToken=${authToken}`
    if (name) url += `&name=${encodeURIComponent(name)}`
    if (avatar) url += `&avatar=${encodeURIComponent(avatar)}`
    this.ws = new WebSocket(url)
    this.ws.binaryType = 'arraybuffer'
    this.ws.addEventListener('open', () => {
      // WebSocket connected
    })
    this.ws.addEventListener('message', this.onPacket)
    this.ws.addEventListener('close', this.onClose)
    this.ws.addEventListener('error', (e) => {
      const isExpectedDisconnect = this.ws?.readyState === WebSocket.CLOSED || this.ws?.readyState === WebSocket.CLOSING
      if (!isExpectedDisconnect) {
        this.logger.error(`WebSocket error: ${e instanceof ErrorEvent ? e.message : String(e)}`)
      }
    })
  }

  preFixedUpdate() {
    this.flush()
  }

  send<T = unknown>(name: string, data?: T) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const packet = writePacket(name, data)
      this.ws.send(packet)
    }
  }

  async upload(file: File) {
    {
      // first check if we even need to upload it
      const hash = await hashFile(file)
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      const filename = `${hash}.${ext}`
      const url = `${this.apiUrl}/upload-check?filename=${filename}`
      const resp = await fetch(url)
      const _data = await resp.json()
    }
    // then upload it
    const form = new FormData()
    form.append('file', file)
    const url = `${this.apiUrl}/upload`
    await fetch(url, {
      method: 'POST',
      body: form,
    })
  }

  enqueue(method: string, data: unknown) {
    this.queue.push([method, data])
  }

  async flush() {
    // Don't process queue if WebSocket is not connected
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }
    
    while (this.queue.length) {
      try {
        const [method, data] = this.queue.shift()!
        const handler = (this as Record<string, unknown>)[method]
        if (handler) {
          // Assume handler is a function
          const result = (handler as Function).call(this, data)
          // If the handler returns a promise, await it
          if (result instanceof Promise) {
            await result
          }
        }
      } catch (err) {
        this.logger.error(`Error in flush: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  getTime() {
    return (performance.now() + this.serverTimeOffset) / 1000 // seconds
  }

  onPacket = (e: MessageEvent) => {
    const result = readPacket(e.data)
    if (result && result[0]) {
      const [method, data] = result
      this.enqueue(method, data)
    }
  }

  async onSnapshot(data: SnapshotData) {
    // Ensure Physics is fully initialized before processing entities
    // This is needed because PlayerLocal uses physics extensions during construction
    if (this.world.physics && !this.world.physics.physics) {
      // Wait a bit for Physics to initialize
      let attempts = 0
      while (!this.world.physics.physics && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 10))
        attempts++
      }
      if (!this.world.physics.physics) {
        this.logger.error('Physics failed to initialize after waiting')
      }
    }
    
    this.id = data.id
    this.serverTimeOffset = data.serverTime - performance.now()
    this.apiUrl = data.apiUrl || null
    this.maxUploadSize = data.maxUploadSize || 10 * 1024 * 1024 // Default 10MB
    this.world.assetsUrl = data.assetsUrl || '/world-assets/'

    const loader = this.world.loader
    if (loader) {
      // Assume preload and execPreload methods exist on loader
      // preload environment model and avatar
      if (data.settings && typeof data.settings === 'object' && 'model' in data.settings) {
        const settings = data.settings;
        if (settings?.model) {
          loader.preload('model', settings.model);
        }
      } else if (this.world.environment?.base?.model) {
        loader.preload('model', this.world.environment.base.model);
      }
      if (data.settings && typeof data.settings === 'object' && 'avatar' in data.settings) {
        const settings = data.settings;
        if (settings?.avatar) {
          loader.preload('avatar', settings.avatar);
        }
      }
      // preload emotes
      for (const url of emoteUrls) {
        loader.preload('emote', url as string)
      }
      // preload local player avatar
      let playerAvatarPreloaded = false
      if (data.entities) {
        for (const item of data.entities) {
          const entity = item
          if (entity.type === 'player' && entity.owner === this.id) {
            const url = entity.sessionAvatar || entity.avatar
            if (url) {
              loader.preload('avatar', url)
              playerAvatarPreloaded = true
            }
          }
        }
      }
      if (!playerAvatarPreloaded) {
        this.logger.warn('No player entity found for preloading avatar')
      }
      loader.execPreload()
    }

    // Deserialize settings if method exists
    if (data.settings) {
      this.world.settings.deserialize(data.settings);
    }

    if (data.chat) {
      this.world.chat.deserialize(data.chat);
    }
    // Deserialize entities if method exists
    if (data.entities) {
      await this.world.entities.deserialize(data.entities);
    }

    if (data.livekit) {
      this.world.livekit?.deserialize(data.livekit);
    }
      
    storage?.set('authToken', data.authToken)
  }

  onSettingsModified = (data: { key: string; value: unknown }) => {
    this.world.settings.set(data.key, data.value)
  }

  onChatAdded = (msg: ChatMessage) => {
    // Add message to chat if method exists
    this.world.chat.add(msg, false);
  }

  onChatCleared = () => {
    // Clear chat if method exists
    this.world.chat.clear();
  }

  onEntityAdded = (data: EntityData) => {
    // Add entity if method exists
    this.world.entities.add(data);
  }

  onEntityModified = (data: { id: string; changes?: Record<string, unknown> } & Record<string, unknown>) => {
    const { id } = data
    const entity = this.world.entities.get(id)
    if (!entity) {
      this.logger.error(`onEntityModified: no entity found for ${JSON.stringify(data)}`)
      return
    }
    // Accept both normalized { changes: {...} } and flat payloads { id, ...changes }
    const changes = data.changes ?? Object.fromEntries(Object.entries(data).filter(([k]) => k !== 'id' && k !== 'changes'))
    entity.modify(changes)
  }

  onEntityEvent = (event: { id: string; version: number; name: string; data?: unknown }) => {
    const { id, version, name, data } = event
    const entity = this.world.entities.get(id)
    if (!entity) return
    // Trigger entity event if method exists
    entity.onEvent(version, name, data, this.id || '');
  }

  onEntityRemoved = (id: string) => {
    // Strong type assumption - entities system has remove method
    this.world.entities.remove(id);
  }

  onPlayerTeleport = (data: { playerId: string; position: [number, number, number] }) => {
    const player = this.world.entities.player as { teleport?: (pos: THREE.Vector3, rotY?: number) => void } | undefined
    if (player?.teleport) {
      const pos = new THREE.Vector3(data.position[0], data.position[1], data.position[2]);
      player.teleport(pos);
    }
  }

  onPlayerPush = (data: { force: [number, number, number] }) => {
    const player = this.world.entities.player as { push?: (force: THREE.Vector3) => void } | undefined
    if (player?.push) {
      const force = new THREE.Vector3(data.force[0], data.force[1], data.force[2]);
      player.push(force);
    }
  }

  onPlayerSessionAvatar = (data: { playerId: string; avatar: string }) => {
    const player = this.world.entities.player as { setSessionAvatar?: (url: string) => void } | undefined
    if (player?.setSessionAvatar) {
      player.setSessionAvatar(data.avatar)
    }
  }

  onPong = (time: number) => {
    if (this.world.stats) {
      this.world.stats.onPong(time);
    }
  }

  onKick = (code: string) => {
    // Emit a typed UI event for kicks
    this.emitTypedEvent('UI_KICK', {
      playerId: this.id || 'unknown',
      reason: code || 'unknown',
    })
  }

  onClose = (code: CloseEvent) => {
    this.world.chat.add({
      id: uuid(),
      from: 'System',
      fromId: undefined,
      body: `You have been disconnected.`,
      text: `You have been disconnected.`,
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
    }, false)
    // Emit a typed network disconnect event
    this.emitTypedEvent('NETWORK_DISCONNECTED', {
      code: code.code,
      reason: code.reason || 'closed',
    })
  }

  destroy() {
    if (this.ws) {
      this.ws.removeEventListener('message', this.onPacket)
      this.ws.removeEventListener('close', this.onClose)
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close()
      }
      this.ws = null
    }
    // Clear any pending queue items
    this.queue.length = 0
  }
}

