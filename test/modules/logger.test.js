/**
 * Unit Tests for Logger Module
 * 
 * Tests the centralized logging functionality with debug mode controls.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { createLogger } from '../../modules/logger.js';

describe('Logger Module', () => {
  let consoleSpy;
  
  beforeEach(() => {
    // Spy on console methods
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {}),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
    };
  });

  describe('createLogger', () => {
    test('should create logger with debug mode enabled', () => {
      const logger = createLogger(true);
      
      expect(logger).toHaveProperty('log');
      expect(logger).toHaveProperty('error');
      expect(logger).toHaveProperty('warn');
      expect(typeof logger.log).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
    });

    test('should create logger with debug mode disabled', () => {
      const logger = createLogger(false);
      
      expect(logger).toHaveProperty('log');
      expect(logger).toHaveProperty('error');
      expect(logger).toHaveProperty('warn');
      expect(typeof logger.log).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
    });
  });

  describe('Logger with debug mode enabled', () => {
    let logger;

    beforeEach(() => {
      logger = createLogger(true);
    });

    test('should log messages when debug mode is enabled', () => {
      const testMessage = 'Test log message';
      const testData = { key: 'value' };
      
      logger.log(testMessage, testData);
      
      expect(consoleSpy.log).toHaveBeenCalledWith('LLMCat:', testMessage, testData);
      expect(consoleSpy.log).toHaveBeenCalledTimes(1);
    });

    test('should log error messages when debug mode is enabled', () => {
      const testError = 'Test error message';
      const errorObject = new Error('Test error');
      
      logger.error(testError, errorObject);
      
      expect(consoleSpy.error).toHaveBeenCalledWith('LLMCat:', testError, errorObject);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    test('should log warning messages when debug mode is enabled', () => {
      const testWarning = 'Test warning message';
      
      logger.warn(testWarning);
      
      expect(consoleSpy.warn).toHaveBeenCalledWith('LLMCat:', testWarning);
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
    });

    test('should handle multiple arguments', () => {
      const arg1 = 'First argument';
      const arg2 = { data: 'object' };
      const arg3 = [1, 2, 3];
      
      logger.log(arg1, arg2, arg3);
      
      expect(consoleSpy.log).toHaveBeenCalledWith('LLMCat:', arg1, arg2, arg3);
    });

    test('should handle no arguments', () => {
      logger.log();
      
      expect(consoleSpy.log).toHaveBeenCalledWith('LLMCat:');
    });
  });

  describe('Logger with debug mode disabled', () => {
    let logger;

    beforeEach(() => {
      logger = createLogger(false);
    });

    test('should not log messages when debug mode is disabled', () => {
      const testMessage = 'Test log message';
      
      logger.log(testMessage);
      
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    test('should still log error messages when debug mode is disabled', () => {
      const testError = 'Test error message';
      
      logger.error(testError);
      
      expect(consoleSpy.error).toHaveBeenCalledWith('LLMCat:', testError);
      expect(consoleSpy.error).toHaveBeenCalledTimes(1);
    });

    test('should not log warning messages when debug mode is disabled', () => {
      const testWarning = 'Test warning message';
      
      logger.warn(testWarning);
      
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    test('should handle undefined debug mode (falsy)', () => {
      const logger = createLogger(undefined);
      
      logger.log('Test message');
      
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    test('should handle null debug mode (falsy)', () => {
      const logger = createLogger(null);
      
      logger.log('Test message');
      
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    test('should handle string "true" as truthy', () => {
      const logger = createLogger('true');
      
      logger.log('Test message');
      
      expect(consoleSpy.log).toHaveBeenCalled();
    });

    test('should handle empty string as falsy', () => {
      const logger = createLogger('');
      
      logger.log('Test message');
      
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });
  });
});
