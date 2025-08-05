/**
 * NPC data management
 */

import type { NPCLocation } from './world-areas';

/**
 * Get NPC data by ID
 * @param npcId The NPC ID
 * @returns NPC data or null if not found
 */
export function getNPC(_npcId: number): NPCLocation | null {
  // NPCs are currently retrieved through world areas using getNPCsInArea()
  // This function is kept for backwards compatibility but is not actively used
  // See world-areas.ts for NPC data definitions
  return null;
}