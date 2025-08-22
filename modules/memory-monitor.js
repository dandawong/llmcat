/**
 * Memory Monitor Module
 * 
 * Provides memory usage monitoring and optimization for the LLMLog Chrome extension.
 * Helps prevent memory leaks and optimize resource consumption.
 */

import { createLogger } from './logger.js';

class MemoryMonitor {
    constructor(debugMode = false) {
        this.logger = createLogger(debugMode);
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.memoryStats = {
            peak: 0,
            current: 0,
            samples: [],
            warnings: 0
        };
        
        // Memory thresholds (in MB)
        this.thresholds = {
            warning: 50,  // 50MB
            critical: 100, // 100MB
            maxSamples: 100 // Keep last 100 samples
        };
    }

    /**
     * Start memory monitoring
     * @param {number} intervalMs - Monitoring interval in milliseconds
     */
    startMonitoring(intervalMs = 30000) { // Default: 30 seconds
        if (this.isMonitoring) {
            this.logger.warn('Memory monitoring already started');
            return;
        }

        this.isMonitoring = true;
        this.logger.log('Starting memory monitoring', { intervalMs });

        this.monitoringInterval = setInterval(() => {
            this.checkMemoryUsage();
        }, intervalMs);

        // Initial check
        this.checkMemoryUsage();
    }

    /**
     * Stop memory monitoring
     */
    stopMonitoring() {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }

        this.logger.log('Memory monitoring stopped');
    }

    /**
     * Check current memory usage
     */
    checkMemoryUsage() {
        try {
            // Use performance.memory if available (Chrome)
            if (performance.memory) {
                const memInfo = {
                    used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024), // MB
                    total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024), // MB
                    limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024), // MB
                    timestamp: Date.now()
                };

                this.updateMemoryStats(memInfo);
                this.checkThresholds(memInfo);

                return memInfo;
            } else {
                this.logger.warn('performance.memory not available');
                return null;
            }
        } catch (error) {
            this.logger.error('Error checking memory usage:', error);
            return null;
        }
    }

    /**
     * Update memory statistics
     * @param {Object} memInfo - Memory information
     */
    updateMemoryStats(memInfo) {
        this.memoryStats.current = memInfo.used;
        
        if (memInfo.used > this.memoryStats.peak) {
            this.memoryStats.peak = memInfo.used;
        }

        // Add sample and maintain max samples limit
        this.memoryStats.samples.push(memInfo);
        if (this.memoryStats.samples.length > this.thresholds.maxSamples) {
            this.memoryStats.samples.shift();
        }
    }

    /**
     * Check memory thresholds and trigger warnings
     * @param {Object} memInfo - Memory information
     */
    checkThresholds(memInfo) {
        if (memInfo.used > this.thresholds.critical) {
            this.memoryStats.warnings++;
            this.logger.error('CRITICAL: Memory usage exceeded critical threshold', {
                used: memInfo.used,
                threshold: this.thresholds.critical,
                recommendation: 'Consider clearing caches or restarting extension'
            });
            
            // Trigger emergency cleanup
            this.triggerEmergencyCleanup();
            
        } else if (memInfo.used > this.thresholds.warning) {
            this.memoryStats.warnings++;
            this.logger.warn('WARNING: Memory usage exceeded warning threshold', {
                used: memInfo.used,
                threshold: this.thresholds.warning,
                recommendation: 'Monitor memory usage closely'
            });
        }
    }

    /**
     * Trigger emergency memory cleanup
     */
    triggerEmergencyCleanup() {
        this.logger.log('Triggering emergency memory cleanup');
        
        // Dispatch custom event for other modules to handle cleanup
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('llmlog-emergency-cleanup', {
                detail: { memoryUsage: this.memoryStats.current }
            }));
        }
    }

    /**
     * Get memory statistics
     * @returns {Object} Memory statistics
     */
    getMemoryStats() {
        return {
            ...this.memoryStats,
            isMonitoring: this.isMonitoring,
            thresholds: this.thresholds
        };
    }

    /**
     * Get memory usage trend
     * @param {number} samples - Number of recent samples to analyze
     * @returns {Object} Trend analysis
     */
    getMemoryTrend(samples = 10) {
        if (this.memoryStats.samples.length < 2) {
            return { trend: 'insufficient-data', change: 0 };
        }

        const recentSamples = this.memoryStats.samples.slice(-samples);
        const first = recentSamples[0].used;
        const last = recentSamples[recentSamples.length - 1].used;
        const change = last - first;
        const changePercent = (change / first) * 100;

        let trend = 'stable';
        if (changePercent > 10) {
            trend = 'increasing';
        } else if (changePercent < -10) {
            trend = 'decreasing';
        }

        return {
            trend,
            change,
            changePercent: Math.round(changePercent * 100) / 100,
            samples: recentSamples.length
        };
    }

    /**
     * Force garbage collection if available
     */
    forceGarbageCollection() {
        try {
            if (window.gc) {
                window.gc();
                this.logger.log('Forced garbage collection');
                return true;
            } else {
                this.logger.warn('Garbage collection not available');
                return false;
            }
        } catch (error) {
            this.logger.error('Error forcing garbage collection:', error);
            return false;
        }
    }

    /**
     * Clear memory statistics
     */
    clearStats() {
        this.memoryStats = {
            peak: 0,
            current: 0,
            samples: [],
            warnings: 0
        };
        this.logger.log('Memory statistics cleared');
    }
}

// Export singleton instance
let memoryMonitorInstance = null;

export function getMemoryMonitor(debugMode = false) {
    if (!memoryMonitorInstance) {
        memoryMonitorInstance = new MemoryMonitor(debugMode);
    }
    return memoryMonitorInstance;
}

export { MemoryMonitor };
