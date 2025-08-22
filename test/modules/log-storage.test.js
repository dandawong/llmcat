/**
 * Unit Tests for Log Storage Module
 * 
 * Tests the log storage functionality with session storage.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Mock chrome.storage.session
const mockSessionStorage = {};

global.chrome = {
  storage: {
    session: {
      get: jest.fn().mockImplementation((key) => {
        return Promise.resolve({ [key]: mockSessionStorage[key] || [] });
      }),
      set: jest.fn().mockImplementation((data) => {
        Object.keys(data).forEach(key => {
          mockSessionStorage[key] = data[key];
        });
        return Promise.resolve();
      }),
      remove: jest.fn().mockImplementation((key) => {
        delete mockSessionStorage[key];
        return Promise.resolve();
      })
    }
  }
};

describe('Log Storage Module', () => {
  const LOG_STORAGE_KEY = 'llmcat_debug_logs';
  
  beforeEach(() => {
    // Clear mock storage before each test
    Object.keys(mockSessionStorage).forEach(key => {
      delete mockSessionStorage[key];
    });
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('addLog', () => {
    test('should add a log entry to storage', async () => {
      const { addLog } = await import('../../modules/log-storage.js');
      
      const logEntry = {
        timestamp: new Date().toISOString(),
        message: 'Test log message',
        level: 'info'
      };
      
      const result = await addLog(logEntry);
      
      expect(result.status).toBe('success');
      expect(chrome.storage.session.set).toHaveBeenCalledWith({ 
        [LOG_STORAGE_KEY]: [logEntry] 
      });
    });

    test('should trim logs when exceeding max count', async () => {
      const { addLog } = await import('../../modules/log-storage.js');
      
      // Add more than MAX_LOG_ENTRIES (500) log entries
      const logEntries = [];
      for (let i = 0; i < 505; i++) {
        logEntries.push({
          timestamp: new Date(Date.now() - (505 - i) * 1000).toISOString(),
          message: `Log entry ${i}`,
          level: 'info'
        });
      }
      
      // Mock get to return existing logs (first 500 entries)
      chrome.storage.session.get.mockImplementationOnce(() => 
        Promise.resolve({ [LOG_STORAGE_KEY]: logEntries.slice(0, 500) })
      );
      
      const newLogEntry = {
        timestamp: new Date().toISOString(),
        message: 'New log entry',
        level: 'info'
      };
      
      const result = await addLog(newLogEntry);
      
      // When adding a new entry to 500 existing entries, the oldest entry (first one) 
      // should be removed, keeping the newest 500 entries
      expect(result.status).toBe('success');
      expect(chrome.storage.session.set).toHaveBeenCalledWith({ 
        [LOG_STORAGE_KEY]: [...logEntries.slice(1, 500), newLogEntry] 
      });
    });

    test('should handle errors when adding log', async () => {
      const { addLog } = await import('../../modules/log-storage.js');
      
      // Mock set to throw an error
      chrome.storage.session.set.mockImplementationOnce(() => {
        return Promise.reject(new Error('Storage error'));
      });
      
      const logEntry = {
        timestamp: new Date().toISOString(),
        message: 'Test log message',
        level: 'info'
      };
      
      const result = await addLog(logEntry);
      
      expect(result.status).toBe('error');
      expect(result.error).toBe('Storage error');
    });
  });

  describe('getLogs', () => {
    test('should retrieve logs from storage in reverse order', async () => {
      const { getLogs } = await import('../../modules/log-storage.js');
      
      const logEntries = [
        { timestamp: new Date(Date.now() - 2000).toISOString(), message: 'First log', level: 'info' },
        { timestamp: new Date(Date.now() - 1000).toISOString(), message: 'Second log', level: 'warn' },
        { timestamp: new Date().toISOString(), message: 'Third log', level: 'error' }
      ];
      
      // Mock get to return existing logs
      chrome.storage.session.get.mockImplementationOnce(() => 
        Promise.resolve({ [LOG_STORAGE_KEY]: logEntries })
      );
      
      const result = await getLogs();
      
      expect(result.status).toBe('success');
      expect(result.data).toEqual([logEntries[2], logEntries[1], logEntries[0]]);
    });

    test('should handle errors when retrieving logs', async () => {
      const { getLogs } = await import('../../modules/log-storage.js');
      
      // Mock get to throw an error
      chrome.storage.session.get.mockImplementationOnce(() => {
        return Promise.reject(new Error('Storage error'));
      });
      
      const result = await getLogs();
      
      expect(result.status).toBe('error');
      expect(result.error).toBe('Storage error');
    });

    test('should return empty array when no logs exist', async () => {
      const { getLogs } = await import('../../modules/log-storage.js');
      
      const result = await getLogs();
      
      expect(result.status).toBe('success');
      expect(result.data).toEqual([]);
    });
  });

  describe('clearLogs', () => {
    test('should clear logs from storage', async () => {
      const { clearLogs } = await import('../../modules/log-storage.js');
      
      // Add some logs first
      const logEntries = [
        { timestamp: new Date().toISOString(), message: 'Test log', level: 'info' }
      ];
      
      // Mock get to return existing logs
      chrome.storage.session.get.mockImplementationOnce(() => 
        Promise.resolve({ [LOG_STORAGE_KEY]: logEntries })
      );
      
      const result = await clearLogs();
      
      expect(result.status).toBe('success');
      expect(chrome.storage.session.remove).toHaveBeenCalledWith(LOG_STORAGE_KEY);
    });

    test('should handle errors when clearing logs', async () => {
      const { clearLogs } = await import('../../modules/log-storage.js');
      
      // Mock remove to throw an error
      chrome.storage.session.remove.mockImplementationOnce(() => {
        return Promise.reject(new Error('Storage error'));
      });
      
      const result = await clearLogs();
      
      expect(result.status).toBe('error');
      expect(result.error).toBe('Storage error');
    });
  });
});
