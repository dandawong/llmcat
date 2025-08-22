/**
 * Performance Monitor Module
 *
 * Provides comprehensive performance monitoring for the LLMLog Chrome extension.
 * Tracks search operations, DOM updates, memory usage, and frame rates.
 */

import { createLogger } from './logger.js';

const logger = createLogger('performance-monitor');

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            searchOperations: [],
            domUpdates: [],
            memoryUsage: [],
            frameRates: [],
            cacheHits: 0,
            cacheMisses: 0
        };
        
        this.thresholds = {
            searchTime: 200, // ms
            domUpdateTime: 16, // ms (60fps)
            memoryUsage: 50 * 1024 * 1024, // 50MB
            frameRate: 30 // fps
        };
        
        this.isMonitoring = false;
        this.frameRateObserver = null;
    }

    /**
     * Initialize performance monitoring
     */
    initialize() {
        this.isMonitoring = true;
        this.startFrameRateMonitoring();
        this.startMemoryMonitoring();
        logger.log('🔍 Performance monitoring initialized');
    }

    /**
     * Stop performance monitoring
     */
    stop() {
        this.isMonitoring = false;
        if (this.frameRateObserver) {
            this.frameRateObserver.disconnect();
        }
        logger.log('🔍 Performance monitoring stopped');
    }

    /**
     * Record search operation performance
     */
    recordSearchOperation(duration, resultCount, fromCache = false) {
        if (!this.isMonitoring) return;

        const metric = {
            timestamp: Date.now(),
            duration,
            resultCount,
            fromCache
        };

        this.metrics.searchOperations.push(metric);
        
        // Update cache statistics
        if (fromCache) {
            this.metrics.cacheHits++;
        } else {
            this.metrics.cacheMisses++;
        }

        // Keep only last 100 operations
        if (this.metrics.searchOperations.length > 100) {
            this.metrics.searchOperations.shift();
        }

        // Alert on slow operations
        if (duration > this.thresholds.searchTime) {
            logger.warn(`🐌 Slow search operation: ${duration}ms`);
        }

        return metric;
    }

    /**
     * Record DOM update performance
     */
    recordDOMUpdate(duration, updateType = 'general') {
        if (!this.isMonitoring) return;

        const metric = {
            timestamp: Date.now(),
            duration,
            updateType
        };

        this.metrics.domUpdates.push(metric);

        // Keep only last 100 updates
        if (this.metrics.domUpdates.length > 100) {
            this.metrics.domUpdates.shift();
        }

        // Alert on slow DOM updates
        if (duration > this.thresholds.domUpdateTime) {
            logger.warn(`🐌 Slow DOM update: ${duration}ms (${updateType})`);
        }

        return metric;
    }

    /**
     * Start frame rate monitoring
     */
    startFrameRateMonitoring() {
        let lastTime = performance.now();
        let frameCount = 0;
        
        const measureFrameRate = () => {
            if (!this.isMonitoring) return;
            
            const currentTime = performance.now();
            frameCount++;
            
            // Calculate FPS every second
            if (currentTime - lastTime >= 1000) {
                const fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
                
                this.metrics.frameRates.push({
                    timestamp: Date.now(),
                    fps
                });

                // Keep only last 60 measurements (1 minute)
                if (this.metrics.frameRates.length > 60) {
                    this.metrics.frameRates.shift();
                }

                // Alert on low frame rate
                if (fps < this.thresholds.frameRate) {
                    logger.warn(`🐌 Low frame rate: ${fps}fps`);
                }

                frameCount = 0;
                lastTime = currentTime;
            }
            
            requestAnimationFrame(measureFrameRate);
        };
        
        requestAnimationFrame(measureFrameRate);
    }

    /**
     * Start memory monitoring
     */
    startMemoryMonitoring() {
        const measureMemory = () => {
            if (!this.isMonitoring) return;
            
            if (performance.memory) {
                const memoryInfo = {
                    timestamp: Date.now(),
                    usedJSHeapSize: performance.memory.usedJSHeapSize,
                    totalJSHeapSize: performance.memory.totalJSHeapSize,
                    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
                };

                this.metrics.memoryUsage.push(memoryInfo);

                // Keep only last 60 measurements (5 minutes at 5s intervals)
                if (this.metrics.memoryUsage.length > 60) {
                    this.metrics.memoryUsage.shift();
                }

                // Alert on high memory usage
                if (memoryInfo.usedJSHeapSize > this.thresholds.memoryUsage) {
                    logger.warn(`🐌 High memory usage: ${Math.round(memoryInfo.usedJSHeapSize / 1024 / 1024)}MB`);
                }
            }
            
            setTimeout(measureMemory, 5000); // Check every 5 seconds
        };
        
        setTimeout(measureMemory, 5000);
    }

    /**
     * Get performance statistics
     */
    getStatistics() {
        const stats = {
            searchOperations: this.calculateSearchStats(),
            domUpdates: this.calculateDOMStats(),
            memoryUsage: this.calculateMemoryStats(),
            frameRates: this.calculateFrameRateStats(),
            cachePerformance: this.calculateCacheStats()
        };

        return stats;
    }

    /**
     * Calculate search operation statistics
     */
    calculateSearchStats() {
        const operations = this.metrics.searchOperations;
        if (operations.length === 0) return null;

        const durations = operations.map(op => op.duration);
        const cacheHitOperations = operations.filter(op => op.fromCache);

        return {
            totalOperations: operations.length,
            averageDuration: this.calculateAverage(durations),
            p95Duration: this.calculatePercentile(durations, 95),
            p99Duration: this.calculatePercentile(durations, 99),
            cacheHitRate: (cacheHitOperations.length / operations.length) * 100,
            slowOperations: operations.filter(op => op.duration > this.thresholds.searchTime).length
        };
    }

    /**
     * Calculate DOM update statistics
     */
    calculateDOMStats() {
        const updates = this.metrics.domUpdates;
        if (updates.length === 0) return null;

        const durations = updates.map(update => update.duration);

        return {
            totalUpdates: updates.length,
            averageDuration: this.calculateAverage(durations),
            p95Duration: this.calculatePercentile(durations, 95),
            slowUpdates: updates.filter(update => update.duration > this.thresholds.domUpdateTime).length
        };
    }

    /**
     * Calculate memory usage statistics
     */
    calculateMemoryStats() {
        const measurements = this.metrics.memoryUsage;
        if (measurements.length === 0) return null;

        const usedMemory = measurements.map(m => m.usedJSHeapSize);
        const latest = measurements[measurements.length - 1];

        return {
            currentUsage: latest.usedJSHeapSize,
            averageUsage: this.calculateAverage(usedMemory),
            peakUsage: Math.max(...usedMemory),
            totalHeapSize: latest.totalJSHeapSize,
            heapSizeLimit: latest.jsHeapSizeLimit
        };
    }

    /**
     * Calculate frame rate statistics
     */
    calculateFrameRateStats() {
        const frameRates = this.metrics.frameRates;
        if (frameRates.length === 0) return null;

        const fps = frameRates.map(fr => fr.fps);

        return {
            currentFPS: frameRates[frameRates.length - 1].fps,
            averageFPS: this.calculateAverage(fps),
            minFPS: Math.min(...fps),
            lowFrameRateEvents: frameRates.filter(fr => fr.fps < this.thresholds.frameRate).length
        };
    }

    /**
     * Calculate cache performance statistics
     */
    calculateCacheStats() {
        const totalRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
        
        return {
            totalRequests,
            cacheHits: this.metrics.cacheHits,
            cacheMisses: this.metrics.cacheMisses,
            hitRate: totalRequests > 0 ? (this.metrics.cacheHits / totalRequests) * 100 : 0
        };
    }

    /**
     * Calculate average of an array
     */
    calculateAverage(values) {
        if (values.length === 0) return 0;
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    /**
     * Calculate percentile of an array
     */
    calculatePercentile(values, percentile) {
        if (values.length === 0) return 0;
        
        const sorted = [...values].sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, index)];
    }

    /**
     * Export performance data for analysis
     */
    exportData() {
        return {
            timestamp: Date.now(),
            metrics: this.metrics,
            statistics: this.getStatistics(),
            thresholds: this.thresholds
        };
    }
}

// Create singleton instance
export const performanceMonitor = new PerformanceMonitor();
