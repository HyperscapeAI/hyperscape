/**
 * Unit tests for ActionRegistry
 * Tests action registration, retrieval, and execution
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { BaseActionRegistry as ActionRegistry } from './systems/ActionRegistry';
import type { ActionDefinition, ActionContext } from './types';
import { createMockWorld } from './__tests__/utils/mockWorld';
import { Entity } from './entities/Entity';

describe('ActionRegistry', () => {
  let registry: ActionRegistry
  let mockAction: ActionDefinition
  let mockContext: ActionContext

  beforeEach(() => {
    registry = new ActionRegistry()
    
    mockAction = {
      name: 'test_action',
      description: 'A test action',
      execute: vi.fn().mockResolvedValue('success'),
      validate: vi.fn().mockReturnValue(true),
      parameters: [
        {
          name: 'target',
          type: 'string',
          required: true,
          description: 'Target entity ID'
        }
      ]
    }

    const mockWorld = createMockWorld();
    const mockEntity = new Entity(mockWorld, { id: 'test-entity', name: 'Test Entity', type: 'generic' });
    
    mockContext = {
        world: mockWorld,
        playerId: 'test-player',
        entity: mockEntity,
    };
  })

  describe('register', () => {
    it('should register an action', () => {
      registry.register(mockAction)

      const retrieved = registry.get('test_action')
      expect(retrieved).toEqual(mockAction)
    })

    it('should overwrite existing action with same name', () => {
      const action1: ActionDefinition = {
        name: 'duplicate',
        description: 'First duplicate action',
        parameters: [],
        execute: vi.fn().mockResolvedValue('first')
      }

      const action2: ActionDefinition = {
        name: 'duplicate',
        description: 'Second duplicate action',
        parameters: [],
        execute: vi.fn().mockResolvedValue('second')
      }

      registry.register(action1)
      registry.register(action2)

      const retrieved = registry.get('duplicate')
      expect(retrieved).toEqual(action2)
      expect(retrieved).not.toEqual(action1)
    })

    it('should handle actions without optional properties', () => {
      const minimalAction: ActionDefinition = {
        name: 'minimal',
        description: 'Minimal action',
        parameters: [],
        execute: vi.fn().mockResolvedValue('minimal')
      }

      registry.register(minimalAction)

      const retrieved = registry.get('minimal')
      expect(retrieved).toEqual(minimalAction)
      expect(retrieved?.description).toBe('Minimal action')
      expect(retrieved?.validate).toBeUndefined()
      expect(retrieved?.parameters).toEqual([])
    })

    it('should handle empty parameter arrays', () => {
      const actionWithEmptyParams: ActionDefinition = {
        name: 'empty_params',
        execute: vi.fn(),
        parameters: [],
        description: 'Action with empty parameters'
      }

      registry.register(actionWithEmptyParams)

      const retrieved = registry.get('empty_params')
      expect(retrieved?.parameters).toEqual([])
    })
  })

  describe('get', () => {
    it('should return undefined for non-existent action', () => {
      const retrieved = registry.get('non_existent')
      expect(retrieved).toBeUndefined()
    })

    it('should return registered action', () => {
      registry.register(mockAction)

      const retrieved = registry.get('test_action')
      expect(retrieved).toEqual(mockAction)
    })

    it('should be case sensitive', () => {
      registry.register(mockAction)

      const retrieved = registry.get('TEST_ACTION')
      expect(retrieved).toBeUndefined()
    })

    it('should handle special characters in action names', () => {
      const specialAction: ActionDefinition = {
        name: 'special-action_123',
        execute: vi.fn(),
        description: 'Special action with numbers',
        parameters: []
      }

      registry.register(specialAction)

      const retrieved = registry.get('special-action_123')
      expect(retrieved).toEqual(specialAction)
    })
  })

  describe('unregister', () => {
    it('should return false for non-existent action', () => {
      const result = registry.unregister('non_existent')
      expect(result).toBe(false)
    })

    it('should return true when removing existing action', () => {
      registry.register(mockAction)

      const result = registry.unregister('test_action')
      expect(result).toBe(true)
    })

    it('should actually remove the action', () => {
      registry.register(mockAction)
      expect(registry.get('test_action')).toEqual(mockAction)

      registry.unregister('test_action')
      expect(registry.get('test_action')).toBeUndefined()
    })

    it('should handle multiple unregister calls', () => {
      registry.register(mockAction)

      const result1 = registry.unregister('test_action')
      const result2 = registry.unregister('test_action')

      expect(result1).toBe(true)
      expect(result2).toBe(false)
    })
  })

  describe('getAll', () => {
    it('should return empty array when no actions registered', () => {
      const actions = registry.getAll()
      expect(actions).toEqual([])
    })

    it('should return all registered actions', () => {
      const action1: ActionDefinition = {
        name: 'action1',
        execute: vi.fn(),
        description: 'Action 1',
        parameters: []
      }

      const action2: ActionDefinition = {
        name: 'action2',
        execute: vi.fn(),
        description: 'Action 2',
        parameters: []
      }

      registry.register(action1)
      registry.register(action2)

      const actions = registry.getAll()
      expect(actions).toHaveLength(2)
      expect(actions).toContain(action1)
      expect(actions).toContain(action2)
    })

    it('should return current state after modifications', () => {
      registry.register(mockAction)
      expect(registry.getAll()).toHaveLength(1)

      registry.unregister('test_action')
      expect(registry.getAll()).toHaveLength(0)
    })

    it('should not affect internal state when array is modified', () => {
      registry.register(mockAction)

      const actions = registry.getAll()
      actions.push({
        name: 'external_action',
        description: 'An external action',
        parameters: [],
        execute: vi.fn()
      })

      // Internal registry should be unchanged
      expect(registry.getAll()).toHaveLength(1)
    })
  })

  describe('getAvailable', () => {
    beforeEach(() => {
      const alwaysAvailable: ActionDefinition = {
        name: 'always_available',
        execute: vi.fn(),
        validate: vi.fn().mockReturnValue(true),
        description: 'Always available action',
        parameters: []
      }

      const neverAvailable: ActionDefinition = {
        name: 'never_available',
        execute: vi.fn(),
        validate: vi.fn().mockReturnValue(false),
        description: 'Never available action',
        parameters: []
      }

      const noValidate: ActionDefinition = {
        name: 'no_validate',
        execute: vi.fn(),
        description: 'No validate action',
        parameters: []
        // No validate function
      }

      registry.register(alwaysAvailable)
      registry.register(neverAvailable)
      registry.register(noValidate)
    })

    it('should return actions that pass validation', () => {
      const available = registry.getAvailable(mockContext)

      const names = available.map(action => action.name)
      expect(names).toContain('always_available')
      expect(names).not.toContain('never_available')
    })

    it('should include actions without validate function', () => {
      const available = registry.getAvailable(mockContext)

      const names = available.map(action => action.name)
      expect(names).toContain('no_validate')
    })

    it('should call validate with correct context', () => {
      const customAction: ActionDefinition = {
        name: 'custom',
        execute: vi.fn(),
        validate: vi.fn().mockReturnValue(true),
        description: 'Custom action',
        parameters: []
      }

      registry.register(customAction)
      registry.getAvailable(mockContext)

      expect(customAction.validate).toHaveBeenCalledWith(mockContext)
    })

    it('should handle validate function throwing errors', () => {
      const throwingAction: ActionDefinition = {
        name: 'throwing',
        execute: vi.fn(),
        description: 'Throwing action',
        parameters: [],
        validate: vi.fn().mockImplementation(() => {
          throw new Error('Validation error')
        })
      }

      registry.register(throwingAction)

      // Should not include actions that throw during validation
      const available = registry.getAvailable(mockContext)
      const names = available.map(action => action.name)
      expect(names).not.toContain('throwing')
    })

    it('should handle empty context', () => {
      const available = registry.getAvailable({ world: createMockWorld() });

      expect(available).toBeInstanceOf(Array)
      expect(available.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('execute', () => {
    beforeEach(() => {
      registry.register(mockAction)
    })

    it('should execute action and return result', async () => {
      const params = { target: 'enemy-1' }

      const result = await registry.execute('test_action', mockContext, params)

      expect(result).toBe('success')
      expect(mockAction.execute).toHaveBeenCalledWith(mockContext, params)
    })

    it('should throw error for non-existent action', async () => {
      await expect(
        registry.execute('non_existent', mockContext, {})
      ).rejects.toThrow('Action not found: non_existent')
    })

    it('should handle action throwing errors', async () => {
      const errorAction: ActionDefinition = {
        name: 'error_action',
        execute: vi.fn().mockRejectedValue(new Error('Action failed')),
        description: 'Error action',
        parameters: []
      }

      registry.register(errorAction)

      await expect(
        registry.execute('error_action', mockContext, {})
      ).rejects.toThrow('Action failed')
    })

    it('should pass parameters correctly', async () => {
      const complexParams = {
        target: 'entity-123',
        amount: 50,
        options: { force: true, silent: false }
      }

      await registry.execute('test_action', mockContext, complexParams)

      expect(mockAction.execute).toHaveBeenCalledWith(mockContext, complexParams)
    })

    it('should handle async action execution', async () => {
      const slowAction: ActionDefinition = {
        name: 'slow_action',
        execute: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 10))
          return 'delayed_result'
        }),
        description: 'Slow action',
        parameters: []
      }

      registry.register(slowAction)

      const result = await registry.execute('slow_action', mockContext, {})
      expect(result).toBe('delayed_result')
    })

    it('should handle action returning complex objects', async () => {
      const complexResult = {
        success: true,
        data: { id: 'test', value: 42 },
        metadata: { timestamp: Date.now() }
      }

      const complexAction: ActionDefinition = {
        name: 'complex_action',
        execute: vi.fn().mockResolvedValue(complexResult),
        description: 'Complex action',
        parameters: []
      }

      registry.register(complexAction)

      const result = await registry.execute('complex_action', mockContext, {})
      expect(result).toEqual(complexResult)
    })
  })

  describe('edge cases', () => {
    it('should handle action with empty name', () => {
      const emptyNameAction: ActionDefinition = {
        name: '',
        description: 'Action with empty name',
        parameters: [],
        execute: vi.fn()
      }

      registry.register(emptyNameAction)

      const retrieved = registry.get('')
      expect(retrieved).toEqual(emptyNameAction)
    })

    it('should handle very long action names', () => {
      const longName = 'a'.repeat(1000)
      const longNameAction: ActionDefinition = {
        name: longName,
        description: 'Action with very long name',
        parameters: [],
        execute: vi.fn()
      }

      registry.register(longNameAction)

      const retrieved = registry.get(longName)
      expect(retrieved).toEqual(longNameAction)
    })

    it('should handle unicode action names', () => {
      const unicodeAction: ActionDefinition = {
        name: '测试_action_🎮',
        description: 'Action with unicode name',
        parameters: [],
        execute: vi.fn()
      }

      registry.register(unicodeAction)

      const retrieved = registry.get('测试_action_🎮')
      expect(retrieved).toEqual(unicodeAction)
    })

    it('should handle action with minimal properties', () => {
      const nullAction: ActionDefinition = {
        name: 'null_action',
        execute: vi.fn(),
        description: '',
        validate: undefined,
        parameters: []
      }

      registry.register(nullAction)

      const retrieved = registry.get('null_action')
      expect(retrieved).toEqual(nullAction)
    })

    it('should handle malformed parameter definitions', () => {
      const malformedAction: ActionDefinition = {
        name: 'malformed',
        description: 'Action with malformed parameters',
        execute: vi.fn(),
        parameters: [
          {
            name: '',
            type: 'string'
          },
          {
            name: 'valid_param',
            type: 'string'
          }
        ]
      }

      registry.register(malformedAction)

      const retrieved = registry.get('malformed')
      expect(retrieved?.parameters).toHaveLength(2)
    })
  })

  describe('concurrency', () => {
    it('should handle concurrent registrations', () => {
      const actions = Array.from({ length: 100 }, (_, i) => ({
        name: `action_${i}`,
        execute: vi.fn().mockResolvedValue(i)
      }))

      // Register all actions concurrently
      actions.forEach(action => registry.register({ ...action, description: '', parameters: [] }))

      // Verify all were registered
      expect(registry.getAll()).toHaveLength(100)
      
      // Verify specific actions
      expect(registry.get('action_0')).toBeDefined()
      expect(registry.get('action_50')).toBeDefined()
      expect(registry.get('action_99')).toBeDefined()
    })

    it('should handle concurrent executions', async () => {
      const concurrentAction: ActionDefinition = {
        name: 'concurrent',
        description: 'Action for concurrent execution testing',
        parameters: [],
        execute: vi.fn().mockImplementation(async (context, params) => {
          await new Promise(resolve => setTimeout(resolve, 1))
          return params.id
        })
      }

      registry.register(concurrentAction)

      // Execute multiple times concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        registry.execute('concurrent', mockContext, { id: i })
      )

      const results = await Promise.all(promises)

      expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
      expect(concurrentAction.execute).toHaveBeenCalledTimes(10)
    })
  })
})
