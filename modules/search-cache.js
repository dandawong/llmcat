/**
 * Search Cache Module
 *
 * Provides intelligent caching for search results with LRU eviction,
 * TTL support, and memory optimization for the LLMLog Chrome extension.
 */

import { createLogger } from './logger.js';

const logger = createLogger('search-cache');

class SearchCache {
    constructor() {
        this.cache = new Map();
        this.maxSize = 200;
        this.defaultTTL = 5 * 60 * 1000; // 5 minutes
        this.hitCount = 0;
        this.missCount = 0;
        this.evictionCount = 0;
        
        // Memory optimization settings
        this.maxContentLength = 500; // Truncate content to save memory
        this.compressionEnabled = true;
    }

    /**
     * Generate cache key from search parameters
     */
    generateKey(searchParams) {
        const { search = '', platform = '', page = 1, limit = 50 } = searchParams;
        
        // Normalize search term
        const normalizedSearch = search.toLowerCase().trim();
        
        // Create deterministic key
        const keyParts = [
            normalizedSearch,
            platform,
            page,
            limit
        ];
        
        return keyParts.join('|');
    }

    /**
     * Get cached result
     */
    get(key) {
        const entry = this.cache.get(key);
        
        if (!entry) {
            this.missCount++;
            return null;
        }
        
        // Check TTL
        const now = Date.now();
        if (now > entry.expiresAt) {
            this.cache.delete(key);
            this.missCount++;
            return null;
        }
        
        // Update access time and move to end (LRU)
        entry.lastAccessed = now;
        this.cache.delete(key);
        this.cache.set(key, entry);
        
        this.hitCount++;
        
        // Decompress if needed
        return this.decompressData(entry.data);
    }

    /**
     * Set cached result
     */
    set(key, data, ttl = this.defaultTTL) {
        // Implement LRU eviction
        if (this.cache.size >= this.maxSize) {
            this.evictLRU();
        }
        
        const now = Date.now();
        const entry = {
            data: this.compressData(data),
            createdAt: now,
            lastAccessed: now,
            expiresAt: now + ttl,
            accessCount: 1,
            size: this.calculateSize(data)
        };
        
        this.cache.set(key, entry);
    }

    /**
     * Evict least recently used entry
     */
    evictLRU() {
        if (this.cache.size === 0) return;
        
        let oldestKey = null;
        let oldestTime = Date.now();
        
        for (const [key, entry] of this.cache.entries()) {
            if (entry.lastAccessed < oldestTime) {
                oldestTime = entry.lastAccessed;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.evictionCount++;
        }
    }

    /**
     * Compress data to save memory
     */
    compressData(data) {
        if (!this.compressionEnabled || !Array.isArray(data)) {
            return data;
        }
        
        // Truncate content fields to save memory
        return data.map(item => ({
            ...item,
            prompt: item.prompt ? item.prompt.substring(0, this.maxContentLength) : '',
            response: item.response ? item.response.substring(0, this.maxContentLength) : '',
            _truncated: item.prompt?.length > this.maxContentLength || 
                       item.response?.length > this.maxContentLength
        }));
    }

    /**
     * Decompress data
     */
    decompressData(data) {
        // For now, just return the data as-is
        // In the future, could implement actual compression algorithms
        return data;
    }

    /**
     * Calculate approximate size of data
     */
    calculateSize(data) {
        if (!data) return 0;
        
        try {
            return JSON.stringify(data).length;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Check if key exists and is valid
     */
    has(key) {
        const entry = this.cache.get(key);
        
        if (!entry) return false;
        
        // Check TTL
        const now = Date.now();
        if (now > entry.expiresAt) {
            this.cache.delete(key);
            return false;
        }
        
        return true;
    }

    /**
     * Delete specific cache entry
     */
    delete(key) {
        return this.cache.delete(key);
    }

    /**
     * Clear all cache entries
     */
    clear() {
        this.cache.clear();
        this.hitCount = 0;
        this.missCount = 0;
        this.evictionCount = 0;
        logger.log('🗑️ Search cache cleared');
    }

    /**
     * Invalidate cache entries based on pattern
     */
    invalidate(pattern) {
        let invalidatedCount = 0;
        
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                this.cache.delete(key);
                invalidatedCount++;
            }
        }
        
        logger.log(`🗑️ Invalidated ${invalidatedCount} cache entries matching "${pattern}"`);
        return invalidatedCount;
    }

    /**
     * Clean up expired entries
     */
    cleanup() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [key, entry] of this.cache.entries()) {
            if (now > entry.expiresAt) {
                this.cache.delete(key);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            logger.log(`🧹 Cleaned up ${cleanedCount} expired cache entries`);
        }
        
        return cleanedCount;
    }

    /**
     * Get cache statistics
     */
    getStats() {
        const totalRequests = this.hitCount + this.missCount;
        const totalSize = Array.from(this.cache.values())
            .reduce((sum, entry) => sum + entry.size, 0);
        
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hitCount: this.hitCount,
            missCount: this.missCount,
            evictionCount: this.evictionCount,
            hitRate: totalRequests > 0 ? (this.hitCount / totalRequests) * 100 : 0,
            totalRequests,
            totalSize,
            averageSize: this.cache.size > 0 ? totalSize / this.cache.size : 0,
            memoryUsage: this.getMemoryUsage()
        };
    }

    /**
     * Get detailed memory usage information
     */
    getMemoryUsage() {
        let totalSize = 0;
        let entryCount = 0;
        const sizeDistribution = { small: 0, medium: 0, large: 0 };
        
        for (const entry of this.cache.values()) {
            totalSize += entry.size;
            entryCount++;
            
            if (entry.size < 1000) {
                sizeDistribution.small++;
            } else if (entry.size < 10000) {
                sizeDistribution.medium++;
            } else {
                sizeDistribution.large++;
            }
        }
        
        return {
            totalBytes: totalSize,
            totalKB: Math.round(totalSize / 1024),
            totalMB: Math.round(totalSize / (1024 * 1024)),
            entryCount,
            averageEntrySize: entryCount > 0 ? Math.round(totalSize / entryCount) : 0,
            sizeDistribution
        };
    }

    /**
     * Get cache entries sorted by access frequency
     */
    getPopularEntries(limit = 10) {
        const entries = Array.from(this.cache.entries())
            .map(([key, entry]) => ({
                key,
                accessCount: entry.accessCount,
                lastAccessed: entry.lastAccessed,
                createdAt: entry.createdAt,
                size: entry.size
            }))
            .sort((a, b) => b.accessCount - a.accessCount)
            .slice(0, limit);
        
        return entries;
    }

    /**
     * Optimize cache configuration based on usage patterns
     */
    optimize() {
        const stats = this.getStats();
        
        // Adjust max size based on hit rate
        if (stats.hitRate < 70 && this.maxSize < 300) {
            this.maxSize = Math.min(300, this.maxSize + 25);
            logger.log(`🔧 Increased cache size to ${this.maxSize}`);
        } else if (stats.hitRate > 95 && this.maxSize > 100) {
            this.maxSize = Math.max(100, this.maxSize - 25);
            logger.log(`🔧 Decreased cache size to ${this.maxSize}`);
        }
        
        // Adjust content length based on memory usage
        if (stats.memoryUsage.totalMB > 10 && this.maxContentLength > 200) {
            this.maxContentLength = Math.max(200, this.maxContentLength - 100);
            logger.log(`🔧 Reduced content length to ${this.maxContentLength}`);
        }
        
        // Clean up expired entries
        this.cleanup();
    }

    /**
     * Export cache data for analysis
     */
    export() {
        const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
            key,
            createdAt: entry.createdAt,
            lastAccessed: entry.lastAccessed,
            expiresAt: entry.expiresAt,
            accessCount: entry.accessCount,
            size: entry.size,
            dataLength: Array.isArray(entry.data) ? entry.data.length : 0
        }));
        
        return {
            timestamp: Date.now(),
            stats: this.getStats(),
            entries
        };
    }

    /**
     * Preload cache with common searches
     */
    preload(commonSearches) {
        logger.log(`🚀 Preloading cache with ${commonSearches.length} common searches`);
        
        commonSearches.forEach(search => {
            const key = this.generateKey(search.params);
            this.set(key, search.results, search.ttl || this.defaultTTL);
        });
    }
}

// Create singleton instance
export const searchCache = new SearchCache();
