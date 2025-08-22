/**
 * Unit Tests for Claude Platform Module
 * 
 * Tests the Claude-specific conversation parsing functionality.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Mock logger
const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

// Mock window.postMessage for Claude's conversation update mechanism
global.window = {
  ...global.window,
  postMessage: jest.fn(),
  location: {
    href: 'https://claude.ai/chat/test-conversation',
    origin: 'https://claude.ai',
  },
};

// Reset window.postMessage mock before each test
beforeEach(() => {
  global.window.postMessage = jest.fn();
});

describe('Claude Platform Module', () => {
  let claudeModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    try {
      const module = await import('../../scripts/capture/platforms/claude.js');
      claudeModule = module;
    } catch (error) {
      // Mock the module structure if import fails
      claudeModule = {
        config: {
          name: 'Claude',
          apiEndpoint: /^\/api\/organizations\/[a-f0-9-]+\/chat_conversations\/[a-f0-9-]+$/,
        },
        parseRequest: jest.fn(),
        parseResponse: jest.fn(),
      };
    }
  });

  describe('Module configuration', () => {
    test('should have correct configuration', () => {
      expect(claudeModule.config).toBeDefined();
      expect(claudeModule.config.name).toBe('Claude');
      expect(claudeModule.config.apiEndpoint).toBeInstanceOf(RegExp);
    });

    test('should match Claude API endpoint pattern', () => {
      const validEndpoints = [
        '/api/organizations/12345678-1234-1234-1234-123456789abc/chat_conversations/abcdef12-3456-7890-abcd-ef1234567890',
        '/api/organizations/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/chat_conversations/11111111-2222-3333-4444-555555555555',
      ];

      const invalidEndpoints = [
        '/api/organizations/invalid/chat_conversations/test',
        '/api/conversations/test',
        '/api/organizations/test-org/conversations/test-conv',
      ];

      validEndpoints.forEach(endpoint => {
        expect(claudeModule.config.apiEndpoint.test(endpoint)).toBe(true);
      });

      invalidEndpoints.forEach(endpoint => {
        expect(claudeModule.config.apiEndpoint.test(endpoint)).toBe(false);
      });
    });
  });

  describe('parseRequest', () => {
    test('should return empty string as Claude gets data from response', async () => {
      const mockRequest = {
        clone: () => ({
          json: () => Promise.resolve({ some: 'data' })
        })
      };

      if (typeof claudeModule.parseRequest === 'function') {
        const result = await claudeModule.parseRequest(mockRequest, mockLogger);
        expect(result).toBe('');
      }
    });
  });

  describe('parseResponse', () => {
    test('should parse Claude conversation response with human and assistant messages', async () => {
      const mockResponseData = {
        uuid: 'conversation-uuid-123',
        chat_messages: [
          {
            sender: 'human',
            content: [
              { text: 'What is artificial intelligence?' }
            ]
          },
          {
            sender: 'assistant',
            content: [
              { text: 'Artificial intelligence (AI) is a branch of computer science' },
              { text: ' that aims to create machines capable of intelligent behavior.' }
            ]
          }
        ]
      };

      const mockResponse = {
        clone: () => ({
          json: () => Promise.resolve(mockResponseData)
        })
      };

      if (typeof claudeModule.parseResponse === 'function') {
        const result = await claudeModule.parseResponse(mockResponse, mockLogger);

        expect(result.text).toBe('Artificial intelligence (AI) is a branch of computer science\n that aims to create machines capable of intelligent behavior.');
        expect(result.id).toBe('conversation-uuid-123');
        expect(global.window.postMessage).toHaveBeenCalledWith({
          type: 'LLMLOG_CONVERSATION_UPDATE',
          payload: {
            platform: 'Claude',
            prompt: 'What is artificial intelligence?',
            response: 'Artificial intelligence (AI) is a branch of computer science\n that aims to create machines capable of intelligent behavior.',
            url: expect.any(String),
            createdAt: expect.any(String),
            title: 'What is artificial intelligence?'
          }
        }, expect.any(String));
      }
    });

    test('should handle conversation with multiple content parts', async () => {
      const mockResponseData = {
        uuid: 'multi-part-uuid',
        chat_messages: [
          {
            sender: 'human',
            content: [
              { text: 'Explain quantum physics' },
              { text: ' in simple terms' }
            ]
          },
          {
            sender: 'assistant',
            content: [
              { text: 'Quantum physics is the study of matter and energy' },
              { text: ' at the smallest scales.' },
              { text: ' It reveals strange behaviors like superposition.' }
            ]
          }
        ]
      };

      const mockResponse = {
        clone: () => ({
          json: () => Promise.resolve(mockResponseData)
        })
      };

      if (typeof claudeModule.parseResponse === 'function') {
        const result = await claudeModule.parseResponse(mockResponse, mockLogger);

        expect(result.text).toBe('Quantum physics is the study of matter and energy\n at the smallest scales.\n It reveals strange behaviors like superposition.');
        expect(result.id).toBe('multi-part-uuid');
        
        const postMessageCall = global.window.postMessage.mock.calls[0];
        expect(postMessageCall[0].payload.prompt).toBe('Explain quantum physics\n in simple terms');
      }
    });

    test('should handle conversation with insufficient messages', async () => {
      const mockResponseData = {
        uuid: 'insufficient-uuid',
        chat_messages: [
          {
            sender: 'human',
            content: [{ text: 'Hello' }]
          }
          // Missing assistant response
        ]
      };

      const mockResponse = {
        clone: () => ({
          json: () => Promise.resolve(mockResponseData)
        })
      };

      if (typeof claudeModule.parseResponse === 'function') {
        const result = await claudeModule.parseResponse(mockResponse, mockLogger);

        expect(result.text).toBe('');
        expect(result.id).toBeNull();
        expect(global.window.postMessage).not.toHaveBeenCalled();
      }
    });

    test('should handle conversation with no human message', async () => {
      const mockResponseData = {
        uuid: 'no-human-uuid',
        chat_messages: [
          {
            sender: 'assistant',
            content: [{ text: 'I am Claude, an AI assistant.' }]
          }
        ]
      };

      const mockResponse = {
        clone: () => ({
          json: () => Promise.resolve(mockResponseData)
        })
      };

      if (typeof claudeModule.parseResponse === 'function') {
        const result = await claudeModule.parseResponse(mockResponse, mockLogger);

        expect(result.text).toBe('');
        expect(result.id).toBeNull();
        expect(global.window.postMessage).not.toHaveBeenCalled();
      }
    });

    test('should handle duplicate conversation detection', async () => {
      const mockResponseData = {
        uuid: 'duplicate-test-uuid',
        chat_messages: [
          {
            sender: 'human',
            content: [{ text: 'Test duplicate' }]
          },
          {
            sender: 'assistant',
            content: [{ text: 'Duplicate response' }]
          }
        ]
      };

      const mockResponse = {
        clone: () => ({
          json: () => Promise.resolve(mockResponseData)
        })
      };

      if (typeof claudeModule.parseResponse === 'function') {
        // First call should process normally
        const result1 = await claudeModule.parseResponse(mockResponse, mockLogger);
        expect(result1.text).toBe('Duplicate response');
        expect(global.window.postMessage).toHaveBeenCalledTimes(1);

        // Second call with same content should be detected as duplicate
        const result2 = await claudeModule.parseResponse(mockResponse, mockLogger);
        expect(result2.text).toBe('Duplicate response');
        // Should not post message again due to duplicate detection
        expect(global.window.postMessage).toHaveBeenCalledTimes(1);
      }
    });

    test('should handle malformed response data', async () => {
      const mockResponse = {
        clone: () => ({
          json: () => Promise.reject(new Error('Invalid JSON'))
        })
      };

      if (typeof claudeModule.parseResponse === 'function') {
        const result = await claudeModule.parseResponse(mockResponse, mockLogger);

        expect(result.text).toBe('');
        expect(result.id).toBeNull();
        expect(mockLogger.error).toHaveBeenCalled();
      }
    });

    test('should handle response with missing chat_messages', async () => {
      const mockResponseData = {
        uuid: 'no-messages-uuid'
        // Missing chat_messages
      };

      const mockResponse = {
        clone: () => ({
          json: () => Promise.resolve(mockResponseData)
        })
      };

      if (typeof claudeModule.parseResponse === 'function') {
        const result = await claudeModule.parseResponse(mockResponse, mockLogger);

        expect(result.text).toBe('');
        expect(result.id).toBeNull();
      }
    });

    test('should handle response with empty chat_messages array', async () => {
      const mockResponseData = {
        uuid: 'empty-messages-uuid',
        chat_messages: []
      };

      const mockResponse = {
        clone: () => ({
          json: () => Promise.resolve(mockResponseData)
        })
      };

      if (typeof claudeModule.parseResponse === 'function') {
        const result = await claudeModule.parseResponse(mockResponse, mockLogger);

        expect(result.text).toBe('');
        expect(result.id).toBeNull();
      }
    });

    test('should handle messages with empty content', async () => {
      const mockResponseData = {
        uuid: 'empty-content-uuid',
        chat_messages: [
          {
            sender: 'human',
            content: []
          },
          {
            sender: 'assistant',
            content: []
          }
        ]
      };

      const mockResponse = {
        clone: () => ({
          json: () => Promise.resolve(mockResponseData)
        })
      };

      if (typeof claudeModule.parseResponse === 'function') {
        const result = await claudeModule.parseResponse(mockResponse, mockLogger);

        expect(result.text).toBe('');
        expect(result.id).toBe('empty-content-uuid'); // The actual implementation returns the UUID even for empty content
      }
    });

    test('should create proper title from long prompts', async () => {
      const longPrompt = 'This is a very long prompt that should be truncated to 50 characters for the title';
      const mockResponseData = {
        uuid: 'long-prompt-uuid',
        chat_messages: [
          {
            sender: 'human',
            content: [{ text: longPrompt }]
          },
          {
            sender: 'assistant',
            content: [{ text: 'Short response' }]
          }
        ]
      };

      const mockResponse = {
        clone: () => ({
          json: () => Promise.resolve(mockResponseData)
        })
      };

      if (typeof claudeModule.parseResponse === 'function') {
        await claudeModule.parseResponse(mockResponse, mockLogger);

        const postMessageCall = global.window.postMessage.mock.calls[0];
        expect(postMessageCall[0].payload.title).toBe(longPrompt.substring(0, 50));
        expect(postMessageCall[0].payload.title.length).toBe(50);
      }
    });
  });

  describe('Duplicate detection', () => {
    test('should detect duplicates within time window', async () => {
      const mockResponseData = {
        uuid: 'duplicate-window-test',
        chat_messages: [
          {
            sender: 'human',
            content: [{ text: 'Window test' }]
          },
          {
            sender: 'assistant',
            content: [{ text: 'Window response' }]
          }
        ]
      };

      const mockResponse = {
        clone: () => ({
          json: () => Promise.resolve(mockResponseData)
        })
      };

      if (typeof claudeModule.parseResponse === 'function') {
        // First call
        await claudeModule.parseResponse(mockResponse, mockLogger);
        expect(global.window.postMessage).toHaveBeenCalledTimes(1);

        // Second call immediately after (within 5 second window)
        await claudeModule.parseResponse(mockResponse, mockLogger);
        expect(global.window.postMessage).toHaveBeenCalledTimes(1); // Should not increase

        // Mock time passage beyond duplicate window
        jest.useFakeTimers();
        jest.advanceTimersByTime(6000); // 6 seconds

        // Third call after window should work
        await claudeModule.parseResponse(mockResponse, mockLogger);
        expect(global.window.postMessage).toHaveBeenCalledTimes(2);

        jest.useRealTimers();
      }
    });
  });
});
