/**
 * Performance Test Suite
 * 
 * Automated performance tests to validate improvements and prevent regressions
 * in data processing efficiency for the LLMLog Chrome extension.
 */

import { performanceMonitor } from '../modules/performance-monitor.js';
import { searchOptimizer } from '../modules/search-optimizer.js';
import { progressiveSearch } from '../modules/progressive-search.js';
import { searchCache } from '../modules/search-cache.js';
import { asyncDOMUpdater } from '../modules/async-dom-updater.js';

class PerformanceTestSuite {
    constructor() {
        this.testResults = [];
        this.benchmarkData = new Map();
        this.testConfig = {
            iterations: 10,
            warmupIterations: 3,
            timeoutMs: 5000,
            acceptableSlowdown: 1.2, // 20% slowdown is acceptable
            targetFrameRate: 55 // Target 55+ FPS
        };
        
        // Test data generators
        this.testDataSizes = [10, 50, 100, 500, 1000];
        this.searchTerms = [
            'javascript',
            'react component',
            'database optimization',
            'machine learning algorithm',
            'web performance'
        ];
    }

    /**
     * Run complete performance test suite
     * @returns {Object} Test results summary
     */
    async runAllTests() {
        console.log('🚀 Starting Performance Test Suite...');
        
        const startTime = performance.now();
        this.testResults = [];
        
        try {
            // Setup test environment
            await this.setupTestEnvironment();
            
            // Run test categories
            await this.runSearchPerformanceTests();
            await this.runDOMUpdateTests();
            await this.runMemoryTests();
            await this.runCacheTests();
            await this.runVirtualScrollTests();
            await this.runProgressiveLoadingTests();
            
            // Generate report
            const report = this.generateTestReport();
            const totalTime = performance.now() - startTime;
            
            console.log(`✅ Performance Test Suite completed in ${totalTime.toFixed(2)}ms`);
            console.log('📊 Test Results:', report);
            
            return report;
            
        } catch (error) {
            console.error('❌ Performance Test Suite failed:', error);
            throw error;
        } finally {
            await this.cleanupTestEnvironment();
        }
    }

    /**
     * Setup test environment
     */
    async setupTestEnvironment() {
        // Clear caches
        searchCache.clearAll();
        asyncDOMUpdater.clearQueue();
        
        // Generate test data
        this.testConversations = this.generateTestConversations(1000);
        
        console.log('🔧 Test environment setup complete');
    }

    /**
     * Run search performance tests
     */
    async runSearchPerformanceTests() {
        console.log('🔍 Running search performance tests...');
        
        for (const dataSize of this.testDataSizes) {
            const testData = this.testConversations.slice(0, dataSize);
            
            for (const searchTerm of this.searchTerms) {
                // Test linear search (baseline)
                const linearTime = await this.benchmarkLinearSearch(testData, searchTerm);
                
                // Test optimized search
                const optimizedTime = await this.benchmarkOptimizedSearch(testData, searchTerm);
                
                // Test cached search
                const cachedTime = await this.benchmarkCachedSearch(testData, searchTerm);
                
                this.recordTestResult('search_performance', {
                    dataSize,
                    searchTerm,
                    linearTime,
                    optimizedTime,
                    cachedTime,
                    improvement: linearTime / optimizedTime,
                    cacheImprovement: linearTime / cachedTime
                });
            }
        }
    }

    /**
     * Run DOM update performance tests
     */
    async runDOMUpdateTests() {
        console.log('🎨 Running DOM update tests...');
        
        // Create test container
        const testContainer = document.createElement('div');
        testContainer.style.position = 'absolute';
        testContainer.style.top = '-9999px';
        document.body.appendChild(testContainer);
        
        try {
            for (const itemCount of [10, 50, 100, 200]) {
                // Test synchronous updates
                const syncTime = await this.benchmarkSyncDOMUpdates(testContainer, itemCount);
                
                // Test asynchronous updates
                const asyncTime = await this.benchmarkAsyncDOMUpdates(testContainer, itemCount);
                
                this.recordTestResult('dom_updates', {
                    itemCount,
                    syncTime,
                    asyncTime,
                    improvement: syncTime / asyncTime
                });
            }
        } finally {
            document.body.removeChild(testContainer);
        }
    }

    /**
     * Run memory performance tests
     */
    async runMemoryTests() {
        console.log('💾 Running memory tests...');
        
        if (!performance.memory) {
            console.warn('Memory API not available, skipping memory tests');
            return;
        }
        
        const initialMemory = performance.memory.usedJSHeapSize;
        
        // Test memory usage with large datasets
        for (const dataSize of [100, 500, 1000, 2000]) {
            const beforeMemory = performance.memory.usedJSHeapSize;
            
            // Simulate heavy data processing
            const testData = this.generateTestConversations(dataSize);
            await this.processLargeDataset(testData);
            
            const afterMemory = performance.memory.usedJSHeapSize;
            const memoryIncrease = afterMemory - beforeMemory;
            
            this.recordTestResult('memory_usage', {
                dataSize,
                memoryIncrease,
                memoryPerItem: memoryIncrease / dataSize
            });
            
            // Force garbage collection if available
            if (window.gc) {
                window.gc();
            }
        }
    }

    /**
     * Run cache performance tests
     */
    async runCacheTests() {
        console.log('🗄️ Running cache tests...');
        
        // Test cache hit rates
        const testQueries = this.generateTestQueries(100);
        
        // First pass - populate cache
        for (const query of testQueries.slice(0, 50)) {
            await this.performCachedSearch(query);
        }
        
        // Second pass - test cache hits
        const cacheTestStart = performance.now();
        let cacheHits = 0;
        
        for (const query of testQueries.slice(0, 50)) {
            const result = searchCache.get(searchCache.generateKey(query));
            if (result) cacheHits++;
        }
        
        const cacheTestTime = performance.now() - cacheTestStart;
        
        this.recordTestResult('cache_performance', {
            totalQueries: 50,
            cacheHits,
            hitRate: (cacheHits / 50) * 100,
            averageAccessTime: cacheTestTime / 50
        });
    }

    /**
     * Run virtual scrolling tests
     */
    async runVirtualScrollTests() {
        console.log('📜 Running virtual scrolling tests...');
        
        // Test rendering performance with different item counts
        for (const itemCount of [100, 500, 1000, 2000]) {
            const renderTime = await this.benchmarkVirtualScrollRender(itemCount);
            
            this.recordTestResult('virtual_scroll', {
                itemCount,
                renderTime,
                itemsPerMs: itemCount / renderTime
            });
        }
    }

    /**
     * Run progressive loading tests
     */
    async runProgressiveLoadingTests() {
        console.log('⚡ Running progressive loading tests...');
        
        for (const dataSize of [100, 500, 1000]) {
            const testData = this.testConversations.slice(0, dataSize);
            
            // Test time to first result
            const firstResultTime = await this.benchmarkTimeToFirstResult(testData);
            
            // Test complete loading time
            const completeLoadTime = await this.benchmarkCompleteLoad(testData);
            
            this.recordTestResult('progressive_loading', {
                dataSize,
                firstResultTime,
                completeLoadTime,
                progressiveAdvantage: completeLoadTime / firstResultTime
            });
        }
    }

    /**
     * Benchmark linear search implementation
     */
    async benchmarkLinearSearch(data, searchTerm) {
        const startTime = performance.now();
        
        const results = data.filter(item => 
            item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.prompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.response.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        return performance.now() - startTime;
    }

    /**
     * Benchmark optimized search implementation
     */
    async benchmarkOptimizedSearch(data, searchTerm) {
        const startTime = performance.now();
        
        const results = await searchOptimizer.performOptimizedSearch(searchTerm, data);
        
        return performance.now() - startTime;
    }

    /**
     * Benchmark cached search
     */
    async benchmarkCachedSearch(data, searchTerm) {
        const cacheKey = searchCache.generateKey({ search: searchTerm });
        
        // First call to populate cache
        await searchOptimizer.performOptimizedSearch(searchTerm, data);
        
        // Benchmark cached retrieval
        const startTime = performance.now();
        const cachedResult = searchCache.get(cacheKey);
        return performance.now() - startTime;
    }

    /**
     * Benchmark synchronous DOM updates
     */
    async benchmarkSyncDOMUpdates(container, itemCount) {
        const startTime = performance.now();
        
        container.innerHTML = '';
        for (let i = 0; i < itemCount; i++) {
            const div = document.createElement('div');
            div.textContent = `Item ${i}`;
            div.className = 'test-item';
            container.appendChild(div);
        }
        
        return performance.now() - startTime;
    }

    /**
     * Benchmark asynchronous DOM updates
     */
    async benchmarkAsyncDOMUpdates(container, itemCount) {
        return new Promise((resolve) => {
            const startTime = performance.now();
            
            asyncDOMUpdater.queueUpdate(() => {
                container.innerHTML = '';
                const fragment = document.createDocumentFragment();
                
                for (let i = 0; i < itemCount; i++) {
                    const div = document.createElement('div');
                    div.textContent = `Item ${i}`;
                    div.className = 'test-item';
                    fragment.appendChild(div);
                }
                
                container.appendChild(fragment);
                resolve(performance.now() - startTime);
            }, 10);
        });
    }

    /**
     * Generate test conversations
     */
    generateTestConversations(count) {
        const conversations = [];
        const platforms = ['chatgpt', 'claude', 'gemini'];
        const sampleTexts = [
            'How to optimize JavaScript performance',
            'Best practices for React development',
            'Database indexing strategies',
            'Machine learning algorithms explained',
            'Web security fundamentals'
        ];
        
        for (let i = 0; i < count; i++) {
            conversations.push({
                id: i + 1,
                title: `Conversation ${i + 1}`,
                platform: platforms[i % platforms.length],
                prompt: sampleTexts[i % sampleTexts.length] + ` - Question ${i}`,
                response: `This is a detailed response for conversation ${i}. `.repeat(10),
                createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
                url: `https://example.com/conversation/${i}`
            });
        }
        
        return conversations;
    }

    /**
     * Generate test queries
     */
    generateTestQueries(count) {
        const queries = [];
        
        for (let i = 0; i < count; i++) {
            queries.push({
                search: this.searchTerms[i % this.searchTerms.length],
                platform: i % 3 === 0 ? 'chatgpt' : '',
                page: 1,
                limit: 20
            });
        }
        
        return queries;
    }

    /**
     * Record test result
     */
    recordTestResult(category, data) {
        this.testResults.push({
            category,
            timestamp: Date.now(),
            ...data
        });
    }

    /**
     * Generate test report
     */
    generateTestReport() {
        const report = {
            timestamp: Date.now(),
            totalTests: this.testResults.length,
            categories: {},
            summary: {
                passed: 0,
                failed: 0,
                warnings: 0
            }
        };
        
        // Group results by category
        for (const result of this.testResults) {
            if (!report.categories[result.category]) {
                report.categories[result.category] = [];
            }
            report.categories[result.category].push(result);
        }
        
        // Analyze results
        for (const [category, results] of Object.entries(report.categories)) {
            const analysis = this.analyzeResults(category, results);
            report.categories[category] = {
                results,
                analysis
            };
            
            if (analysis.status === 'passed') report.summary.passed++;
            else if (analysis.status === 'failed') report.summary.failed++;
            else report.summary.warnings++;
        }
        
        return report;
    }

    /**
     * Analyze test results for a category
     */
    analyzeResults(category, results) {
        const analysis = {
            status: 'passed',
            averageImprovement: 0,
            issues: []
        };
        
        if (category === 'search_performance') {
            const improvements = results.map(r => r.improvement).filter(i => i);
            analysis.averageImprovement = improvements.reduce((a, b) => a + b, 0) / improvements.length;
            
            if (analysis.averageImprovement < 1.5) {
                analysis.status = 'warning';
                analysis.issues.push('Search optimization improvement below expected threshold');
            }
        }
        
        return analysis;
    }

    /**
     * Cleanup test environment
     */
    async cleanupTestEnvironment() {
        searchCache.clearAll();
        asyncDOMUpdater.clearQueue();
        console.log('🧹 Test environment cleaned up');
    }
}

// Export for use in tests
export { PerformanceTestSuite };
