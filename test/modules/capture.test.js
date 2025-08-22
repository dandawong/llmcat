/**
 * Unit Tests for Capture Module
 * 
 * Tests the platform-specific capture configuration management.
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { getPlatformConfig } from '../../modules/capture.js';

describe('Capture Module', () => {
  describe('getPlatformConfig', () => {
    test('should return config for supported ChatGPT platform', () => {
      const result = getPlatformConfig({ platform: 'chatgpt' });
      
      expect(result).toEqual({
        modulePath: 'scripts/capture/platforms/chatgpt.js'
      });
    });

    test('should return config for supported Gemini platform', () => {
      const result = getPlatformConfig({ platform: 'gemini' });
      
      expect(result).toEqual({
        modulePath: 'scripts/capture/platforms/gemini.js'
      });
    });

    test('should return config for supported Claude platform', () => {
      const result = getPlatformConfig({ platform: 'claude' });
      
      expect(result).toEqual({
        modulePath: 'scripts/capture/platforms/claude.js'
      });
    });

    test('should return config for supported Tongyi platform', () => {
      const result = getPlatformConfig({ platform: 'tongyi' });
      
      expect(result).toEqual({
        modulePath: 'scripts/capture/platforms/tongyi.js'
      });
    });

    test('should return config for supported DeepSeek platform', () => {
      const result = getPlatformConfig({ platform: 'deepseek' });
      
      expect(result).toEqual({
        modulePath: 'scripts/capture/platforms/deepseek.js'
      });
    });

    test('should return null for unsupported platform', () => {
      const result = getPlatformConfig({ platform: 'unsupported' });
      
      expect(result).toBeNull();
    });

    test('should return null for undefined platform', () => {
      const result = getPlatformConfig({ platform: undefined });
      
      expect(result).toBeNull();
    });

    test('should return null for null platform', () => {
      const result = getPlatformConfig({ platform: null });
      
      expect(result).toBeNull();
    });

    test('should return null for empty string platform', () => {
      const result = getPlatformConfig({ platform: '' });
      
      expect(result).toBeNull();
    });

    test('should handle case sensitivity correctly', () => {
      // Test uppercase
      const upperResult = getPlatformConfig({ platform: 'CHATGPT' });
      expect(upperResult).toBeNull();
      
      // Test mixed case
      const mixedResult = getPlatformConfig({ platform: 'ChatGPT' });
      expect(mixedResult).toBeNull();
      
      // Only lowercase should work
      const lowerResult = getPlatformConfig({ platform: 'chatgpt' });
      expect(lowerResult).not.toBeNull();
    });

    test('should handle missing payload object', () => {
      // The actual function expects destructured parameter, so this will throw
      expect(() => {
        getPlatformConfig();
      }).toThrow();
    });

    test('should handle empty payload object', () => {
      const result = getPlatformConfig({});
      
      expect(result).toBeNull();
    });

    test('should handle payload with missing platform property', () => {
      const result = getPlatformConfig({ otherProperty: 'value' });
      
      expect(result).toBeNull();
    });

    test('should handle non-string platform values', () => {
      const testCases = [
        { platform: 123 },
        { platform: true },
        { platform: [] },
        { platform: {} },
        { platform: Symbol('test') },
      ];
      
      testCases.forEach(testCase => {
        const result = getPlatformConfig(testCase);
        expect(result).toBeNull();
      });
    });

    test('should return correct module paths for all supported platforms', () => {
      const expectedPlatforms = {
        'chatgpt': 'scripts/capture/platforms/chatgpt.js',
        'gemini': 'scripts/capture/platforms/gemini.js',
        'claude': 'scripts/capture/platforms/claude.js',
        'tongyi': 'scripts/capture/platforms/tongyi.js',
        'deepseek': 'scripts/capture/platforms/deepseek.js',
      };
      
      Object.entries(expectedPlatforms).forEach(([platform, expectedPath]) => {
        const result = getPlatformConfig({ platform });
        expect(result).toEqual({ modulePath: expectedPath });
      });
    });

    test('should handle platforms with special characters', () => {
      const specialPlatforms = [
        'chat-gpt',
        'chat.gpt',
        'chat_gpt',
        'chat gpt',
        'chatgpt!',
        '@chatgpt',
      ];
      
      specialPlatforms.forEach(platform => {
        const result = getPlatformConfig({ platform });
        expect(result).toBeNull();
      });
    });

    test('should be consistent across multiple calls', () => {
      const platform = 'chatgpt';
      const expectedResult = { modulePath: 'scripts/capture/platforms/chatgpt.js' };
      
      // Call multiple times
      const result1 = getPlatformConfig({ platform });
      const result2 = getPlatformConfig({ platform });
      const result3 = getPlatformConfig({ platform });
      
      expect(result1).toEqual(expectedResult);
      expect(result2).toEqual(expectedResult);
      expect(result3).toEqual(expectedResult);
      
      // Results should be equal but not the same object reference
      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2);
    });

    test('should handle payload with additional properties', () => {
      const payload = {
        platform: 'chatgpt',
        extraProperty: 'should be ignored',
        anotherProperty: 123,
      };
      
      const result = getPlatformConfig(payload);
      
      expect(result).toEqual({
        modulePath: 'scripts/capture/platforms/chatgpt.js'
      });
    });
  });

  describe('Module path validation', () => {
    test('should return valid file paths for all platforms', () => {
      const platforms = ['chatgpt', 'gemini', 'claude', 'tongyi', 'deepseek'];
      
      platforms.forEach(platform => {
        const result = getPlatformConfig({ platform });
        expect(result.modulePath).toMatch(/^scripts\/capture\/platforms\/\w+\.js$/);
        expect(result.modulePath).toContain(platform);
        expect(result.modulePath.endsWith('.js')).toBe(true);
      });
    });

    test('should return paths that follow consistent naming convention', () => {
      const platforms = ['chatgpt', 'gemini', 'claude', 'tongyi', 'deepseek'];
      
      platforms.forEach(platform => {
        const result = getPlatformConfig({ platform });
        const expectedPath = `scripts/capture/platforms/${platform}.js`;
        expect(result.modulePath).toBe(expectedPath);
      });
    });
  });
});
