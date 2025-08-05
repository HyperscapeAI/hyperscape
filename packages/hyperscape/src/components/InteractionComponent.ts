/**
 * Interaction Component for entities
 * Stores interaction-related data for entities that can be interacted with
 */

import { Component } from './Component';
import type { Entity } from '../entities/Entity';

export interface InteractionComponentData {
  type?: string;
  interactable?: boolean;
  distance?: number;
  prompt?: string;
  description?: string;
  cooldown?: number;
  lastInteractionTime?: number;
  usesRemaining?: number;
  maxUses?: number;
  requiredItem?: string | null;
  consumesItem?: boolean;
  effect?: string | null;
}

export class InteractionComponent extends Component {
  constructor(entity: Entity, data?: InteractionComponentData) {
    // Initialize default values
    const defaultData: InteractionComponentData = {
      type: '',
      interactable: true,
      distance: 2.0,
      prompt: 'Interact',
      description: '',
      cooldown: 0,
      lastInteractionTime: 0,
      usesRemaining: -1, // -1 = infinite uses
      maxUses: -1,
      requiredItem: null,
      consumesItem: false,
      effect: null
    };
    
    // Merge provided data with defaults
    const componentData = { ...defaultData, ...data };
    
    super('interaction', entity, componentData as Record<string, unknown>);
  }

  update(_deltaTime: number): void {
    // Interaction logic is handled by InteractionSystem
  }

  serialize(): Record<string, unknown> {
    return {
      type: this.type,
      ...this.data
    };
  }
}