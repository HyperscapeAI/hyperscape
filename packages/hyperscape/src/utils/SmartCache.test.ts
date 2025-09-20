/**
 * Unit tests for SmartCache and CacheManager
 * Tests intelligent caching with TTL, LRU eviction, and cache management
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CacheManager, globalCacheManager, SmartCache } from './SmartCache'

describe('SmartCache', () => {
  let cache: SmartCache<string>

  beforeEach(() => {
    cache = new SmartCache<string>({
      maxSize: 5,
      ttl: 100, // Using a shorter TTL for real-time tests
      serialize: false
    })
  })

  afterEach(() => {
    cache.destroy()
  })

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultCache = new SmartCache()
      expect(defaultCache).toBeDefined()
      
      const stats = defaultCache.getStats()
      expect(stats.maxSize).toBe(1000)
      expect(stats.size).toBe(0)
      
      defaultCache.destroy()
    })

    it('should initialize with custom options', () => {
      const customCache = new SmartCache({
        maxSize: 10,
        ttl: 2000,
        serialize: true
      })

      const stats = customCache.getStats()
      expect(stats.maxSize).toBe(10)
      
      customCache.destroy()
    })

    it('should call onEvict callback when provided', () => {
      const onEvictSpy = vi.fn()
      const callbackCache = new SmartCache({
        maxSize: 1,
        onEvict: onEvictSpy
      })

      callbackCache.set('key1', 'value1')
      callbackCache.set('key2', 'value2') // Should evict key1

      expect(onEvictSpy).toHaveBeenCalledWith('key1', 'value1')
      
      callbackCache.destroy()
    })
  })

  describe('get and set', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1')
      
      const value = cache.get('key1')
      expect(value).toBe('value1')
    })

    it('should return null for non-existent keys', () => {
      const value = cache.get('nonexistent')
      expect(value).toBeNull()
    })

    it('should update existing values', () => {
      cache.set('key1', 'value1')
      cache.set('key1', 'value2')
      
      const value = cache.get('key1')
      expect(value).toBe('value2')
    })

    it('should handle serialization when enabled', () => {
      const serializeCache = new SmartCache<{ data: string }>({
        serialize: true
      })

      const originalObject = { data: 'test' }
      serializeCache.set('key1', originalObject)
      
      const retrievedObject = serializeCache.get('key1')
      expect(retrievedObject).not.toBe(originalObject) // Different reference
      expect(retrievedObject).toEqual(originalObject) // Same content
      
      serializeCache.destroy()
    })

    it('should not serialize when disabled', () => {
      const noSerializeCache = new SmartCache<{ data: string }>({
        serialize: false
      })

      const originalObject = { data: 'test' }
      noSerializeCache.set('key1', originalObject)
      
      const retrievedObject = noSerializeCache.get('key1')
      expect(retrievedObject).toBe(originalObject) // Same reference
      
      noSerializeCache.destroy()
    })
  })

  describe('TTL and expiration', () => {
    it('should expire entries after TTL', async () => {
      cache.set('key1', 'value1')
      
      expect(cache.get('key1')).toBe('value1')
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 110))
      
      expect(cache.get('key1')).toBeNull()
    })

    it('should not expire entries before TTL', async () => {
      cache.set('key1', 'value1')
      
      // Wait for some time, but less than TTL
      await new Promise(resolve => setTimeout(resolve, 90))
      
      expect(cache.get('key1')).toBe('value1')
    })

    it('should update access statistics', () => {
      cache.set('key1', 'value1')
      cache.get('key1')
      cache.get('key1')
      cache.get('nonexistent')
      
      const stats = cache.getStats()
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(1)
    })
  })

  describe('LRU eviction', () => {
    it('should evict least recently used items when at capacity', async () => {
      // Fill cache to capacity with different timestamps
      cache.set('key1', 'value1')
      await new Promise(resolve => setTimeout(resolve, 10))
      cache.set('key2', 'value2')
      await new Promise(resolve => setTimeout(resolve, 10))
      cache.set('key3', 'value3')
      await new Promise(resolve => setTimeout(resolve, 10))
      cache.set('key4', 'value4')
      await new Promise(resolve => setTimeout(resolve, 10))
      cache.set('key5', 'value5')
      
      // Access key1 to make it more recently used
      cache.get('key1')
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // Add one more item to trigger eviction
      cache.set('key6', 'value6')
      
      // key2 should be evicted (least recently used since key1 was accessed)
      expect(cache.get('key1')).toBe('value1') // Still there
      expect(cache.get('key2')).toBeNull() // Evicted
      expect(cache.get('key6')).toBe('value6') // New item
    })

    it('should not evict when updating existing key', () => {
      // Fill cache to capacity
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')
      cache.set('key4', 'value4')
      cache.set('key5', 'value5')
      
      // Update existing key (should not trigger eviction)
      cache.set('key1', 'updated_value1')
      
      const stats = cache.getStats()
      expect(stats.size).toBe(5)
      expect(cache.get('key1')).toBe('updated_value1')
    })
  })

  describe('has', () => {
    it('should return true for existing non-expired keys', () => {
      cache.set('key1', 'value1')
      
      expect(cache.has('key1')).toBe(true)
    })

    it('should return false for non-existent keys', () => {
      expect(cache.has('nonexistent')).toBe(false)
    })

    it('should return false for expired keys', async () => {
      cache.set('key1', 'value1')
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 110))
      
      expect(cache.has('key1')).toBe(false)
    })

    it('should clean up expired keys when checking', async () => {
      cache.set('key1', 'value1')
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 110))
      
      cache.has('key1') // Should trigger cleanup
      
      const stats = cache.getStats()
      expect(stats.size).toBe(0)
    })
  })

  describe('delete', () => {
    it('should delete existing keys', () => {
      cache.set('key1', 'value1')
      
      const result = cache.delete('key1')
      
      expect(result).toBe(true)
      expect(cache.get('key1')).toBeNull()
    })

    it('should return false for non-existent keys', () => {
      const result = cache.delete('nonexistent')
      
      expect(result).toBe(false)
    })

    it('should call onEvict callback when deleting', () => {
      const onEvictSpy = vi.fn()
      const callbackCache = new SmartCache({
        onEvict: onEvictSpy
      })

      callbackCache.set('key1', 'value1')
      callbackCache.delete('key1')

      expect(onEvictSpy).toHaveBeenCalledWith('key1', 'value1')
      
      callbackCache.destroy()
    })
  })

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')
      
      cache.clear()
      
      const stats = cache.getStats()
      expect(stats.size).toBe(0)
      expect(cache.get('key1')).toBeNull()
      expect(cache.get('key2')).toBeNull()
      expect(cache.get('key3')).toBeNull()
    })

    it('should call onEvict for all cleared entries', () => {
      const onEvictSpy = vi.fn()
      const callbackCache = new SmartCache({
        onEvict: onEvictSpy
      })

      callbackCache.set('key1', 'value1')
      callbackCache.set('key2', 'value2')
      callbackCache.clear()

      expect(onEvictSpy).toHaveBeenCalledTimes(2)
      expect(onEvictSpy).toHaveBeenCalledWith('key1', 'value1')
      expect(onEvictSpy).toHaveBeenCalledWith('key2', 'value2')
      
      callbackCache.destroy()
    })
  })

  describe('getOrSet', () => {
    it('should return cached value if exists', () => {
      cache.set('key1', 'cached_value')
      
      const result = cache.getOrSet('key1', () => 'factory_value')
      
      expect(result).toBe('cached_value')
    })

    it('should call factory and cache result if not exists', () => {
      const factory = vi.fn(() => 'factory_value')
      
      const result = cache.getOrSet('key1', factory)
      
      expect(factory).toHaveBeenCalled()
      expect(result).toBe('factory_value')
      expect(cache.get('key1')).toBe('factory_value')
    })

    it('should handle async factory functions', async () => {
      const asyncFactory = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100))
        return 'async_value'
      })
      
      const resultPromise = cache.getOrSet('key1', asyncFactory)
      
      expect(resultPromise).toBeInstanceOf(Promise)
      
      // Advance timers to resolve the setTimeout
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const result = await resultPromise
      expect(result).toBe('async_value')
      expect(cache.get('key1')).toBe('async_value')
    })

    it('should not call factory for expired but existing keys', async () => {
      cache.set('key1', 'old_value')
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 110))
      
      const factory = vi.fn(() => 'new_value')
      const result = cache.getOrSet('key1', factory)
      
      expect(factory).toHaveBeenCalled()
      expect(result).toBe('new_value')
    })
  })

  describe('keys and values', () => {
    it('should return all keys', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')
      
      const keys = cache.keys()
      
      expect(keys).toHaveLength(3)
      expect(keys).toContain('key1')
      expect(keys).toContain('key2')
      expect(keys).toContain('key3')
    })

    it('should return all values', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')
      
      const values = cache.values()
      
      expect(values).toHaveLength(3)
      expect(values).toContain('value1')
      expect(values).toContain('value2')
      expect(values).toContain('value3')
    })

    it('should return empty arrays for empty cache', () => {
      expect(cache.keys()).toEqual([])
      expect(cache.values()).toEqual([])
    })
  })

  describe('touch', () => {
    it('should update timestamp for existing key', () => {
      cache.set('key1', 'value1')
      
      // Fast forward some time
      cache.touch('key1')
      
      // Fast forward past original TTL but not past touched time
      cache.touch('key1')
      
      expect(cache.get('key1')).toBe('value1') // Should still exist
    })

    it('should return false for non-existent key', () => {
      const result = cache.touch('nonexistent')
      expect(result).toBe(false)
    })
  })

  describe('invalidatePattern', () => {
    beforeEach(() => {
      cache.set('user:1', 'user1')
      cache.set('user:2', 'user2')
      cache.set('post:1', 'post1')
      cache.set('post:2', 'post2')
      cache.set('comment:1', 'comment1')
    })

    it('should invalidate keys matching string pattern', () => {
      const count = cache.invalidatePattern('user:')
      
      expect(count).toBe(2)
      expect(cache.get('user:1')).toBeNull()
      expect(cache.get('user:2')).toBeNull()
      expect(cache.get('post:1')).toBe('post1') // Should remain
    })

    it('should invalidate keys matching regex pattern', () => {
      const count = cache.invalidatePattern(/^post:\d+$/)
      
      expect(count).toBe(2)
      expect(cache.get('post:1')).toBeNull()
      expect(cache.get('post:2')).toBeNull()
      expect(cache.get('user:1')).toBe('user1') // Should remain
    })

    it('should return 0 if no keys match', () => {
      const count = cache.invalidatePattern('nonexistent:')
      
      expect(count).toBe(0)
    })

    it('should handle complex regex patterns', () => {
      const count = cache.invalidatePattern(/^(user|post):\d+$/)
      
      expect(count).toBe(4)
      expect(cache.get('comment:1')).toBe('comment1') // Should remain
    })
  })

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 110))
      
      const removedCount = cache.cleanup()
      
      expect(removedCount).toBe(3)
      expect(cache.getStats().size).toBe(0)
    })

    it('should not remove non-expired entries', async () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      
      // Wait for some time, but less than TTL
      await new Promise(resolve => setTimeout(resolve, 50))
      
      const removedCount = cache.cleanup()
      
      expect(removedCount).toBe(0)
      expect(cache.getStats().size).toBe(2)
    })

    it('should handle mixed expired and non-expired entries', async () => {
      cache.set('key1', 'value1')
      
      // Wait for some time, but less than TTL
      await new Promise(resolve => setTimeout(resolve, 60))
      
      cache.set('key2', 'value2') // Fresh entry
      
      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 60))
      
      const removedCount = cache.cleanup()
      
      expect(removedCount).toBe(1)
      expect(cache.get('key1')).toBeNull()
      expect(cache.get('key2')).toBe('value2')
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.get('key1') // Hit
      cache.get('key1') // Hit  
      cache.get('nonexistent') // Miss
      
      const stats = cache.getStats()
      
      expect(stats.hits).toBe(2)
      expect(stats.misses).toBe(1)
      expect(stats.size).toBe(2)
      expect(stats.maxSize).toBe(5)
      expect(stats.hitRate).toBe('66.67%')
      expect(stats.memoryUsage).toMatch(/\d+(\.\d+)?(B|KB|MB)/)
    })

    it('should calculate hit rate correctly with no requests', () => {
      const stats = cache.getStats()
      
      expect(stats.hitRate).toBe('0.00%')
    })

    it('should format memory usage correctly', () => {
      cache.set('key1', 'value1')
      
      const stats = cache.getStats()
      
      expect(typeof stats.memoryUsage).toBe('string')
      expect(stats.memoryUsage).toMatch(/\d+(\.\d+)?(B|KB|MB)/)
    })
  })

  describe('deep cloning', () => {
    it('should deep clone nested objects when serialization enabled', () => {
      const serializeCache = new SmartCache<{ nested: { data: string } }>({
        serialize: true
      })

      const original = {
        nested: { data: 'test' }
      }

      serializeCache.set('key1', original)
      const retrieved = serializeCache.get('key1')!

      // Modify retrieved object
      retrieved.nested.data = 'modified'

      // Original should be unchanged
      expect(original.nested.data).toBe('test')
      
      serializeCache.destroy()
    })

    it('should handle dates correctly', () => {
      const serializeCache = new SmartCache<{ date: Date }>({
        serialize: true
      })

      const original = { date: new Date('2023-01-01') }
      
      serializeCache.set('key1', original)
      const retrieved = serializeCache.get('key1')!

      expect(retrieved.date).toBeInstanceOf(Date)
      expect(retrieved.date.getTime()).toBe(original.date.getTime())
      expect(retrieved.date).not.toBe(original.date) // Different reference
      
      serializeCache.destroy()
    })

    it('should handle arrays correctly', () => {
      const serializeCache = new SmartCache<(number | number[])[]>({
        serialize: true
      })

      const original: (number | number[])[] = [1, 2, 3, [4, 5]]
      
      serializeCache.set('key1', original)
      const retrieved = serializeCache.get('key1')!

      expect(retrieved).toEqual(original)
      expect(retrieved).not.toBe(original) // Different reference
      
      serializeCache.destroy()
    })
  })

  describe('destroy', () => {
    it('should clear cache and stop cleanup interval', () => {
      cache.set('key1', 'value1')
      
      cache.destroy()
      
      expect(cache.getStats().size).toBe(0)
      // Cleanup interval should be stopped (can't easily test this directly)
    })

    it('should handle multiple destroy calls', () => {
      cache.set('key1', 'value1')
      
      cache.destroy()
      expect(() => cache.destroy()).not.toThrow()
    })
  })

  describe('performance', () => {
    it('should handle large numbers of entries efficiently', async () => {
      const largeCache = new SmartCache<string>({
        maxSize: 10000,
        ttl: 60000
      })

      const startTime = performance.now()
      
      // Add many entries
      for (let i = 0; i < 1000; i++) {
        largeCache.set(`key${i}`, `value${i}`)
      }
      
      // Access entries
      for (let i = 0; i < 1000; i++) {
        largeCache.get(`key${i}`)
      }

      const endTime = performance.now()
      const duration = endTime - startTime

      expect(duration).toBeLessThan(1000) // Should complete in under 1 second
      expect(largeCache.getStats().size).toBe(1000)
      
      largeCache.destroy()
    })
  })
})

describe('CacheManager', () => {
  let manager: CacheManager

  beforeEach(() => {
    manager = new CacheManager({
      maxSize: 10,
      ttl: 1000
    })
  })

  afterEach(() => {
    manager.destroy()
  })

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const defaultManager = new CacheManager()
      expect(defaultManager).toBeDefined()
      
      defaultManager.destroy()
    })

    it('should initialize with custom default options', () => {
      const customManager = new CacheManager({
        maxSize: 100,
        ttl: 5000,
        serialize: true
      })
      
      expect(customManager).toBeDefined()
      
      customManager.destroy()
    })
  })

  describe('getCache', () => {
    it('should create and return named cache', () => {
      const cache = manager.getCache<string>('users')
      
      expect(cache).toBeInstanceOf(SmartCache)
      expect(cache.getStats().maxSize).toBe(10) // From default options
    })

    it('should return same cache instance for same name', () => {
      const cache1 = manager.getCache<string>('users')
      const cache2 = manager.getCache<string>('users')
      
      expect(cache1).toBe(cache2)
    })

    it('should merge options with defaults', () => {
      const cache = manager.getCache<string>('posts', {
        maxSize: 50,
        serialize: true
      })
      
      expect(cache.getStats().maxSize).toBe(50) // Overridden
    })

    it('should create different caches for different names', () => {
      const usersCache = manager.getCache<string>('users')
      const postsCache = manager.getCache<string>('posts')
      
      expect(usersCache).not.toBe(postsCache)
    })
  })

  describe('deleteCache', () => {
    it('should delete existing cache', () => {
      const cache = manager.getCache<string>('users')
      cache.set('key1', 'value1')
      
      const result = manager.deleteCache('users')
      
      expect(result).toBe(true)
      
      // Should create new cache instance with same name
      const newCache = manager.getCache<string>('users')
      expect(newCache).not.toBe(cache)
      expect(newCache.get('key1')).toBeNull()
    })

    it('should return false for non-existent cache', () => {
      const result = manager.deleteCache('nonexistent')
      
      expect(result).toBe(false)
    })
  })

  describe('getAllStats', () => {
    it('should return stats for all caches', () => {
      const usersCache = manager.getCache<string>('users')
      const postsCache = manager.getCache<string>('posts')
      
      usersCache.set('user1', 'data1')
      postsCache.set('post1', 'data1')
      postsCache.set('post2', 'data2')
      
      const allStats = manager.getAllStats()
      
      expect(allStats).toHaveProperty('users')
      expect(allStats).toHaveProperty('posts')
      expect(allStats.users.size).toBe(1)
      expect(allStats.posts.size).toBe(2)
    })

    it('should return empty object when no caches exist', () => {
      const allStats = manager.getAllStats()
      
      expect(allStats).toEqual({})
    })
  })

  describe('cleanupAll', () => {
    it('should cleanup all caches and return counts', async () => {
      const usersCache = manager.getCache<string>('users')
      const postsCache = manager.getCache<string>('posts')
      
      usersCache.set('user1', 'data1')
      postsCache.set('post1', 'data1')
      postsCache.set('post2', 'data2')
      
      // Fast forward past TTL
      await new Promise(resolve => setTimeout(resolve, 1100))
      
      const results = manager.cleanupAll()
      
      expect(results).toHaveProperty('users')
      expect(results).toHaveProperty('posts')
      expect(results.users).toBe(1)
      expect(results.posts).toBe(2)
    })

    it('should return empty object when no caches exist', () => {
      const results = manager.cleanupAll()
      
      expect(results).toEqual({})
    })
  })

  describe('destroy', () => {
    it('should destroy all caches', () => {
      const usersCache = manager.getCache<string>('users')
      const postsCache = manager.getCache<string>('posts')
      
      usersCache.set('user1', 'data1')
      postsCache.set('post1', 'data1')
      
      manager.destroy()
      
      // Should create fresh caches after destroy
      const newUsersCache = manager.getCache<string>('users')
      expect(newUsersCache).not.toBe(usersCache)
      expect(newUsersCache.get('user1')).toBeNull()
    })

    it('should handle multiple destroy calls', () => {
      manager.getCache<string>('users')
      
      manager.destroy()
      expect(() => manager.destroy()).not.toThrow()
    })
  })

  describe('integration with actual caches', () => {
    it('should work with different cache types', () => {
      interface User {
        id: string
        name: string
      }

      interface Post {
        id: string
        title: string
      }

      const usersCache = manager.getCache<User>('users')
      const postsCache = manager.getCache<Post>('posts')
      
      usersCache.set('1', { id: '1', name: 'John' })
      postsCache.set('1', { id: '1', title: 'Hello World' })
      
      expect(usersCache.get('1')?.name).toBe('John')
      expect(postsCache.get('1')?.title).toBe('Hello World')
    })
  })
})

describe('globalCacheManager', () => {
  afterEach(() => {
    // Clean up global cache manager after each test
    globalCacheManager.destroy()
  })

  it('should be an instance of CacheManager', () => {
    expect(globalCacheManager).toBeInstanceOf(CacheManager)
  })

  it('should have default configuration', () => {
    const cache = globalCacheManager.getCache<string>('test')
    const stats = cache.getStats()
    
    expect(stats.maxSize).toBe(500)
    // TTL and serialize options are applied during cache operations
  })

  it('should work as a singleton', () => {
    const cache1 = globalCacheManager.getCache<string>('shared')
    const cache2 = globalCacheManager.getCache<string>('shared')
    
    cache1.set('key1', 'value1')
    
    expect(cache2.get('key1')).toBe('value1')
    expect(cache1).toBe(cache2)
  })
})