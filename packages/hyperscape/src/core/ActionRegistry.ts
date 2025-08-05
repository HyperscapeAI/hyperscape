import type { ActionContext, ActionDefinition } from '../types';

export class ActionRegistry {
  private actions = new Map<string, ActionDefinition>();
  
  register(action: ActionDefinition): void {
    this.actions.set(action.name, action);
  }
  
  unregister(name: string): boolean {
    const removed = this.actions.delete(name);
    if (removed) {
      // Action successfully removed from registry
    }
    return removed;
  }
  
  get(name: string): ActionDefinition | undefined {
    return this.actions.get(name);
  }
  
  getAll(): ActionDefinition[] {
    return Array.from(this.actions.values());
  }
  
  getAvailable(context: ActionContext): ActionDefinition[] {
    return this.getAll().filter(action => {
      if (!action.validate) return true;
      try {
        return action.validate(context);
      } catch {
        // If validation throws, exclude the action
        return false;
      }
    });
  }
  
  async execute(name: string, context: ActionContext, params: Record<string, unknown>): Promise<unknown> {
    const action = this.actions.get(name);
    if (!action) {
      throw new Error(`Action not found: ${name}`);
    }
    
    if (action.validate && !action.validate(context)) {
      throw new Error(`Action validation failed: ${name}`);
    }
    
    return await action.execute(context, params);
  }
}