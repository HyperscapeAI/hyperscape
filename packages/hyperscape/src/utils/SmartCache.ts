
/**
 * Smart Caching System
 * Provides intelligent caching with TTL, LRU eviction, and cache invalidation
 */

export interface CacheOptions<T> {
  maxSize?: number; // Maximum number of items in cache
  ttl?: number; // Time to live in milliseconds
  onEvict?: (key: string, value: T) => void; // Called when item is evicted
  serialize?: boolean; // Whether to deep clone values
}

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  maxSize: number;
  hitRate: string;
  memoryUsage: string;
}

export class SmartCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private options: Required<CacheOptions<T>>;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    sets: 0
  };

  constructor(options: CacheOptions<T> = {}) {
    this.options = {
      maxSize: options.maxSize || 1000,
      ttl: options.ttl || 5 * 60 * 1000, // 5 minutes default
      onEvict: options.onEvict || (() => {}),
      serialize: options.serialize || false
    };

    // Start cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Get current time - mockable for testing
   */
  private getCurrentTime(): number {
    return Date.now();
  }

  /**
   * Get value from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }

    // Update access statistics and move to front for LRU
    entry.lastAccessed = this.getCurrentTime();
    entry.accessCount++;
    // Re-insert to update order for LRU
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.stats.hits++;

    // Return cloned value if serialization is enabled
    return this.options.serialize ? this.deepClone(entry.value) : entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T): void {
    if (this.cache.size >= this.options.maxSize && !this.cache.has(key)) {
      this._evict();
    }
    const now = this.getCurrentTime();
    const entry: CacheEntry<T> = {
      value: this.options.serialize ? this.deepClone(value) : value,
      timestamp: now,
      lastAccessed: now,
      accessCount: 1
    };
    this.cache.set(key, entry);
    this.stats.sets++;
  }

  /**
   * Get or set with factory function
   */
  getOrSet(key: string, factory: () => T | Promise<T>): T | Promise<T> {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const result = factory();
    
    // Handle async factories
    if (result instanceof Promise) {
      // prevent dogpiling
      this.set(key, result as unknown as T);
      return result.then((value) => {
        this.set(key, value);
        return value;
      }).catch(err => {
        this.delete(key);
        throw err;
      });
    }

    this.set(key, result);
    return result;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Delete specific key
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.options.onEvict(key, entry.value);
      this.stats.evictions++;
    }
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    for (const [key, entry] of this.cache.entries()) {
      this.options.onEvict(key, entry.value);
      this.stats.evictions++;
    }
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : '0.00';

    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.options.maxSize,
      hitRate: `${hitRate}%`,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * Get all keys in cache
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all values in cache
   */
  values(): T[] {
    return Array.from(this.cache.values()).map(entry => entry.value);
  }

  /**
   * Update TTL for specific key
   */
  touch(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    entry.timestamp = this.getCurrentTime();
    entry.lastAccessed = this.getCurrentTime();
    return true;
  }

  /**
   * Invalidate all entries matching pattern
   */
  invalidatePattern(pattern: string | RegExp): number {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let count = 0;
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.delete(key);
        count++;
      }
    }
    
    return count;
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): number {
    let removedCount = 0;
    const now = this.getCurrentTime();
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.options.ttl) {
        this.delete(key);
        removedCount++;
      }
    }
    
    return removedCount;
  }

  /**
   * Destroy cache and stop cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }

  private isExpired(entry: CacheEntry<T>): boolean {
    return this.getCurrentTime() - entry.timestamp > this.options.ttl;
  }

  private _evict(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.delete(oldestKey);
    }
  }

  private startCleanupInterval(): void {
    // Skip interval in test environment
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return;
    }

    // Run cleanup every 2 minutes to reduce resource usage
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 120000);
  }

  private deepClone<U>(obj: U): U {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (obj instanceof Date) {
      return new Date(obj.getTime()) as unknown as U;
    }
    
    if (obj instanceof Array) {
      return obj.map(item => this.deepClone(item)) as unknown as U;
    }
    
    if (typeof obj === 'object') {
      const cloned = {} as U;
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          (cloned as Record<string, unknown>)[key] = this.deepClone((obj as Record<string, unknown>)[key]);
        }
      }
      return cloned;
    }
    
    return obj;
  }

  private estimateMemoryUsage(): string {
    let size = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      size += key.length * 2; // String is UTF-16
      try {
        size += JSON.stringify(entry).length * 2;
      } catch {
        // cannot serialize, maybe a promise
      }
    }
    
    if (size < 1024) return `${size}B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)}KB`;
    return `${(size / (1024 * 1024)).toFixed(2)}MB`;
  }
}

/**
 * Cache Manager for multiple named caches
 */
export class CacheManager {
  private caches = new Map<string, SmartCache<unknown>>();
  private defaultOptions: CacheOptions<unknown>;

  constructor(defaultOptions: CacheOptions<unknown> = {}) {
    this.defaultOptions = defaultOptions;
  }

  /**
   * Get or create a named cache
   */
  getCache<T>(name: string, options?: CacheOptions<T>): SmartCache<T> {
    if (!this.caches.has(name)) {
      const mergedOptions = { ...this.defaultOptions, ...options };
      this.caches.set(name, new SmartCache<T>(mergedOptions) as SmartCache<unknown>);
    }
    return this.caches.get(name)! as SmartCache<T>;
  }

  /**
   * Delete a named cache
   */
  deleteCache(name: string): boolean {
    const cache = this.caches.get(name);
    if (cache) {
      cache.destroy();
      return this.caches.delete(name);
    }
    return false;
  }

  /**
   * Get statistics for all caches
   */
  getAllStats(): Record<string, CacheStats> {
    const stats: Record<string, CacheStats> = {};
    for (const [name, cache] of this.caches.entries()) {
      stats[name] = cache.getStats();
    }
    return stats;
  }

  /**
   * Cleanup all caches
   */
  cleanupAll(): Record<string, number> {
    const results: Record<string, number> = {};
    for (const [name, cache] of this.caches.entries()) {
      results[name] = cache.cleanup();
    }
    return results;
  }

  /**
   * Destroy all caches
   */
  destroy(): void {
    for (const cache of this.caches.values()) {
      cache.destroy();
    }
    this.caches.clear();
  }
}

// Global cache manager instance
export const globalCacheManager = new CacheManager({
  maxSize: 500,
  ttl: 5 * 60 * 1000, // 5 minutes
  serialize: true
});
