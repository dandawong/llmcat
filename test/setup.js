/**
 * Jest Test Setup File
 * 
 * This file sets up the testing environment with Chrome API mocks,
 * IndexedDB simulation, and other necessary test utilities.
 */

import 'fake-indexeddb/auto';
import { jest } from '@jest/globals';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

// Helper to check if a value is a Jest mock function
const isMockFunction = (fn) => fn && typeof fn.mockReset === 'function';

// Factory function to create a fresh chrome mock object
const createChromeMock = () => {
  // Create storage state that persists across calls within a test
  const localStorageState = {};
  const sessionStorageState = {};

  return {
    storage: {
      local: {
        get: jest.fn((keys, callback) => {
          let result = {};
          if (Array.isArray(keys)) {
            keys.forEach(key => {
              if (localStorageState.hasOwnProperty(key)) {
                result[key] = localStorageState[key];
              }
            });
          } else if (typeof keys === 'string') {
            if (localStorageState.hasOwnProperty(keys)) {
              result[keys] = localStorageState[keys];
            }
          } else if (keys === null || keys === undefined) {
            result = { ...localStorageState };
          }
          if (callback) callback(result);
          return Promise.resolve(result);
        }),
        set: jest.fn((data, callback) => {
          Object.assign(localStorageState, data);
          if (callback) callback();
          return Promise.resolve();
        }),
        remove: jest.fn((keys, callback) => {
          const keysArray = Array.isArray(keys) ? keys : [keys];
          keysArray.forEach(key => delete localStorageState[key]);
          if (callback) callback();
          return Promise.resolve();
        }),
        clear: jest.fn((callback) => {
          Object.keys(localStorageState).forEach(key => delete localStorageState[key]);
          if (callback) callback();
          return Promise.resolve();
        }),
      },
      session: {
        get: jest.fn((keys, callback) => {
          let result = {};
          if (Array.isArray(keys)) {
            keys.forEach(key => {
              if (sessionStorageState.hasOwnProperty(key)) {
                result[key] = sessionStorageState[key];
              }
            });
          } else if (typeof keys === 'string') {
            if (sessionStorageState.hasOwnProperty(keys)) {
              result[keys] = sessionStorageState[keys];
            }
          } else if (keys === null || keys === undefined) {
            result = { ...sessionStorageState };
          }
          if (callback) callback(result);
          return Promise.resolve(result);
        }),
        set: jest.fn((data, callback) => {
          Object.assign(sessionStorageState, data);
          if (callback) callback();
          return Promise.resolve();
        }),
        remove: jest.fn((keys, callback) => {
          const keysArray = Array.isArray(keys) ? keys : [keys];
          keysArray.forEach(key => delete sessionStorageState[key]);
          if (callback) callback();
          return Promise.resolve();
        }),
        clear: jest.fn((callback) => {
          Object.keys(sessionStorageState).forEach(key => delete sessionStorageState[key]);
          if (callback) callback();
          return Promise.resolve();
        }),
      },
      onChanged: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
    },
    runtime: {
      sendMessage: jest.fn(),
      onMessage: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
      onConnect: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
      connect: jest.fn(),
      getURL: jest.fn((path) => `chrome-extension://test-id/${path}`),
      lastError: null,
    },
    alarms: {
      create: jest.fn(),
      clear: jest.fn(),
      get: jest.fn(),
      getAll: jest.fn(),
      onAlarm: {
        addListener: jest.fn(),
        removeListener: jest.fn(),
      },
    },
    tabs: {
      query: jest.fn(),
      get: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      remove: jest.fn(),
    },
    scripting: {
      executeScript: jest.fn(),
      insertCSS: jest.fn(),
      removeCSS: jest.fn(),
    },
  };
};

// Mock console methods for cleaner test output
global.console = {
  ...console,
  log: jest.fn((...args) => {
    // Also output to actual console for debugging
    process.stdout.write('LOG: ' + args.join(' ') + '\n');
  }),
  error: jest.fn((...args) => {
    // Also output to actual console for debugging
    process.stdout.write('ERROR: ' + args.join(' ') + '\n');
  }),
  warn: jest.fn((...args) => {
    // Also output to actual console for debugging
    process.stdout.write('WARN: ' + args.join(' ') + '\n');
  }),
  info: jest.fn((...args) => {
    // Also output to actual console for debugging
    process.stdout.write('INFO: ' + args.join(' ') + '\n');
  }),
  debug: jest.fn((...args) => {
    // Also output to actual console for debugging
    process.stdout.write('DEBUG: ' + args.join(' ') + '\n');
  }),
};

// Helper functions for tests
global.testHelpers = {
  createMockConversation: (overrides = {}) => ({
    id: Date.now() + Math.random(), // More unique ID
    platform: 'ChatGPT',
    prompt: 'Test prompt',
    response: 'Test response',
    title: 'Test conversation',
    url: `https://chat.openai.com/c/test-id-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ...overrides,
  }),
};

// Setup and teardown for each test
beforeEach(() => {
  // Always assign a fresh mock object before each test
  global.chrome = createChromeMock();
  
  // Reset IndexedDB for each test
  global.indexedDB = new FDBFactory();
  global.IDBKeyRange = FDBKeyRange;
  
  jest.clearAllMocks();
});

afterEach(() => {
  // Clean up IndexedDB after each test
  if (global.indexedDB && global.indexedDB._databases) {
    global.indexedDB._databases.clear();
  }
});

// Save references to the native TextEncoder and TextDecoder if they exist
const NativeTextEncoder = typeof TextEncoder !== 'undefined' ? TextEncoder : null;
const NativeTextDecoder = typeof TextDecoder !== 'undefined' ? TextDecoder : null;

// Mock TextDecoder for tests
global.TextDecoder = class {
  decode(buffer) {
    // Use the native TextDecoder if available, otherwise fall back to a simple implementation
    if (NativeTextDecoder) {
      return new NativeTextDecoder().decode(buffer);
    }
    // Simple fallback implementation for testing purposes
    return Array.from(buffer).map(byte => String.fromCharCode(byte)).join('');
  }
};

// Mock TextEncoder for tests
global.TextEncoder = class {
  encode(string) {
    // Use the native TextEncoder if available, otherwise fall back to a simple implementation
    if (NativeTextEncoder) {
      return new NativeTextEncoder().encode(string);
    }
    // Simple fallback implementation for testing purposes
    return new Uint8Array(string.split('').map(char => char.charCodeAt(0)));
  }
};

// Mock structuredClone for tests
if (typeof structuredClone === 'undefined') {
  global.structuredClone = (obj) => {
    // Simple implementation for testing purposes
    return JSON.parse(JSON.stringify(obj));
  };
}
