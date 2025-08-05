/**
 * Generic data component for RPG entities
 * Used for components that are primarily data containers without complex behavior
 */

import { Component } from '../../core/components/Component';
import type { Entity } from '../../core/entities/Entity';

export class DataComponent extends Component {
  constructor(entity: Entity, data?: Record<string, unknown>) {
    super('data', entity, {
      ...data
    });
  }

  // No special initialization needed for data components
  init(): void {
    // Data components are passive containers
  }

  // No special cleanup needed
  destroy(): void {
    // Data components don't manage resources
  }
}