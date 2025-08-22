/**
 * Progressive Search Module
 *
 * Provides progressive search loading with streaming results,
 * early result display, and cancellation support for better UX.
 */

import { performanceMonitor } from './performance-monitor.js';
import { searchOptimizer } from './search-optimizer.js';
import { createLogger } from './logger.js';

const logger = createLogger('progressive-search');

class ProgressiveSearch {
    constructor() {
        this.activeSearches = new Map();
        this.searchCounter = 0;
        this.defaultBatchSize = 20;
        this.earlyResultCount = 5;
        this.maxConcurrentSearches = 3;
    }

    /**
     * Perform progressive search with streaming results
     */
    async performProgressiveSearch(searchTerm, conversations, onProgress, options = {}) {
        const searchId = ++this.searchCounter;
        const startTime = performance.now();
        
        // Cancel previous searches if limit exceeded
        this.manageConcurrentSearches();
        
        const searchContext = {
            id: searchId,
            searchTerm,
            startTime,
            cancelled: false,
            batchSize: options.batchSize || this.defaultBatchSize,
            maxResults: options.maxResults || 100,
            onProgress,
            totalProcessed: 0,
            results: []
        };
        
        this.activeSearches.set(searchId, searchContext);
        
        try {
            // Check cache first for immediate results
            const cacheKey = searchOptimizer.generateCacheKey(searchTerm, options);
            const cachedResults = searchOptimizer.getFromCache(cacheKey);
            
            if (cachedResults) {
                const earlyResults = cachedResults.slice(0, this.earlyResultCount);
                onProgress(earlyResults, false, { fromCache: true, isComplete: false });
                
                // Return full cached results after a short delay for better UX
                setTimeout(() => {
                    if (!searchContext.cancelled) {
                        onProgress(cachedResults, true, { fromCache: true, isComplete: true });
                        this.completeSearch(searchId, cachedResults);
                    }
                }, 50);
                
                return cachedResults;
            }
            
            // Perform progressive search
            const results = await this.streamingSearch(searchContext, conversations);
            
            if (!searchContext.cancelled) {
                this.completeSearch(searchId, results);
                return results;
            }
            
            return [];
            
        } catch (error) {
            logger.error('Progressive search failed:', error);
            this.completeSearch(searchId, []);
            return [];
        }
    }

    /**
     * Perform streaming search with batched processing
     */
    async streamingSearch(searchContext, conversations) {
        const { searchTerm, batchSize, maxResults, onProgress } = searchContext;
        const searchTerms = searchOptimizer.prepareSearchTerms(searchTerm);
        
        let allResults = [];
        let earlyResultsSent = false;
        
        // Process conversations in batches
        for (let i = 0; i < conversations.length; i += batchSize) {
            if (searchContext.cancelled) {
                break;
            }
            
            const batch = conversations.slice(i, i + batchSize);
            const batchResults = [];
            
            // Process each conversation in the batch
            for (const conversation of batch) {
                if (searchContext.cancelled) break;
                
                const score = searchOptimizer.calculateRelevanceScore(conversation, searchTerms);
                if (score > 0) {
                    batchResults.push({ ...conversation, score });
                }
            }
            
            // Add batch results to total
            allResults.push(...batchResults);
            allResults.sort((a, b) => b.score - a.score);
            
            // Limit results to prevent memory issues
            if (allResults.length > maxResults) {
                allResults = allResults.slice(0, maxResults);
            }
            
            searchContext.totalProcessed = i + batch.length;
            searchContext.results = allResults;
            
            // Send early results after first few batches
            if (!earlyResultsSent && allResults.length >= this.earlyResultCount) {
                const earlyResults = allResults.slice(0, this.earlyResultCount);
                onProgress(earlyResults, false, {
                    isEarly: true,
                    totalProcessed: searchContext.totalProcessed,
                    totalConversations: conversations.length,
                    isComplete: false
                });
                earlyResultsSent = true;
            }
            
            // Send progress updates every few batches
            if (i % (batchSize * 3) === 0 || allResults.length >= maxResults) {
                onProgress(allResults, false, {
                    totalProcessed: searchContext.totalProcessed,
                    totalConversations: conversations.length,
                    isComplete: false
                });
            }
            
            // Yield control to prevent blocking
            await this.yieldControl();
            
            // Stop if we have enough results
            if (allResults.length >= maxResults) {
                break;
            }
        }
        
        // Send final results
        if (!searchContext.cancelled) {
            onProgress(allResults, true, {
                totalProcessed: searchContext.totalProcessed,
                totalConversations: conversations.length,
                isComplete: true
            });
            
            // Cache the results
            const cacheKey = searchOptimizer.generateCacheKey(searchTerm);
            searchOptimizer.addToCache(cacheKey, allResults);
        }
        
        return allResults;
    }

    /**
     * Yield control to prevent UI blocking
     */
    async yieldControl() {
        return new Promise(resolve => {
            if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(resolve, { timeout: 5 });
            } else {
                setTimeout(resolve, 0);
            }
        });
    }

    /**
     * Cancel active search
     */
    cancelSearch(searchId) {
        const searchContext = this.activeSearches.get(searchId);
        if (searchContext) {
            searchContext.cancelled = true;
            this.activeSearches.delete(searchId);
            logger.log(`🚫 Cancelled search ${searchId}`);
            return true;
        }
        return false;
    }

    /**
     * Cancel all active searches
     */
    cancelAllSearches() {
        const cancelledCount = this.activeSearches.size;
        
        for (const [searchId, searchContext] of this.activeSearches.entries()) {
            searchContext.cancelled = true;
        }
        
        this.activeSearches.clear();
        
        if (cancelledCount > 0) {
            logger.log(`🚫 Cancelled ${cancelledCount} active searches`);
        }
        
        return cancelledCount;
    }

    /**
     * Manage concurrent searches to prevent resource exhaustion
     */
    manageConcurrentSearches() {
        if (this.activeSearches.size >= this.maxConcurrentSearches) {
            // Cancel oldest search
            const oldestSearchId = Math.min(...this.activeSearches.keys());
            this.cancelSearch(oldestSearchId);
        }
    }

    /**
     * Complete search and clean up
     */
    completeSearch(searchId, results) {
        const searchContext = this.activeSearches.get(searchId);
        if (searchContext) {
            const duration = performance.now() - searchContext.startTime;
            
            performanceMonitor.recordSearchOperation(
                duration,
                results.length,
                false // Not from cache since this is the actual search
            );
            
            this.activeSearches.delete(searchId);
            
            logger.log(`✅ Completed search ${searchId} in ${Math.round(duration)}ms with ${results.length} results`);
        }
    }

    /**
     * Get active search statistics
     */
    getActiveSearchStats() {
        const searches = Array.from(this.activeSearches.values());
        
        return {
            activeCount: searches.length,
            totalProcessed: searches.reduce((sum, s) => sum + s.totalProcessed, 0),
            averageDuration: searches.length > 0 
                ? searches.reduce((sum, s) => sum + (Date.now() - s.startTime), 0) / searches.length 
                : 0,
            searches: searches.map(s => ({
                id: s.id,
                searchTerm: s.searchTerm,
                duration: Date.now() - s.startTime,
                totalProcessed: s.totalProcessed,
                resultCount: s.results.length
            }))
        };
    }

    /**
     * Perform quick search for immediate feedback
     */
    async performQuickSearch(searchTerm, conversations, maxResults = 10) {
        const startTime = performance.now();
        const searchTerms = searchOptimizer.prepareSearchTerms(searchTerm);
        
        // Quick scan of first portion of conversations
        const quickScanSize = Math.min(100, conversations.length);
        const quickResults = [];
        
        for (let i = 0; i < quickScanSize && quickResults.length < maxResults; i++) {
            const conversation = conversations[i];
            const score = searchOptimizer.calculateRelevanceScore(conversation, searchTerms);
            
            if (score > 0) {
                quickResults.push({ ...conversation, score });
            }
        }
        
        quickResults.sort((a, b) => b.score - a.score);
        
        const duration = performance.now() - startTime;
        performanceMonitor.recordSearchOperation(duration, quickResults.length, false);
        
        return quickResults.slice(0, maxResults);
    }

    /**
     * Search with priority handling
     */
    async performPrioritySearch(searchTerm, conversations, priority = 'normal', options = {}) {
        // Cancel lower priority searches if needed
        if (priority === 'high') {
            const lowPrioritySearches = Array.from(this.activeSearches.entries())
                .filter(([_, context]) => context.priority !== 'high');
            
            lowPrioritySearches.forEach(([searchId]) => {
                this.cancelSearch(searchId);
            });
        }
        
        return this.performProgressiveSearch(searchTerm, conversations, options.onProgress, {
            ...options,
            priority
        });
    }

    /**
     * Get search performance metrics
     */
    getPerformanceMetrics() {
        const activeStats = this.getActiveSearchStats();
        
        return {
            activeSearches: activeStats,
            searchCounter: this.searchCounter,
            maxConcurrentSearches: this.maxConcurrentSearches,
            defaultBatchSize: this.defaultBatchSize,
            earlyResultCount: this.earlyResultCount
        };
    }

    /**
     * Optimize search parameters based on performance
     */
    optimizeParameters(performanceData) {
        // Adjust batch size based on performance
        if (performanceData.averageSearchTime > 500) {
            this.defaultBatchSize = Math.max(10, this.defaultBatchSize - 5);
            logger.log(`🔧 Reduced batch size to ${this.defaultBatchSize}`);
        } else if (performanceData.averageSearchTime < 100) {
            this.defaultBatchSize = Math.min(50, this.defaultBatchSize + 5);
            logger.log(`🔧 Increased batch size to ${this.defaultBatchSize}`);
        }
        
        // Adjust early result count based on user behavior
        if (performanceData.earlyResultClickRate > 80) {
            this.earlyResultCount = Math.min(10, this.earlyResultCount + 1);
        } else if (performanceData.earlyResultClickRate < 20) {
            this.earlyResultCount = Math.max(3, this.earlyResultCount - 1);
        }
    }
}

// Create singleton instance
export const progressiveSearch = new ProgressiveSearch();
