import { System } from './System';
import type { World, Events as IEvents } from '../types/index';
import { EventBus, type EventSubscription } from './EventBus';

type EventCallback = (data?: unknown, extra?: unknown) => void;

/**
 * Events System
 *
 * - Runs on both the server and client.
 * - Used to notify apps of world events like player enter/leave
 *
 */
export class Events extends System implements IEvents {
  private eventListeners: Map<string | symbol, Set<EventCallback>>;
  private bus: EventBus;
  private busListenerMap: Map<string, Map<EventCallback, EventSubscription>>;

  constructor(world: World) {
    super(world);
    this.eventListeners = new Map();
    // Use World's shared EventBus (initialized in World)
    const worldWithBus = this.world as World & { $eventBus: EventBus };
    worldWithBus.$eventBus = worldWithBus.$eventBus || new EventBus();
    this.bus = worldWithBus.$eventBus;
    this.busListenerMap = new Map();
  }

  emit<T extends string | symbol>(event: T, ...args: unknown[]): boolean {
    // Extract data and extra from args for backward compatibility
    const [data, extra] = args;
    const callbacks = this.eventListeners.get(event);
    if (!callbacks) return false;
    
    for (const callback of callbacks) {
      try {
        callback(data, extra);
      } catch (err) {
        console.error(`Error in event listener for '${String(event)}':`, err);
      }
    }
    // Bridge world.emit -> EventBus for string events
    if (typeof event === 'string') {
      this.bus.emitEvent(event, (data as Record<string, unknown>) as unknown as Record<string, unknown>, 'world');
    }
    return true;
  }

  on<T extends string | symbol>(event: T, fn: (...args: unknown[]) => void, _context?: unknown): this {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    // Wrap the function to handle the context if provided
    const handler = _context ? fn.bind(_context) : fn;
    this.eventListeners.get(event)!.add(handler);
    // Bridge EventBus -> world.on for string events
    if (typeof event === 'string') {
      let mapForEvent = this.busListenerMap.get(event);
      if (!mapForEvent) {
        mapForEvent = new Map();
        this.busListenerMap.set(event, mapForEvent);
      }
      const sub = this.bus.subscribe(event, (evt) => {
        try {
          handler(evt.data);
        } catch (err) {
          console.error(`Error in bridged EventBus handler for '${event}':`, err);
        }
      });
      mapForEvent.set(handler, sub);
    }
    return this;
  }

  off<T extends string | symbol>(event: T, fn?: (...args: unknown[]) => void, _context?: unknown, _once?: boolean): this {
    if (!fn) {
      // Remove all listeners for this event
      this.eventListeners.delete(event);
      if (typeof event === 'string') {
        // Unsubscribe all bridged subscriptions for this event
        const mapForEvent = this.busListenerMap.get(event);
        if (mapForEvent) {
          for (const sub of mapForEvent.values()) {
            sub.unsubscribe();
          }
          this.busListenerMap.delete(event);
        }
      }
      return this;
    }
    
    const callbacks = this.eventListeners.get(event);
    if (callbacks) {
      // If context was provided, we need to find the bound version
      // For simplicity, just remove the function as-is
      callbacks.delete(fn);
      if (callbacks.size === 0) {
        this.eventListeners.delete(event);
      }
    }
    if (typeof event === 'string') {
      const mapForEvent = this.busListenerMap.get(event);
      if (mapForEvent) {
        const sub = mapForEvent.get(fn);
        if (sub) {
          sub.unsubscribe();
          mapForEvent.delete(fn);
        }
        if (mapForEvent.size === 0) {
          this.busListenerMap.delete(event);
        }
      }
    }
    return this;
  }

  override destroy(): void {
    this.eventListeners.clear();
  }
} 