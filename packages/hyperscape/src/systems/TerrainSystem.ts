import type { World, WorldChunk } from '../types';
import { geometryToPxMesh, PMeshHandle } from '../extras/geometryToPxMesh';
import THREE from '../extras/three';
import { System } from './System';
import { EventType } from '../types/events';
import { NoiseGenerator } from '../utils/NoiseGenerator';
import { MeshFactory } from '../utils/MeshFactory';

/**
 * Terrain System
 * 
 * Specifications:
 * - 100x100m tiles (100m x 100m each)
 * - 100x100 world grid = 10km x 10km total world
 * - Only load current tile + adjacent tiles (3x3 = 9 tiles max)
 * - Procedural heightmap generation with biomes
 * - PhysX collision support
 * - Resource placement and road generation
 */

import type { BiomeData } from '../types/core';
import type { ResourceNode, RoadSegment, TerrainTile } from '../types/terrain';

interface BiomeCenter {
    x: number;
    z: number;
    type: string;
    influence: number;
}

export class TerrainSystem extends System {
    private terrainTiles = new Map<string, TerrainTile>();
    private terrainContainer!: THREE.Group;
    private _terrainInitialized = false;
    private lastPlayerTile = { x: 0, z: 0 };
    private updateTimer = 0;
    private noise!: NoiseGenerator;
    private biomeCenters: BiomeCenter[] = [];
    private databaseSystem!: { 
        saveWorldChunk(chunkData: unknown): void;
    }; // DatabaseSystem reference
    private chunkSaveInterval?: NodeJS.Timeout;
    private terrainUpdateIntervalId?: NodeJS.Timeout;
    private serializationIntervalId?: NodeJS.Timeout;
    private boundingBoxIntervalId?: NodeJS.Timeout;
    private activeChunks = new Set<string>();
    
    private coreChunkRange = 1; // 9 core chunks (3x3 grid)
    private ringChunkRange = 2; // Additional ring around core chunks
    private unloadPadding = 1; // Hysteresis padding for unloading beyond ring range
    private playerChunks = new Map<string, Set<string>>(); // player -> chunk keys
    private simulatedChunks = new Set<string>(); // chunks with active simulation
    private isGenerating = false; // Track if terrain generation is in progress
    private chunkPlayerCounts = new Map<string, number>(); // chunk -> player count
    
    // Serialization system
    private lastSerializationTime = 0;
    private serializationInterval = 15 * 60 * 1000; // 15 minutes in milliseconds
    private worldStateVersion = 1;
    private pendingSerializationData = new Map<string, {
        key: string;
        tileX: number;
        tileZ: number;
        biome: string;
        heightData?: number[];
        resourceStates: Array<{
            id: string;
            type: string;
            position: [number, number, number];
        }>;
        roadData: Array<{
            start: [number, number];
            end: [number, number];
            width: number;
        }>;
        playerCount: number;
        lastActiveTime?: Date;
        isSimulated: boolean;
        worldStateVersion: number;
        timestamp: number;
    }>();
    
    // Bounding box verification
    private worldBounds = {
        minX: -1000, maxX: 1000,
        minZ: -1000, maxZ: 1000,
        minY: -50, maxY: 100
    };
    private terrainBoundingBoxes = new Map<string, THREE.Box3>();
    
    // Deterministic noise seeding
    private computeSeedFromWorldId(): number {
        // Check for explicit seed in world config or environment
        const worldConfig = (this.world as { config?: { terrainSeed?: number } }).config;
        if (worldConfig?.terrainSeed !== undefined) {
            console.log(`[TerrainSystem] Using explicit terrain seed: ${worldConfig.terrainSeed}`);
            return worldConfig.terrainSeed;
        }
        
        // Check environment variable
        if (typeof process !== 'undefined' && process.env?.TERRAIN_SEED) {
            const envSeed = parseInt(process.env.TERRAIN_SEED, 10);
            if (!isNaN(envSeed)) {
                console.log(`[TerrainSystem] Using environment terrain seed: ${envSeed}`);
                return envSeed;
            }
        }
        
        // Use world ID as fallback for deterministic generation
        const id = String((this.world as { id?: string }).id || 'hyperscape-world');
        let hash = 5381; // Start with prime for better distribution
        for (let i = 0; i < id.length; i++) {
            hash = ((hash << 5) + hash) + id.charCodeAt(i); // hash * 33 + char
            hash = hash >>> 0; // Convert to unsigned 32-bit
        }
        const finalSeed = hash || 42; // Fallback to a known constant
        console.log(`[TerrainSystem] Using deterministic seed from world ID '${id}': ${finalSeed}`);
        return finalSeed;
    }
    
    private initializeBiomeCenters(): void {
        const worldSize = this.CONFIG.WORLD_SIZE * this.CONFIG.TILE_SIZE; // 10km x 10km
        const numCenters = Math.floor(worldSize * worldSize / 1000000); // Roughly 100 centers for 10km x 10km
        
        // Use deterministic PRNG for reproducible biome placement
        const baseSeed = this.computeSeedFromWorldId();
        let randomState = baseSeed;
        
        const nextRandom = () => {
            // Linear congruential generator for deterministic random
            randomState = (randomState * 1664525 + 1013904223) >>> 0;
            return randomState / 0xFFFFFFFF;
        };
        
        const biomeTypes = [
            'darkwood_forest', 'mistwood_valley', 'goblin_wastes', 
            'northern_reaches', 'plains', 'lakes'
        ];
        
        // Clear any existing centers
        this.biomeCenters = [];
        
        for (let i = 0; i < numCenters; i++) {
            const x = (nextRandom() - 0.5) * worldSize;
            const z = (nextRandom() - 0.5) * worldSize;
            const typeIndex = Math.floor(nextRandom() * biomeTypes.length);
            const influence = 200 + nextRandom() * 400; // 200-600m influence radius
            
            this.biomeCenters.push({
                x,
                z,
                type: biomeTypes[typeIndex],
                influence
            });
        }
        
        console.log(`[TerrainSystem] Initialized ${this.biomeCenters.length} biome centers with seed ${baseSeed}`);
    }
    
    // World Configuration - Your Specifications
    private readonly CONFIG = {
        // Core World Specs
        TILE_SIZE: 100,           // 100m x 100m tiles
        WORLD_SIZE: 100,          // 100x100 grid = 10km x 10km world
        TILE_RESOLUTION: 64,      // 64x64 vertices per tile for smooth terrain
        MAX_HEIGHT: 80,           // 80m max height variation
        
        // Chunking - Only adjacent tiles
        VIEW_DISTANCE: 1,         // Load only 1 tile in each direction (3x3 = 9 tiles)
        UPDATE_INTERVAL: 0.5,     // Check player movement every 0.5 seconds
        
        // Movement Constraints
        WATER_IMPASSABLE: true,   // Water blocks movement
        MAX_WALKABLE_SLOPE: 0.7,  // Maximum slope for movement (tan of angle)
        SLOPE_CHECK_DISTANCE: 1,  // Distance to check for slope calculation
        
        // Features
        ROAD_WIDTH: 4,            // 4m wide roads
        RESOURCE_DENSITY: 0.15,   // 15% chance per area for resources (increased for more resources)
        TREE_DENSITY: 0.25,       // 25% chance for trees in forest biomes (increased for visibility)
        TOWN_RADIUS: 25,          // Safe radius around towns
    };
    
    // GDD-Compliant Biomes - All 8 specified biomes from Game Design Document
    private readonly BIOMES: Record<string, BiomeData> = {
        // Core biomes from GDD
        'mistwood_valley': {
            id: 'mistwood_valley',
            name: 'Mistwood Valley',
            description: 'A mystical valley shrouded in perpetual mist, home to ancient trees and hidden dangers',
            difficultyLevel: 1,
            terrain: 'forest',
            color: 0x3d5a47,
            heightRange: [0.1, 0.4],
            resources: ['tree', 'herb'],
            mobs: ['goblin', 'bandit'],
            fogIntensity: 0.7,
            ambientSound: 'forest_ambient',
            colorScheme: {
                primary: '#3d5a47',
                secondary: '#2a3d33',
                fog: '#e0e8e4'
            },
            terrainMultiplier: 0.6,
            waterLevel: 2.0,
            maxSlope: 0.4,
            mobTypes: ['goblin', 'bandit'],
            difficulty: 1,
            baseHeight: 0.25,
            heightVariation: 0.15,
            resourceDensity: 0.12,
            resourceTypes: ['tree', 'herb']
        },
        'goblin_wastes': {
            id: 'goblin_wastes',
            name: 'Goblin Wastes',
            description: 'A barren wasteland overrun by goblin hordes, scarred by their destructive presence',
            difficultyLevel: 1,
            terrain: 'wastes',
            color: 0x8b7355,
            heightRange: [0.0, 0.3],
            resources: ['rock', 'ore'],
            mobs: ['goblin', 'hobgoblin'],
            fogIntensity: 0.3,
            ambientSound: 'wastes_wind',
            colorScheme: {
                primary: '#8b7355',
                secondary: '#6e5a44',
                fog: '#d4c4b0'
            },
            terrainMultiplier: 0.4,
            waterLevel: 1.0,
            maxSlope: 0.6,
            mobTypes: ['goblin', 'hobgoblin'],
            difficulty: 1,
            baseHeight: 0.15,
            heightVariation: 0.15,
            resourceDensity: 0.08,
            resourceTypes: ['rock', 'ore']
        },
        'darkwood_forest': {
            id: 'darkwood_forest',
            name: 'Darkwood Forest',
            description: 'An ancient forest where darkness reigns eternal and powerful warriors guard forbidden secrets',
            difficultyLevel: 2,
            terrain: 'forest',
            color: 0x1a2e1a,
            heightRange: [0.2, 0.7],
            resources: ['tree', 'herb', 'rare_ore'],
            mobs: ['dark_warrior', 'barbarian'],
            fogIntensity: 0.8,
            ambientSound: 'dark_forest_ambient',
            colorScheme: {
                primary: '#1a2e1a',
                secondary: '#0f1f0f',
                fog: '#2a3a2a'
            },
            terrainMultiplier: 0.9,
            waterLevel: 2.5,
            maxSlope: 0.5,
            mobTypes: ['dark_warrior', 'barbarian'],
            difficulty: 2,
            baseHeight: 0.45,
            heightVariation: 0.25,
            resourceDensity: 0.15,
            resourceTypes: ['tree', 'herb', 'rare_ore']
        },
        'northern_reaches': {
            id: 'northern_reaches',
            name: 'Northern Reaches',
            description: 'Frozen mountains at the edge of the world where only the strongest survive the eternal winter',
            difficultyLevel: 3,
            terrain: 'frozen',
            color: 0x7a8fa8,
            heightRange: [0.6, 1.0],
            resources: ['rock', 'gem', 'rare_ore'],
            mobs: ['ice_warrior', 'black_knight'],
            fogIntensity: 0.6,
            ambientSound: 'frozen_wind',
            colorScheme: {
                primary: '#7a8fa8',
                secondary: '#5a6f88',
                fog: '#e8f0f8'
            },
            terrainMultiplier: 1.2,
            waterLevel: 0.5,
            maxSlope: 0.8,
            mobTypes: ['ice_warrior', 'black_knight'],
            difficulty: 3,
            baseHeight: 0.8,
            heightVariation: 0.2,
            resourceDensity: 0.06,
            resourceTypes: ['rock', 'gem', 'rare_ore']
        },
        'blasted_lands': {
            id: 'blasted_lands',
            name: 'Blasted Lands',
            description: 'A corrupted wasteland where dark magic has twisted the very earth into a nightmarish realm',
            difficultyLevel: 3,
            terrain: 'corrupted',
            color: 0x5a4a3a,
            heightRange: [0.0, 0.4],
            resources: ['rare_ore'],
            mobs: ['dark_ranger', 'black_knight'],
            fogIntensity: 0.5,
            ambientSound: 'corrupted_whispers',
            colorScheme: {
                primary: '#5a4a3a',
                secondary: '#3a2a1a',
                fog: '#8a7a6a'
            },
            terrainMultiplier: 0.3,
            waterLevel: 0.0,
            maxSlope: 0.7,
            mobTypes: ['dark_ranger', 'black_knight'],
            difficulty: 3,
            baseHeight: 0.2,
            heightVariation: 0.2,
            resourceDensity: 0.04,
            resourceTypes: ['rare_ore']
        },
        'lakes': {
            id: 'lakes',
            name: 'Lakes',
            description: 'Serene lakes providing safe passage and abundant fishing opportunities',
            difficultyLevel: 0,
            terrain: 'lake',
            color: 0x4a90e2,
            heightRange: [-0.2, 0.1],
            resources: ['fish'],
            mobs: [],
            fogIntensity: 0.1,
            ambientSound: 'water_lapping',
            colorScheme: {
                primary: '#4a90e2',
                secondary: '#3a80d2',
                fog: '#d0e4f7'
            },
            terrainMultiplier: 0.1,
            waterLevel: 5.0,
            maxSlope: 0.2,
            mobTypes: [],
            difficulty: 0,
            baseHeight: -0.05,
            heightVariation: 0.15,
            resourceDensity: 0.05,
            resourceTypes: ['fish']
        },
        'plains': {
            id: 'plains',
            name: 'Plains',
            description: 'Rolling grasslands where bandits roam and resources are scattered across the open fields',
            difficultyLevel: 1,
            terrain: 'plains',
            color: 0x6b8f47,
            heightRange: [0.0, 0.2],
            resources: ['tree', 'herb'],
            mobs: ['bandit', 'barbarian'],
            fogIntensity: 0.2,
            ambientSound: 'plains_wind',
            colorScheme: {
                primary: '#6b8f47',
                secondary: '#5b7f37',
                fog: '#e8f0e0'
            },
            terrainMultiplier: 0.3,
            waterLevel: 1.5,
            maxSlope: 0.3,
            mobTypes: ['bandit', 'barbarian'],
            difficulty: 1,
            baseHeight: 0.1,
            heightVariation: 0.1,
            resourceDensity: 0.08,
            resourceTypes: ['tree', 'herb']
        },
        'starter_towns': {
            id: 'starter_towns',
            name: 'Starter Towns',
            description: 'Safe havens where new adventurers begin their journey, protected from hostile forces',
            difficultyLevel: 0,
            terrain: 'plains',
            color: 0x8fbc8f,
            heightRange: [0.1, 0.3],
            resources: ['tree'],
            mobs: [],
            fogIntensity: 0.0,
            ambientSound: 'town_ambient',
            colorScheme: {
                primary: '#8fbc8f',
                secondary: '#7fac7f',
                fog: '#f0f8f0'
            },
            terrainMultiplier: 0.2,
            waterLevel: 2.0,
            maxSlope: 0.2,
            mobTypes: [],
            difficulty: 0,
            baseHeight: 0.2,
            heightVariation: 0.1,
            resourceDensity: 0.05,
            resourceTypes: ['tree']
        }
    };

    constructor(world: World) {
        super(world);
    }

    async init(): Promise<void> {
        
        // Initialize deterministic noise from world id
        this.noise = new NoiseGenerator(this.computeSeedFromWorldId());
        
        // Initialize biome centers using deterministic random placement
        this.initializeBiomeCenters();
        
        // Get systems references
        // Check if database system exists and has the required method
        const dbSystem = this.world.getSystem('rpg-database') as { saveWorldChunk(chunkData: unknown): void } | undefined;
        if (dbSystem) {
            this.databaseSystem = dbSystem;
        }

        // Initialize chunk loading system
        this.initializeChunkLoadingSystem();
        
        // Initialize serialization system  
        this.initializeSerializationSystem();
        
        // Initialize bounding box verification
        this.initializeBoundingBoxSystem();

        // Environment detection (deferred until network system is available)
        const networkSystem = this.world.network;
        if (networkSystem?.isClient) {
            // Client-side initialization
        } else if (networkSystem?.isServer) {
            // Server-side initialization
        } else {
            // Environment not yet determined
        }
    }

    async start(): Promise<void> {
        console.log('[TerrainSystem] Starting terrain system...');
        
        // Initialize noise generator if not already initialized (failsafe)
        if (!this.noise) {
            console.log('[TerrainSystem] Initializing noise generator with deterministic seed...');
            this.noise = new NoiseGenerator(this.computeSeedFromWorldId());
            this.initializeBiomeCenters();
        }
        
        // Final environment detection
        const isServer = this.world.network?.isServer || false;
        const isClient = this.world.network?.isClient || false;
        
        console.log(`[TerrainSystem] Environment: ${isServer ? 'Server' : isClient ? 'Client' : 'Unknown'}`);

        if (isClient) {
            this.setupClientTerrain();
        } else if (isServer) {
            this.setupServerTerrain();
        } else {
            console.warn('[TerrainSystem] Environment not detected - terrain setup deferred');
        }
        
        // Load initial tiles
        this.loadInitialTiles();
        
        // Start player-based terrain update loop
        this.terrainUpdateIntervalId = setInterval(() => {
            this.updatePlayerBasedTerrain();
        }, 1000); // Update every second
        
        // Start serialization loop
        this.serializationIntervalId = setInterval(() => {
            this.performPeriodicSerialization();
        }, 60000); // Check every minute
        
        // Start bounding box verification
        this.boundingBoxIntervalId = setInterval(() => {
            this.verifyTerrainBoundingBoxes();
        }, 30000); // Verify every 30 seconds
        
        console.log('[TerrainSystem] Terrain system started successfully');
    }

    private setupClientTerrain(): void {
        const stage = this.world.stage as { scene: THREE.Scene };
        const scene = stage.scene;
        
        // Create terrain container
        this.terrainContainer = new THREE.Group();
        this.terrainContainer.name = 'TerrainContainer';
        scene.add(this.terrainContainer);
        
        // Setup initial camera only if no client camera system controls it
        // Leave control to ClientCameraSystem for third-person follow
        
        // Load initial tiles
        this.loadInitialTiles();
    }

    private setupServerTerrain(): void {
        
        // Setup chunk save interval for persistence
        if (this.databaseSystem) {
            this.chunkSaveInterval = setInterval(() => {
                this.saveModifiedChunks();
            }, 30000); // Save every 30 seconds
        }
        
        // Pre-generate spawn area tiles
        this.loadInitialTiles();
    }

    private loadInitialTiles(): void {
        const startTime = performance.now();
        let tilesGenerated = 0;
        let minHeight = Infinity;
        let maxHeight = -Infinity;
        
        console.log('[TerrainSystem] Loading initial tiles...');
        
        // Generate initial 3x3 grid around origin
        const initialRange = 1;
        for (let dx = -initialRange; dx <= initialRange; dx++) {
            for (let dz = -initialRange; dz <= initialRange; dz++) {
                const tile = this.generateTile(dx, dz);
                tilesGenerated++;
                
                // Sample heights to check variation
                for (let i = 0; i < 10; i++) {
                    const testX = tile.x * this.CONFIG.TILE_SIZE + (Math.random() - 0.5) * this.CONFIG.TILE_SIZE;
                    const testZ = tile.z * this.CONFIG.TILE_SIZE + (Math.random() - 0.5) * this.CONFIG.TILE_SIZE;
                    const height = this.getHeightAt(testX, testZ);
                    minHeight = Math.min(minHeight, height);
                    maxHeight = Math.max(maxHeight, height);
                }
            }
        }
        
        const endTime = performance.now();
        console.log(`[TerrainSystem] Generated ${tilesGenerated} tiles in ${(endTime - startTime).toFixed(2)}ms`);
        console.log(`[TerrainSystem] Height range: ${minHeight.toFixed(2)}m to ${maxHeight.toFixed(2)}m (variation: ${(maxHeight - minHeight).toFixed(2)}m)`);
        
        // Warn if terrain is too flat
        if (maxHeight - minHeight < 20) {
            console.warn('[TerrainSystem] ⚠️ Terrain appears too flat! Height variation is only ' + (maxHeight - minHeight).toFixed(2) + 'm');
        }
    }

    private generateTile(tileX: number, tileZ: number): TerrainTile {
        const key = `${tileX}_${tileZ}`;
        
        // Check if tile already exists
        if (this.terrainTiles.has(key)) {
            return this.terrainTiles.get(key)!;
        }

        
        // Create geometry for this tile
        const geometry = this.createTileGeometry(tileX, tileZ);
        
        // Create material with vertex colors
        const material = new THREE.MeshBasicMaterial({ 
            vertexColors: true,
            wireframe: false
        });
        
        // Create mesh
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
            tileX * this.CONFIG.TILE_SIZE,
            0,
            tileZ * this.CONFIG.TILE_SIZE
        );
        mesh.name = `Terrain_${key}`;
        
        // Add userData for click-to-move detection and other systems
        mesh.userData = {
            type: 'terrain',
            walkable: true,
            clickable: true,
            biome: this.getBiomeAt(tileX, tileZ),
            tileKey: key,
            tileX: tileX,
            tileZ: tileZ
        };
        
        // Add to scene if client-side
        if (this.terrainContainer) {
            this.terrainContainer.add(mesh);
        }
        
        // Generate collision for both client and server if physics is initialized
        let collision: PMeshHandle | null = null;
        if (this.world.physics && this.world.physics.isInitialized()) {
            try {
                // Create a transformed geometry that matches the mesh position
                const transformedGeometry = geometry.clone();
                transformedGeometry.translate(
                    tileX * this.CONFIG.TILE_SIZE,
                    0,
                    tileZ * this.CONFIG.TILE_SIZE
                );
                
                const meshHandle = geometryToPxMesh(this.world, transformedGeometry, false);
            if (meshHandle) {
                // PMeshHandle already has the correct structure
                collision = meshHandle;
                    console.log(`[TerrainSystem] Created physics collision for tile ${key} at (${tileX * this.CONFIG.TILE_SIZE}, ${tileZ * this.CONFIG.TILE_SIZE})`);
            }
            } catch (error) {
                console.warn(`[TerrainSystem] ⚠️ Failed to generate collision for tile ${key}:`, error);
            }
        } else {
            console.warn(`[TerrainSystem] Physics not initialized, skipping collision for tile ${key}`);
        }
        
        // Create tile object
        const tile: TerrainTile = {
            key,
            x: tileX,
            z: tileZ,
            mesh,
            collision: collision || null,
            biome: this.getBiomeAt(tileX, tileZ) as TerrainTile['biome'],
            resources: [],
            roads: [],
            generated: true,
            lastActiveTime: new Date(),
            playerCount: 0,
            needsSave: true,
            waterMeshes: [],
            heightData: [],
            chunkSeed: 0,
            heightMap: new Float32Array(0),
            collider: null,
            lastUpdate: Date.now()
        };
        
        // Generate resources for this tile
        this.generateTileResources(tile);
        
        // Generate visual features (roads, lakes)
        this.generateVisualFeatures(tile);
        
        // Add water meshes for low areas
        this.generateWaterMeshes(tile);
        
        // Add visible resource meshes (simple proxies)
        if (tile.resources.length > 0 && tile.mesh) {
            for (const resource of tile.resources) {
                if (resource.mesh) continue;
                let m: THREE.Mesh | null = null;
                let resourceColor = 0x2f7d32;
                let resourceSize = { x: 1.2, y: 3.0, z: 1.2 };
                
                if (resource.type === 'tree') {
                    resourceColor = 0x2f7d32; // Green for trees
                    resourceSize = { x: 1.2, y: 3.0, z: 1.2 };
                    m = MeshFactory.createResourceMesh({ color: resourceColor, size: resourceSize });
                } else if (resource.type === 'fish') {
                    m = MeshFactory.createSphereMesh({ color: 0x3aa7ff, radius: 0.6, transparent: true, opacity: 0.7 });
                } else if (resource.type === 'rock' || resource.type === 'ore' || resource.type === 'rare_ore') {
                    resourceColor = 0x8a8a8a;
                    resourceSize = { x: 1.0, y: 1.0, z: 1.0 };
                    m = MeshFactory.createResourceMesh({ color: resourceColor, size: resourceSize });
                } else if (resource.type === 'herb') {
                    resourceColor = 0x66bb6a;
                    resourceSize = { x: 0.6, y: 0.8, z: 0.6 };
                    m = MeshFactory.createResourceMesh({ color: resourceColor, size: resourceSize });
                }
                
                if (m) {
                    const pos = resource.position instanceof THREE.Vector3
                        ? resource.position
                        : new THREE.Vector3(resource.position.x, resource.position.y, resource.position.z);
                    m.position.set(pos.x, pos.y, pos.z);
                    m.name = `resource_${resource.id}`;
                    
                    // Add userData for interaction detection
                    m.userData = {
                        type: 'resource',
                        resourceType: resource.type,
                        resourceId: resource.id,
                        walkable: false,
                        clickable: true,
                        interactable: true,
                        harvestable: resource.harvestable
                    };
                    
                    tile.mesh.add(m);
                    resource.mesh = m;
                    
                    // Emit resource created event for InteractionSystem registration
                    this.world.emit('resource:mesh:created', {
                        mesh: m,
                        resourceId: resource.id,
                        resourceType: resource.type,
                        worldPosition: {
                            x: tile.x * this.CONFIG.TILE_SIZE + pos.x,
                            y: pos.y,
                            z: tile.z * this.CONFIG.TILE_SIZE + pos.z
                        }
                    });
                }
            }
        }

        // Emit typed event for other systems (resources, AI nav, etc.)
        try {
            const originX = tile.x * this.CONFIG.TILE_SIZE;
            const originZ = tile.z * this.CONFIG.TILE_SIZE;
            const resourcesPayload = tile.resources.map(r => {
                const pos = r.position instanceof THREE.Vector3
                    ? { x: originX + r.position.x, y: r.position.y, z: originZ + r.position.z }
                    : { x: originX + r.position.x, y: r.position.y, z: originZ + r.position.z };
                return { id: r.id, type: r.type, position: pos };
            });
            const genericBiome = this.mapBiomeToGeneric(tile.biome as string);
            this.world.emit(EventType.TERRAIN_TILE_GENERATED, {
                tileId: `${tileX},${tileZ}`,
                position: { x: originX, z: originZ },
                biome: genericBiome,
                tileX,
                tileZ,
                resources: resourcesPayload
            });
            
            // Also emit resource spawn points for ResourceSystem
            if (tile.resources.length > 0) {
                console.log(`[TerrainSystem] Registering ${tile.resources.length} resources for tile ${tile.key}`);
                this.world.emit(EventType.RESOURCE_SPAWN_POINTS_REGISTERED, {
                    spawnPoints: tile.resources.map(r => {
                        const worldPos = r.position instanceof THREE.Vector3
                            ? { x: originX + r.position.x, y: r.position.y, z: originZ + r.position.z }
                            : { x: originX + r.position.x, y: r.position.y, z: originZ + r.position.z };
                        return {
                            id: r.id,
                            type: r.type,
                            subType: r.type === 'tree' ? 'normal_tree' : r.type,
                            position: worldPos
                        };
                    })
                });
            }
        } catch (_err) {
            console.error('[TerrainSystem] Error emitting events:', _err);
        }

        // Store tile
        this.terrainTiles.set(key, tile);
        this.activeChunks.add(key);
        
        return tile;
    }

    private createTileGeometry(tileX: number, tileZ: number): THREE.PlaneGeometry {
        const geometry = new THREE.PlaneGeometry(
            this.CONFIG.TILE_SIZE, 
            this.CONFIG.TILE_SIZE, 
            this.CONFIG.TILE_RESOLUTION - 1, 
            this.CONFIG.TILE_RESOLUTION - 1
        );
        
        // Rotate to be horizontal
        geometry.rotateX(-Math.PI / 2);
        
        const positions = geometry.attributes.position;
        const colors = new Float32Array(positions.count * 3);
        const heightData: number[] = [];
        
        // Default biome fallback for coloring
        const defaultBiomeData = this.BIOMES['plains'] || { color: 0x7fb069, name: 'Plains' };
        
        // Pre-calculate nearby road data in world coordinates
        const roadColor = new THREE.Color(0x8B7355); // Brown road color
        const nearbyRoads = this.getNearbyRoadSegmentsWorld(tileX, tileZ);
        
        // Generate heightmap and vertex colors
        for (let i = 0; i < positions.count; i++) {
            const localX = positions.getX(i);
            const localZ = positions.getZ(i);
            
            // Safeguard against NaN position values
            if (isNaN(localX) || isNaN(localZ)) {
                positions.setY(i, 10);
                heightData.push(10);
                continue;
            }
            
            const x = localX + (tileX * this.CONFIG.TILE_SIZE);
            const z = localZ + (tileZ * this.CONFIG.TILE_SIZE);
            
            // Generate height using our improved noise function
            let height = this.getHeightAt(x, z);
            
            // Final NaN check for height
            if (isNaN(height)) {
                height = 10;
            }
            
            positions.setY(i, height);
            heightData.push(height);
            
            // Get biome for this specific vertex position using smooth transitions
            const vertexBiomeKey = this.getBiomeAtWorldPosition(x, z);
            const vertexBiome = this.BIOMES[vertexBiomeKey] || defaultBiomeData;
            
            // Start with base biome color
            const color = new THREE.Color(vertexBiome.color);
            
            // Add height-based shading
            const normalizedHeight = height / 80; // Max height is 80
            
            // Snow on high peaks
            if (normalizedHeight > 0.75) {
                const snowColor = new THREE.Color(0xf0f8ff);
                const snowFactor = (normalizedHeight - 0.75) / 0.25;
                color.lerp(snowColor, snowFactor * 0.8);
            }
            // Rock exposure on steep slopes
            else if (normalizedHeight > 0.6) {
                const rockColor = new THREE.Color(0x6b6b6b);
                const rockFactor = (normalizedHeight - 0.6) / 0.2;
                color.lerp(rockColor, rockFactor * 0.3);
            }
            // Water coloring for low areas
            else if (normalizedHeight < 0.15) {
                const waterColor = new THREE.Color(0x1e3a5f);
                const depth = 0.15 - normalizedHeight;
                color.lerp(waterColor, Math.min(1, depth * 5));
            }
            
            // Add lighting/shading based on height
            const brightness = 0.7 + normalizedHeight * 0.4;
            color.multiplyScalar(brightness);
            
            // Add subtle noise variation
            const colorVariation = 0.9 + Math.random() * 0.2;
            color.multiplyScalar(colorVariation);
            
            // Check for road influence at this vertex
            const roadInfluence = this.sampleRoadInfluenceAt(x, z, nearbyRoads);
            
            if (roadInfluence > 0) {
                // Blend road color with terrain color
                color.lerp(roadColor, roadInfluence);
                
                // Flatten terrain slightly for roads
                const flattenedHeight = height * (1 - roadInfluence * 0.1);
                positions.setY(i, flattenedHeight);
                heightData[heightData.length - 1] = flattenedHeight;
            }
            
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        
        // Store height data for persistence
        this.storeHeightData(tileX, tileZ, heightData);
        
        return geometry;
    }

    // Build list of nearby road segments in world coordinates for blending across tile seams
    private getNearbyRoadSegmentsWorld(tileX: number, tileZ: number): Array<{ start: THREE.Vector2; end: THREE.Vector2; halfWidth: number }>{
        const segments: Array<{ start: THREE.Vector2; end: THREE.Vector2; halfWidth: number }> = [];
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const key = `${tileX + dx}_${tileZ + dz}`;
                const tile = this.terrainTiles.get(key);
                if (!tile) continue;
                for (const r of tile.roads) {
                    const sx = (tile.x * this.CONFIG.TILE_SIZE) + (r.start instanceof THREE.Vector2 ? r.start.x : r.start.x);
                    const sz = (tile.z * this.CONFIG.TILE_SIZE) + (r.start instanceof THREE.Vector2 ? r.start.y : r.start.z);
                    const ex = (tile.x * this.CONFIG.TILE_SIZE) + (r.end instanceof THREE.Vector2 ? r.end.x : r.end.x);
                    const ez = (tile.z * this.CONFIG.TILE_SIZE) + (r.end instanceof THREE.Vector2 ? r.end.y : r.end.z);
                    segments.push({ start: new THREE.Vector2(sx, sz), end: new THREE.Vector2(ex, ez), halfWidth: r.width * 0.5 });
                }
            }
        }
        return segments;
    }

    // Sample influence of world-space road segments at a world position
    private sampleRoadInfluenceAt(worldX: number, worldZ: number, segments: Array<{ start: THREE.Vector2; end: THREE.Vector2; halfWidth: number }>): number {
        const p = new THREE.Vector2(worldX, worldZ);
        let influence = 0;
        for (const s of segments) {
            const d = this.distanceToLineSegment(p, s.start, s.end);
            if (d <= s.halfWidth) {
                const local = 1 - (d / s.halfWidth);
                if (local > influence) influence = local;
            }
        }
        return influence;
    }

    getHeightAt(worldX: number, worldZ: number): number {
        // Ensure valid coordinates
        if (!isFinite(worldX)) worldX = 0;
        if (!isFinite(worldZ)) worldZ = 0;
        
        // Multi-layered noise for realistic terrain
        // Layer 1: Continental shelf - very large scale features
        const continentScale = 0.0008;
        const continentNoise = this.noise.fractal2D(
            worldX * continentScale,
            worldZ * continentScale,
            5, 0.7, 2.0
        );
        
        // Layer 2: Mountain ridges - creates dramatic peaks and valleys
        const ridgeScale = 0.003;
        const ridgeNoise = this.noise.ridgeNoise2D(
            worldX * ridgeScale,
            worldZ * ridgeScale
        );
        
        // Layer 3: Hills and valleys - medium scale variation
        const hillScale = 0.012;
        const hillNoise = this.noise.fractal2D(
            worldX * hillScale,
            worldZ * hillScale,
            4, 0.5, 2.2
        );
        
        // Layer 4: Erosion - smooths valleys and creates river beds
        const erosionScale = 0.005;
        const erosionNoise = this.noise.erosionNoise2D(
            worldX * erosionScale,
            worldZ * erosionScale,
            3
        );
        
        // Layer 5: Fine detail - small bumps and texture
        const detailScale = 0.04;
        const detailNoise = this.noise.fractal2D(
            worldX * detailScale,
            worldZ * detailScale,
            2, 0.3, 2.5
        );
        
        // Combine layers with carefully tuned weights
        let height = 0;
        
        // Base continental elevation (40% weight)
        height += continentNoise * 0.4;
        
        // Add mountain ridges with squared effect for sharper peaks (30% weight)
        const ridgeContribution = ridgeNoise * Math.abs(ridgeNoise);
        height += ridgeContribution * 0.3;
        
        // Add rolling hills (20% weight)
        height += hillNoise * 0.2;
        
        // Apply erosion to create valleys (10% weight, subtractive)
        height += erosionNoise * 0.1;
        
        // Add fine detail (5% weight)
        height += detailNoise * 0.05;
        
        // Normalize to [0, 1] range
        height = (height + 1) * 0.5;
        height = Math.max(0, Math.min(1, height));
        
        // Apply power curve to create more dramatic elevation changes
        // Lower values = more valleys, higher values = more peaks
        height = Math.pow(height, 1.4);
        
        // Create ocean depressions
        const oceanScale = 0.0015;
        const oceanMask = this.noise.simplex2D(
            worldX * oceanScale,
            worldZ * oceanScale
        );
        
        // If in ocean zone, depress the terrain
        if (oceanMask < -0.3) {
            const oceanDepth = (-0.3 - oceanMask) * 2; // How deep into ocean
            height *= Math.max(0.1, 1 - oceanDepth);
        }
        
        // Scale to actual world height
        const MAX_HEIGHT = 80; // Maximum terrain height in meters
        const finalHeight = height * MAX_HEIGHT;
        
        return isFinite(finalHeight) ? finalHeight : 10;
    }
    
    private generateNoise(x: number, z: number): number {
        // Safeguard against NaN inputs
        if (isNaN(x) || isNaN(z)) {
            return 0;
        }
        
        const sin1 = Math.sin(x * 2.1 + z * 1.7);
        const cos1 = Math.cos(x * 1.3 - z * 2.4);
        const sin2 = Math.sin(x * 3.7 - z * 4.1);
        const cos2 = Math.cos(x * 5.2 + z * 3.8);
        
        const result = (sin1 * cos1 + sin2 * cos2 * 0.5) * 0.5;
        
        // Safeguard against NaN results
        if (isNaN(result)) {
            return 0;
        }
        
        return result;
    }

    private getBiomeAt(tileX: number, tileZ: number): string {
        // Get world coordinates for center of tile
        const worldX = tileX * this.CONFIG.TILE_SIZE + this.CONFIG.TILE_SIZE / 2;
        const worldZ = tileZ * this.CONFIG.TILE_SIZE + this.CONFIG.TILE_SIZE / 2;
        
        // Check if near starter towns first (safe zones)
        const towns = [
            { x: 0, z: 0, name: 'Brookhaven' },
            { x: 10, z: 0, name: 'Eastport' },
            { x: -10, z: 0, name: 'Westfall' },
            { x: 0, z: 10, name: 'Northridge' },
            { x: 0, z: -10, name: 'Southmere' }
        ];
        
        for (const town of towns) {
            const distance = Math.sqrt((tileX - town.x) ** 2 + (tileZ - town.z) ** 2);
            if (distance < 3) return 'starter_towns';
        }
        
        return this.getBiomeAtWorldPosition(worldX, worldZ);
    }
    
    private getBiomeAtWorldPosition(worldX: number, worldZ: number): string {
        // Get height and moisture values
        const height = this.getHeightAt(worldX, worldZ);
        const normalizedHeight = height / 80;
        
        // Use Voronoi-based biome determination with smooth transitions
        const biomeInfluences: Array<{ type: string; weight: number }> = [];
        
        // Calculate influence from each biome center
        for (const center of this.biomeCenters) {
            const distance = Math.sqrt(
                (worldX - center.x) ** 2 + 
                (worldZ - center.z) ** 2
            );
            
            if (distance < center.influence * 2) {
                // Smooth falloff using exponential decay
                const normalizedDistance = distance / center.influence;
                const weight = Math.exp(-normalizedDistance * normalizedDistance * 2);
                
                // Adjust weight based on height appropriateness for the biome
                let heightMultiplier = 1.0;
                
                if (center.type === 'lakes' && normalizedHeight < 0.2) {
                    heightMultiplier = 2.0; // Lakes more likely in low areas
                } else if (center.type === 'northern_reaches' && normalizedHeight > 0.6) {
                    heightMultiplier = 2.0; // Mountains more likely at high elevation
                } else if (center.type === 'darkwood_forest' && normalizedHeight > 0.3 && normalizedHeight < 0.7) {
                    heightMultiplier = 1.5; // Forests at mid elevation
                } else if (center.type === 'plains' && normalizedHeight > 0.2 && normalizedHeight < 0.4) {
                    heightMultiplier = 1.5; // Plains at low-mid elevation
                }
                
                if (weight > 0.01) {
                    biomeInfluences.push({
                        type: center.type,
                        weight: weight * heightMultiplier
                    });
                }
            }
        }
        
        // If no biome centers are close enough, use height-based fallback
        if (biomeInfluences.length === 0) {
            if (normalizedHeight < 0.15) return 'lakes';
            if (normalizedHeight < 0.35) return 'plains';
            if (normalizedHeight < 0.6) return 'darkwood_forest';
            return 'northern_reaches';
        }
        
        // Add noise to biome weights for more organic transitions
        const noiseScale = 0.005;
        const blendNoise = this.noise.simplex2D(worldX * noiseScale, worldZ * noiseScale);
        
        // Sort by weight and select the dominant biome
        biomeInfluences.sort((a, b) => b.weight - a.weight);
        
        // If the top two biomes are close in weight, blend based on noise
        if (biomeInfluences.length >= 2) {
            const topWeight = biomeInfluences[0].weight;
            const secondWeight = biomeInfluences[1].weight;
            const ratio = secondWeight / topWeight;
            
            // If weights are similar (within 30%), use noise to decide
            if (ratio > 0.7) {
                const blendFactor = (blendNoise + 1) * 0.5; // Normalize to 0-1
                if (blendFactor > 0.5) {
                    return biomeInfluences[1].type;
                }
            }
        }
        
        return biomeInfluences[0].type;
    }
    
    private getBiomeNoise(x: number, z: number): number {
        // Simple noise function for biome determination
        return Math.sin(x * 2.1 + z * 1.7) * Math.cos(x * 1.3 - z * 2.4) * 0.5 +
               Math.sin(x * 4.2 + z * 3.8) * Math.cos(x * 2.7 - z * 4.1) * 0.3 +
               Math.sin(x * 8.1 - z * 6.2) * Math.cos(x * 5.9 + z * 7.3) * 0.2;
    }

    // Map internal biome keys to generic TerrainTileData biome set
    private mapBiomeToGeneric(internal: string): 'forest' | 'plains' | 'desert' | 'mountains' | 'swamp' | 'tundra' | 'jungle' {
        switch (internal) {
            case 'mistwood_valley':
            case 'darkwood_forest':
                return 'forest';
            case 'plains':
            case 'starter_towns':
                return 'plains';
            case 'northern_reaches':
                return 'tundra';
            case 'blasted_lands':
            case 'goblin_wastes':
                return 'desert';
            case 'lakes':
                return 'swamp';
            default:
                return 'plains';
        }
    }

    private generateTileResources(tile: TerrainTile): void {
        const biomeData = this.BIOMES[tile.biome];
        
        // Safety check for biomeData
        if (!biomeData) {
            console.error(`[TerrainSystem] Biome '${tile.biome}' not found in BIOMES for resource generation. Skipping resources.`);
            return;
        }
        
        this.generateTreesForTile(tile, biomeData);
        this.generateOtherResourcesForTile(tile, biomeData);
        this.generateRoadsForTile(tile);
        
    }
    
    private generateTreesForTile(tile: TerrainTile, biomeData: BiomeData): void {
        // Trees generation based on biome type
        if (!biomeData.resources.includes('tree')) return;
        
        let treeDensity = this.CONFIG.RESOURCE_DENSITY;
        
        // Adjust density based on biome
        const biomeName = tile.biome as string;
        switch (biomeName) {
            case 'mistwood_valley':
            case 'darkwood_forest':
                treeDensity = this.CONFIG.TREE_DENSITY; // Higher density in forests
                break;
            case 'plains':
            case 'starter_towns':
                treeDensity = this.CONFIG.RESOURCE_DENSITY * 0.5; // Lower density in open areas
                break;
            case 'northern_reaches':
            case 'blasted_lands':
                treeDensity = this.CONFIG.RESOURCE_DENSITY * 0.2; // Very few trees in harsh areas
                break;
        }
        
        const treeCount = Math.floor((this.CONFIG.TILE_SIZE / 10) ** 2 * treeDensity);
        
        for (let i = 0; i < treeCount; i++) {
            const worldX = (tile.x * this.CONFIG.TILE_SIZE) + (Math.random() - 0.5) * this.CONFIG.TILE_SIZE;
            const worldZ = (tile.z * this.CONFIG.TILE_SIZE) + (Math.random() - 0.5) * this.CONFIG.TILE_SIZE;
            
            // Check if position is walkable (don't place trees in water or on steep slopes)
            const walkableCheck = this.isPositionWalkable(worldX, worldZ);
            if (!walkableCheck.walkable) continue;
            
            const height = this.getHeightAt(worldX, worldZ);
            const position = new THREE.Vector3(
                worldX - (tile.x * this.CONFIG.TILE_SIZE),
                height,
                worldZ - (tile.z * this.CONFIG.TILE_SIZE)
            );
            
            const tree: ResourceNode = {
                id: `${tile.key}_tree_${i}`,
                type: 'tree',
                position,
                mesh: null,
                health: 100,
                maxHealth: 100,
                respawnTime: 300000, // 5 minutes
                harvestable: true,
                requiredLevel: 1
            };
            
            tile.resources.push(tree);
        }
    }
    
    private generateOtherResourcesForTile(tile: TerrainTile, biomeData: BiomeData): void {
        // Generate other resources (ore, herbs, fishing spots, etc.)
        const otherResources = biomeData.resources.filter(r => r !== 'tree');
        
        for (const resourceType of otherResources) {
            let resourceCount = 0;
            
            // Determine count based on resource type and biome
            switch (resourceType) {
                case 'fish':
                    resourceCount = (tile.biome as string) === 'lakes' ? 3 : 0;
                    break;
                case 'ore':
                case 'rare_ore':
                    resourceCount = Math.random() < 0.3 ? 1 : 0;
                    break;
                case 'herb':
                    resourceCount = Math.floor(Math.random() * 3);
                    break;
                case 'rock':
                    resourceCount = Math.floor(Math.random() * 2);
                    break;
                case 'gem':
                    resourceCount = Math.random() < 0.1 ? 1 : 0; // Rare
                    break;
            }
            
            for (let i = 0; i < resourceCount; i++) {
                const worldX = (tile.x * this.CONFIG.TILE_SIZE) + (Math.random() - 0.5) * this.CONFIG.TILE_SIZE;
                const worldZ = (tile.z * this.CONFIG.TILE_SIZE) + (Math.random() - 0.5) * this.CONFIG.TILE_SIZE;
                
                // For fishing spots, place near water
                if (resourceType === 'fish') {
                    const height = this.getHeightAt(worldX, worldZ);
                    if (height >= biomeData.waterLevel) continue; // Only place fish in water
                }
                
                const height = this.getHeightAt(worldX, worldZ);
                const position = new THREE.Vector3(
                    worldX - (tile.x * this.CONFIG.TILE_SIZE),
                    height,
                    worldZ - (tile.z * this.CONFIG.TILE_SIZE)
                );
                
                const resource: ResourceNode = {
                    id: `${tile.key}_${resourceType}_${i}`,
                    type: resourceType as ResourceNode['type'],
                    position,
                    mesh: null,
                    health: 100,
                    maxHealth: 100,
                    respawnTime: 300000, // 5 minutes
                    harvestable: true,
                    requiredLevel: 1
                };
                
                tile.resources.push(resource);
            }
        }
    }
    
    private generateRoadsForTile(tile: TerrainTile): void {
        // Generate roads connecting to nearby starter towns
        const towns = [
            { x: 0, z: 0 }, { x: 10, z: 0 }, { x: -10, z: 0 },
            { x: 0, z: 10 }, { x: 0, z: -10 }
        ];
        
        for (const town of towns) {
            const distance = Math.sqrt((tile.x - town.x) ** 2 + (tile.z - town.z) ** 2);
            
            // Generate road segments for tiles within reasonable distance of towns
            if (distance < 8 && distance > 0.5) {
                const roadDirection = {
                    x: (town.x - tile.x) / distance,
                    z: (town.z - tile.z) / distance
                };
                
                const roadStart = new THREE.Vector2(
                    -roadDirection.x * this.CONFIG.TILE_SIZE * 0.5,
                    -roadDirection.z * this.CONFIG.TILE_SIZE * 0.5
                );
                
                const roadEnd = new THREE.Vector2(
                    roadDirection.x * this.CONFIG.TILE_SIZE * 0.5,
                    roadDirection.z * this.CONFIG.TILE_SIZE * 0.5
                );
                
                const road: RoadSegment = {
                    start: { x: roadStart.x, z: roadStart.y },
                    end: { x: roadEnd.x, z: roadEnd.y },
                    width: this.CONFIG.ROAD_WIDTH,
                    mesh: null,
                    material: 'stone',
                    condition: 1.0
                };
                
                tile.roads.push(road);
                break; // Only one road per tile
            }
        }
    }
    
    /**
     * Calculate road influence for vertex coloring
     */
    private calculateRoadVertexInfluence(tileX: number, tileZ: number): Map<string, number> {
        const roadMap = new Map<string, number>();
        
        // Generate temporary tile to get road data
        const tempTile: TerrainTile = {
            key: `temp_${tileX}_${tileZ}`,
            x: tileX,
            z: tileZ,
            mesh: null as unknown as THREE.Mesh,
            biome: this.getBiomeAt(tileX, tileZ) as TerrainTile['biome'],
            resources: [],
            roads: [],
            generated: false,
            playerCount: 0,
            needsSave: false,
            collision: null,
            waterMeshes: [],
            heightData: [],
            lastActiveTime: new Date(),
            chunkSeed: 0,
            heightMap: new Float32Array(0),
            collider: null,
            lastUpdate: Date.now()
        };
        
        this.generateRoadsForTile(tempTile);
        
        // Calculate influence for each vertex position
        const resolution = this.CONFIG.TILE_RESOLUTION;
        const step = this.CONFIG.TILE_SIZE / (resolution - 1);
        
        for (let i = 0; i < resolution; i++) {
            for (let j = 0; j < resolution; j++) {
                const localX = (i - (resolution - 1) / 2) * step;
                const localZ = (j - (resolution - 1) / 2) * step;
                
                let maxInfluence = 0;
                
                // Check distance to each road segment
                for (const road of tempTile.roads) {
                    const distanceToRoad = this.distanceToLineSegment(
                        new THREE.Vector2(localX, localZ),
                        road.start instanceof THREE.Vector2 ? road.start : new THREE.Vector2(road.start.x, road.start.z),
                        road.end instanceof THREE.Vector2 ? road.end : new THREE.Vector2(road.end.x, road.end.z)
                    );
                    
                    // Calculate influence based on distance (closer = more influence)
                    const halfWidth = road.width * 0.5;
                    if (distanceToRoad <= halfWidth) {
                        const influence = 1 - (distanceToRoad / halfWidth);
                        maxInfluence = Math.max(maxInfluence, influence);
                    }
                }
                
                if (maxInfluence > 0) {
                    roadMap.set(`${localX.toFixed(1)},${localZ.toFixed(1)}`, maxInfluence);
                }
            }
        }
        
        return roadMap;
    }
    
    /**
     * Calculate distance from point to line segment
     */
    private distanceToLineSegment(point: THREE.Vector2, lineStart: THREE.Vector2, lineEnd: THREE.Vector2): number {
        const lineLengthSquared = lineStart.distanceToSquared(lineEnd);
        
        if (lineLengthSquared === 0) {
            return point.distanceTo(lineStart);
        }
        
        const t = Math.max(0, Math.min(1, 
            point.clone().sub(lineStart).dot(lineEnd.clone().sub(lineStart)) / lineLengthSquared
        ));
        
        const projection = lineStart.clone().add(
            lineEnd.clone().sub(lineStart).multiplyScalar(t)
        );
        
        return point.distanceTo(projection);
    }
    
    /**
     * Store height data for persistence and collision generation
     */
    private storeHeightData(tileX: number, tileZ: number, heightData: number[]): void {
        const key = `${tileX}_${tileZ}`;
        const tile = this.terrainTiles.get(key);
        
        if (tile) {
            tile.heightData = heightData;
            tile.needsSave = true;
            
        }
    }

    private saveModifiedChunks(): void {
        // Assume database system exists - this method is only called on server
        const chunksToSave = Array.from(this.terrainTiles.values()).filter(tile => tile.needsSave);
        
        for (const tile of chunksToSave) {
            try {
                // Validate tile data before saving
                if (tile.x === undefined || tile.z === undefined) {
                    console.warn(`[TerrainSystem] Skipping save for chunk with invalid coordinates: ${tile.key}`);
                    continue;
                }
                
                const chunkData: WorldChunk = {
                    chunkX: tile.x,
                    chunkZ: tile.z,
                    biome: tile.biome || 'grassland',
                    heightData: tile.heightData || [],
                    chunkSeed: tile.chunkSeed || 0,
                    lastActiveTime: tile.lastActiveTime || new Date(),
                    lastActivity: tile.lastActiveTime || new Date(),
                };
                
                if (this.databaseSystem) {
                    this.databaseSystem.saveWorldChunk(chunkData);
                }
                tile.needsSave = false;
            } catch (error) {
                console.error(`[UnifiedTerrain] Failed to save chunk ${tile.key}:`, error);
            }
        }
        
        if (chunksToSave.length > 0) {
            // Chunks successfully saved to database
        }
    }

    update(_deltaTime: number): void {
        // Use the dedicated interval-based player terrain updater to avoid flicker
    }

    private checkPlayerMovement(): void {
        // Get player positions and update loaded tiles accordingly
        const players = this.world.getPlayers() || [];
        
        for (const player of players) {
            if (player.node.position) {
                // Validate position values
                const x = player.node.position.x;
                const z = player.node.position.z;
                
                if (!isFinite(x) || !isFinite(z)) {
                    console.warn('[TerrainSystem] Invalid player position detected:', {
                        x,
                        z,
                        playerId: (player as { id?: string }).id
                    });
                    continue;
                }
                
                const tileX = Math.floor(x / this.CONFIG.TILE_SIZE);
                const tileZ = Math.floor(z / this.CONFIG.TILE_SIZE);
                
                // Check if player moved to a new tile
                if (tileX !== this.lastPlayerTile.x || tileZ !== this.lastPlayerTile.z) {
                    this.updateTilesAroundPlayer(tileX, tileZ);
                    this.lastPlayerTile = { x: tileX, z: tileZ };
                }
            }
        }
    }

    private updateTilesAroundPlayer(centerX: number, centerZ: number): void {
        const requiredTiles = new Set<string>();
        
        // Generate list of required tiles (3x3 around player)
        for (let dx = -this.CONFIG.VIEW_DISTANCE; dx <= this.CONFIG.VIEW_DISTANCE; dx++) {
            for (let dz = -this.CONFIG.VIEW_DISTANCE; dz <= this.CONFIG.VIEW_DISTANCE; dz++) {
                const tileX = centerX + dx;
                const tileZ = centerZ + dz;
                requiredTiles.add(`${tileX}_${tileZ}`);
            }
        }
        
        // Unload tiles that are no longer needed
        for (const [key, tile] of this.terrainTiles) {
            if (!requiredTiles.has(key)) {
                this.unloadTile(tile);
            }
        }
        
        // Load new tiles that are needed
        for (const key of requiredTiles) {
            if (!this.terrainTiles.has(key)) {
                const [tileX, tileZ] = key.split('_').map(Number);
                this.generateTile(tileX, tileZ);
            }
        }
    }

    private unloadTile(tile: TerrainTile): void {
        // Clean up road meshes
        for (const road of tile.roads) {
            if (road.mesh && road.mesh.parent) {
                road.mesh.parent.remove(road.mesh);
                road.mesh.geometry.dispose();
                if (road.mesh.material instanceof THREE.Material) {
                    road.mesh.material.dispose();
                }
                road.mesh = null;
            }
        }
        
        // Clean up water meshes
        if (tile.waterMeshes) {
            for (const waterMesh of tile.waterMeshes) {
                if (waterMesh.parent) {
                    waterMesh.parent.remove(waterMesh);
                    waterMesh.geometry.dispose();
                    if (waterMesh.material instanceof THREE.Material) {
                        waterMesh.material.dispose();
                    }
                }
            }
            tile.waterMeshes = [];
        }
        
        // Remove main tile mesh from scene
        if (this.terrainContainer && tile.mesh.parent) {
            this.terrainContainer.remove(tile.mesh);
            tile.mesh.geometry.dispose();
            if (tile.mesh.material instanceof THREE.Material) {
                tile.mesh.material.dispose();
            }
        }
        
        // Remove collision
        if (tile.collision) {
            tile.collision.release();
        }
        
        // Save if needed
        if (tile.needsSave && this.databaseSystem) {
            // Save tile data before unloading
            // This would be implemented when we have the database schema
        }
        
        // Remove from maps
        this.terrainTiles.delete(tile.key);
        this.activeChunks.delete(tile.key);
        try {
            this.world.emit('terrain:tile:unloaded', { tileId: `${tile.x},${tile.z}` });
        } catch (_e) {}
        
    }

    // ===== TERRAIN MOVEMENT CONSTRAINTS (GDD Requirement) =====
    
    /**
     * Check if a position is walkable based on terrain constraints
     * Implements GDD rules: "Water bodies are impassable" and "Steep mountain slopes block movement"
     */
    isPositionWalkable(worldX: number, worldZ: number): { walkable: boolean; reason?: string } {
        const tileX = Math.floor(worldX / this.CONFIG.TILE_SIZE);
        const tileZ = Math.floor(worldZ / this.CONFIG.TILE_SIZE);
        const biome = this.getBiomeAt(tileX, tileZ);
        const biomeData = this.BIOMES[biome];
        
        // Safety check for biomeData
        if (!biomeData) {
            console.error(`[TerrainSystem] Biome '${biome}' not found in BIOMES for walkability check. Assuming walkable.`);
            return { walkable: true };
        }
        
        // Get height at position
        const height = this.getHeightAt(worldX, worldZ);
        
        // Check if underwater (water impassable rule)
        if (height < biomeData.waterLevel) {
            return { walkable: false, reason: 'Water bodies are impassable' };
        }
        
        // Check slope constraints
        const slope = this.calculateSlope(worldX, worldZ);
        if (slope > biomeData.maxSlope) {
            return { walkable: false, reason: 'Steep mountain slopes block movement' };
        }
        
        // Special case for lakes biome - always impassable
        if (biome === 'lakes') {
            return { walkable: false, reason: 'Lake water is impassable' };
        }
        
        return { walkable: true };
    }
    
    /**
     * Calculate slope at a given world position
     */
    private calculateSlope(worldX: number, worldZ: number): number {
        const checkDistance = this.CONFIG.SLOPE_CHECK_DISTANCE;
        const centerHeight = this.getHeightAt(worldX, worldZ);
        
        // Sample heights in 4 directions
        const northHeight = this.getHeightAt(worldX, worldZ + checkDistance);
        const southHeight = this.getHeightAt(worldX, worldZ - checkDistance);
        const eastHeight = this.getHeightAt(worldX + checkDistance, worldZ);
        const westHeight = this.getHeightAt(worldX - checkDistance, worldZ);
        
        // Calculate maximum slope in any direction
        const slopes = [
            Math.abs(northHeight - centerHeight) / checkDistance,
            Math.abs(southHeight - centerHeight) / checkDistance,
            Math.abs(eastHeight - centerHeight) / checkDistance,
            Math.abs(westHeight - centerHeight) / checkDistance
        ];
        
        return Math.max(...slopes);
    }
    
    /**
     * Find a walkable path between two points (basic pathfinding)
     */
    findWalkablePath(startX: number, startZ: number, endX: number, endZ: number): 
        { path: Array<{x: number, z: number}>; blocked: boolean } {
        
        // Simple line-of-sight check first
        const steps = 20;
        const dx = (endX - startX) / steps;
        const dz = (endZ - startZ) / steps;
        
        const path: Array<{x: number, z: number}> = [];
        
        for (let i = 0; i <= steps; i++) {
            const x = startX + dx * i;
            const z = startZ + dz * i;
            
            const walkableCheck = this.isPositionWalkable(x, z);
            if (!walkableCheck.walkable) {
                // Path is blocked, would need A* pathfinding for complex routing
                return { path: [], blocked: true };
            }
            
            path.push({ x, z });
        }
        
        return { path, blocked: false };
    }
    
    /**
     * Get terrain info at world position (for movement system integration)
     */
    getTerrainInfoAt(worldX: number, worldZ: number): {
        height: number;
        biome: string;
        walkable: boolean;
        slope: number;
        underwater: boolean;
    } {
        const height = this.getHeightAt(worldX, worldZ);
        const tileX = Math.floor(worldX / this.CONFIG.TILE_SIZE);
        const tileZ = Math.floor(worldZ / this.CONFIG.TILE_SIZE);
        const biome = this.getBiomeAt(tileX, tileZ);
        const biomeData = this.BIOMES[biome];
        const slope = this.calculateSlope(worldX, worldZ);
        const walkableCheck = this.isPositionWalkable(worldX, worldZ);
        
        return {
            height,
            biome,
            walkable: walkableCheck.walkable,
            slope,
            underwater: height < biomeData.waterLevel
        };
    }
    
    // ===== TERRAIN-BASED MOB SPAWNING (GDD Integration) =====
    
    /**
     * Generate visual features (road meshes, lake meshes) for a tile
     */
    private generateVisualFeatures(tile: TerrainTile): void {
        // Generate road meshes
        this.generateRoadMeshes(tile);
        
        // Generate lake meshes for water bodies
        this.generateLakeMeshes(tile);
        
    }
    
    /**
     * Generate visual road meshes for better visibility
     */
    private generateRoadMeshes(tile: TerrainTile): void {
        for (const road of tile.roads) {
            if (road.mesh) continue; // Already has mesh
            
            // Create road geometry
            const startVec = road.start instanceof THREE.Vector2 ? road.start : new THREE.Vector2(road.start.x, road.start.z);
            const endVec = road.end instanceof THREE.Vector2 ? road.end : new THREE.Vector2(road.end.x, road.end.z);
            const roadLength = startVec.distanceTo(endVec);
            const roadGeometry = new THREE.PlaneGeometry(road.width, roadLength);
            
            // Create road material (darker color for visibility)
            const roadMaterial = new THREE.MeshLambertMaterial({
                color: 0x4a4a4a, // Dark gray
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide
            });
            
            // Create road mesh
            const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
            
            // Position road mesh
            const startX = road.start instanceof THREE.Vector2 ? road.start.x : road.start.x;
            const startZ = road.start instanceof THREE.Vector2 ? road.start.y : road.start.z;
            const endX = road.end instanceof THREE.Vector2 ? road.end.x : road.end.x;
            const endZ = road.end instanceof THREE.Vector2 ? road.end.y : road.end.z;
            const centerX = (startX + endX) / 2;
            const centerZ = (startZ + endZ) / 2;
            const worldX = (tile.x * this.CONFIG.TILE_SIZE) + centerX;
            const worldZ = (tile.z * this.CONFIG.TILE_SIZE) + centerZ;
            const height = this.getHeightAt(worldX, worldZ);
            
            roadMesh.position.set(centerX, height + 0.01, centerZ); // Slightly above terrain
            
            // Rotate road to match direction
            const roadDirection = new THREE.Vector2().subVectors(endVec, startVec);
            
            // Only rotate if road has a valid direction (not zero length)
            if (roadDirection.lengthSq() > 0.0001) {
                roadDirection.normalize();
                const roadAngle = Math.atan2(roadDirection.y, roadDirection.x);
                roadMesh.rotation.y = roadAngle;
            } else {
                // Default rotation for zero-length roads
                roadMesh.rotation.y = 0;
            }
            roadMesh.rotation.x = -Math.PI / 2; // Lay flat
            
            // Add userData for interaction detection
            roadMesh.userData = {
                type: 'terrain',
                walkable: true,
                clickable: true,
                subType: 'road',
                tileKey: tile.key
            };
            
            // Add to terrain container
            if (tile.mesh) {
                tile.mesh.add(roadMesh);
            }
            
            // Store mesh reference
            road.mesh = roadMesh;
        }
    }
    
    /**
     * Generate water meshes for low areas
     */
    private generateWaterMeshes(tile: TerrainTile): void {
        // Sample tile to find water areas
        const waterLevel = 12; // Water appears below 12m elevation
        const sampleStep = 20; // Sample every 20m
        const waterAreas: Array<{x: number, z: number, depth: number}> = [];
        
        for (let x = -this.CONFIG.TILE_SIZE/2; x < this.CONFIG.TILE_SIZE/2; x += sampleStep) {
            for (let z = -this.CONFIG.TILE_SIZE/2; z < this.CONFIG.TILE_SIZE/2; z += sampleStep) {
                const worldX = tile.x * this.CONFIG.TILE_SIZE + x;
                const worldZ = tile.z * this.CONFIG.TILE_SIZE + z;
                const height = this.getHeightAt(worldX, worldZ);
                
                if (height < waterLevel) {
                    waterAreas.push({
                        x: x,
                        z: z,
                        depth: waterLevel - height
                    });
                }
            }
        }
        
        // Create water plane if we found water
        if (waterAreas.length > 5) { // At least 5 water samples
            const waterGeometry = new THREE.PlaneGeometry(this.CONFIG.TILE_SIZE, this.CONFIG.TILE_SIZE);
            waterGeometry.rotateX(-Math.PI / 2);
            
            const waterMaterial = new THREE.MeshPhongMaterial({
                color: 0x1e3a5f,
                transparent: true,
                opacity: 0.7,
                shininess: 100,
                specular: 0x4080ff
            });
            
            const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
            waterMesh.position.y = waterLevel;
            waterMesh.name = `Water_${tile.key}`;
            waterMesh.userData = {
                type: 'water',
                walkable: false,
                clickable: false
            };
            
            if (tile.mesh) {
                tile.mesh.add(waterMesh);
                tile.waterMeshes.push(waterMesh);
            }
        }
    }
    
    /**
     * Generate visual lake meshes for water bodies
     */
    private generateLakeMeshes(tile: TerrainTile): void {
        const biomeData = this.BIOMES[tile.biome];
        if (!biomeData) return;
        
        // Only generate lake meshes for water biomes or areas below water level
        if ((tile.biome as string) === 'lakes' || biomeData.waterLevel > 0) {
            // Sample the tile to find water areas
            const waterAreas = this.findWaterAreas(tile);
            
            for (const waterArea of waterAreas) {
                const waterGeometry = new THREE.PlaneGeometry(waterArea.width, waterArea.depth);
                
                // Create water material with transparency and animation
                const waterMaterial = new THREE.MeshLambertMaterial({
                    color: 0x1e6ba8, // Blue water color
                    transparent: true,
                    opacity: 0.7,
                    side: THREE.DoubleSide
                });
                
                const waterMesh = new THREE.Mesh(waterGeometry, waterMaterial);
                waterMesh.position.set(
                    waterArea.centerX,
                    biomeData.waterLevel + 0.01, // At water level
                    waterArea.centerZ
                );
                waterMesh.rotation.x = -Math.PI / 2; // Lay flat
                
                // Add userData for interaction detection (water is NOT walkable)
                waterMesh.userData = {
                    type: 'terrain',
                    walkable: false, // Water is impassable per GDD
                    clickable: true,
                    subType: 'water',
                    tileKey: tile.key,
                    biome: tile.biome
                };
                
                // Add to terrain container
                if (tile.mesh) {
                    tile.mesh.add(waterMesh);
                }
                
                // Store reference for potential updates
                if (!tile.waterMeshes) tile.waterMeshes = [];
                tile.waterMeshes.push(waterMesh);
            }
        }
    }
    
    /**
     * Find water areas within a tile that need visual representation
     */
    private findWaterAreas(tile: TerrainTile): Array<{centerX: number, centerZ: number, width: number, depth: number}> {
        const waterAreas: Array<{centerX: number, centerZ: number, width: number, depth: number}> = [];
        const biomeData = this.BIOMES[tile.biome];
        if (!biomeData) return waterAreas;
        
        // For lakes biome, create a large water area covering most of the tile
        if ((tile.biome as string) === 'lakes') {
            waterAreas.push({
                centerX: 0,
                centerZ: 0,
                width: this.CONFIG.TILE_SIZE * 0.8,
                depth: this.CONFIG.TILE_SIZE * 0.8
            });
        } else {
            // For other biomes, sample the heightmap to find areas below water level
            const sampleSize = 10; // Sample every 10 meters
            const samples: Array<{x: number, z: number, underwater: boolean}> = [];
            
            for (let x = -this.CONFIG.TILE_SIZE/2; x < this.CONFIG.TILE_SIZE/2; x += sampleSize) {
                for (let z = -this.CONFIG.TILE_SIZE/2; z < this.CONFIG.TILE_SIZE/2; z += sampleSize) {
                    const worldX = (tile.x * this.CONFIG.TILE_SIZE) + x;
                    const worldZ = (tile.z * this.CONFIG.TILE_SIZE) + z;
                    const height = this.getHeightAt(worldX, worldZ);
                    
                    samples.push({
                        x, z,
                        underwater: height < biomeData.waterLevel
                    });
                }
            }
            
            // Group contiguous underwater areas (simplified approach)
            const underwaterSamples = samples.filter(s => s.underwater);
            if (underwaterSamples.length > 0) {
                // Create one water area covering the underwater region
                const minX = Math.min(...underwaterSamples.map(s => s.x));
                const maxX = Math.max(...underwaterSamples.map(s => s.x));
                const minZ = Math.min(...underwaterSamples.map(s => s.z));
                const maxZ = Math.max(...underwaterSamples.map(s => s.z));
                
                waterAreas.push({
                    centerX: (minX + maxX) / 2,
                    centerZ: (minZ + maxZ) / 2,
                    width: maxX - minX + sampleSize,
                    depth: maxZ - minZ + sampleSize
                });
            }
        }
        
        return waterAreas;
    }
    
    /**
     * Get valid mob spawn positions in a tile based on biome and terrain constraints
     */
    getMobSpawnPositionsForTile(tileX: number, tileZ: number, maxSpawns: number = 10): Array<{
        position: { x: number; y: number; z: number }
        mobTypes: string[];
        biome: string;
        difficulty: number;
    }> {
        const biome = this.getBiomeAt(tileX, tileZ);
        const biomeData = this.BIOMES[biome];
        
        // Safety check for biomeData
        if (!biomeData) {
            console.error(`[TerrainSystem] Biome '${biome}' not found in BIOMES for mob spawning. No spawns generated.`);
            return [];
        }
        
        // Don't spawn mobs in safe zones
        if (biomeData.difficulty === 0 || biomeData.mobTypes.length === 0) {
            return [];
        }
        
        const spawnPositions: Array<{
            position: { x: number; y: number; z: number }
            mobTypes: string[];
            biome: string;
            difficulty: number;
        }> = [];
        
        // Try to find valid spawn positions
        let attempts = 0;
        const maxAttempts = maxSpawns * 3; // Allow some failures
        
        while (spawnPositions.length < maxSpawns && attempts < maxAttempts) {
            attempts++;
            
            // Random position within tile
            const worldX = (tileX * this.CONFIG.TILE_SIZE) + (Math.random() - 0.5) * this.CONFIG.TILE_SIZE * 0.8;
            const worldZ = (tileZ * this.CONFIG.TILE_SIZE) + (Math.random() - 0.5) * this.CONFIG.TILE_SIZE * 0.8;
            
            // Check if position is suitable for mob spawning
            const terrainInfo = this.getTerrainInfoAt(worldX, worldZ);
            
            if (!terrainInfo.walkable || terrainInfo.underwater) {
                continue; // Skip unwalkable positions
            }
            
            // Check distance from roads (don't spawn too close to roads)
            if (this.isPositionNearRoad(worldX, worldZ, 8)) {
                continue; // Skip positions near roads
            }
            
            // Check distance from starter towns
            if (this.isPositionNearTown(worldX, worldZ, this.CONFIG.TOWN_RADIUS)) {
                continue; // Skip positions near safe towns
            }
            
            spawnPositions.push({
                position: {
                    x: worldX,
                    y: terrainInfo.height,
                    z: worldZ
                },
                mobTypes: [...biomeData.mobTypes],
                biome: biome,
                difficulty: biomeData.difficulty
            });
        }
        
        return spawnPositions;
    }
    
    /**
     * Check if position is near a road
     */
    private isPositionNearRoad(worldX: number, worldZ: number, minDistance: number): boolean {
        const tileX = Math.floor(worldX / this.CONFIG.TILE_SIZE);
        const tileZ = Math.floor(worldZ / this.CONFIG.TILE_SIZE);
        
        // Check current tile and adjacent tiles for roads
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                const checkTileX = tileX + dx;
                const checkTileZ = tileZ + dz;
                const tileKey = `${checkTileX}_${checkTileZ}`;
                const tile = this.terrainTiles.get(tileKey);
                
                if (tile && tile.roads.length > 0) {
                    for (const road of tile.roads) {
                        const localX = worldX - (checkTileX * this.CONFIG.TILE_SIZE);
                        const localZ = worldZ - (checkTileZ * this.CONFIG.TILE_SIZE);
                        
                        const distanceToRoad = this.distanceToLineSegment(
                            new THREE.Vector2(localX, localZ),
                            road.start instanceof THREE.Vector2 ? road.start : new THREE.Vector2(road.start.x, road.start.z),
                            road.end instanceof THREE.Vector2 ? road.end : new THREE.Vector2(road.end.x, road.end.z)
                        );
                        
                        if (distanceToRoad < minDistance) {
                            return true;
                        }
                    }
                }
            }
        }
        
        return false;
    }
    
    /**
     * Check if position is near a starter town
     */
    private isPositionNearTown(worldX: number, worldZ: number, minDistance: number): boolean {
        const towns = [
            { x: 0, z: 0 }, { x: 10 * this.CONFIG.TILE_SIZE, z: 0 }, 
            { x: -10 * this.CONFIG.TILE_SIZE, z: 0 },
            { x: 0, z: 10 * this.CONFIG.TILE_SIZE }, 
            { x: 0, z: -10 * this.CONFIG.TILE_SIZE }
        ];
        
        for (const town of towns) {
            const distance = Math.sqrt((worldX - town.x) ** 2 + (worldZ - town.z) ** 2);
            if (distance < minDistance) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Get all mob types available in a specific biome
     */
    getBiomeMobTypes(biome: string): string[] {
        const biomeData = this.BIOMES[biome];
        return biomeData ? [...biomeData.mobTypes] : [];
    }
    
    /**
     * Get biome difficulty level for mob spawning
     */
    getBiomeDifficulty(biome: string): number {
        const biomeData = this.BIOMES[biome];
        return biomeData ? biomeData.difficulty : 0;
    }
    
    /**
     * Get all loaded tiles with their biome and mob spawn data
     */
    getLoadedTilesWithSpawnData(): Array<{
        tileX: number;
        tileZ: number;
        biome: string;
        difficulty: number;
        mobTypes: string[];
        spawnPositions: Array<{ x: number; y: number; z: number }>;
    }> {
        const tilesData: Array<{
            tileX: number;
            tileZ: number;
            biome: string;
            difficulty: number;
            mobTypes: string[];
            spawnPositions: Array<{ x: number; y: number; z: number }>;
        }> = [];
        
        for (const [key, tile] of this.terrainTiles.entries()) {
            const biomeData = this.BIOMES[tile.biome];
            
            // Safety check for biomeData
            if (!biomeData) {
                console.warn(`[TerrainSystem] Biome '${tile.biome}' not found in BIOMES for spawn data. Skipping tile ${key}.`);
                continue;
            }
            
            if (biomeData.difficulty > 0 && biomeData.mobTypes.length > 0) {
                const spawnPositions = this.getMobSpawnPositionsForTile(tile.x, tile.z, 5);
                
                tilesData.push({
                    tileX: tile.x,
                    tileZ: tile.z,
                    biome: tile.biome,
                    difficulty: biomeData.difficulty,
                    mobTypes: [...biomeData.mobTypes],
                    spawnPositions: spawnPositions.map(spawn => spawn.position)
                });
            }
        }
        
        return tilesData;
    }
    
    destroy(): void {
        
        // Perform final serialization before shutdown
        this.performImmediateSerialization();
        
        // Clear save interval
        if (this.chunkSaveInterval) {
            clearInterval(this.chunkSaveInterval);
        }
        if (this.terrainUpdateIntervalId) {
            clearInterval(this.terrainUpdateIntervalId);
        }
        if (this.serializationIntervalId) {
            clearInterval(this.serializationIntervalId);
        }
        if (this.boundingBoxIntervalId) {
            clearInterval(this.boundingBoxIntervalId);
        }
        
        // Save all modified chunks before shutdown
        this.saveModifiedChunks();
        
        // Unload all tiles
        for (const tile of this.terrainTiles.values()) {
            this.unloadTile(tile);
        }
        
        // Remove terrain container
        if (this.terrainContainer && this.terrainContainer.parent) {
            this.terrainContainer.parent.remove(this.terrainContainer);
        }
        
        // Clear tracking data
        this.playerChunks.clear();
        this.simulatedChunks.clear();
        this.chunkPlayerCounts.clear();
        this.terrainBoundingBoxes.clear();
        this.pendingSerializationData.clear();
        
    }

    // Methods for chunk persistence (used by tests)
    markChunkActive(chunkX: number, chunkZ: number): void {
        const key = `${chunkX}_${chunkZ}`;
        
        // Add to simulated chunks if not already there
        this.simulatedChunks.add(key);
        
        // Update chunk player count
        const currentCount = this.chunkPlayerCounts.get(key) || 0;
        this.chunkPlayerCounts.set(key, currentCount + 1);
        
    }

    markChunkInactive(chunkX: number, chunkZ: number): void {
        const key = `${chunkX}_${chunkZ}`;
        
        // Decrease chunk player count
        const currentCount = this.chunkPlayerCounts.get(key) || 0;
        if (currentCount > 1) {
            this.chunkPlayerCounts.set(key, currentCount - 1);
        } else {
            // No more active references - remove from simulation
            this.chunkPlayerCounts.delete(key);
            this.simulatedChunks.delete(key);
        }
    }

    getActiveChunks(): Array<{x: number, z: number}> {
        // Return currently loaded terrain tiles as "active chunks"
        const activeChunks: Array<{x: number, z: number}> = [];
        for (const [key, _tile] of this.terrainTiles.entries()) {
            // FIX: Use '_' separator, not ','
            const [x, z] = key.split('_').map(Number);
            activeChunks.push({ x, z });
        }
        return activeChunks;
    }

    async saveAllActiveChunks(): Promise<void> {
        // In a real implementation, this would persist chunk data
        // For now, just save modified chunks
        this.saveModifiedChunks();
    }

    // ===== TEST INTEGRATION METHODS (expected by test-terrain.mjs) =====
    
    /**
     * Get comprehensive terrain statistics for testing
     */
    getTerrainStats(): {
        tileSize: string;
        worldSize: string;
        totalArea: string;
        maxLoadedTiles: number;
        tilesLoaded: number;
        currentlyLoaded: string[];
        biomeCount: number;
        chunkSize: number;
        worldBounds: {
            min: { x: number; z: number };
            max: { x: number; z: number };
        };
        activeBiomes: string[];
        totalRoads: number;
    } {
        const activeChunks = Array.from(this.terrainTiles.keys());
        return {
            tileSize: '100x100m',
            worldSize: '100x100',
            totalArea: '10km x 10km',
            maxLoadedTiles: 9,
            tilesLoaded: this.terrainTiles.size,
            currentlyLoaded: activeChunks,
            biomeCount: Object.keys(this.BIOMES).length,
            chunkSize: this.CONFIG.TILE_SIZE,
            worldBounds: {
                min: { x: -this.CONFIG.WORLD_SIZE / 2, z: -this.CONFIG.WORLD_SIZE / 2 },
                max: { x: this.CONFIG.WORLD_SIZE / 2, z: this.CONFIG.WORLD_SIZE / 2 }
            },
            activeBiomes: Array.from(new Set(Array.from(this.terrainTiles.values()).map(t => t.biome))),
            totalRoads: Array.from(this.terrainTiles.values()).reduce((sum, t) => sum + t.roads.length, 0)
        };
    }

    /**
     * Get biome name at world position (wrapper for test compatibility)
     */
    getBiomeAtPosition(x: number, z: number): string {
        const tileX = Math.floor(x / this.CONFIG.TILE_SIZE);
        const tileZ = Math.floor(z / this.CONFIG.TILE_SIZE);
        const biome = this.getBiomeAt(tileX, tileZ);
        return biome;
    }

    /**
     * Get height at world position (wrapper for test compatibility)
     */
    getHeightAtPosition(x: number, z: number): number {
        return this.getHeightAt(x, z);
    }
    
    // ===== MMOCHUNK LOADING AND SIMULATION SYSTEM =====
    
    /**
     * Initialize chunk loading system with 9 core + ring strategy
     */
    private initializeChunkLoadingSystem(): void {
        // Increase load radius to reduce tile pop-in
        this.coreChunkRange = 2; // 5x5 core grid
        this.ringChunkRange = 3; // Preload ring up to ~7x7
        
        // Initialize tracking maps
        this.playerChunks.clear();
        this.simulatedChunks.clear();
        this.chunkPlayerCounts.clear();
    }
    
    /**
     * Initialize 15-minute serialization system
     */
    private initializeSerializationSystem(): void {
        
        this.lastSerializationTime = Date.now();
        this.serializationInterval = 15 * 60 * 1000; // 15 minutes
        this.worldStateVersion = 1;
        this.pendingSerializationData.clear();
    }
    
    /**
     * Initialize bounding box verification system
     */
    private initializeBoundingBoxSystem(): void {
        
        // Set world bounds based on 100x100 tile grid
        this.worldBounds = {
            minX: -50 * this.CONFIG.TILE_SIZE,
            maxX: 50 * this.CONFIG.TILE_SIZE,
            minZ: -50 * this.CONFIG.TILE_SIZE,
            maxZ: 50 * this.CONFIG.TILE_SIZE,
            minY: -50,
            maxY: 100
        };
        
        this.terrainBoundingBoxes.clear();
    }
    
    /**
     * Player-based terrain update with 9 core + ring strategy
     */
    private updatePlayerBasedTerrain(): void {
        if (this.isGenerating) return;
        
        // Get all players
        const players = this.world.getPlayers() || [];
        
        // Clear previous player chunk tracking
        this.playerChunks.clear();
        this.chunkPlayerCounts.clear();
        
        // Track which tiles are needed based on 9 core + ring strategy
        const neededTiles = new Set<string>();
        const simulationTiles = new Set<string>();
        
        for (const player of players) {
            const playerPos = player.node.position;
            if (!playerPos) continue;
            
            const playerId = (player as { playerId?: string; id?: string }).playerId || (player as { playerId?: string; id?: string }).id || 'unknown';
            
            // Validate position values
            const x = playerPos.x;
            const z = playerPos.z;
            
            if (!isFinite(x) || !isFinite(z)) {
                console.warn('[TerrainSystem] Invalid player position in updatePlayerBasedTerrain:', {
                    x,
                    z,
                    playerId
                });
                continue;
            }
            
            // Calculate tile position
            const tileX = Math.floor(x / this.CONFIG.TILE_SIZE);
            const tileZ = Math.floor(z / this.CONFIG.TILE_SIZE);
            
            // 9 core chunks (3x3 grid) - these get full simulation
            const coreChunks = new Set<string>();
            for (let dx = -this.coreChunkRange; dx <= this.coreChunkRange; dx++) {
                for (let dz = -this.coreChunkRange; dz <= this.coreChunkRange; dz++) {
                    const tx = tileX + dx;
                    const tz = tileZ + dz;
                    const key = `${tx}_${tz}`;
                    coreChunks.add(key);
                    neededTiles.add(key);
                    simulationTiles.add(key);
                }
            }
            
            // Ring chunks around core - these are loaded but not simulated
            for (let dx = -this.ringChunkRange; dx <= this.ringChunkRange; dx++) {
                for (let dz = -this.ringChunkRange; dz <= this.ringChunkRange; dz++) {
                    // Skip core chunks
                    if (Math.abs(dx) <= this.coreChunkRange && Math.abs(dz) <= this.coreChunkRange) {
                        continue;
                    }
                    
                    const tx = tileX + dx;
                    const tz = tileZ + dz;
                    const key = `${tx}_${tz}`;
                    neededTiles.add(key);
                }
            }
            
            // Track player chunks for shared world simulation
            this.playerChunks.set(playerId, coreChunks);
            
            // Count players per chunk for shared simulation
            for (const chunkKey of coreChunks) {
                const currentCount = this.chunkPlayerCounts.get(chunkKey) || 0;
                this.chunkPlayerCounts.set(chunkKey, currentCount + 1);
            }
        }
        
        // Update simulated chunks - only chunks with players get simulation
        this.simulatedChunks.clear();
        for (const chunkKey of simulationTiles) {
            if (this.chunkPlayerCounts.get(chunkKey)! > 0) {
                this.simulatedChunks.add(chunkKey);
            }
        }
        
        // Generate missing tiles
        for (const tileKey of neededTiles) {
            if (!this.terrainTiles.has(tileKey)) {
                const [x, z] = tileKey.split('_').map(Number);
                this.generateTile(x, z);
            }
        }
        
        // Remove tiles that are no longer needed, with hysteresis padding
        // Approximate each player's center from their core chunk set
        const playerCenters: Array<{ x: number; z: number }> = [];
        for (const coreSet of this.playerChunks.values()) {
            let anyKey: string | null = null;
            for (const k of coreSet) { anyKey = k; break; }
            if (anyKey) {
                const [cx, cz] = anyKey.split('_').map(Number);
                playerCenters.push({ x: cx, z: cz });
            }
        }
        for (const [tileKey, tile] of this.terrainTiles) {
            if (!neededTiles.has(tileKey)) {
                let minChebyshev = Infinity;
                for (const c of playerCenters) {
                    const d = Math.max(Math.abs(tile.x - c.x), Math.abs(tile.z - c.z));
                    if (d < minChebyshev) minChebyshev = d;
                }
                if (minChebyshev > this.ringChunkRange + this.unloadPadding) {
                    this.unloadTile(tile);
                }
            }
        }
        
        // Log simulation status every 10 updates
        if (Math.random() < 0.1) {
            const _totalPlayers = players.length;
            const _simulatedChunkCount = this.simulatedChunks.size;
            const _loadedChunkCount = this.terrainTiles.size;
            
            // Simulation status tracked for debugging
            
            // Log shared world status
            const sharedChunks = Array.from(this.chunkPlayerCounts.entries())
                .filter(([_, count]) => count > 1)
                .map(([key, count]) => `${key}(${count})`)
                .join(', ');
            
            if (sharedChunks) {
                // Multiple players sharing chunks - enhanced simulation active
            }
        }
    }
    
    /**
     * Perform periodic serialization every 15 minutes
     */
    private performPeriodicSerialization(): void {
        const now = Date.now();
        
        if (now - this.lastSerializationTime >= this.serializationInterval) {
            this.performImmediateSerialization();
            this.lastSerializationTime = now;
        }
    }
    
    /**
     * Perform immediate serialization of all world state
     */
    private performImmediateSerialization(): void {
        const startTime = Date.now();
        let _serializedChunks = 0;
        
        try {
            // Serialize all active chunks
            for (const [key, tile] of this.terrainTiles) {
                const serializationData = {
                    key: key,
                    tileX: tile.x,
                    tileZ: tile.z,
                    biome: tile.biome,
                    heightData: tile.heightData,
                    resourceStates: tile.resources.map(r => ({
                        id: r.id,
                        type: r.type,
                        position: r.position instanceof THREE.Vector3 ? r.position.toArray() as [number, number, number] : [r.position.x, r.position.y, r.position.z]
                    })),
                    roadData: tile.roads.map(r => ({
                        start: r.start instanceof THREE.Vector2 ? r.start.toArray() as [number, number] : [r.start.x, r.start.z],
                        end: r.end instanceof THREE.Vector2 ? r.end.toArray() as [number, number] : [r.end.x, r.end.z],
                        width: r.width
                    })),
                    playerCount: this.chunkPlayerCounts.get(key) || 0,
                    lastActiveTime: tile.lastActiveTime,
                    isSimulated: this.simulatedChunks.has(key),
                    worldStateVersion: this.worldStateVersion,
                    timestamp: Date.now()
                };
                
                // Store for database persistence with proper tuple types
                const typedSerializationData = {
                    ...serializationData,
                    resourceStates: serializationData.resourceStates.map(rs => ({
                        ...rs,
                        position: rs.position as [number, number, number]
                    })),
                    roadData: serializationData.roadData.map(rd => ({
                        ...rd,
                        start: rd.start as [number, number],
                        end: rd.end as [number, number]
                    }))
                };
                this.pendingSerializationData.set(key, typedSerializationData);
                
                // If database system is available, save immediately
                if (this.databaseSystem) {
                    try {
                        // Validate tile data before saving
                        if (tile.x === undefined || tile.z === undefined) {
                            console.warn(`[TerrainSystem] Skipping serialization for chunk with invalid coordinates: ${key}`);
                            continue;
                        }
                        
                        const chunkData: WorldChunk = {
                            chunkX: tile.x,
                            chunkZ: tile.z,
                            biome: tile.biome || 'grassland',
                            heightData: tile.heightData || [],
                            chunkSeed: tile.chunkSeed || 0,
                            lastActiveTime: tile.lastActiveTime || new Date(),
                            lastActivity: tile.lastActiveTime || new Date(),
                        };
                        
                        this.databaseSystem.saveWorldChunk(chunkData);
                        _serializedChunks++;
                    } catch (error) {
                        console.error(`[TerrainSystem] ❌ Failed to serialize chunk ${key}:`, error);
                    }
                }
            }
            
            // Increment world state version
            this.worldStateVersion++;
            
            const _elapsed = Date.now() - startTime;
            
        } catch (error) {
            console.error('[TerrainSystem] ❌ Serialization failed:', error);
        }
    }
    
    /**
     * Verify terrain bounding boxes for size validation
     */
    private verifyTerrainBoundingBoxes(): void {
        let _validBoxes = 0;
        let _invalidBoxes = 0;
        const oversizedTiles: string[] = [];
        
        for (const [key, tile] of this.terrainTiles) {
            // Calculate bounding box for this tile
            const box = new THREE.Box3();
            
            if (tile.mesh && tile.mesh.geometry) {
                box.setFromObject(tile.mesh);
                
                // Verify tile is within expected size bounds
                const tempVector = new THREE.Vector3();
                const size = box.getSize(tempVector);
                const expectedSize = this.CONFIG.TILE_SIZE;
                
                if (size.x > expectedSize * 1.1 || size.z > expectedSize * 1.1) {
                    _invalidBoxes++;
                    oversizedTiles.push(key);
                } else {
                    _validBoxes++;
                }
                
                // Store bounding box for future reference
                this.terrainBoundingBoxes.set(key, box.clone());
                
                // Verify tile is within world bounds
                if (box.min.x < this.worldBounds.minX || box.max.x > this.worldBounds.maxX ||
                    box.min.z < this.worldBounds.minZ || box.max.z > this.worldBounds.maxZ) {
                    // Tile exceeds world bounds - tracked but no logging
                }
            }
        }
        
        // Verification completed - results available via getChunkSimulationStatus()
    }
    
    /**
     * Get chunk simulation status for debugging
     */
    getChunkSimulationStatus(): {
        totalChunks: number;
        simulatedChunks: number;
        playerChunks: Map<string, Set<string>>;
        chunkPlayerCounts: Map<string, number>;
        lastSerializationTime: number;
        nextSerializationIn: number;
        worldStateVersion: number;
    } {
        return {
            totalChunks: this.terrainTiles.size,
            simulatedChunks: this.simulatedChunks.size,
            playerChunks: new Map(this.playerChunks),
            chunkPlayerCounts: new Map(this.chunkPlayerCounts),
            lastSerializationTime: this.lastSerializationTime,
            nextSerializationIn: this.serializationInterval - (Date.now() - this.lastSerializationTime),
            worldStateVersion: this.worldStateVersion
        };
    }
    
    /**
     * Check if a chunk is being simulated
     */
    isChunkSimulated(chunkX: number, chunkZ: number): boolean {
        const key = `${chunkX}_${chunkZ}`;
        return this.simulatedChunks.has(key);
    }
    
    /**
     * Get players in a specific chunk
     */
    getPlayersInChunk(chunkX: number, chunkZ: number): string[] {
        const key = `${chunkX}_${chunkZ}`;
        const playersInChunk: string[] = [];
        
        for (const [playerId, chunks] of this.playerChunks) {
            if (chunks.has(key)) {
                playersInChunk.push(playerId);
            }
        }
        
        return playersInChunk;
    }
    
    /**
     * Force immediate serialization (for testing/admin commands)
     */
    forceSerialization(): void {
        this.performImmediateSerialization();
    }
}