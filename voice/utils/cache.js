/**
 * NAZAR Client-side Bounded LRU Cache
 * v1.0.0
 */
import { voiceConfig } from './voiceConfig.js';

export class LRUCache {
    constructor(limit = voiceConfig.cacheSize) {
        this.limit = limit;
        this.cache = new Map();
    }

    /**
     * Retrieves an item from the cache and updates its recency status
     * @param {string} key 
     * @returns {*} Cached item value or undefined
     */
    get(key) {
        if (!this.cache.has(key)) return undefined;

        const val = this.cache.get(key);
        // Delete and re-insert to mark as most recently used
        this.cache.delete(key);
        this.cache.set(key, val);
        return val;
    }

    /**
     * Stores an item in the cache, purging the least recently used if exceeding bounds
     * @param {string} key 
     * @param {*} value 
     */
    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.limit) {
            // Evict oldest entry (the first item in the Map iterator)
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
            console.log(`[LRUCache] Evicted oldest key: "${oldestKey}"`);
        }
        this.cache.set(key, value);
    }

    /**
     * Clears cache contents
     */
    clear() {
        this.cache.clear();
    }
}

// Export single instance
export const lruCache = new LRUCache();
