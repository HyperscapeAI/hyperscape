/**
 * React hook for using typed world events
 */

import { useCallback, useEffect } from 'react';
import type { World } from '../../core/World';
import type { EventMap } from '../../types/event-system';
// import { getTypedWorld } from '../../types/typed-world';

/**
 * React hook that provides typed event methods
 * 
 * @example
 * ```typescript
 * const { emit, on, off } = useTypedWorld(world);
 * 
 * // Use in effects
 * useEffect(() => {
 *   const handler = (data) => console.log(data);
 *   on(EventType.PLAYER_LEVEL_UP, handler);
 *   return () => off(EventType.PLAYER_LEVEL_UP, handler);
 * }, [on, off]);
 * ```
 */
export function useTypedWorld(world: World) {
  const typedWorld = world;
  
  const emit = useCallback(<K extends keyof EventMap>(
    event: K,
    data: EventMap[K]
  ) => {
    typedWorld.emit(event, data);
  }, [typedWorld]);
  
  const on = useCallback(<K extends keyof EventMap>(
    event: K,
    listener: (data: EventMap[K]) => void
  ) => {
    typedWorld.on(event, listener);
  }, [typedWorld]);
  
  const off = useCallback(<K extends keyof EventMap>(
    event: K,
    listener: (data: EventMap[K]) => void
  ) => {
    typedWorld.off(event, listener);
  }, [typedWorld]);
  
  const once = useCallback(<K extends keyof EventMap>(
    event: K,
    listener: (data: EventMap[K]) => void
  ) => {
    typedWorld.once(event, listener);
  }, [typedWorld]);
  
  return {
    typedWorld,
    emit,
    on,
    off,
    once
  };
}

/**
 * React hook for subscribing to typed events with automatic cleanup
 * 
 * @example
 * ```typescript
 * useTypedEvent(world, EventType.PLAYER_LEVEL_UP, (data) => {
 *   console.log(`Player ${data.playerId} reached level ${data.newLevel}`);
 * });
 * ```
 */
export function useTypedEvent<K extends keyof EventMap>(
  world: World,
  event: K,
  handler: (data: EventMap[K]) => void,
  deps: React.DependencyList = []
) {
  useEffect(() => {
    const typedWorld = world;
    typedWorld.on(event, handler);
    return () => {
      typedWorld.off(event, handler);
    };
  }, [world, event, ...deps]);
}