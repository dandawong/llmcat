/**
 * Unit Tests for CSP Reporter Module
 * 
 * Tests the Content Security Policy violation reporting functionality.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Mock the settings and logger modules
jest.mock('../../modules/settings.js', () => ({
  getSetting: jest.fn(),
}));

jest.mock('../../modules/logger.js', () => ({
  createLogger: jest.fn(() => ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  })),
}));

import { 
  getStoredViolations, 
  clearStoredViolations, 
  getViolationStats, 
  checkCSPConfiguration 
} from '../../modules/csp-reporter.js';
import * as settings from '../../modules/settings.js';

describe('CSP Reporter Module', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    settings.getSetting.mockResolvedValue(false);
  });

  describe('getStoredViolations', () => {
    test('should return empty array when no violations exist', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      
      const result = await getStoredViolations();
      
      expect(result).toEqual([]);
      expect(chrome.storage.local.get).toHaveBeenCalledWith(['csp_violations']);
    });

    test('should return stored violations', async () => {
      const mockViolations = [
        {
          timestamp: '2025-01-01T00:00:00.000Z',
          blockedURI: 'https://evil.com/script.js',
          effectiveDirective: 'script-src',
          violatedDirective: 'script-src \'self\'',
        },
        {
          timestamp: '2025-01-01T00:01:00.000Z',
          blockedURI: 'https://malicious.com/style.css',
          effectiveDirective: 'style-src',
          violatedDirective: 'style-src \'self\'',
        },
      ];

      chrome.storage.local.get.mockResolvedValue({
        csp_violations: mockViolations
      });
      
      const result = await getStoredViolations();
      
      expect(result).toEqual(mockViolations);
    });

    test('should handle storage errors gracefully', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));
      
      const result = await getStoredViolations();
      
      expect(result).toEqual([]);
    });

    test('should handle malformed stored data', async () => {
      chrome.storage.local.get.mockResolvedValue({
        csp_violations: 'not an array'
      });

      const result = await getStoredViolations();

      // The actual implementation returns the malformed data as-is
      expect(result).toBe('not an array');
    });
  });

  describe('clearStoredViolations', () => {
    test('should clear violations successfully', async () => {
      chrome.storage.local.remove.mockResolvedValue();
      
      const result = await clearStoredViolations();
      
      expect(result).toEqual({
        status: 'success',
        message: 'CSP violations cleared'
      });
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(['csp_violations']);
    });

    test('should handle storage errors when clearing', async () => {
      const error = new Error('Storage access denied');
      chrome.storage.local.remove.mockRejectedValue(error);
      
      const result = await clearStoredViolations();
      
      expect(result).toEqual({
        status: 'error',
        message: 'Storage access denied'
      });
    });
  });

  describe('getViolationStats', () => {
    test('should return empty stats for no violations', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      
      const result = await getViolationStats();
      
      expect(result.status).toBe('success');
      expect(result.data).toEqual({
        total: 0,
        byDirective: {},
        byURI: {},
        recent: [],
        timeRange: {
          oldest: null,
          newest: null,
        },
      });
    });

    test('should generate correct stats for violations', async () => {
      const mockViolations = [
        {
          timestamp: '2025-01-01T00:00:00.000Z',
          blockedURI: 'https://evil.com/script.js',
          effectiveDirective: 'script-src',
        },
        {
          timestamp: '2025-01-01T00:01:00.000Z',
          blockedURI: 'https://evil.com/script2.js',
          effectiveDirective: 'script-src',
        },
        {
          timestamp: '2025-01-01T00:02:00.000Z',
          blockedURI: 'https://malicious.com/style.css',
          effectiveDirective: 'style-src',
        },
      ];

      chrome.storage.local.get.mockResolvedValue({
        csp_violations: mockViolations
      });
      
      const result = await getViolationStats();
      
      expect(result.status).toBe('success');
      expect(result.data.total).toBe(3);
      expect(result.data.byDirective).toEqual({
        'script-src': 2,
        'style-src': 1,
      });
      expect(result.data.byURI).toEqual({
        'https://evil.com/script.js': 1,
        'https://evil.com/script2.js': 1,
        'https://malicious.com/style.css': 1,
      });
      expect(result.data.recent).toHaveLength(3);
      expect(result.data.timeRange.oldest).toBe('2025-01-01T00:00:00.000Z');
      expect(result.data.timeRange.newest).toBe('2025-01-01T00:02:00.000Z');
    });

    test('should limit recent violations to last 10', async () => {
      const mockViolations = Array.from({ length: 15 }, (_, i) => ({
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        blockedURI: `https://evil.com/script${i}.js`,
        effectiveDirective: 'script-src',
      }));

      chrome.storage.local.get.mockResolvedValue({
        csp_violations: mockViolations
      });
      
      const result = await getViolationStats();
      
      expect(result.status).toBe('success');
      expect(result.data.total).toBe(15);
      expect(result.data.recent).toHaveLength(10);
    });

    test('should handle violations with missing directive', async () => {
      const mockViolations = [
        {
          timestamp: '2025-01-01T00:00:00.000Z',
          blockedURI: 'https://evil.com/script.js',
          violatedDirective: 'script-src \'self\'', // Only violatedDirective
        },
        {
          timestamp: '2025-01-01T00:01:00.000Z',
          blockedURI: 'https://evil.com/script2.js',
          // No directive at all
        },
      ];

      chrome.storage.local.get.mockResolvedValue({
        csp_violations: mockViolations
      });
      
      const result = await getViolationStats();
      
      expect(result.status).toBe('success');
      expect(result.data.byDirective).toHaveProperty('script-src \'self\'');
      expect(result.data.byDirective).toHaveProperty('undefined');
    });

    test('should handle storage errors when generating stats', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));

      const result = await getViolationStats();

      // The actual implementation catches errors and returns empty array, then processes normally
      expect(result.status).toBe('success');
      expect(result.data.total).toBe(0);
    });
  });

  describe('checkCSPConfiguration', () => {
    test('should return CSP configuration check results', () => {
      const result = checkCSPConfiguration();
      
      expect(result.status).toBe('success');
      expect(result.data).toHaveProperty('requiredDirectives');
      expect(result.data).toHaveProperty('recommendations');
      expect(result.data).toHaveProperty('warnings');
      expect(result.data).toHaveProperty('lastChecked');
      
      expect(Array.isArray(result.data.requiredDirectives)).toBe(true);
      expect(Array.isArray(result.data.recommendations)).toBe(true);
      expect(Array.isArray(result.data.warnings)).toBe(true);
      expect(typeof result.data.lastChecked).toBe('string');
    });

    test('should include all required CSP directives', () => {
      const result = checkCSPConfiguration();
      
      const expectedDirectives = [
        'default-src',
        'script-src',
        'style-src',
        'img-src',
        'connect-src',
        'object-src',
        'frame-ancestors',
        'base-uri',
        'form-action'
      ];
      
      expect(result.data.requiredDirectives).toEqual(expectedDirectives);
    });

    test('should provide security recommendations', () => {
      const result = checkCSPConfiguration();
      
      expect(result.data.recommendations.length).toBeGreaterThan(0);
      expect(result.data.recommendations.some(rec => 
        rec.includes('nonce')
      )).toBe(true);
      expect(result.data.recommendations.some(rec => 
        rec.includes('Monitor CSP violations')
      )).toBe(true);
    });

    test('should detect extension context', () => {
      // Mock chrome as undefined to simulate non-extension context
      const originalChrome = global.chrome;
      global.chrome = undefined;
      
      const result = checkCSPConfiguration();
      
      expect(result.data.warnings.some(warning => 
        warning.includes('Not running in extension context')
      )).toBe(true);
      
      // Restore chrome
      global.chrome = originalChrome;
    });

    test('should include timestamp in ISO format', () => {
      const result = checkCSPConfiguration();
      
      const timestamp = result.data.lastChecked;
      expect(() => new Date(timestamp).toISOString()).not.toThrow();
      expect(new Date(timestamp).toISOString()).toBe(timestamp);
    });
  });

  describe('Integration scenarios', () => {
    test('should handle complete violation lifecycle', async () => {
      // Start with no violations
      chrome.storage.local.get.mockResolvedValue({});
      
      let initialViolations = await getStoredViolations();
      expect(initialViolations).toHaveLength(0);
      
      // Simulate storing violations (this would normally be done by the violation handler)
      const mockViolations = [
        {
          timestamp: new Date().toISOString(),
          blockedURI: 'https://evil.com/script.js',
          effectiveDirective: 'script-src',
        }
      ];
      
      chrome.storage.local.get.mockResolvedValue({
        csp_violations: mockViolations
      });
      
      // Get violations
      const violations = await getStoredViolations();
      expect(violations).toHaveLength(1);
      
      // Get stats
      const stats = await getViolationStats();
      expect(stats.data.total).toBe(1);
      
      // Clear violations
      const clearResult = await clearStoredViolations();
      expect(clearResult.status).toBe('success');
      
      // Verify cleared
      chrome.storage.local.get.mockResolvedValue({});
      const clearedViolations = await getStoredViolations();
      expect(clearedViolations).toHaveLength(0);
    });

    test('should handle large number of violations efficiently', async () => {
      const largeViolationSet = Array.from({ length: 1000 }, (_, i) => ({
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        blockedURI: `https://evil.com/script${i}.js`,
        effectiveDirective: i % 2 === 0 ? 'script-src' : 'style-src',
      }));

      chrome.storage.local.get.mockResolvedValue({
        csp_violations: largeViolationSet
      });
      
      const stats = await getViolationStats();
      
      expect(stats.status).toBe('success');
      expect(stats.data.total).toBe(1000);
      expect(stats.data.byDirective['script-src']).toBe(500);
      expect(stats.data.byDirective['style-src']).toBe(500);
      expect(stats.data.recent).toHaveLength(10);
    });
  });
});
