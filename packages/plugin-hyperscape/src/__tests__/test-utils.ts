/**
 * Test Utility Functions
 *
 * These functions are only used in tests and not in production code.
 * They provide helper methods for spatial calculations, entity formatting,
 * and physics data manipulation in test scenarios.
 */

/**
 * Entity that can be formatted for display
 */
export interface FormattableEntity {
  name?: string
  position?: { x: number; y: number; z: number }
  type?: string
  distance?: number
}

/**
 * Entity with interactable components
 */
export interface InteractableEntity {
  app?: unknown
  grabbable?: boolean
  clickable?: boolean
  interactable?: boolean
  trigger?: boolean
  seat?: boolean
  portal?: boolean
}

/**
 * Physics data from PhysX
 */
export interface PhysicsData {
  velocity?: { x: number; y: number; z: number }
  position?: { x: number; y: number; z: number }
  isGrounded?: boolean
  mass?: number
  grounded?: boolean
}

/**
 * Calculate distance between two 3D points
 * @param pos1 - First position {x, y, z}
 * @param pos2 - Second position {x, y, z}
 * @returns Distance between the points
 */
export function calculateDistance3D(
  pos1: { x: number; y: number; z: number },
  pos2: { x: number; y: number; z: number },
): number {
  const dx = pos2.x - pos1.x;
  const dy = pos2.y - pos1.y;
  const dz = pos2.z - pos1.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Check if a position is within range of another position
 * @param pos1 - First position
 * @param pos2 - Second position
 * @param range - Maximum distance
 * @returns True if within range
 */
export function isWithinRange(
  pos1: { x: number; y: number; z: number },
  pos2: { x: number; y: number; z: number },
  range: number,
): boolean {
  return calculateDistance3D(pos1, pos2) <= range;
}

/**
 * Generate a random position within a radius
 * @param center - Center position
 * @param radius - Maximum radius
 * @param minHeight - Minimum Y position
 * @param maxHeight - Maximum Y position
 * @returns Random position
 */
export function randomPositionInRadius(
  center: { x: number; y: number; z: number },
  radius: number,
  minHeight: number = 0,
  maxHeight: number = 10,
): { x: number; y: number; z: number } {
  const angle = Math.random() * Math.PI * 2;
  const distance = Math.sqrt(Math.random()) * radius; // Use sqrt for uniform distribution

  return {
    x: center.x + Math.cos(angle) * distance,
    y: center.y + minHeight + Math.random() * (maxHeight - minHeight),
    z: center.z + Math.sin(angle) * distance,
  };
}

/**
 * Format entity data for display
 * @param entity - Entity object from Hyperscape world
 * @returns Formatted string
 */
export function formatEntity(entity: FormattableEntity): string {
  const parts = [`Entity: ${entity.name || "Unnamed"}`];

  if (entity.position) {
    parts.push(
      `Position: (${entity.position.x.toFixed(2)}, ${entity.position.y.toFixed(2)}, ${entity.position.z.toFixed(2)})`,
    );
  }

  if (entity.type) {
    parts.push(`Type: ${entity.type}`);
  }

  if (entity.distance !== undefined) {
    parts.push(`Distance: ${entity.distance.toFixed(2)}m`);
  }

  return parts.join(" | ");
}

/**
 * Check if an entity is interactable based on Hyperscape app system
 * @param entity - Entity to check
 * @returns True if entity has interactive components
 */
export function isInteractableEntity(entity: InteractableEntity): boolean {
  // Check for common interactive components in Hyperscape
  return !!(
    entity.app ||
    entity.grabbable ||
    entity.clickable ||
    entity.trigger ||
    entity.seat ||
    entity.portal ||
    entity.interactable
  );
}

/**
 * Convert Hyperscape physics data to readable format
 * @param physicsData - Physics data from PhysX
 * @returns Human-readable physics information
 */
export function formatPhysicsData(physicsData: PhysicsData): string {
  const parts: string[] = [];

  if (physicsData.velocity) {
    const speed = Math.sqrt(
      physicsData.velocity.x ** 2 +
        physicsData.velocity.y ** 2 +
        physicsData.velocity.z ** 2,
    );
    parts.push(`Speed: ${speed.toFixed(2)} m/s`);
  }

  if (physicsData.mass !== undefined) {
    parts.push(`Mass: ${physicsData.mass} kg`);
  }

  if (physicsData.grounded !== undefined) {
    parts.push(`Grounded: ${physicsData.grounded ? "Yes" : "No"}`);
  }

  return parts.join(", ");
}
