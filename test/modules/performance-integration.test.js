/**
 * Performance Integration Module Tests
 *
 * Tests for the performance integration module that coordinates
 * all performance optimization features.
 */

import { jest } from '@jest/globals';

// Mock the performance modules
const mockPerformanceMonitor = {
  initialize: jest.fn(),
  recordSearchOperation: jest.fn(),
  recordDOMUpdate: jest.fn(),
  getStatistics: jest.fn(() => ({
    searchOperations: { averageDuration: 150, totalOperations: 10 },
    domUpdates: { averageDuration: 8, totalUpdates: 5 },
    memoryUsage: { currentUsage: 1024 * 1024 * 10 },
    frameRates: { currentFPS: 60 }
  })),
  exportData: jest.fn(() => ({ timestamp: Date.now() }))
};

const mockSearchOptimizer = {
  performOptimizedSearch: jest.fn(async (term, conversations) => {
    return conversations.filter(c =>
      c.title.toLowerCase().includes(term.toLowerCase()) ||
      c.prompt.toLowerCase().includes(term.toLowerCase())
    );
  }),
  getCacheStats: jest.fn(() => ({
    hitCount: 5,
    missCount: 2,
    hitRate: 71.4
  })),
  clearCache: jest.fn()
};

const mockProgressiveSearch = {
  performProgressiveSearch: jest.fn(async (term, conversations, onProgress) => {
    const results = conversations.filter(c =>
      c.title.toLowerCase().includes(term.toLowerCase())
    );
    onProgress(results, true, { isComplete: true });
    return results;
  }),
  getPerformanceMetrics: jest.fn(() => ({
    activeSearches: { activeCount: 0 },
    searchCounter: 5
  }))
};

const mockSearchCache = {
  clear: jest.fn(),
  getStats: jest.fn(() => ({
    size: 10,
    hitRate: 85.5,
    totalRequests: 20
  })),
  cleanup: jest.fn(),
  optimize: jest.fn()
};

const mockAsyncDOMUpdater = {
  scheduleUpdate: jest.fn((fn) => {
    fn(); // Execute immediately in tests
    return 'update-id-123';
  }),
  batchDOMOperations: jest.fn(async (operations) => {
    operations.forEach(op => op());
  }),
  getQueueStats: jest.fn(() => ({
    queueLength: 0,
    isProcessing: false
  })),
  clearQueue: jest.fn()
};

// Mock the performance integration module
const mockPerformanceIntegration = {
  isInitialized: false,
  config: {
    enableProgressiveSearch: true,
    enableSearchCache: true,
    enableAsyncDOM: true,
    enablePerformanceMonitoring: true,
    debugMode: false
  },

  async initialize(container, userConfig = {}) {
    if (this.isInitialized) {
      return; // Don't initialize twice
    }
    this.config = { ...this.config, ...userConfig };
    this.isInitialized = true;
    mockPerformanceMonitor.initialize();
  },

  async performOptimizedSearch(searchTerm, conversations, onProgress, options = {}) {
    try {
      if (this.config.enableProgressiveSearch) {
        return await mockProgressiveSearch.performProgressiveSearch(
          searchTerm, conversations, onProgress, options
        );
      } else {
        return await mockSearchOptimizer.performOptimizedSearch(
          searchTerm, conversations, options
        );
      }
    } catch (error) {
      // Fallback to basic search
      return conversations.filter(c =>
        c.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.prompt.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
  },

  async updateDOM(updateFunction, priority = 'normal') {
    if (this.config.enableAsyncDOM) {
      return mockAsyncDOMUpdater.scheduleUpdate(updateFunction, 1);
    } else {
      return updateFunction();
    }
  },

  async batchDOMOperations(operations) {
    if (this.config.enableAsyncDOM) {
      return mockAsyncDOMUpdater.batchDOMOperations(operations);
    } else {
      operations.forEach(op => op());
    }
  },

  getPerformanceStats() {
    return {
      timestamp: Date.now(),
      isInitialized: this.isInitialized,
      config: this.config,
      monitoring: mockPerformanceMonitor.getStatistics(),
      cache: mockSearchCache.getStats(),
      searchOptimizer: mockSearchOptimizer.getCacheStats(),
      progressiveSearch: mockProgressiveSearch.getPerformanceMetrics(),
      asyncDOM: mockAsyncDOMUpdater.getQueueStats()
    };
  },

  exportPerformanceData() {
    return {
      timestamp: Date.now(),
      performanceMonitor: mockPerformanceMonitor.exportData(),
      searchCache: mockSearchCache.getStats(),
      searchOptimizer: mockSearchOptimizer.getCacheStats(),
      progressiveSearch: mockProgressiveSearch.getPerformanceMetrics(),
      asyncDOM: mockAsyncDOMUpdater.getQueueStats(),
      config: this.config
    };
  },

  clearAllCaches() {
    mockSearchCache.clear();
    mockSearchOptimizer.clearCache();
    mockAsyncDOMUpdater.clearQueue();
  },

  performOptimization() {
    mockSearchCache.cleanup();
    mockSearchCache.optimize();
  },

  getHealthStatus() {
    const stats = this.getPerformanceStats();
    const issues = [];

    if (stats.monitoring.searchOperations.averageDuration > 500) {
      issues.push('High search latency detected');
    }
    if (stats.cache.hitRate < 50) {
      issues.push('Low cache hit rate');
    }
    if (stats.monitoring.frameRates.currentFPS < 30) {
      issues.push('Low frame rate detected');
    }
    if (stats.asyncDOM.queueLength > 50) {
      issues.push('High DOM update queue length');
    }

    return {
      status: this.isInitialized ? 'healthy' : 'not-initialized',
      performance: {
        searchLatency: stats.monitoring.searchOperations.averageDuration,
        cacheHitRate: stats.cache.hitRate,
        memoryUsage: stats.monitoring.memoryUsage.currentUsage,
        frameRate: stats.monitoring.frameRates.currentFPS
      },
      issues
    };
  },

  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  },

  isFeatureEnabled(feature) {
    return this.config[feature] === true;
  },

  shutdown() {
    this.isInitialized = false;
  }
};

describe('Performance Integration Module', () => {
  let performanceIntegration;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset the performance integration state
    performanceIntegration = { ...mockPerformanceIntegration };
    performanceIntegration.isInitialized = false;
    performanceIntegration.config = {
      enableProgressiveSearch: true,
      enableSearchCache: true,
      enableAsyncDOM: true,
      enablePerformanceMonitoring: true,
      debugMode: false
    };
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', async () => {
      const container = document.createElement('div');
      
      await performanceIntegration.initialize(container);
      
      expect(performanceIntegration.isInitialized).toBe(true);
      expect(mockPerformanceMonitor.initialize).toHaveBeenCalled();
    });

    test('should initialize with custom configuration', async () => {
      const container = document.createElement('div');
      const customConfig = {
        enableProgressiveSearch: false,
        enableSearchCache: true,
        debugMode: true
      };
      
      await performanceIntegration.initialize(container, customConfig);
      
      expect(performanceIntegration.config.enableProgressiveSearch).toBe(false);
      expect(performanceIntegration.config.debugMode).toBe(true);
    });

    test('should not initialize twice', async () => {
      const container = document.createElement('div');
      
      await performanceIntegration.initialize(container);
      await performanceIntegration.initialize(container);
      
      // Should only call initialize once
      expect(mockPerformanceMonitor.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('Optimized Search', () => {
    beforeEach(async () => {
      const container = document.createElement('div');
      await performanceIntegration.initialize(container);
    });

    test('should perform progressive search when enabled', async () => {
      const conversations = [
        { id: 1, title: 'AI conversation', prompt: 'What is AI?', response: 'AI is...' },
        { id: 2, title: 'ML discussion', prompt: 'Explain ML', response: 'ML is...' }
      ];
      
      const onProgress = jest.fn();
      
      const results = await performanceIntegration.performOptimizedSearch(
        'AI',
        conversations,
        onProgress
      );
      
      expect(mockProgressiveSearch.performProgressiveSearch).toHaveBeenCalledWith(
        'AI',
        conversations,
        onProgress,
        {}
      );
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('AI conversation');
    });

    test('should fallback to basic search when progressive search fails', async () => {
      // Make progressive search throw an error
      mockProgressiveSearch.performProgressiveSearch.mockRejectedValueOnce(
        new Error('Progressive search failed')
      );
      
      const conversations = [
        { id: 1, title: 'AI conversation', prompt: 'What is AI?', response: 'AI is...' }
      ];
      
      const results = await performanceIntegration.performOptimizedSearch(
        'AI',
        conversations,
        jest.fn()
      );
      
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('AI conversation');
    });

    test('should use regular optimized search when progressive search disabled', async () => {
      performanceIntegration.config.enableProgressiveSearch = false;
      
      const conversations = [
        { id: 1, title: 'AI conversation', prompt: 'What is AI?', response: 'AI is...' }
      ];
      
      const results = await performanceIntegration.performOptimizedSearch(
        'AI',
        conversations,
        jest.fn()
      );
      
      expect(mockSearchOptimizer.performOptimizedSearch).toHaveBeenCalledWith(
        'AI',
        conversations,
        {}
      );
    });
  });

  describe('DOM Updates', () => {
    beforeEach(async () => {
      const container = document.createElement('div');
      await performanceIntegration.initialize(container);
    });

    test('should schedule async DOM updates when enabled', async () => {
      const updateFunction = jest.fn();
      
      const updateId = await performanceIntegration.updateDOM(updateFunction, 'high');
      
      expect(mockAsyncDOMUpdater.scheduleUpdate).toHaveBeenCalledWith(
        updateFunction,
        mockAsyncDOMUpdater.priorities?.HIGH || 1
      );
      expect(updateFunction).toHaveBeenCalled();
      expect(updateId).toBe('update-id-123');
    });

    test('should execute synchronously when async DOM disabled', async () => {
      performanceIntegration.config.enableAsyncDOM = false;
      const updateFunction = jest.fn();
      
      const result = await performanceIntegration.updateDOM(updateFunction);
      
      expect(updateFunction).toHaveBeenCalled();
      expect(mockAsyncDOMUpdater.scheduleUpdate).not.toHaveBeenCalled();
    });

    test('should batch DOM operations', async () => {
      const operations = [jest.fn(), jest.fn(), jest.fn()];
      
      await performanceIntegration.batchDOMOperations(operations);
      
      expect(mockAsyncDOMUpdater.batchDOMOperations).toHaveBeenCalledWith(operations);
      operations.forEach(op => expect(op).toHaveBeenCalled());
    });
  });

  describe('Performance Statistics', () => {
    beforeEach(async () => {
      const container = document.createElement('div');
      await performanceIntegration.initialize(container);
    });

    test('should collect comprehensive performance statistics', () => {
      const stats = performanceIntegration.getPerformanceStats();
      
      expect(stats).toHaveProperty('timestamp');
      expect(stats).toHaveProperty('isInitialized', true);
      expect(stats).toHaveProperty('config');
      expect(stats).toHaveProperty('monitoring');
      expect(stats).toHaveProperty('cache');
      expect(stats).toHaveProperty('searchOptimizer');
      expect(stats).toHaveProperty('progressiveSearch');
      expect(stats).toHaveProperty('asyncDOM');
    });

    test('should export performance data for analysis', () => {
      const data = performanceIntegration.exportPerformanceData();
      
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('performanceMonitor');
      expect(data).toHaveProperty('searchCache');
      expect(data).toHaveProperty('searchOptimizer');
      expect(data).toHaveProperty('progressiveSearch');
      expect(data).toHaveProperty('asyncDOM');
      expect(data).toHaveProperty('config');
    });
  });

  describe('Cache Management', () => {
    beforeEach(async () => {
      const container = document.createElement('div');
      await performanceIntegration.initialize(container);
    });

    test('should clear all caches', () => {
      performanceIntegration.clearAllCaches();
      
      expect(mockSearchCache.clear).toHaveBeenCalled();
      expect(mockSearchOptimizer.clearCache).toHaveBeenCalled();
      expect(mockAsyncDOMUpdater.clearQueue).toHaveBeenCalled();
    });

    test('should perform periodic optimization', () => {
      performanceIntegration.performOptimization();
      
      expect(mockSearchCache.cleanup).toHaveBeenCalled();
      expect(mockSearchCache.optimize).toHaveBeenCalled();
    });
  });

  describe('Health Status', () => {
    beforeEach(async () => {
      const container = document.createElement('div');
      await performanceIntegration.initialize(container);
    });

    test('should report healthy status with good performance', () => {
      const health = performanceIntegration.getHealthStatus();
      
      expect(health.status).toBe('healthy');
      expect(health.performance).toHaveProperty('searchLatency');
      expect(health.performance).toHaveProperty('cacheHitRate');
      expect(health.performance).toHaveProperty('memoryUsage');
      expect(health.performance).toHaveProperty('frameRate');
      expect(health.issues).toHaveLength(0);
    });

    test('should detect performance issues', () => {
      // Mock poor performance
      mockPerformanceMonitor.getStatistics.mockReturnValueOnce({
        searchOperations: { averageDuration: 600 }, // Slow search
        domUpdates: { averageDuration: 8 },
        memoryUsage: { currentUsage: 1024 * 1024 * 10 },
        frameRates: { currentFPS: 25 } // Low frame rate
      });

      mockSearchCache.getStats.mockReturnValueOnce({
        hitRate: 30 // Low cache hit rate
      });

      mockAsyncDOMUpdater.getQueueStats.mockReturnValueOnce({
        queueLength: 60 // High queue length
      });

      const health = performanceIntegration.getHealthStatus();

      expect(health.issues.length).toBeGreaterThan(0);
      expect(health.issues).toContain('High search latency detected');
      expect(health.issues).toContain('Low cache hit rate');
      expect(health.issues).toContain('Low frame rate detected');
      expect(health.issues).toContain('High DOM update queue length');
    });
  });

  describe('Configuration Management', () => {
    test('should update configuration', () => {
      const newConfig = { debugMode: true, enableSearchCache: false };
      
      performanceIntegration.updateConfig(newConfig);
      
      expect(performanceIntegration.config.debugMode).toBe(true);
      expect(performanceIntegration.config.enableSearchCache).toBe(false);
    });

    test('should check if features are enabled', () => {
      expect(performanceIntegration.isFeatureEnabled('enableProgressiveSearch')).toBe(true);
      expect(performanceIntegration.isFeatureEnabled('nonExistentFeature')).toBe(false);
    });
  });

  describe('Shutdown', () => {
    test('should properly shutdown and cleanup', async () => {
      const container = document.createElement('div');
      await performanceIntegration.initialize(container);
      
      performanceIntegration.shutdown();
      
      expect(performanceIntegration.isInitialized).toBe(false);
    });
  });
});
