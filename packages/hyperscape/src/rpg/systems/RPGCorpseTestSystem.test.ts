import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from '../../core/extras/three';
import { RPGCorpseTestSystem } from './RPGCorpseTestSystem';
import { World } from '../../types/index';
import { RPGLogger } from '../utils/RPGLogger';

// Mock the RPGLogger to avoid console spam during tests
vi.mock('../utils/RPGLogger', () => ({
  RPGLogger: {
    system: vi.fn(),
    systemError: vi.fn(),
    systemWarn: vi.fn(),
  },
  SystemLogger: vi.fn().mockImplementation(() => ({
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn()
  }))
}));

// Mock World with minimal required functionality
const createMockWorld = () => ({
  stage: {
    scene: new THREE.Scene()
  },
  on: vi.fn(),
  emit: vi.fn(),
  isServer: false
} as unknown as World);

describe('RPGCorpseTestSystem', () => {
  let corpseSystem: RPGCorpseTestSystem;
  let mockWorld: World;

  beforeEach(() => {
    mockWorld = createMockWorld();
    corpseSystem = new RPGCorpseTestSystem(mockWorld);
  });

  describe('Corpse ID Generation', () => {
    it('should generate unique corpse IDs', async () => {
      const testId1 = 'test1';
      const testId2 = 'test2';
      const position = { x: 0, y: 0, z: 0 };

      // Set up test data first (like the real tests do)
      const testData1 = {
        testId: testId1,
        corpseId: '',
        position,
        mobType: 'goblin',
        startTime: Date.now(),
        phase: 'spawning' as const,
        corpseSpawned: false,
        corpseVisible: false,
        corpseInteractable: false,
        lootAccessible: false,
        corpseCleanedUp: false,
        expectedLootItems: ['coins'],
        actualLootItems: [],
        errors: []
      };
      
      const testData2 = {
        testId: testId2,
        corpseId: '',
        position,
        mobType: 'bandit',
        startTime: Date.now(),
        phase: 'spawning' as const,
        corpseSpawned: false,
        corpseVisible: false,
        corpseInteractable: false,
        lootAccessible: false,
        corpseCleanedUp: false,
        expectedLootItems: ['coins'],
        actualLootItems: [],
        errors: []
      };

      corpseSystem['testData'].set(testId1, testData1);
      corpseSystem['testData'].set(testId2, testData2);

      // Simulate multiple corpse deaths in quick succession
      const promise1 = corpseSystem['simulateMobDeath'](testId1, 'goblin', position);
      const promise2 = corpseSystem['simulateMobDeath'](testId2, 'bandit', position);

      await Promise.all([promise1, promise2]);

      // Get the updated corpse IDs from test data
      const updatedTestData1 = corpseSystem['testData'].get(testId1);
      const updatedTestData2 = corpseSystem['testData'].get(testId2);

      expect(updatedTestData1?.corpseId).toBeDefined();
      expect(updatedTestData2?.corpseId).toBeDefined();
      expect(updatedTestData1?.corpseId).not.toBe(updatedTestData2?.corpseId);
    });

    it('should generate unique IDs even with same timestamp', async () => {
      const testIds = ['test1', 'test2', 'test3'];
      const position = { x: 0, y: 0, z: 0 };

      // Set up test data for each test ID first
      testIds.forEach(testId => {
        const testData = {
          testId,
          corpseId: '',
          position,
          mobType: 'goblin',
          startTime: Date.now(),
          phase: 'spawning' as const,
          corpseSpawned: false,
          corpseVisible: false,
          corpseInteractable: false,
          lootAccessible: false,
          corpseCleanedUp: false,
          expectedLootItems: ['coins'],
          actualLootItems: [],
          errors: []
        };
        corpseSystem['testData'].set(testId, testData);
      });

      // Mock Date.now to return the same value
      const originalDateNow = Date.now;
      Date.now = vi.fn(() => 1234567890);

      try {
        // Create multiple corpses "simultaneously"
        const promises = testIds.map(id => 
          corpseSystem['simulateMobDeath'](id, 'goblin', position)
        );
        await Promise.all(promises);

        // Get all corpse IDs
        const corpseIds = testIds.map(id => 
          corpseSystem['testData'].get(id)?.corpseId
        ).filter(Boolean);

        // All IDs should be unique despite same timestamp
        const uniqueIds = new Set(corpseIds);
        expect(uniqueIds.size).toBe(corpseIds.length);
        expect(corpseIds.length).toBe(3);
      } finally {
        Date.now = originalDateNow;
      }
    });
  });

  describe('Corpse Visual Creation', () => {
    it('should create corpse visual with correct properties', () => {
      const corpseId = 'test-corpse-123';
      const position = { x: 5, y: 2, z: -3 };
      const mobType = 'goblin';

      const corpse = corpseSystem['createCorpseVisual'](corpseId, position, mobType);

      expect(corpse).toBeInstanceOf(THREE.Mesh);
      expect(corpse.name).toBe(corpseId);
      expect(corpse.position.x).toBe(position.x);
      expect(corpse.position.y).toBe(position.y + 0.15); // Corpse is slightly elevated
      expect(corpse.position.z).toBe(position.z);
      expect(corpse.userData.type).toBe('corpse');
      expect(corpse.userData.corpseId).toBe(corpseId);
      expect(corpse.userData.mobType).toBe(mobType);
      expect(corpse.userData.interactable).toBe(true);
      expect(corpse.userData.hasLoot).toBe(true);
    });

    it('should add corpse to scene when scene is available', () => {
      const scene = mockWorld.stage!.scene as THREE.Scene;
      const addSpy = vi.spyOn(scene, 'add');
      
      const corpseId = 'test-corpse-456';
      const position = { x: 0, y: 0, z: 0 };
      
      corpseSystem['createCorpseVisual'](corpseId, position, 'bandit');
      
      expect(addSpy).toHaveBeenCalledOnce();
    });

    it('should create glow effect for interactable corpses', () => {
      const corpse = corpseSystem['createCorpseVisual']('test', { x: 0, y: 0, z: 0 }, 'goblin');
      
      // Corpse should have a child object (the glow effect)
      expect(corpse.children.length).toBe(1);
      
      const glow = corpse.children[0] as THREE.Mesh;
      expect(glow).toBeInstanceOf(THREE.Mesh);
      
      const material = glow.material as THREE.MeshLambertMaterial;
      expect(material.color.getHex()).toBe(0xFF0000); // Red glow
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBe(0.3);
    });
  });

  describe('Corpse Finding', () => {
    it('should find corpse by ID when it exists in scene', () => {
      const corpseId = 'findable-corpse';
      const position = { x: 0, y: 0, z: 0 };
      
      // Create and add corpse to scene
      corpseSystem['createCorpseVisual'](corpseId, position, 'goblin');
      
      // Should be able to find it
      const foundCorpse = corpseSystem['findCorpseById'](corpseId);
      expect(foundCorpse).toBeDefined();
      expect(foundCorpse?.name).toBe(corpseId);
    });

    it('should return null when corpse does not exist', () => {
      const foundCorpse = corpseSystem['findCorpseById']('non-existent-corpse');
      expect(foundCorpse).toBeNull();
    });

    it('should find multiple corpses near a position', () => {
      const centerPos = { x: 0, y: 0, z: 0 };
      const radius = 5;

      // Create corpses at different distances
      corpseSystem['createCorpseVisual']('close1', { x: 1, y: 0, z: 1 }, 'goblin');
      corpseSystem['createCorpseVisual']('close2', { x: -2, y: 0, z: 2 }, 'bandit');
      corpseSystem['createCorpseVisual']('far1', { x: 10, y: 0, z: 10 }, 'barbarian');

      const nearbyCorpses = corpseSystem['findAllCorpsesNear'](centerPos, radius);
      
      expect(nearbyCorpses.length).toBe(2); // Only the close ones
      const names = nearbyCorpses.map(c => c.name);
      expect(names).toContain('close1');
      expect(names).toContain('close2');
      expect(names).not.toContain('far1');
    });
  });

  describe('Loot Table Generation', () => {
    it('should return appropriate loot for different mob types', () => {
      const goblinLoot = corpseSystem['getLootTableForMob']('goblin');
      const banditLoot = corpseSystem['getLootTableForMob']('bandit');
      const defaultLoot = corpseSystem['getLootTableForMob']('unknown_mob');

      expect(Array.isArray(goblinLoot)).toBe(true);
      expect(Array.isArray(banditLoot)).toBe(true);
      expect(Array.isArray(defaultLoot)).toBe(true);

      // All should contain coins
      expect(goblinLoot).toContain('coins');
      expect(banditLoot).toContain('coins');
      expect(defaultLoot).toContain('coins');

      // Different mobs should have different loot (at least sometimes)
      // This is a basic check - in a real game, loot tables would be more complex
      expect(goblinLoot.length).toBeGreaterThan(0);
      expect(banditLoot.length).toBeGreaterThan(0);
    });
  });

  describe('Test Data Management', () => {
    it('should properly initialize test data structure', async () => {
      const testId = 'data-test';
      const position = { x: 1, y: 2, z: 3 };
      
      // Set up test data like the actual test would
      const testData = {
        testId,
        corpseId: '',
        position,
        mobType: 'goblin',
        startTime: Date.now(),
        phase: 'spawning' as const,
        corpseSpawned: false,
        corpseVisible: false,
        corpseInteractable: false,
        lootAccessible: false,
        corpseCleanedUp: false,
        expectedLootItems: ['coins'],
        actualLootItems: [],
        errors: []
      };
      
      corpseSystem['testData'].set(testId, testData);
      
      // Simulate mob death to populate corpseId
      await corpseSystem['simulateMobDeath'](testId, 'goblin', position);
      
      const updatedData = corpseSystem['testData'].get(testId);
      expect(updatedData?.corpseId).toBeDefined();
      expect(updatedData?.corpseId).toMatch(/^corpse_data-test_\d+_\d+$/);
    });

    it('should handle missing test data gracefully', () => {
      // These methods should not throw when test data is missing
      expect(() => {
        corpseSystem['verifyCorpseSpawned']('non-existent-test');
        corpseSystem['verifyCorpseVisual']('non-existent-test');
        corpseSystem['verifyCorpseExists']('non-existent-test');
      }).not.toThrow();
    });
  });

  describe('Multiple Corpses Test Structure', () => {
    it('should create separate test data for each corpse in multiple corpses test', async () => {
      const testId = 'multiple_corpses';
      const corpseIds = [`${testId}_1`, `${testId}_2`, `${testId}_3`];
      const mobTypes = ['goblin', 'bandit', 'barbarian'];
      const positions = [
        { x: -1, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 }
      ];

      // Simulate what the multiple corpses test does
      corpseIds.forEach((corpseTestId, index) => {
        const testData = {
          testId: corpseTestId,
          corpseId: '',
          position: positions[index],
          mobType: mobTypes[index],
          startTime: Date.now(),
          phase: 'spawning' as const,
          corpseSpawned: false,
          corpseVisible: false,
          corpseInteractable: false,
          lootAccessible: false,
          corpseCleanedUp: false,
          expectedLootItems: ['coins'],
          actualLootItems: [],
          errors: []
        };
        corpseSystem['testData'].set(corpseTestId, testData);
      });

      // Simulate deaths for each corpse
      for (let i = 0; i < 3; i++) {
        await corpseSystem['simulateMobDeath'](corpseIds[i], mobTypes[i], positions[i]);
      }

      // Verify all test data entries exist and have unique corpse IDs
      const allCorpseIds = corpseIds.map(id => {
        const data = corpseSystem['testData'].get(id);
        expect(data).toBeDefined();
        return data!.corpseId;
      });

      const uniqueIds = new Set(allCorpseIds);
      expect(uniqueIds.size).toBe(3); // All should be unique
    });
  });
});