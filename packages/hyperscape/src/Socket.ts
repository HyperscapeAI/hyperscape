import { readPacket, writePacket } from './packets'
import type { NodeWebSocket, NetworkWithSocket, SocketOptions } from './types/network-types'

import type { Entity } from './entities/Entity'

export class Socket {
  id: string;
  ws: NodeWebSocket;
  network: NetworkWithSocket;
  player?: Entity;
  alive: boolean;
  closed: boolean;
  disconnected: boolean;
  
  constructor({ id, ws, network, player }: SocketOptions) {
    this.id = id
    this.ws = ws
    this.network = network

    this.player = player

    this.alive = true
    this.closed = false
    this.disconnected = false

    // If ws is unexpectedly undefined, install a minimal no-op stub to prevent hard crashes
    if (!this.ws) {
      this.ws = {
        on: () => {},
        ping: () => {},
        terminate: () => {},
        send: () => {},
        close: () => {},
      } as unknown as NodeWebSocket
    }

    const wsNode = this.ws as unknown as {
      on?: (event: string, listener: (arg?: unknown) => void) => void
      addEventListener?: (event: string, listener: (arg?: unknown) => void) => void
    }
    if (typeof wsNode.on === 'function') {
      wsNode.on('message', (arg?: unknown) => {
        const data = arg as ArrayBuffer | Uint8Array
        if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
          this.onMessage(data)
        }
      })
      wsNode.on('pong', () => {
        this.onPong()
      })
      wsNode.on('close', (arg?: unknown) => {
        const code = typeof arg === 'object' && arg !== null && 'code' in (arg as { code?: number | string })
          ? (arg as { code?: number | string }).code
          : undefined
        this.onClose({ code })
      })
    } else if (typeof wsNode.addEventListener === 'function') {
      wsNode.addEventListener('message', (evt?: unknown) => {
        const data = (evt as { data?: ArrayBuffer | Uint8Array } | undefined)?.data
        if (data) this.onMessage(data)
      })
      wsNode.addEventListener('close', () => this.onClose({}))
      // 'pong' event is Node-specific; browsers don't expose it
    }
  }

  send<T>(name: string, data: T): void {
    const packet = writePacket(name, data)
    this.ws.send(packet)
  }

  sendPacket(packet: ArrayBuffer | Uint8Array): void {
    this.ws.send(packet)
  }

  ping(): void {
    this.alive = false
    const wsNode = this.ws as unknown as { ping?: () => void; send?: (data: unknown) => void }
    if (typeof wsNode.ping === 'function') {
      wsNode.ping()
    } else {
      // Fallback to app-level ping packet if low-level ping isn't available
      try {
        this.send('ping', null as unknown as never)
      } catch {
        // ignore
      }
    }
  }

  // end(code) {
  //   this.send('end', code)
  //   this.disconnect()
  // }

  onPong = (): void => {
    this.alive = true
  }

  onMessage = (packet: ArrayBuffer | Uint8Array): void => {
    const result = readPacket(packet)
    if (result.length === 2) {
      const [method, data] = result
      this.network.enqueue(this, method, data)
    }
  }

  onClose = (e: { code?: number | string }): void => {
    this.closed = true
    this.disconnect(e?.code)
  }

  disconnect(code?: number | string): void {
    if (!this.closed) {
      const wsNode = this.ws as unknown as { terminate?: () => void; close?: () => void }
      if (typeof wsNode.terminate === 'function') return wsNode.terminate()
      if (typeof wsNode.close === 'function') return wsNode.close()
    }
    if (this.disconnected) return
    this.disconnected = true
    this.network.onDisconnect(this, code)
  }

  close = (): void => {
    if (!this.closed) {
      this.closed = true;
      this.alive = false;
      this.ws.close();
    }
  }
}
