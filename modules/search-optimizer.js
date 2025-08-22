/**
 * Search Optimizer Module
 *
 * Provides optimized search algorithms with relevance scoring, caching,
 * and performance enhancements for the LLMLog Chrome extension.
 */

import { performanceMonitor } from './performance-monitor.js';
import { createLogger } from './logger.js';

const logger = createLogger('search-optimizer');

class SearchOptimizer {
    constructor() {
        this.cache = new Map();
        this.maxCacheSize = 100;
        this.cacheHitCount = 0;
        this.cacheMissCount = 0;
        
        // Scoring weights for different fields
        this.weights = {
            title: 3.0,
            platform: 2.5,
            prompt: 2.0,
            response: 1.0
        };
        
        // Age boost factors
        this.ageBoosts = {
            lastDay: 0.3,    // 30% boost for conversations from last day
            lastWeek: 0.1    // 10% boost for conversations from last week
        };
    }

    /**
     * Perform optimized search with relevance scoring
     */
    async performOptimizedSearch(searchTerm, conversations, options = {}) {
        const startTime = performance.now();
        
        // Check cache first
        const cacheKey = this.generateCacheKey(searchTerm, options);
        const cachedResult = this.getFromCache(cacheKey);
        
        if (cachedResult) {
            this.cacheHitCount++;
            const duration = performance.now() - startTime;
            performanceMonitor.recordSearchOperation(duration, cachedResult.length, true);
            return cachedResult;
        }
        
        this.cacheMissCount++;
        
        // Prepare search terms
        const searchTerms = this.prepareSearchTerms(searchTerm);
        
        // Filter and score conversations
        const scoredResults = conversations
            .map(conversation => ({
                ...conversation,
                score: this.calculateRelevanceScore(conversation, searchTerms)
            }))
            .filter(result => result.score > 0)
            .sort((a, b) => b.score - a.score);
        
        // Cache the result
        this.addToCache(cacheKey, scoredResults);
        
        const duration = performance.now() - startTime;
        performanceMonitor.recordSearchOperation(duration, scoredResults.length, false);
        
        return scoredResults;
    }

    /**
     * Prepare search terms for processing
     */
    prepareSearchTerms(searchTerm) {
        if (!searchTerm || typeof searchTerm !== 'string') {
            return [];
        }
        
        return searchTerm
            .toLowerCase()
            .trim()
            .split(/\s+/)
            .filter(term => term.length > 0)
            .map(term => ({
                original: term,
                normalized: term.replace(/[^\w]/g, '') // Remove special characters
            }));
    }

    /**
     * Calculate relevance score for a conversation
     */
    calculateRelevanceScore(conversation, searchTerms) {
        if (searchTerms.length === 0) return 0;
        
        let totalScore = 0;
        let matchedTerms = 0;
        
        for (const term of searchTerms) {
            let termScore = 0;
            
            // Check title matches
            if (conversation.title) {
                const titleMatches = this.countMatches(conversation.title.toLowerCase(), term.original);
                termScore += titleMatches * this.weights.title;
            }
            
            // Check platform matches
            if (conversation.platform) {
                const platformMatches = this.countMatches(conversation.platform.toLowerCase(), term.original);
                termScore += platformMatches * this.weights.platform;
            }
            
            // Check prompt matches
            if (conversation.prompt) {
                const promptMatches = this.countMatches(conversation.prompt.toLowerCase(), term.original);
                termScore += promptMatches * this.weights.prompt;
            }
            
            // Check response matches
            if (conversation.response) {
                const responseMatches = this.countMatches(conversation.response.toLowerCase(), term.original);
                termScore += responseMatches * this.weights.response;
            }
            
            if (termScore > 0) {
                matchedTerms++;
                totalScore += termScore;
            }
        }
        
        // Require all terms to match (AND logic)
        if (matchedTerms < searchTerms.length) {
            return 0;
        }
        
        // Apply age boost
        const ageBoost = this.calculateAgeBoost(conversation.createdAt);
        totalScore *= (1 + ageBoost);
        
        return totalScore;
    }

    /**
     * Count matches of a term in text
     */
    countMatches(text, term) {
        if (!text || !term) return 0;
        
        const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        const matches = text.match(regex);
        return matches ? matches.length : 0;
    }

    /**
     * Calculate age boost for recent conversations
     */
    calculateAgeBoost(createdAt) {
        if (!createdAt) return 0;
        
        const now = Date.now();
        const conversationTime = new Date(createdAt).getTime();
        const ageInMs = now - conversationTime;
        
        const oneDayMs = 24 * 60 * 60 * 1000;
        const oneWeekMs = 7 * oneDayMs;
        
        if (ageInMs < oneDayMs) {
            return this.ageBoosts.lastDay;
        } else if (ageInMs < oneWeekMs) {
            return this.ageBoosts.lastWeek;
        }
        
        return 0;
    }

    /**
     * Generate cache key for search parameters
     */
    generateCacheKey(searchTerm, options = {}) {
        const keyParts = [
            searchTerm.toLowerCase().trim(),
            options.platform || '',
            options.limit || '',
            options.sortBy || ''
        ];
        
        return keyParts.join('|');
    }

    /**
     * Get result from cache
     */
    getFromCache(cacheKey) {
        const cached = this.cache.get(cacheKey);
        
        if (cached) {
            // Check if cache entry is still valid (5 minutes TTL)
            const now = Date.now();
            if (now - cached.timestamp < 5 * 60 * 1000) {
                // Move to end (LRU)
                this.cache.delete(cacheKey);
                this.cache.set(cacheKey, cached);
                return cached.results;
            } else {
                // Expired, remove from cache
                this.cache.delete(cacheKey);
            }
        }
        
        return null;
    }

    /**
     * Add result to cache
     */
    addToCache(cacheKey, results) {
        // Implement LRU eviction
        if (this.cache.size >= this.maxCacheSize) {
            // Remove oldest entry
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        // Store with timestamp and truncated content to save memory
        const truncatedResults = results.map(result => ({
            ...result,
            prompt: result.prompt ? result.prompt.substring(0, 500) : '',
            response: result.response ? result.response.substring(0, 500) : ''
        }));
        
        this.cache.set(cacheKey, {
            results: truncatedResults,
            timestamp: Date.now()
        });
    }

    /**
     * Clear search cache
     */
    clearCache() {
        this.cache.clear();
        logger.log('🗄️ Search cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        const totalRequests = this.cacheHitCount + this.cacheMissCount;
        
        return {
            size: this.cache.size,
            maxSize: this.maxCacheSize,
            hitCount: this.cacheHitCount,
            missCount: this.cacheMissCount,
            hitRate: totalRequests > 0 ? (this.cacheHitCount / totalRequests) * 100 : 0,
            totalRequests
        };
    }

    /**
     * Optimize search configuration
     */
    optimizeConfiguration(performanceData) {
        // Adjust cache size based on hit rate
        const stats = this.getCacheStats();
        
        if (stats.hitRate < 70 && this.maxCacheSize < 200) {
            this.maxCacheSize = Math.min(200, this.maxCacheSize + 20);
            logger.log(`🔧 Increased cache size to ${this.maxCacheSize}`);
        } else if (stats.hitRate > 95 && this.maxCacheSize > 50) {
            this.maxCacheSize = Math.max(50, this.maxCacheSize - 10);
            logger.log(`🔧 Decreased cache size to ${this.maxCacheSize}`);
        }
        
        // Adjust weights based on user behavior (could be enhanced with analytics)
        // For now, keep default weights
    }

    /**
     * Perform search with progressive loading
     */
    async performProgressiveSearch(searchTerm, conversations, onProgress, options = {}) {
        const startTime = performance.now();
        const batchSize = options.batchSize || 20;
        const maxResults = options.maxResults || 100;
        
        // Check cache first
        const cacheKey = this.generateCacheKey(searchTerm, options);
        const cachedResult = this.getFromCache(cacheKey);
        
        if (cachedResult) {
            this.cacheHitCount++;
            onProgress(cachedResult.slice(0, maxResults), true);
            return cachedResult.slice(0, maxResults);
        }
        
        this.cacheMissCount++;
        
        // Prepare search terms
        const searchTerms = this.prepareSearchTerms(searchTerm);
        const results = [];
        
        // Process in batches
        for (let i = 0; i < conversations.length; i += batchSize) {
            const batch = conversations.slice(i, i + batchSize);
            
            const batchResults = batch
                .map(conversation => ({
                    ...conversation,
                    score: this.calculateRelevanceScore(conversation, searchTerms)
                }))
                .filter(result => result.score > 0);
            
            results.push(...batchResults);
            
            // Sort and limit results
            results.sort((a, b) => b.score - a.score);
            const limitedResults = results.slice(0, maxResults);
            
            // Report progress
            onProgress(limitedResults, false);
            
            // Yield control to prevent blocking
            await new Promise(resolve => setTimeout(resolve, 0));
            
            if (limitedResults.length >= maxResults) {
                break;
            }
        }
        
        // Final sort and cache
        const finalResults = results
            .sort((a, b) => b.score - a.score)
            .slice(0, maxResults);
        
        this.addToCache(cacheKey, finalResults);
        
        const duration = performance.now() - startTime;
        performanceMonitor.recordSearchOperation(duration, finalResults.length, false);
        
        return finalResults;
    }
}

// Create singleton instance
export const searchOptimizer = new SearchOptimizer();
