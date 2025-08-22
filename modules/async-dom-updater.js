/**
 * Async DOM Updater Module
 * 
 * Provides asynchronous, batched DOM updates to prevent UI blocking
 * and maintain 60fps performance during heavy operations.
 */

import { performanceMonitor } from './performance-monitor.js';
import { createLogger } from './logger.js';

// Create logger instance with default debug mode disabled
const logger = createLogger(false);

class AsyncDOMUpdater {
    constructor() {
        this.updateQueue = [];
        this.isProcessing = false;
        this.frameTimeTarget = 16; // 16ms for 60fps
        this.maxBatchSize = 10;
        this.pendingUpdates = new Map();
        
        // Priority levels
        this.priorities = {
            HIGH: 1,
            NORMAL: 2,
            LOW: 3
        };
    }

    /**
     * Schedule a DOM update with priority
     */
    scheduleUpdate(updateFunction, priority = this.priorities.NORMAL, id = null) {
        const update = {
            id: id || Date.now() + Math.random(),
            function: updateFunction,
            priority,
            timestamp: Date.now()
        };

        // If an update with the same ID exists, replace it
        if (id && this.pendingUpdates.has(id)) {
            const existingIndex = this.updateQueue.findIndex(u => u.id === id);
            if (existingIndex !== -1) {
                this.updateQueue[existingIndex] = update;
            }
        } else {
            this.updateQueue.push(update);
            if (id) {
                this.pendingUpdates.set(id, update);
            }
        }

        // Sort by priority
        this.updateQueue.sort((a, b) => a.priority - b.priority);

        // Start processing if not already running
        if (!this.isProcessing) {
            this.processUpdates();
        }

        return update.id;
    }

    /**
     * Process queued updates in batches
     */
    async processUpdates() {
        if (this.isProcessing || this.updateQueue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.updateQueue.length > 0) {
            const frameStart = performance.now();
            let processedCount = 0;

            // Process updates until frame budget is exhausted
            while (
                this.updateQueue.length > 0 && 
                processedCount < this.maxBatchSize &&
                (performance.now() - frameStart) < this.frameTimeTarget
            ) {
                const update = this.updateQueue.shift();
                
                try {
                    const updateStart = performance.now();
                    await update.function();
                    const updateDuration = performance.now() - updateStart;
                    
                    performanceMonitor.recordDOMUpdate(updateDuration, 'async-batch');
                    
                    // Remove from pending updates
                    if (this.pendingUpdates.has(update.id)) {
                        this.pendingUpdates.delete(update.id);
                    }
                    
                    processedCount++;
                } catch (error) {
                    logger.error('DOM update failed:', error);
                }
            }

            // Yield control to browser for next frame
            if (this.updateQueue.length > 0) {
                await this.waitForNextFrame();
            }
        }

        this.isProcessing = false;
    }

    /**
     * Wait for next animation frame
     */
    waitForNextFrame() {
        return new Promise(resolve => {
            requestAnimationFrame(resolve);
        });
    }

    /**
     * Batch multiple DOM operations together
     */
    batchDOMOperations(operations) {
        return new Promise((resolve) => {
            const batchFunction = () => {
                const startTime = performance.now();
                
                try {
                    // Execute all operations in a single frame
                    operations.forEach(operation => {
                        if (typeof operation === 'function') {
                            operation();
                        }
                    });
                    
                    const duration = performance.now() - startTime;
                    performanceMonitor.recordDOMUpdate(duration, 'batch-operations');
                    
                    resolve();
                } catch (error) {
                    logger.error('Batch DOM operations failed:', error);
                    resolve();
                }
            };

            this.scheduleUpdate(batchFunction, this.priorities.HIGH);
        });
    }

    /**
     * Create document fragment for efficient DOM manipulation
     */
    createDocumentFragment() {
        return document.createDocumentFragment();
    }

    /**
     * Efficiently update element content
     */
    updateElementContent(element, content, sanitize = true) {
        return this.scheduleUpdate(() => {
            if (!element) return;
            
            if (sanitize && typeof content === 'string') {
                // Basic XSS protection
                const tempDiv = document.createElement('div');
                tempDiv.textContent = content;
                element.innerHTML = tempDiv.innerHTML;
            } else {
                element.innerHTML = content;
            }
        }, this.priorities.NORMAL, `content-${element.id || element.className}`);
    }

    /**
     * Efficiently update element attributes
     */
    updateElementAttributes(element, attributes) {
        return this.scheduleUpdate(() => {
            if (!element) return;
            
            Object.entries(attributes).forEach(([key, value]) => {
                if (value === null || value === undefined) {
                    element.removeAttribute(key);
                } else {
                    element.setAttribute(key, value);
                }
            });
        }, this.priorities.NORMAL, `attrs-${element.id || element.className}`);
    }

    /**
     * Efficiently update element styles
     */
    updateElementStyles(element, styles) {
        return this.scheduleUpdate(() => {
            if (!element) return;
            
            Object.entries(styles).forEach(([property, value]) => {
                element.style[property] = value;
            });
        }, this.priorities.NORMAL, `styles-${element.id || element.className}`);
    }

    /**
     * Efficiently append multiple children
     */
    appendChildren(parent, children) {
        return this.scheduleUpdate(() => {
            if (!parent || !children) return;
            
            const fragment = this.createDocumentFragment();
            
            children.forEach(child => {
                if (child) {
                    fragment.appendChild(child);
                }
            });
            
            parent.appendChild(fragment);
        }, this.priorities.NORMAL, `children-${parent.id || parent.className}`);
    }

    /**
     * Efficiently remove multiple children
     */
    removeChildren(parent, selector = null) {
        return this.scheduleUpdate(() => {
            if (!parent) return;
            
            if (selector) {
                const children = parent.querySelectorAll(selector);
                children.forEach(child => child.remove());
            } else {
                parent.innerHTML = '';
            }
        }, this.priorities.NORMAL, `remove-${parent.id || parent.className}`);
    }

    /**
     * Measure DOM operation performance
     */
    measurePerformance(operation, operationName = 'DOM Operation') {
        const startTime = performance.now();
        
        const result = operation();
        
        const duration = performance.now() - startTime;
        performanceMonitor.recordDOMUpdate(duration, operationName);
        
        return result;
    }

    /**
     * Debounce DOM updates to prevent excessive operations
     */
    debounce(func, delay = 100) {
        let timeoutId;
        
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    /**
     * Throttle DOM updates to limit frequency
     */
    throttle(func, limit = 16) {
        let inThrottle;
        
        return (...args) => {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    /**
     * Cancel pending update by ID
     */
    cancelUpdate(updateId) {
        const index = this.updateQueue.findIndex(update => update.id === updateId);
        if (index !== -1) {
            this.updateQueue.splice(index, 1);
            this.pendingUpdates.delete(updateId);
            return true;
        }
        return false;
    }

    /**
     * Clear all pending updates
     */
    clearQueue() {
        this.updateQueue.length = 0;
        this.pendingUpdates.clear();
        logger.log('🗑️ DOM update queue cleared');
    }

    /**
     * Get queue statistics
     */
    getQueueStats() {
        return {
            queueLength: this.updateQueue.length,
            isProcessing: this.isProcessing,
            pendingUpdates: this.pendingUpdates.size,
            priorityBreakdown: {
                high: this.updateQueue.filter(u => u.priority === this.priorities.HIGH).length,
                normal: this.updateQueue.filter(u => u.priority === this.priorities.NORMAL).length,
                low: this.updateQueue.filter(u => u.priority === this.priorities.LOW).length
            }
        };
    }

    /**
     * Force process all pending updates immediately
     */
    async flushUpdates() {
        while (this.updateQueue.length > 0 && !this.isProcessing) {
            await this.processUpdates();
        }
    }
}

// Create singleton instance
export const asyncDOMUpdater = new AsyncDOMUpdater();

// Export utility functions for backward compatibility
export const DOMOptimizer = {
    batchDOMUpdates: (operations) => asyncDOMUpdater.batchDOMOperations(operations),
    createDocumentFragment: () => asyncDOMUpdater.createDocumentFragment(),
    measurePerformance: (name, operation) => asyncDOMUpdater.measurePerformance(operation, name),
    debounce: (func, delay) => asyncDOMUpdater.debounce(func, delay),
    throttle: (func, limit) => asyncDOMUpdater.throttle(func, limit)
};
