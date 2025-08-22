/**
 * Unit Tests for Router Module
 * 
 * Tests the message routing functionality and error handling.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Mock all the modules that router depends on
jest.mock('../../modules/log-storage.js', () => ({
  addLog: jest.fn(),
  getLogs: jest.fn(),
  clearLogs: jest.fn(),
}));

jest.mock('../../modules/storage.js', () => ({
  saveConversation: jest.fn(),
  getAllConversations: jest.fn(),
  getConversations: jest.fn(),
  getTotalConversationCount: jest.fn(),
  deleteConversation: jest.fn(),
}));

jest.mock('../../modules/capture.js', () => ({
  getPlatformConfig: jest.fn(),
}));

jest.mock('../../modules/settings.js', () => ({
  getSetting: jest.fn(),
  setSetting: jest.fn(),
}));

jest.mock('../../modules/csp-reporter.js', () => ({
  storeViolation: jest.fn(),
  getStoredViolations: jest.fn(),
  clearStoredViolations: jest.fn(),
  getViolationStats: jest.fn(),
  checkCSPConfiguration: jest.fn(),
}));

jest.mock('../../modules/logger.js', () => ({
  createLogger: jest.fn(() => ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  })),
}));

import { initialize } from '../../modules/router.js';
import * as logStorage from '../../modules/log-storage.js';
import * as storage from '../../modules/storage.js';
import * as capture from '../../modules/capture.js';
import * as settings from '../../modules/settings.js';
import * as cspReporter from '../../modules/csp-reporter.js';

describe('Router Module', () => {
  let mockSendResponse;
  let mockSender;

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock functions
    mockSendResponse = jest.fn();
    mockSender = {
      tab: { id: 123 },
      url: 'https://example.com',
    };

    // Mock settings.getSetting to return false for debug logging
    settings.getSetting.mockResolvedValue(false);

    // Initialize the router
    await initialize();
  });

  describe('Message routing', () => {
    test('should route logging.addLog messages correctly', async () => {
      const message = {
        namespace: 'logging',
        action: 'addLog',
        payload: { message: 'Test log entry' },
      };

      logStorage.addLog.mockResolvedValue({ status: 'success' });

      // Get the message handler that was registered
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      const result = messageHandler(message, mockSender, mockSendResponse);

      expect(result).toBe(true); // Should return true for async response
      expect(logStorage.addLog).toHaveBeenCalledWith(message.payload);

      // Wait for async operation
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockSendResponse).toHaveBeenCalledWith({ status: 'success' });
    });

    test('should route database.saveConversation messages correctly', async () => {
      const message = {
        namespace: 'database',
        action: 'saveConversation',
        payload: global.testHelpers.createMockConversation(),
      };

      storage.saveConversation.mockResolvedValue({ 
        status: 'success', 
        data: { id: 1 } 
      });

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      messageHandler(message, mockSender, mockSendResponse);

      expect(storage.saveConversation).toHaveBeenCalledWith(message.payload);

      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockSendResponse).toHaveBeenCalledWith({ 
        status: 'success', 
        data: { id: 1 } 
      });
    });

    test('should route capture.getPlatformConfig messages correctly', async () => {
      const message = {
        namespace: 'capture',
        action: 'getPlatformConfig',
        payload: { platform: 'chatgpt' },
      };

      const mockConfig = { modulePath: 'scripts/capture/platforms/chatgpt.js' };
      capture.getPlatformConfig.mockReturnValue(mockConfig);

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      messageHandler(message, mockSender, mockSendResponse);

      expect(capture.getPlatformConfig).toHaveBeenCalledWith(message.payload);

      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockSendResponse).toHaveBeenCalledWith({ 
        status: 'success', 
        data: mockConfig 
      });
    });

    test('should route settings.get messages correctly', async () => {
      const message = {
        namespace: 'settings',
        action: 'get',
        payload: { key: 'debugLoggingEnabled' },
      };

      settings.getSetting.mockResolvedValue(true);

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      messageHandler(message, mockSender, mockSendResponse);

      expect(settings.getSetting).toHaveBeenCalledWith('debugLoggingEnabled');

      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockSendResponse).toHaveBeenCalledWith({ 
        status: 'success', 
        data: true 
      });
    });

    test('should route settings.set messages correctly', async () => {
      const message = {
        namespace: 'settings',
        action: 'set',
        payload: { key: 'debugLoggingEnabled', value: true },
      };

      settings.setSetting.mockResolvedValue();

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      messageHandler(message, mockSender, mockSendResponse);

      expect(settings.setSetting).toHaveBeenCalledWith('debugLoggingEnabled', true);

      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockSendResponse).toHaveBeenCalledWith({ 
        status: 'success', 
        data: undefined 
      });
    });

    test('should route security messages correctly', async () => {
      const message = {
        namespace: 'security',
        action: 'getCSPViolations',
        payload: {},
      };

      const mockViolations = [{ type: 'script-src', blockedURI: 'evil.com' }];
      cspReporter.getStoredViolations.mockResolvedValue(mockViolations);

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      messageHandler(message, mockSender, mockSendResponse);

      expect(cspReporter.getStoredViolations).toHaveBeenCalled();

      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockSendResponse).toHaveBeenCalledWith(mockViolations);
    });
  });

  describe('Error handling', () => {
    test('should handle unknown namespace', async () => {
      const message = {
        namespace: 'unknown',
        action: 'someAction',
        payload: {},
      };

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      messageHandler(message, mockSender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        status: 'error',
        message: 'Action not found'
      });
    });

    test('should handle unknown action', async () => {
      const message = {
        namespace: 'logging',
        action: 'unknownAction',
        payload: {},
      };

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      messageHandler(message, mockSender, mockSendResponse);

      expect(mockSendResponse).toHaveBeenCalledWith({
        status: 'error',
        message: 'Action not found'
      });
    });

    test('should handle handler errors gracefully', async () => {
      const message = {
        namespace: 'logging',
        action: 'addLog',
        payload: { message: 'Test log' },
      };

      // Mock the handler to throw an error
      logStorage.addLog.mockRejectedValue(new Error('Handler error'));

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      messageHandler(message, mockSender, mockSendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockSendResponse).toHaveBeenCalledWith({
        status: 'error',
        message: 'An unexpected error occurred in the router.',
        details: 'Handler error'
      });
    });

    test('should handle malformed messages', async () => {
      const malformedMessages = [
        {}, // Missing namespace and action
        { namespace: 'logging' }, // Missing action
        { action: 'addLog' }, // Missing namespace
        { namespace: null, action: 'addLog' },
        { namespace: 'logging', action: null },
      ];

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      for (const message of malformedMessages) {
        mockSendResponse.mockClear();

        // The actual router will throw on null/undefined, so we test valid objects only
        if (message && typeof message === 'object') {
          messageHandler(message, mockSender, mockSendResponse);

          expect(mockSendResponse).toHaveBeenCalledWith({
            status: 'error',
            message: 'Action not found'
          });
        }
      }
    });

    test('should handle null and undefined messages gracefully', async () => {
      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];

      // Test that null/undefined messages cause the expected error
      expect(() => {
        messageHandler(null, mockSender, mockSendResponse);
      }).toThrow();

      expect(() => {
        messageHandler(undefined, mockSender, mockSendResponse);
      }).toThrow();
    });
  });

  describe('Response format standardization', () => {
    test('should wrap successful responses in standard format', async () => {
      const message = {
        namespace: 'capture',
        action: 'getPlatformConfig',
        payload: { platform: 'chatgpt' },
      };

      const mockConfig = { modulePath: 'test.js' };
      capture.getPlatformConfig.mockReturnValue(mockConfig);

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      messageHandler(message, mockSender, mockSendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockSendResponse).toHaveBeenCalledWith({
        status: 'success',
        data: mockConfig
      });
    });

    test('should preserve existing response format', async () => {
      const message = {
        namespace: 'logging',
        action: 'addLog',
        payload: { message: 'Test' },
      };

      // Mock response already in correct format
      logStorage.addLog.mockResolvedValue({ 
        status: 'success', 
        data: { id: 1 } 
      });

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      messageHandler(message, mockSender, mockSendResponse);

      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockSendResponse).toHaveBeenCalledWith({
        status: 'success',
        data: { id: 1 }
      });
    });
  });

  describe('Initialization', () => {
    test('should register message listener on initialization', async () => {
      // Clear previous calls
      chrome.runtime.onMessage.addListener.mockClear();

      await initialize();

      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    test('should initialize logger with debug setting', async () => {
      settings.getSetting.mockResolvedValue(true);

      await initialize();

      expect(settings.getSetting).toHaveBeenCalledWith('debugLoggingEnabled');
    });
  });

  describe('Sender information handling', () => {
    test('should handle messages from tabs', async () => {
      const message = {
        namespace: 'logging',
        action: 'addLog',
        payload: { message: 'Test' },
      };

      const senderWithTab = {
        tab: { id: 456, url: 'https://example.com' },
      };

      logStorage.addLog.mockResolvedValue({ status: 'success' });

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      messageHandler(message, senderWithTab, mockSendResponse);

      expect(logStorage.addLog).toHaveBeenCalledWith(message.payload);
    });

    test('should handle messages from extension context', async () => {
      const message = {
        namespace: 'logging',
        action: 'addLog',
        payload: { message: 'Test' },
      };

      const senderWithoutTab = {
        url: 'chrome-extension://test-id/popup.html',
      };

      logStorage.addLog.mockResolvedValue({ status: 'success' });

      const messageHandler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
      messageHandler(message, senderWithoutTab, mockSendResponse);

      expect(logStorage.addLog).toHaveBeenCalledWith(message.payload);
    });
  });
});
