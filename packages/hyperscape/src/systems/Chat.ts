import moment from 'moment';
import type { ChatMessage, World } from '../types/index';
import { uuid } from '../utils';
import { System } from './System';
import { EventType } from '../types/events';

/**
 * Chat System
 *
 * - Runs on both the server and client.
 * - Stores and handles chat messages
 * - Provides subscribe hooks for client UI
 *
 */

const CHAT_MAX_MESSAGES = 50;

export type ChatListener = (messages: ChatMessage[]) => void;

export class Chat extends System {
  msgs: ChatMessage[];
  private chatListeners: Set<ChatListener>;

  // Alias for backward compatibility with ExtendedChatMessage
  public get extendedMsgs(): ChatMessage[] {
    return this.msgs;
  }

  constructor(world: World) {
    super(world);
    this.msgs = [];
    this.chatListeners = new Set();
  }

  add(msg: ChatMessage, broadcast?: boolean): void {
    // add to chat messages
    this.msgs = [...this.msgs, msg];
    if (this.msgs.length > CHAT_MAX_MESSAGES) {
      this.msgs.shift();
    }
    
    // notify listeners
    Array.from(this.chatListeners).forEach(callback => {
      callback(this.msgs);
    });
    
    // trigger player chat animation if applicable
    if (msg.fromId) {
      const player = this.world.entities.players?.get(msg.fromId);
      if (player && 'chat' in player) {
        // Assume chat method exists on player entity
        (player as { chat: (text: string) => void }).chat(msg.body);
      }
    }
    
    // emit chat event
    const readOnly = Object.freeze({ ...msg });
    this.world.emit(EventType.NETWORK_MESSAGE_RECEIVED, readOnly);
    
    // maybe broadcast
    if (broadcast) {
      const network = this.world.network;
      if (network?.send) {
        network.send('chatAdded', msg);
      }
    }
  }

  command(text: string): void {
    const network = this.world.network;
    if (!network || network.isServer) return;
    
    const playerId = network.id;
    const args = text
      .slice(1)
      .split(' ')
      .map(str => str.trim())
      .filter(str => !!str);
      
    const isAdminCommand = args[0] === 'admin';
    
    if (args[0] === 'stats') {
      const prefs = this.world.prefs;
      if (prefs?.setStats) {
        prefs.setStats(!prefs.stats);
      }
    }
    
    if (!isAdminCommand) {
      this.world.emit('command', { playerId, args });
    }
    
    if (network.send) {
      network.send('command', args);
    }
  }

  clear(broadcast?: boolean): void {
    this.msgs = [];
    
    // notify listeners
    Array.from(this.chatListeners).forEach(callback => {
      callback(this.msgs);
    });
    
    if (broadcast) {
      const network = this.world.network;
      if (network?.send) {
        network.send('chatCleared', {});
      }
    }
  }

  send(text: string): ChatMessage | undefined {
    // only available as a client
    const network = this.world.network;
    if (!network || !network.isClient) return;
    
    const player = this.world.entities.player;
    if (!player) return;
    
    const data: ChatMessage = {
      id: uuid(),
      from: player.data?.name || 'Unknown',
      fromId: player.data?.id,
      body: text,
      text: text, // for interface compatibility
      timestamp: Date.now(),
      createdAt: moment().toISOString(),
    };
    
    this.add(data, true);
    return data;
  }

  serialize(): ChatMessage[] {
    return this.msgs;
  }

  deserialize(msgs: ChatMessage[]): void {
    this.msgs = msgs;
    
    // notify listeners
    Array.from(this.chatListeners).forEach(callback => {
      callback(msgs);
    });
  }

  subscribe(callback: ChatListener): () => void {
    this.chatListeners.add(callback);
    callback(this.msgs);
    
    return () => {
      this.chatListeners.delete(callback);
    };
  }

  override destroy(): void {
    this.msgs = [];
    this.chatListeners.clear();
  }
}
