/**
 * Advanced Procedural Terrain Generator
 * 
 * Generates realistic terrain with proper geographic features:
 * - Multi-layered noise generation
 * - Realistic biome placement based on climate
 * - River networks and water systems
 * - Mountain ranges with proper ridges
 * - Erosion simulation
 * - Height-based color gradients
 */

import THREE from '../extras/three';
import { NoiseGenerator, TerrainFeatureGenerator } from './NoiseGenerator';

export interface TerrainConfig {
    // World Configuration
    tileSize: number;           // Size of each terrain tile in meters
    resolution: number;         // Vertices per tile edge
    maxHeight: number;          // Maximum height variation
    
    // Noise Configuration
    baseScale: number;          // Base terrain frequency
    detailScale: number;        // Detail noise frequency
    ridgeScale: number;         // Mountain ridge frequency
    
    // Climate Configuration
    equatorZ: number;           // Z coordinate of equator for temperature
    temperatureRange: number;   // Temperature variation range
    moistureVariation: number;  // Moisture map variation
    
    // Feature Configuration
    riverDensity: number;       // Density of river generation
    lakeDensity: number;        // Density of lake generation
    erosionStrength: number;    // Hydraulic erosion intensity
    
    // Visual Configuration
    snowlineHeight: number;     // Height above which snow appears
    treeLine: number;           // Height above which no trees grow
    waterLevel: number;         // Sea level for water rendering
}

export interface BiomeDefinition {
    name: string;
    baseColor: THREE.Color;
    temperature: [number, number]; // Min, max temperature
    moisture: [number, number];     // Min, max moisture
    elevation: [number, number];    // Preferred elevation range
    resources: string[];
    mobTypes: string[];
    difficulty: number;
    
    // Visual properties
    colorVariation: number;     // How much color varies within biome
    textureScale: number;       // Scale for texture mapping
    normalStrength: number;     // Normal map intensity
}

export interface TerrainFeature {
    type: 'river' | 'lake' | 'mountain_peak' | 'valley' | 'road';
    position: THREE.Vector2;
    properties: {
        flow?: number;
        radius?: number;
        height?: number;
        [key: string]: number | undefined;
    };
}

export class AdvancedTerrainGenerator {
    private noise: NoiseGenerator;
    private featureGenerator: TerrainFeatureGenerator;
    private config: TerrainConfig;
    private biomes!: Map<string, BiomeDefinition>;
    
    // Cache for expensive calculations
    private heightCache = new Map<string, number>();
    private biomeCache = new Map<string, string>();
    private climateCache = new Map<string, { temperature: number, moisture: number }>();
    
    constructor(seed: number = 42, config?: Partial<TerrainConfig>) {
        this.noise = new NoiseGenerator(seed);
        this.featureGenerator = new TerrainFeatureGenerator(seed + 1000);
        
        this.config = {
            tileSize: 100,
            resolution: 64,
            maxHeight: 25,           // Reduced from 80 - more reasonable scale
            baseScale: 0.003,        // Reduced from 0.008 - smoother large features
            detailScale: 0.015,      // Reduced from 0.04 - less chaotic detail
            ridgeScale: 0.008,       // Reduced from 0.02 - smoother ridges
            equatorZ: 0,
            temperatureRange: 0.5,   // Reduced from 0.8 - less extreme variation
            moistureVariation: 0.4,  // Reduced from 0.6 - smoother transitions
            riverDensity: 0.2,       // Reduced from 0.3 - fewer rivers
            lakeDensity: 0.05,       // Reduced from 0.1 - fewer lakes
            erosionStrength: 0.2,    // Reduced from 0.4 - less aggressive erosion
            snowlineHeight: 20,      // Adjusted for new max height
            treeLine: 15,            // Adjusted for new max height
            waterLevel: 1.0,         // Reduced from 2.0 - more realistic sea level
            ...config
        };
        
        this.initializeBiomes();
    }
    
    private initializeBiomes(): void {
        this.biomes = new Map();
        
        // Arctic/Tundra - Cold, low moisture
        this.biomes.set('tundra', {
            name: 'Frozen Tundra',
            baseColor: new THREE.Color(0x9da5b0),
            temperature: [0.0, 0.2],
            moisture: [0.0, 0.3],
            elevation: [0.6, 1.0],
            resources: ['ice', 'rare_ore'],
            mobTypes: [], // Loaded from JSON manifests
            difficulty: 3,
            colorVariation: 0.15,
            textureScale: 1.0,
            normalStrength: 0.8
        });
        
        // Boreal Forest - Cold, high moisture
        this.biomes.set('boreal_forest', {
            name: 'Northern Reaches',
            baseColor: new THREE.Color(0x2d4a3e),
            temperature: [0.2, 0.4],
            moisture: [0.5, 0.8],
            elevation: [0.3, 0.7],
            resources: ['tree', 'gem', 'rare_ore'],
            mobTypes: [], // Loaded from JSON manifests
            difficulty: 3,
            colorVariation: 0.2,
            textureScale: 0.8,
            normalStrength: 1.0
        });
        
        // Temperate Forest - Moderate temperature and moisture
        this.biomes.set('temperate_forest', {
            name: 'Darkwood Forest',
            baseColor: new THREE.Color(0x1a2e1a),
            temperature: [0.4, 0.7],
            moisture: [0.4, 0.8],
            elevation: [0.2, 0.6],
            resources: ['tree', 'herb', 'rare_ore'],
            mobTypes: [], // Loaded from JSON manifests
            difficulty: 2,
            colorVariation: 0.25,
            textureScale: 0.6,
            normalStrength: 1.2
        });
        
        // Grasslands - Moderate temperature, low-medium moisture
        this.biomes.set('grasslands', {
            name: 'Plains',
            baseColor: new THREE.Color(0x6b8f47),
            temperature: [0.5, 0.8],
            moisture: [0.2, 0.5],
            elevation: [0.0, 0.3],
            resources: ['tree', 'herb'],
            mobTypes: ['bandit', 'barbarian'],
            difficulty: 1,
            colorVariation: 0.3,
            textureScale: 1.2,
            normalStrength: 0.6
        });
        
        // Desert - Hot, dry
        this.biomes.set('desert', {
            name: 'Blasted Lands',
            baseColor: new THREE.Color(0x5a4a3a),
            temperature: [0.7, 1.0],
            moisture: [0.0, 0.2],
            elevation: [0.0, 0.4],
            resources: ['rare_ore'],
            mobTypes: [], // Loaded from JSON manifests
            difficulty: 3,
            colorVariation: 0.2,
            textureScale: 1.5,
            normalStrength: 1.0
        });
        
        // Swampland - Warm, very wet
        this.biomes.set('swampland', {
            name: 'Mistwood Valley',
            baseColor: new THREE.Color(0x3d5a47),
            temperature: [0.6, 0.9],
            moisture: [0.7, 1.0],
            elevation: [0.0, 0.2],
            resources: ['tree', 'herb', 'rare_herb'],
            mobTypes: ['goblin', 'bandit', 'swamp_creature'],
            difficulty: 1,
            colorVariation: 0.4,
            textureScale: 0.7,
            normalStrength: 1.4
        });
        
        // Wasteland - Variable temperature, very dry
        this.biomes.set('wasteland', {
            name: 'Goblin Wastes',
            baseColor: new THREE.Color(0x8b7355),
            temperature: [0.3, 0.8],
            moisture: [0.0, 0.3],
            elevation: [0.0, 0.5],
            resources: ['rock', 'ore'],
            mobTypes: [], // Loaded from JSON manifests
            difficulty: 1,
            colorVariation: 0.3,
            textureScale: 1.1,
            normalStrength: 0.9
        });
        
        // Mountain - High elevation
        this.biomes.set('mountain', {
            name: 'Mountain Peaks',
            baseColor: new THREE.Color(0x6b6b6b),
            temperature: [0.0, 0.4],
            moisture: [0.0, 0.6],
            elevation: [0.7, 1.0],
            resources: ['rock', 'gem', 'rare_ore'],
            mobTypes: ['mountain_troll'],
            difficulty: 3,
            colorVariation: 0.2,
            textureScale: 2.0,
            normalStrength: 2.0
        });
        
        // Water bodies
        this.biomes.set('water', {
            name: 'Lakes and Rivers',
            baseColor: new THREE.Color(0x4a90e2),
            temperature: [0.0, 1.0],
            moisture: [1.0, 1.0],
            elevation: [-0.2, 0.1],
            resources: ['fish'],
            mobTypes: [],
            difficulty: 0,
            colorVariation: 0.1,
            textureScale: 0.5,
            normalStrength: 0.3
        });
    }
    
    /**
     * Generate terrain geometry for a specific tile
     */
    generateTerrainGeometry(tileX: number, tileZ: number): {
        geometry: THREE.BufferGeometry;
        heightData: number[];
        biomeData: string[];
        features: TerrainFeature[];
    } {
        const resolution = this.config.resolution;
        const tileSize = this.config.tileSize;
        
        // Create base geometry
        const geometry = new THREE.PlaneGeometry(
            tileSize, tileSize, 
            resolution - 1, resolution - 1
        );
        geometry.rotateX(-Math.PI / 2);
        
        const positions = geometry.attributes.position;
        const colors = new Float32Array(positions.count * 3);
        const heightData: number[] = [];
        const biomeData: string[] = [];
        const features: TerrainFeature[] = [];
        
        // Generate height and biome data for each vertex
        for (let i = 0; i < positions.count; i++) {
            const localX = positions.getX(i);
            const localZ = positions.getZ(i);
            const worldX = tileX * tileSize + localX;
            const worldZ = tileZ * tileSize + localZ;
            
            // Generate terrain height using multiple noise layers
            const height = this.generateHeightAt(worldX, worldZ);
            positions.setY(i, height);
            heightData.push(height);
            
            // Determine biome based on climate and elevation
            const biome = this.getBiomeAt(worldX, worldZ, height);
            biomeData.push(biome);
            
            // Generate color based on biome and height
            const color = this.generateVertexColor(worldX, worldZ, height, biome);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        
        // Apply vertex colors
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        
        // Generate terrain features for this tile
        features.push(...this.generateTileFeatures(tileX, tileZ, heightData));
        
        return { geometry, heightData, biomeData, features };
    }
    
    /**
     * Generate realistic terrain height using multiple noise layers
     */
    private generateHeightAt(worldX: number, worldZ: number): number {
        const cacheKey = `${worldX.toFixed(1)},${worldZ.toFixed(1)}`;
        if (this.heightCache.has(cacheKey)) {
            return this.heightCache.get(cacheKey)!;
        }
        
        // Apply domain warping for more organic results
        const warped = this.noise.domainWarp2D(worldX, worldZ, 20);
        const x = warped.x;
        const z = warped.y;
        
        // Base terrain layer - large scale elevation
        const baseHeight = this.noise.fractal2D(
            x * this.config.baseScale, 
            z * this.config.baseScale, 
            6, 0.6, 2.0
        );
        
        // Mountain ridges - sharp peaks and valleys
        const ridgeHeight = this.noise.ridgeNoise2D(
            x * this.config.ridgeScale,
            z * this.config.ridgeScale
        );
        
        // Detail noise - small scale features
        const detailHeight = this.noise.fractal2D(
            x * this.config.detailScale,
            z * this.config.detailScale,
            4, 0.4, 2.5
        );
        
        // Erosion simulation for realistic valleys
        const erosionHeight = this.noise.erosionNoise2D(
            x * this.config.baseScale * 0.5,
            z * this.config.baseScale * 0.5,
            2
        );
        
        // Combine layers with smoother blending for more natural terrain
        let combinedHeight = 
            baseHeight * 0.8 +                    // Primary terrain shape (increased weight)
            ridgeHeight * Math.abs(ridgeHeight) * 0.15 + // Mountain ridges (less extreme)
            detailHeight * 0.08 +                 // Surface detail (reduced)
            erosionHeight * 0.05;                 // Erosion effects (reduced)
        
        // Apply smoothness constraints - limit extreme variations
        const smoothnessFactor = 0.8; // How much to smooth the terrain (0.0 = no smoothing, 1.0 = maximum smoothing)
        combinedHeight = this.applySmoothness(combinedHeight, smoothnessFactor);
        
        // Apply altitude-based modifications (more gradual)
        const climate = this.getClimateAt(worldX, worldZ);
        if (climate.temperature < 0.3) {
            // Cold regions tend to be more mountainous but not excessively so
            combinedHeight *= 1.1; // Reduced from 1.2
        }
        
        // Normalize and scale to world height with better constraints
        combinedHeight = Math.max(-0.15, Math.min(0.85, combinedHeight));
        const finalHeight = Math.max(0, combinedHeight * this.config.maxHeight);
        
        this.heightCache.set(cacheKey, finalHeight);
        return finalHeight;
    }
    
    /**
     * Apply smoothness constraints to terrain height to prevent extreme variations
     */
    private applySmoothness(height: number, smoothnessFactor: number): number {
        if (smoothnessFactor <= 0) return height;
        
        // Apply sigmoid-like smoothing to compress extreme values
        const sigmoid = (x: number) => 2 / (1 + Math.exp(-2 * x)) - 1;
        
        // Scale input to reasonable range for sigmoid
        const scaledHeight = height * 2; // Scale to roughly [-2, 2] range
        const smoothedHeight = sigmoid(scaledHeight) * smoothnessFactor + height * (1 - smoothnessFactor);
        
        // Additional constraint: limit rate of change
        const maxGradient = 0.3; // Maximum allowed slope as ratio of height change
        return Math.max(-maxGradient, Math.min(maxGradient, smoothedHeight));
    }
    
    /**
     * Determine biome based on climate and elevation
     */
    private getBiomeAt(worldX: number, worldZ: number, elevation: number): string {
        const cacheKey = `${worldX.toFixed(2)},${worldZ.toFixed(2)}`;
        if (this.biomeCache.has(cacheKey)) {
            return this.biomeCache.get(cacheKey)!;
        }
        
        const climate = this.getClimateAt(worldX, worldZ);
        const normalizedElevation = elevation / this.config.maxHeight;
        
        // Water bodies
        if (elevation < this.config.waterLevel) {
            this.biomeCache.set(cacheKey, 'water');
            return 'water';
        }
        
        // Find best matching biome based on climate and elevation
        let bestBiome = 'grasslands';
        let bestScore = -1;
        
        for (const [biomeName, biome] of this.biomes) {
            if (biomeName === 'water') continue;
            
            // Calculate compatibility score
            const tempScore = this.calculateCompatibility(
                climate.temperature, biome.temperature[0], biome.temperature[1]
            );
            const moistureScore = this.calculateCompatibility(
                climate.moisture, biome.moisture[0], biome.moisture[1]
            );
            const elevationScore = this.calculateCompatibility(
                normalizedElevation, biome.elevation[0], biome.elevation[1]
            );
            
            const totalScore = tempScore * moistureScore * elevationScore;
            
            if (totalScore > bestScore) {
                bestScore = totalScore;
                bestBiome = biomeName;
            }
        }
        
        this.biomeCache.set(cacheKey, bestBiome);
        return bestBiome;
    }
    
    /**
     * Calculate climate data (temperature and moisture) for a position
     * Note: This method avoids calling generateHeightAt to prevent circular dependency
     */
    private getClimateAt(worldX: number, worldZ: number): { temperature: number, moisture: number } {
        const cacheKey = `${worldX.toFixed(5)},${worldZ.toFixed(5)}`;
        if (this.climateCache.has(cacheKey)) {
            return this.climateCache.get(cacheKey)!;
        }
        
        // Temperature based on latitude (distance from equator)
        const latitude = (worldZ - this.config.equatorZ) / 1000; // Normalize to world scale
        const baseTemperature = 1.0 - Math.abs(latitude) * this.config.temperatureRange;
        
        // Add basic elevation cooling using simple noise (avoid circular dependency)
        const simpleElevationNoise = this.noise.fractal2D(worldX * this.config.baseScale, worldZ * this.config.baseScale, 3);
        const estimatedElevation = Math.max(0, simpleElevationNoise * this.config.maxHeight);
        const elevationCooling = Math.max(0, estimatedElevation - 10) * 0.008; // Cool by altitude
        
        // Add noise variation
        const temperatureNoise = this.noise.fractal2D(worldX * 0.001, worldZ * 0.001, 3) * 0.2;
        
        const temperature = Math.max(0, Math.min(1, 
            baseTemperature - elevationCooling + temperatureNoise
        ));
        
        // Moisture from noise patterns (simulating wind patterns and geography)
        const moisture = Math.max(0, Math.min(1,
            this.noise.moistureMap(worldX, worldZ) * this.config.moistureVariation
        ));
        
        const result = { temperature, moisture };
        this.climateCache.set(cacheKey, result);
        return result;
    }
    
    /**
     * Generate vertex color based on biome and environmental factors
     */
    private generateVertexColor(worldX: number, worldZ: number, height: number, biomeName: string): THREE.Color {
        const biome = this.biomes.get(biomeName);
        if (!biome) return new THREE.Color(0x888888);
        
        const color = biome.baseColor.clone();
        
        // Apply height-based color modifications
        const normalizedHeight = height / this.config.maxHeight;
        
        // Snow at high elevations
        if (height > this.config.snowlineHeight) {
            const snowFactor = Math.min(1, (height - this.config.snowlineHeight) / 20);
            const snowColor = new THREE.Color(0xf0f8ff);
            color.lerp(snowColor, snowFactor * 0.8);
        }
        
        // Darker colors at very high elevations (rock exposure)
        if (normalizedHeight > 0.7) {
            const rockFactor = (normalizedHeight - 0.7) / 0.3;
            const rockColor = new THREE.Color(0x4a4a4a);
            color.lerp(rockColor, rockFactor * 0.6);
        }
        
        // Water color variations based on depth
        if (biomeName === 'water') {
            const depth = Math.max(0, this.config.waterLevel - height);
            const deepWaterColor = new THREE.Color(0x1e3a5f);
            color.lerp(deepWaterColor, Math.min(1, depth / 5));
        }
        
        // Add subtle noise variation within biome
        const colorNoise = this.noise.fractal2D(worldX * 0.1, worldZ * 0.1, 2) * biome.colorVariation;
        color.multiplyScalar(1 + colorNoise);
        
        // Clamp color values
        color.r = Math.max(0, Math.min(1, color.r));
        color.g = Math.max(0, Math.min(1, color.g));
        color.b = Math.max(0, Math.min(1, color.b));
        
        return color;
    }
    
    /**
     * Generate terrain features for a tile
     */
    private generateTileFeatures(tileX: number, tileZ: number, heightData: number[]): TerrainFeature[] {
        const features: TerrainFeature[] = [];
        const resolution = this.config.resolution;
        
        // Generate heightmap for feature detection
        const heightmap: number[][] = [];
        for (let z = 0; z < resolution; z++) {
            heightmap[z] = [];
            for (let x = 0; x < resolution; x++) {
                const index = z * resolution + x;
                heightmap[z][x] = heightData[index] / this.config.maxHeight;
            }
        }
        
        // Generate river and lake features
        const waterFeatures = this.featureGenerator.generateRiverNetwork(heightmap, resolution, resolution);
        
        // Convert to world coordinates
        for (const river of waterFeatures.rivers) {
            features.push({
                type: 'river',
                position: new THREE.Vector2(
                    tileX * this.config.tileSize + river.x * this.config.tileSize,
                    tileZ * this.config.tileSize + river.y * this.config.tileSize
                ),
                properties: { flow: river.flow }
            });
        }
        
        for (const lake of waterFeatures.lakes) {
            features.push({
                type: 'lake',
                position: new THREE.Vector2(
                    tileX * this.config.tileSize + lake.x * this.config.tileSize,
                    tileZ * this.config.tileSize + lake.y * this.config.tileSize
                ),
                properties: { radius: lake.radius * this.config.tileSize }
            });
        }
        
        // Detect mountain peaks
        for (let z = 1; z < resolution - 1; z++) {
            for (let x = 1; x < resolution - 1; x++) {
                const height = heightmap[z][x];
                if (height > 0.7) { // High elevation
                    const neighbors = [
                        heightmap[z-1][x], heightmap[z+1][x],
                        heightmap[z][x-1], heightmap[z][x+1]
                    ];
                    
                    // Check if this is a local maximum
                    if (neighbors.every(h => h < height)) {
                        features.push({
                            type: 'mountain_peak',
                            position: new THREE.Vector2(
                                tileX * this.config.tileSize + (x / resolution) * this.config.tileSize,
                                tileZ * this.config.tileSize + (z / resolution) * this.config.tileSize
                            ),
                            properties: { height: height * this.config.maxHeight }
                        });
                    }
                }
            }
        }
        
        return features;
    }
    
    /**
     * Calculate compatibility score between value and range
     */
    private calculateCompatibility(value: number, min: number, max: number): number {
        if (value < min) return Math.max(0, 1 - (min - value) * 2);
        if (value > max) return Math.max(0, 1 - (value - max) * 2);
        return 1.0; // Perfect match within range
    }
    
    /**
     * Get biome information for external use
     */
    getBiomeInfo(biomeName: string): BiomeDefinition | undefined {
        return this.biomes.get(biomeName);
    }
    
    /**
     * Get all available biomes
     */
    getAllBiomes(): Map<string, BiomeDefinition> {
        return new Map(this.biomes);
    }
    
    /**
     * Clear caches to free memory
     */
    clearCaches(): void {
        this.heightCache.clear();
        this.biomeCache.clear();
        this.climateCache.clear();
    }
}