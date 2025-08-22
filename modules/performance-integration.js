/**
 * Performance Integration Module
 *
 * Integrates all performance optimization modules and provides
 * a unified interface for the LLMLog Chrome extension.
 */

import { performanceMonitor } from './performance-monitor.js';
import { searchOptimizer } from './search-optimizer.js';
import { progressiveSearch } from './progressive-search.js';
import { searchCache } from './search-cache.js';
import { asyncDOMUpdater } from './async-dom-updater.js';
import { createLogger } from './logger.js';

const logger = createLogger('performance-integration');

class PerformanceIntegration {
    constructor() {
        this.isInitialized = false;
        this.config = {
            enableProgressiveSearch: true,
            enableSearchCache: true,
            enableAsyncDOM: true,
            enableOptimizedVirtualScroll: true,
            enablePerformanceMonitoring: true,
            searchDebounceMs: 300,
            maxCacheSize: 200,
            virtualScrollBufferSize: 8,
            debugMode: false
        };
        
        this.eventListeners = new Map();
        this.optimizationTimer = null;
    }

    /**
     * Initialize performance integration
     */
    async initialize(container, userConfig = {}) {
        if (this.isInitialized) {
            logger.warn('Performance integration already initialized');
            return;
        }

        // Merge user configuration
        this.config = { ...this.config, ...userConfig };
        
        try {
            // Initialize performance monitoring
            if (this.config.enablePerformanceMonitoring) {
                performanceMonitor.initialize();
                this.log('Performance monitoring initialized');
            }

            // Configure search cache
            if (this.config.enableSearchCache) {
                searchCache.maxSize = this.config.maxCacheSize;
                this.log('Search cache configured');
            }

            // Set up event listeners for performance tracking
            this.setupEventListeners();

            // Start periodic optimization
            this.startPeriodicOptimization();

            this.isInitialized = true;
            this.log('Performance integration initialized successfully');

            // Dispatch initialization event
            this.dispatchEvent('performance-integration-ready', {
                config: this.config,
                timestamp: Date.now()
            });

        } catch (error) {
            logger.error('Failed to initialize performance integration:', error);
            throw error;
        }
    }

    /**
     * Enhanced search with all optimizations
     */
    async performOptimizedSearch(searchTerm, conversations, onProgress, options = {}) {
        const startTime = performance.now();
        
        try {
            // Use progressive search if enabled
            if (this.config.enableProgressiveSearch) {
                return await progressiveSearch.performProgressiveSearch(
                    searchTerm,
                    conversations,
                    onProgress,
                    options
                );
            } else {
                // Fallback to regular optimized search
                return await searchOptimizer.performOptimizedSearch(
                    searchTerm,
                    conversations,
                    options
                );
            }
        } catch (error) {
            logger.error('Optimized search failed:', error);
            
            // Fallback to basic search
            return this.performBasicSearch(searchTerm, conversations);
        }
    }

    /**
     * Fallback basic search implementation
     */
    performBasicSearch(searchTerm, conversations) {
        const searchLower = searchTerm.toLowerCase().trim();
        
        return conversations.filter(conversation => {
            return (conversation.title && conversation.title.toLowerCase().includes(searchLower)) ||
                   (conversation.prompt && conversation.prompt.toLowerCase().includes(searchLower)) ||
                   (conversation.response && conversation.response.toLowerCase().includes(searchLower)) ||
                   (conversation.platform && conversation.platform.toLowerCase().includes(searchLower));
        });
    }

    /**
     * Optimized DOM updates
     */
    async updateDOM(updateFunction, priority = 'normal') {
        if (this.config.enableAsyncDOM) {
            const priorityMap = {
                'high': asyncDOMUpdater.priorities.HIGH,
                'normal': asyncDOMUpdater.priorities.NORMAL,
                'low': asyncDOMUpdater.priorities.LOW
            };
            
            return asyncDOMUpdater.scheduleUpdate(
                updateFunction,
                priorityMap[priority] || asyncDOMUpdater.priorities.NORMAL
            );
        } else {
            // Synchronous fallback
            return updateFunction();
        }
    }

    /**
     * Batch DOM operations
     */
    async batchDOMOperations(operations) {
        if (this.config.enableAsyncDOM) {
            return asyncDOMUpdater.batchDOMOperations(operations);
        } else {
            // Synchronous fallback
            operations.forEach(operation => {
                if (typeof operation === 'function') {
                    operation();
                }
            });
        }
    }

    /**
     * Setup event listeners for performance tracking
     */
    setupEventListeners() {
        // Search performance tracking
        const searchStartedHandler = (event) => {
            window.searchStartTime = event.detail.timestamp;
        };
        
        const searchCompletedHandler = (event) => {
            const { searchTerm, resultCount, duration, fromCache } = event.detail;
            
            if (this.config.enablePerformanceMonitoring) {
                performanceMonitor.recordSearchOperation(duration, resultCount, fromCache);
            }
            
            this.log(`Search completed: "${searchTerm}" (${resultCount} results, ${duration}ms, cached: ${fromCache})`);
        };

        window.addEventListener('llmlog-search-started', searchStartedHandler);
        window.addEventListener('llmlog-search-completed', searchCompletedHandler);
        
        this.eventListeners.set('search-started', searchStartedHandler);
        this.eventListeners.set('search-completed', searchCompletedHandler);
    }

    /**
     * Start periodic optimization
     */
    startPeriodicOptimization() {
        // Run optimization every 5 minutes
        this.optimizationTimer = setInterval(() => {
            this.performOptimization();
        }, 5 * 60 * 1000);
    }

    /**
     * Perform periodic optimization
     */
    performOptimization() {
        try {
            // Clean up expired cache entries
            if (this.config.enableSearchCache) {
                searchCache.cleanup();
                searchCache.optimize();
            }

            // Optimize search parameters
            const performanceStats = performanceMonitor.getStatistics();
            if (performanceStats.searchOperations) {
                searchOptimizer.optimizeConfiguration(performanceStats);
                progressiveSearch.optimizeParameters(performanceStats);
            }

            this.log('Periodic optimization completed');
            
        } catch (error) {
            logger.error('Optimization failed:', error);
        }
    }

    /**
     * Get comprehensive performance statistics
     */
    getPerformanceStats() {
        const stats = {
            timestamp: Date.now(),
            isInitialized: this.isInitialized,
            config: this.config
        };

        if (this.config.enablePerformanceMonitoring) {
            stats.monitoring = performanceMonitor.getStatistics();
        }

        if (this.config.enableSearchCache) {
            stats.cache = searchCache.getStats();
        }

        stats.searchOptimizer = searchOptimizer.getCacheStats();
        stats.progressiveSearch = progressiveSearch.getPerformanceMetrics();
        stats.asyncDOM = asyncDOMUpdater.getQueueStats();

        return stats;
    }

    /**
     * Export performance data for analysis
     */
    exportPerformanceData() {
        return {
            timestamp: Date.now(),
            performanceMonitor: performanceMonitor.exportData(),
            searchCache: searchCache.export(),
            searchOptimizer: searchOptimizer.getCacheStats(),
            progressiveSearch: progressiveSearch.getPerformanceMetrics(),
            asyncDOM: asyncDOMUpdater.getQueueStats(),
            config: this.config
        };
    }

    /**
     * Clear all caches and reset performance data
     */
    clearAllCaches() {
        if (this.config.enableSearchCache) {
            searchCache.clear();
        }
        
        searchOptimizer.clearCache();
        progressiveSearch.cancelAllSearches();
        asyncDOMUpdater.clearQueue();
        
        this.log('All caches cleared');
    }

    /**
     * Shutdown performance integration
     */
    shutdown() {
        if (!this.isInitialized) return;

        // Stop performance monitoring
        if (this.config.enablePerformanceMonitoring) {
            performanceMonitor.stop();
        }

        // Cancel active searches
        progressiveSearch.cancelAllSearches();

        // Clear optimization timer
        if (this.optimizationTimer) {
            clearInterval(this.optimizationTimer);
            this.optimizationTimer = null;
        }

        // Remove event listeners
        for (const [eventType, handler] of this.eventListeners.entries()) {
            window.removeEventListener(`llmlog-${eventType}`, handler);
        }
        this.eventListeners.clear();

        this.isInitialized = false;
        this.log('Performance integration shutdown');
    }

    /**
     * Dispatch custom event
     */
    dispatchEvent(eventType, detail) {
        window.dispatchEvent(new CustomEvent(`llmlog-${eventType}`, { detail }));
    }

    /**
     * Debug logging
     */
    log(message, data = null) {
        if (this.config.debugMode) {
            logger.log(`🚀 [PerformanceIntegration] ${message}`, data || '');
        }
    }

    /**
     * Check if feature is enabled
     */
    isFeatureEnabled(feature) {
        return this.config[feature] === true;
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.log('Configuration updated', newConfig);
    }

    /**
     * Get health status
     */
    getHealthStatus() {
        const stats = this.getPerformanceStats();
        
        return {
            status: this.isInitialized ? 'healthy' : 'not-initialized',
            performance: {
                searchLatency: stats.monitoring?.searchOperations?.averageDuration || 0,
                cacheHitRate: stats.cache?.hitRate || 0,
                memoryUsage: stats.monitoring?.memoryUsage?.currentUsage || 0,
                frameRate: stats.monitoring?.frameRates?.currentFPS || 0
            },
            issues: this.detectPerformanceIssues(stats)
        };
    }

    /**
     * Detect performance issues
     */
    detectPerformanceIssues(stats) {
        const issues = [];
        
        if (stats.monitoring?.searchOperations?.averageDuration > 500) {
            issues.push('High search latency detected');
        }
        
        if (stats.cache?.hitRate < 50) {
            issues.push('Low cache hit rate');
        }
        
        if (stats.monitoring?.frameRates?.currentFPS < 30) {
            issues.push('Low frame rate detected');
        }
        
        if (stats.asyncDOM?.queueLength > 50) {
            issues.push('High DOM update queue length');
        }
        
        return issues;
    }
}

// Create singleton instance
export const performanceIntegration = new PerformanceIntegration();
