/**
 * Comprehensive Persistence Integration Tests
 * Tests the complete persistence flow including:
 * - Client reconnection with same identity
 * - Data persistence across sessions
 * - Player authentication and token management
 * - Real world gameplay state preservation
 */

import { PlayerTokenManager } from '../client/PlayerTokenManager'
import { DatabaseSystem } from '../systems/DatabaseSystem'
import { PersistenceSystem } from '../systems/PersistenceSystem'
import { PlayerSystem } from '../systems/PlayerSystem'
import type { PlayerRow, WorldChunkData, ClientPlayerToken } from '../types/database'
import type { World } from '../types/index'
import { ItemRarity, ItemType, type Item } from '../types/index'
import { MockWorld, TestResult } from './test-utils'

// Helper function to create complete Item objects for testing
function createTestItem(overrides: Partial<Item>): Item {
  return {
    id: '1',
    name: 'Test Item',
    type: ItemType.MISC,
    quantity: 1,
    stackable: false,
    maxStackSize: 1,
    value: 10,
    weight: 1,
    equipSlot: null,
    weaponType: null,
    equipable: false,
    attackType: null,
    description: 'A test item',
    examine: 'This is a test item',
    tradeable: true,
    rarity: ItemRarity.COMMON,
    modelPath: 'items/test.glb',
    iconPath: 'icons/test.png',
    healAmount: 0,
    stats: { attack: 0, defense: 0, strength: 0 },
    bonuses: {},
    requirements: { level: 1, skills: {} },
    ...overrides
  };
}

interface TestClient {
  id: number
  tokenManager: PlayerTokenManager
  token: ClientPlayerToken
  session: unknown
  playerId: string
  expectedAttack?: number
  expectedStrength?: number
  expectedDefense?: number
}

/**
 * Real-World Persistence Integration Test Suite
 * Tests actual persistence flows that players would experience
 */
export class PersistenceIntegrationTestSuite {
  private results: TestResult[] = []
  private mockWorld: MockWorld
  private databaseSystem?: DatabaseSystem
  private playerSystem?: PlayerSystem
  private persistenceSystem?: PersistenceSystem

  constructor() {
    this.mockWorld = new MockWorld()
  }

  async runAllTests(): Promise<TestResult[]> {
    try {
      await this.setupTestEnvironment()

      // Core persistence tests
      await this.testPlayerIdentityPersistence()
      await this.testClientDisconnectReconnect()
      await this.testGameplayStatePersistence()
      await this.testMultiSessionPlayer()
      await this.testChunkPersistenceFlow()
      await this.testDatabaseIntegrity()
      await this.testPerformanceUnderLoad()
      await this.testErrorRecovery()

      await this.cleanupTestEnvironment()
    } catch (error) {
      this.addResult('Test Suite Setup', false, error instanceof Error ? error.message : 'Unknown error')
    }

    this.printDetailedResults()
    return this.results
  }

  private async setupTestEnvironment(): Promise<void> {
    try {
      // Initialize database system
      this.databaseSystem = new DatabaseSystem(this.mockWorld as unknown as World)
      this.mockWorld['rpg-database'] = this.databaseSystem
      await this.databaseSystem.init()

      // Initialize player system
      this.playerSystem = new PlayerSystem(this.mockWorld as unknown as World)
      this.mockWorld['rpg-player-system'] = this.playerSystem
      await this.playerSystem.init()

      // Initialize persistence system
      this.persistenceSystem = new PersistenceSystem(this.mockWorld as unknown as World)
      this.mockWorld['rpg-persistence-system'] = this.persistenceSystem
      await this.persistenceSystem.init()

      this.addResult('Test Environment Setup', true)
    } catch (error) {
      this.addResult('Test Environment Setup', false, error instanceof Error ? error.message : 'Unknown error')
      throw error
    }
  }

  private async testPlayerIdentityPersistence(): Promise<void> {
    const startTime = Date.now()

    try {
      // Test 1: Create player with client-side token
      const tokenManager = PlayerTokenManager.getInstance()
      tokenManager.clearStoredData()

      const clientToken = tokenManager.getOrCreatePlayerToken('TestPlayer')

      // Simulate server recognizing the client token
      const testPlayerId = 'identity_test_player'
      await this.simulatePlayerEnter(testPlayerId, 'IdentityTestPlayer', clientToken.tokenSecret)

      // Modify player data
      if (this.playerSystem) {
        await this.playerSystem.updatePlayerStats(testPlayerId, {
          attack: { level: 15, xp: 0 },
          strength: { level: 12, xp: 0 },
        })
        await this.playerSystem.updatePlayerEquipment(testPlayerId, {
          weapon: createTestItem({ id: '2', name: 'Steel sword', type: ItemType.WEAPON, value: 100 }),
        })
      }

      // End session (player leaves)
      tokenManager.endSession()
      await this.simulatePlayerLeave(testPlayerId)

      // Test 2: Player reconnects with same client token
      const reconnectToken = tokenManager.getOrCreatePlayerToken('TestPlayer')
      if (reconnectToken.playerId !== clientToken.playerId) {
        throw new Error('Player token not preserved across sessions')
      }

      await this.simulatePlayerEnter(testPlayerId, 'IdentityTestPlayer', reconnectToken.tokenSecret)

      // Verify data was preserved
      const restoredPlayer = this.playerSystem?.getPlayer(testPlayerId)
      if (!restoredPlayer) {
        throw new Error('Player data not restored after reconnection')
      }

      // Verify stats were preserved
      const stats = this.playerSystem?.getPlayerStats(testPlayerId)
      if (!stats || stats.attack.level !== 15 || stats.strength.level !== 12) {
        throw new Error('Player stats not preserved across sessions')
      }

      // Verify equipment was preserved
      const equipment = this.playerSystem?.getPlayerEquipment(testPlayerId)
      if (!equipment?.weapon || equipment.weapon.name !== 'Steel sword') {
        throw new Error('Player equipment not preserved across sessions')
      }

      tokenManager.endSession()
      tokenManager.clearStoredData()

      const duration = Date.now() - startTime
      this.addResult(
        'Player Identity Persistence',
        true,
        undefined,
        {
          originalTokenId: clientToken.playerId.substring(0, 8) + '...',
          reconnectTokenId: reconnectToken.playerId.substring(0, 8) + '...',
          statsPreserved: true,
          equipmentPreserved: true,
          testDuration: `${duration}ms`,
        },
        duration
      )
    } catch (error) {
      const duration = Date.now() - startTime
      this.addResult(
        'Player Identity Persistence',
        false,
        error instanceof Error ? error.message : 'Unknown error',
        {},
        duration
      )
    }
  }

  private async testClientDisconnectReconnect(): Promise<void> {
    const startTime = Date.now()

    try {
      // Simulate multiple clients with different machine identities
      const clients: TestClient[] = []

      for (let i = 0; i < 3; i++) {
        const tokenManager = PlayerTokenManager.getInstance()
        tokenManager.clearStoredData()

        const token = tokenManager.getOrCreatePlayerToken(`Client${i}`)
        const session = tokenManager.startSession()

        clients.push({
          id: i,
          tokenManager,
          token,
          session,
          playerId: `client_test_${i}`,
        })
      }

      // Simulate all clients entering the game
      for (const client of clients) {
        await this.simulatePlayerEnter(client.playerId, `Client${client.id}`, client.token.tokenSecret)

        // Give each client different progression
        if (this.playerSystem) {
          await this.playerSystem.updatePlayerStats(client.playerId, {
            attack: { level: 5 + client.id, xp: 0 },
            strength: { level: 3 + client.id, xp: 0 },
          })
        }
      }

      // Simulate random disconnects and reconnects
      for (let round = 0; round < 3; round++) {
        // Randomly disconnect half the clients
        const disconnectingClients = clients.slice(0, Math.ceil(clients.length / 2))

        for (const client of disconnectingClients) {
          client.tokenManager.endSession()
          await this.simulatePlayerLeave(client.playerId)
        }

        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 100))

        // Reconnect them
        for (const client of disconnectingClients) {
          const reconnectToken = client.tokenManager.getOrCreatePlayerToken(`Client${client.id}`)
          if (reconnectToken.playerId !== client.token.playerId) {
            throw new Error(`Client ${client.id} lost identity on reconnect`)
          }

          client.session = client.tokenManager.startSession()
          await this.simulatePlayerEnter(client.playerId, `Client${client.id}`, reconnectToken.tokenSecret)

          // Verify their stats were preserved
          const stats = this.playerSystem?.getPlayerStats(client.playerId)
          if (!stats || stats.attack.level !== 5 + client.id) {
            throw new Error(`Client ${client.id} lost stats on reconnect`)
          }
        }
      }

      // Cleanup
      for (const client of clients) {
        client.tokenManager.endSession()
        client.tokenManager.clearStoredData()
      }

      const duration = Date.now() - startTime
      this.addResult(
        'Client Disconnect/Reconnect Flow',
        true,
        undefined,
        {
          clientsTested: clients.length,
          reconnectRounds: 3,
          allDataPreserved: true,
          testDuration: `${duration}ms`,
        },
        duration
      )
    } catch (error) {
      const duration = Date.now() - startTime
      this.addResult(
        'Client Disconnect/Reconnect Flow',
        false,
        error instanceof Error ? error.message : 'Unknown error',
        {},
        duration
      )
    }
  }

  private async testGameplayStatePersistence(): Promise<void> {
    const startTime = Date.now()

    try {
      const testPlayerId = 'gameplay_test_player'
      const tokenManager = PlayerTokenManager.getInstance()
      tokenManager.clearStoredData()

      const token = tokenManager.getOrCreatePlayerToken('GameplayTester')

      // Initial player entry
      await this.simulatePlayerEnter(testPlayerId, 'GameplayTester', token.tokenSecret)

      // Simulate gameplay progression over time
      const gameplayActions = [
        // Combat progression
        { action: 'updateStats', data: { attack: { level: 10, xp: 0 }, strength: { level: 8, xp: 0 } } },
        {
          action: 'updateEquipment',
          data: { weapon: createTestItem({ id: '3', name: 'Mithril sword', type: ItemType.WEAPON, value: 300 }) },
        },

        // Health changes
        { action: 'updateHealth', data: { health: 75, maxHealth: 120 } },

        // Position changes (simulating movement)
        { action: 'updatePosition', data: { x: 150, y: 5, z: -200 } },

        // More equipment changes
        {
          action: 'updateEquipment',
          data: {
            shield: createTestItem({ id: '5', name: 'Bronze shield', type: ItemType.ARMOR, value: 50 }),
            helmet: createTestItem({ id: '7', name: 'Steel helmet', type: ItemType.ARMOR, value: 100 }),
          },
        },

        // Further stat progression
        {
          action: 'updateStats',
          data: { attack: { level: 15, xp: 0 }, strength: { level: 12, xp: 0 }, defense: { level: 8, xp: 0 } },
        },
      ]

      // Execute gameplay actions with delays to simulate real gameplay
      for (let i = 0; i < gameplayActions.length; i++) {
        const gameAction = gameplayActions[i]

        switch (gameAction.action) {
          case 'updateStats':
            if (this.playerSystem) {
              await this.playerSystem.updatePlayerStats(testPlayerId, gameAction.data)
            }
            break
          case 'updateEquipment':
            if (this.playerSystem) {
              await this.playerSystem.updatePlayerEquipment(testPlayerId, gameAction.data)
            }
            break
          case 'updateHealth':
            if (this.playerSystem && typeof (this.playerSystem as { updateHealth?: Function }).updateHealth === 'function') {
              await (this.playerSystem as {
                updateHealth: (data: import('../types/events').HealthUpdateEvent) => Promise<void>
              }).updateHealth({
                entityId: testPlayerId,
                previousHealth: 0,
                currentHealth: (gameAction.data as { health: number }).health,
                maxHealth: (gameAction.data as { maxHealth: number }).maxHealth,
              })
            }
            break
          case 'updatePosition':
            if (this.playerSystem) {
              await this.playerSystem.updatePlayerPosition(
                testPlayerId,
                gameAction.data as { x: number; y: number; z: number }
              )
            }
            break
        }

        // Small delay to simulate real gameplay timing
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // Force a save to ensure all changes are persisted
      if (this.persistenceSystem) {
        await this.persistenceSystem.forceSave()
      }

      // Player disconnects
      tokenManager.endSession()
      await this.simulatePlayerLeave(testPlayerId)

      // Wait to simulate time passing
      await new Promise(resolve => setTimeout(resolve, 200))

      // Player reconnects
      const reconnectToken = tokenManager.getOrCreatePlayerToken('GameplayTester')
      await this.simulatePlayerEnter(testPlayerId, 'GameplayTester', reconnectToken.tokenSecret)

      // Verify all gameplay state was preserved
      const finalPlayer = this.playerSystem?.getPlayer(testPlayerId)
      const finalStats = this.playerSystem?.getPlayerStats(testPlayerId)
      const finalEquipment = this.playerSystem?.getPlayerEquipment(testPlayerId)
      const finalHealth = this.playerSystem?.getPlayerHealth(testPlayerId)

      if (!finalPlayer || !finalStats || !finalEquipment || !finalHealth) {
        throw new Error('Player data missing after reconnection')
      }

      // Verify final state matches expected values
      const verifications = [
        { check: 'Attack stat', expected: 15, actual: finalStats.attack.level },
        { check: 'Strength stat', expected: 12, actual: finalStats.strength.level },
        { check: 'Defense stat', expected: 8, actual: finalStats.defense.level },
        { check: 'Current health', expected: 75, actual: finalHealth.current },
        { check: 'Max health', expected: 120, actual: finalHealth.max },
        { check: 'Position X', expected: 150, actual: finalPlayer.position.x },
        { check: 'Position Z', expected: -200, actual: finalPlayer.position.z },
        { check: 'Weapon name', expected: 'Mithril sword', actual: finalEquipment.weapon?.name },
        { check: 'Shield name', expected: 'Bronze shield', actual: finalEquipment.shield?.name },
        { check: 'Helmet name', expected: 'Steel helmet', actual: finalEquipment.helmet?.name },
      ]

      const failedVerifications = verifications.filter(v => v.expected !== v.actual)
      if (failedVerifications.length > 0) {
        throw new Error(
          `State verification failed: ${failedVerifications
            .map(v => `${v.check} expected ${v.expected} but got ${v.actual}`)
            .join(', ')}`
        )
      }

      tokenManager.endSession()
      tokenManager.clearStoredData()

      const duration = Date.now() - startTime
      this.addResult(
        'Gameplay State Persistence',
        true,
        undefined,
        {
          gameplayActionsExecuted: gameplayActions.length,
          verificationsChecked: verifications.length,
          allStatesPreserved: true,
          finalStats: finalStats,
          finalEquipment: Object.keys(finalEquipment).length,
          testDuration: `${duration}ms`,
        },
        duration
      )
    } catch (error) {
      const duration = Date.now() - startTime
      this.addResult(
        'Gameplay State Persistence',
        false,
        error instanceof Error ? error.message : 'Unknown error',
        {},
        duration
      )
    }
  }

  private async testMultiSessionPlayer(): Promise<void> {
    const startTime = Date.now()

    try {
      const players: TestClient[] = []

      // Create multiple players with different progressions
      for (let i = 0; i < 5; i++) {
        const tokenManager = PlayerTokenManager.getInstance()
        tokenManager.clearStoredData()

        const token = tokenManager.getOrCreatePlayerToken(`Player${i}`)
        const session = tokenManager.startSession()
        const playerId = `multi_session_${i}`

        await this.simulatePlayerEnter(playerId, `Player${i}`, token.tokenSecret)

        // Give each player unique progression
        if (this.playerSystem) {
          await this.playerSystem.updatePlayerStats(playerId, {
            attack: { level: 5 + i * 2, xp: 0 },
            strength: { level: 3 + i * 1, xp: 0 },
            defense: { level: 1 + i, xp: 0 },
          })

          await this.playerSystem.updatePlayerEquipment(playerId, {
            weapon: createTestItem({
              id: `${10 + i}`,
              name: `Player${i} Weapon`,
              type: ItemType.WEAPON,
              value: 50 + i * 10,
            }),
          })
        }

        players.push({
          id: i,
          tokenManager,
          token,
          session,
          playerId,
          expectedAttack: 5 + i * 2,
          expectedStrength: 3 + i * 1,
          expectedDefense: 1 + i,
        })
      }

      // Force save all player data
      if (this.persistenceSystem) {
        await this.persistenceSystem.forceSave()
      }

      // All players disconnect
      for (const player of players) {
        player.tokenManager.endSession()
        await this.simulatePlayerLeave(player.playerId)
      }

      // Wait for potential cleanup
      await new Promise(resolve => setTimeout(resolve, 100))

      // All players reconnect in random order
      const reconnectOrder = [...players].sort(() => Math.random() - 0.5)

      for (const player of reconnectOrder) {
        const reconnectToken = player.tokenManager.getOrCreatePlayerToken(`Player${player.id}`)
        player.session = player.tokenManager.startSession()

        await this.simulatePlayerEnter(player.playerId, `Player${player.id}`, reconnectToken.tokenSecret)

        // Verify their unique data was preserved
        const stats = this.playerSystem?.getPlayerStats(player.playerId)
        const equipment = this.playerSystem?.getPlayerEquipment(player.playerId)

        if (
          !stats ||
          stats.attack.level !== player.expectedAttack ||
          stats.strength.level !== player.expectedStrength ||
          stats.defense.level !== player.expectedDefense
        ) {
          throw new Error(
            `Player ${player.id} stats not preserved: expected ${player.expectedAttack}/${player.expectedStrength}/${player.expectedDefense}, got ${stats?.attack}/${stats?.strength}/${stats?.defense}`
          )
        }

        if (!equipment?.weapon || equipment.weapon.name !== `Player${player.id} Weapon`) {
          throw new Error(`Player ${player.id} equipment not preserved`)
        }
      }

      // Cleanup
      for (const player of players) {
        player.tokenManager.endSession()
        player.tokenManager.clearStoredData()
      }

      const duration = Date.now() - startTime
      this.addResult(
        'Multi-Session Player Data',
        true,
        undefined,
        {
          playersSimulated: players.length,
          allPlayersRestored: true,
          uniqueDataPreserved: true,
          testDuration: `${duration}ms`,
        },
        duration
      )
    } catch (error) {
      const duration = Date.now() - startTime
      this.addResult(
        'Multi-Session Player Data',
        false,
        error instanceof Error ? error.message : 'Unknown error',
        {},
        duration
      )
    }
  }

  private async testChunkPersistenceFlow(): Promise<void> {
    const startTime = Date.now()

    if (!this.databaseSystem) {
      throw new Error('Database system not available')
    }

    try {
      // Test chunk persistence by simulating player movement and chunk loading
      const testPlayerId = 'chunk_test_player'
      const tokenManager = PlayerTokenManager.getInstance()
      tokenManager.clearStoredData()

      const token = tokenManager.getOrCreatePlayerToken('ChunkTester')

      await this.simulatePlayerEnter(testPlayerId, 'ChunkTester', token.tokenSecret)

      // Simulate player moving through different chunks
      const chunkPositions = [
        { x: 0, z: 0 }, // Chunk 0,0
        { x: 100, z: 0 }, // Chunk 1,0
        { x: 100, z: 100 }, // Chunk 1,1
        { x: 0, z: 100 }, // Chunk 0,1
        { x: -100, z: 0 }, // Chunk -1,0
      ]

      // Full chunk persistence testing
              const chunksSaved: WorldChunkData[] = []

      for (let i = 0; i < chunkPositions.length; i++) {
        const pos = chunkPositions[i]
        const worldPos = { x: pos.x * 100, y: 2, z: pos.z * 100 }

        // Update player position to trigger chunk loading
        if (this.playerSystem) {
          await this.playerSystem.updatePlayerPosition(testPlayerId, worldPos)
        }

        // Create mock chunk data matching WorldChunkData type
        const chunkDataContent = {
          biome: 'grassland',
          heightData: [1, 2, 3, 4, 5],
          resourceStates: { [`tree_${pos.x}_${pos.z}_1`]: { type: 'tree', depleted: false } },
          mobSpawnStates: {},
          playerModifications: { [`player_${testPlayerId}`]: { timestamp: Date.now() } },
          chunkSeed: 12345 + i,
        }

        const chunkData: WorldChunkData = {
          chunkX: pos.x,
          chunkZ: pos.z,
          data: JSON.stringify(chunkDataContent),
          lastActive: Date.now(),
          playerCount: 1,
          version: 1,
        }

        // Save chunk
        this.databaseSystem.saveWorldChunk(chunkData)
        chunksSaved.push(chunkData)

        await new Promise<void>((resolve: () => void) => setTimeout(resolve, 50))
      }

      // Verify chunks were saved and can be loaded
      let chunksLoaded = 0
      for (const savedChunk of chunksSaved) {
        const loadedChunk = this.databaseSystem!.getWorldChunk(savedChunk.chunkX, savedChunk.chunkZ)
        if (loadedChunk && loadedChunk.data) {
          const loadedData = JSON.parse(loadedChunk.data as string)
          const originalData = JSON.parse(savedChunk.data)
          if (loadedData.biome === originalData.biome) {
            chunksLoaded++
          }
        }
      }

      if (chunksLoaded !== chunksSaved.length) {
        throw new Error(`Only ${chunksLoaded}/${chunksSaved.length} chunks could be loaded back`)
      }

      this.addResult('Chunk Persistence Flow', true, undefined, {
        chunksSaved: chunksSaved.length,
        chunksLoadedBack: chunksLoaded,
        playerMovementSimulated: true,
        testDuration: `${Date.now() - startTime}ms`,
      })

      tokenManager.endSession()
      tokenManager.clearStoredData()
    } catch (error) {
      const duration = Date.now() - startTime
      this.addResult(
        'Chunk Persistence Flow',
        false,
        error instanceof Error ? error.message : 'Unknown error',
        {},
        duration
      )
    }
  }

  private async testDatabaseIntegrity(): Promise<void> {
    const startTime = Date.now()

    try {
      if (!this.databaseSystem) {
        throw new Error('Database system not available')
      }

      // Test database stats and health
      const stats = this.databaseSystem.getDatabaseStats()

      // Test concurrent writes
      const concurrentPlayers: unknown[] = []
      for (let i = 0; i < 10; i++) {
        const playerId = `integrity_test_${i}`
        const playerRow: Partial<PlayerRow> = {
          name: `IntegrityTest${i}`,
          attackLevel: 1 + i,
          attackXp: i * 100,
          strengthLevel: 1,
          strengthXp: 0,
          defenseLevel: 1,
          defenseXp: 0,
          rangedLevel: 1,
          rangedXp: 0,
          woodcuttingLevel: 1,
          woodcuttingXp: 0,
          fishingLevel: 1,
          fishingXp: 0,
          firemakingLevel: 1,
          firemakingXp: 0,
          cookingLevel: 1,
          cookingXp: 0,
          constitutionLevel: 10,
          constitutionXp: 1154,
          health: 100,
          maxHealth: 100,
          positionX: i * 10,
          positionY: 2,
          positionZ: i * 10,
        }

        concurrentPlayers.push({ playerId, playerRow })
      }

      // Write all players concurrently
      await Promise.all(
        concurrentPlayers.map(player => {
          const p = player as { playerId: string; playerRow: Partial<PlayerRow> }
          return this.databaseSystem!.savePlayer(p.playerId, p.playerRow)
        })
      )

      // Verify all players can be loaded
      let playersLoaded = 0
      for (const player of concurrentPlayers) {
        const p = player as { playerId: string; playerRow: { name: string } }
        const loadedPlayer = this.databaseSystem.getPlayer(p.playerId)
        if (loadedPlayer && loadedPlayer.name === p.playerRow.name) {
          playersLoaded++
        }
      }

      if (playersLoaded !== concurrentPlayers.length) {
        throw new Error(
          `Database integrity failed: ${playersLoaded}/${concurrentPlayers.length} players could be loaded`
        )
      }

      const finalStats = this.databaseSystem.getDatabaseStats()

      const duration = Date.now() - startTime
      this.addResult(
        'Database Integrity',
        true,
        undefined,
        {
          concurrentWrites: concurrentPlayers.length,
          playersLoadedBack: playersLoaded,
          initialStats: stats,
          finalStats: finalStats,
          testDuration: `${duration}ms`,
        },
        duration
      )
    } catch (error) {
      const duration = Date.now() - startTime
      this.addResult(
        'Database Integrity',
        false,
        error instanceof Error ? error.message : 'Unknown error',
        {},
        duration
      )
    }
  }

  private async testPerformanceUnderLoad(): Promise<void> {
    const startTime = Date.now()

    try {
      const operationCounts = {
        saves: 0,
        loads: 0,
        updates: 0,
      }

      // Simulate high-frequency operations
      const operations: (() => Promise<void>)[] = []

      for (let i = 0; i < 100; i++) {
        const playerId = `perf_test_${i}`

        // Create save operation
        operations.push(async () => {
          if (this.databaseSystem) {
            const playerRow: Partial<PlayerRow> = {
              name: `PerfTest${i}`,
              attackLevel: Math.floor(Math.random() * 20) + 1,
              attackXp: Math.floor(Math.random() * 1000),
              strengthLevel: 1,
              strengthXp: 0,
              defenseLevel: 1,
              defenseXp: 0,
              rangedLevel: 1,
              rangedXp: 0,
              woodcuttingLevel: 1,
              woodcuttingXp: 0,
              fishingLevel: 1,
              fishingXp: 0,
              firemakingLevel: 1,
              firemakingXp: 0,
              cookingLevel: 1,
              cookingXp: 0,
              constitutionLevel: 10,
              constitutionXp: 1154,
              health: 100,
              maxHealth: 100,
              positionX: Math.random() * 1000,
              positionY: 2,
              positionZ: Math.random() * 1000,
            }

            this.databaseSystem.savePlayer(playerId, playerRow)
            operationCounts.saves++
          }
        })

        // Create load operation
        operations.push(async () => {
          if (this.databaseSystem) {
            this.databaseSystem.getPlayer(playerId)
            operationCounts.loads++
          }
        })
      }

      // Execute all operations concurrently
      const operationStartTime = Date.now()
      await Promise.all(operations.map(op => op()))
      const operationDuration = Date.now() - operationStartTime

      const totalOperations = operationCounts.saves + operationCounts.loads + operationCounts.updates
      const operationsPerSecond = Math.round((totalOperations / operationDuration) * 1000)

      const duration = Date.now() - startTime
      this.addResult(
        'Performance Under Load',
        true,
        undefined,
        {
          totalOperations,
          operationBreakdown: operationCounts,
          operationDuration: `${operationDuration}ms`,
          operationsPerSecond,
          testDuration: `${duration}ms`,
        },
        duration
      )
    } catch (error) {
      const duration = Date.now() - startTime
      this.addResult(
        'Performance Under Load',
        false,
        error instanceof Error ? error.message : 'Unknown error',
        {},
        duration
      )
    }
  }

  private async testErrorRecovery(): Promise<void> {
    const startTime = Date.now()

    try {
      const recoveryTests: (() => Promise<void>)[] = []

      // Test 1: Invalid player data handling
      recoveryTests.push(async () => {
        if (this.databaseSystem) {
          // Try to load non-existent player
          const result = this.databaseSystem.getPlayer('non_existent_player')
          if (result !== null) {
            throw new Error('Should return null for non-existent player')
          }
        }
      })

      // Test 2: System graceful handling of missing dependencies
      recoveryTests.push(async () => {
        if (this.playerSystem) {
          // Try to update non-existent player
          await this.playerSystem.updatePlayerStats('non_existent_player', { attack: { level: 5, xp: 0 } })
          // Should not throw, should handle gracefully
        }
      })

      // Test 3: Token manager resilience
      recoveryTests.push(async () => {
        const tokenManager = PlayerTokenManager.getInstance()

        // Clear data and try to get stats
        tokenManager.clearStoredData()
        const stats = tokenManager.getPlayerStats()

        if (stats.hasToken || stats.hasSession) {
          throw new Error('Stats should show no token/session after clear')
        }
      })

      // Execute all recovery tests
      await Promise.all(recoveryTests)

      const duration = Date.now() - startTime
      this.addResult(
        'Error Recovery',
        true,
        undefined,
        {
          recoveryTestsExecuted: recoveryTests.length,
          allTestsPassed: true,
          testDuration: `${duration}ms`,
        },
        duration
      )
    } catch (error) {
      const duration = Date.now() - startTime
      this.addResult('Error Recovery', false, error instanceof Error ? error.message : 'Unknown error', {}, duration)
    }
  }

  private async simulatePlayerEnter(playerId: string, playerName: string, clientToken?: string): Promise<void> {
    if (this.playerSystem && 'onPlayerEnter' in this.playerSystem) {
      if (typeof (this.playerSystem as { onPlayerEnter?: Function }).onPlayerEnter === 'function') {
        await (this.playerSystem as {
          onPlayerEnter: (data: {
            playerId: string
            player: { name: string; clientToken: string }
          }) => Promise<void> | void
        }).onPlayerEnter({
          playerId,
          player: { name: playerName, clientToken: clientToken || 'default_token' },
        })
      }
    }
  }

  private async simulatePlayerLeave(playerId: string): Promise<void> {
    if (this.playerSystem && typeof (this.playerSystem as { onPlayerLeave?: Function }).onPlayerLeave === 'function') {
      await (this.playerSystem as { onPlayerLeave: (data: { playerId: string }) => Promise<void> }).onPlayerLeave({ playerId })
    }
  }

  private async cleanupTestEnvironment(): Promise<void> {
    try {
      if (this.persistenceSystem) {
        this.persistenceSystem.destroy()
      }

      if (this.playerSystem) {
        this.playerSystem.destroy()
      }

      if (this.databaseSystem) {
        this.databaseSystem.destroy()
      }

      this.addResult('Test Environment Cleanup', true)
    } catch (error) {
      this.addResult('Test Environment Cleanup', false, error instanceof Error ? error.message : 'Unknown error')
    }
  }

  private addResult(testName: string, passed: boolean, error?: string, details?: unknown, duration?: number): void {
    this.results.push({
      testName,
      passed,
      error,
      details,
      duration,
    })
  }

  private printDetailedResults(): void {
    // Results are already logged via addResult method
    let _passed = 0
    let _failed = 0
    let _totalDuration = 0

    for (const result of this.results) {
      const status = result.passed ? '✅ PASS' : '❌ FAIL'
      const duration = result.duration ? ` (${result.duration}ms)` : ''

      // Log results if needed
      if (!result.passed && result.error) {
        console.error(`${status} ${result.testName}${duration}: ${result.error}`)
      }

      if (result.passed) {
        _passed++
      } else {
        _failed++
      }

      if (result.duration) {
        _totalDuration += result.duration
      }
    }

    if (_failed === 0) {
      // All tests passed
      console.log(`✅ All ${_passed} tests passed in ${_totalDuration}ms`)
    } else {
      // Some tests failed
      console.log(`❌ ${_failed} of ${_passed + _failed} tests failed`)
    }
  }
}

// Main test runner function
export async function runComprehensivePersistenceTests(): Promise<TestResult[]> {
  const testSuite = new PersistenceIntegrationTestSuite()
  const results = await testSuite.runAllTests()

  return results
}

// If running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runComprehensivePersistenceTests()
    .then(results => {
      const failed = results.filter(r => !r.passed).length
      process.exit(failed > 0 ? 1 : 0)
    })
    .catch(error => {
      console.error('❌ Test suite failed:', error)
      process.exit(1)
    })
}
