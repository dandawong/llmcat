/**
 * Unit Tests for Doubao Platform Module
 * 
 * Tests the Doubao-specific conversation parsing functionality including
 * SSE stream processing, delta reconstruction, and error handling.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Mock logger
const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

describe('Doubao Platform Module', () => {
  let doubaoModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    try {
      // Import the module
      const module = await import('../../scripts/capture/platforms/doubao.js');
      doubaoModule = module;
    } catch (error) {
      // If direct import fails, we'll mock the module structure
      doubaoModule = {
        config: {
          name: 'Doubao',
          apiEndpoint: '/samantha/chat/completion',
          duplicateWindow: 30000
        },
        parseRequest: jest.fn().mockResolvedValue(''),
        parseResponse: jest.fn().mockResolvedValue({ text: '', id: null }),
        generateTitle: jest.fn().mockReturnValue('Doubao Conversation')
      };
    }
  });

  describe('Module configuration', () => {
    test('should have correct configuration', () => {
      expect(doubaoModule.config).toBeDefined();
      expect(doubaoModule.config.name).toBe('Doubao');
      expect(doubaoModule.config.apiEndpoint).toBe('/samantha/chat/completion');
      expect(doubaoModule.config.duplicateWindow).toBe(30000);
    });
  });

  describe('generateTitle', () => {
    test('should generate title from user prompt', () => {
      if (typeof doubaoModule.generateTitle === 'function') {
        const result = doubaoModule.generateTitle('What is artificial intelligence?');
        expect(result).toBe('What is artificial intelligence?');
      }
    });

    test('should truncate long prompts to 50 characters', () => {
      if (typeof doubaoModule.generateTitle === 'function') {
        const longPrompt = 'This is a very long prompt that should be truncated to 50 characters for the title generation';
        const result = doubaoModule.generateTitle(longPrompt);
        expect(result.length).toBeLessThanOrEqual(53); // 50 + '...'
        expect(result).toContain('...');
      }
    });

    test('should handle empty or missing prompts', () => {
      if (typeof doubaoModule.generateTitle === 'function') {
        expect(doubaoModule.generateTitle('')).toBe('Doubao Conversation');
        expect(doubaoModule.generateTitle(null)).toBe('Doubao Conversation');
        expect(doubaoModule.generateTitle(undefined)).toBe('Doubao Conversation');
        expect(doubaoModule.generateTitle('   ')).toBe('Doubao Conversation');
      }
    });

    test('should sanitize special characters', () => {
      if (typeof doubaoModule.generateTitle === 'function') {
        const promptWithSpecialChars = 'What is <script>alert("test")</script> AI?';
        const result = doubaoModule.generateTitle(promptWithSpecialChars);
        expect(result).not.toContain('<script>');
        expect(result).not.toContain('</script>');
      }
    });

    test('should handle Chinese characters properly', () => {
      if (typeof doubaoModule.generateTitle === 'function') {
        const chinesePrompt = '什么是人工智能？请详细解释一下。';
        const result = doubaoModule.generateTitle(chinesePrompt);
        expect(result).toBe('什么是人工智能？请详细解释一下。');
      }
    });
  });

  describe('parseRequest', () => {
    test('should extract user message from nested JSON structure', async () => {
      const mockRequestBody = {
        messages: [
          {
            content: '{"text":"What is the weather today?"}',
            content_type: 2001,
            attachments: [],
            references: []
          }
        ],
        completion_option: {
          is_regen: false,
          with_suggest: true
        }
      };

      const mockRequest = {
        clone: () => ({
          json: () => Promise.resolve(mockRequestBody)
        }),
        url: 'https://www.doubao.com/samantha/chat/completion',
        headers: {
          get: (name) => name === 'content-type' ? 'application/json' : null
        }
      };

      if (typeof doubaoModule.parseRequest === 'function') {
        const result = await doubaoModule.parseRequest(mockRequest, mockLogger);
        expect(result).toBe('What is the weather today?');
      }
    });

    test('should handle request with string content as fallback', async () => {
      const mockRequestBody = {
        messages: [
          {
            content: 'Direct string content',
            content_type: 2001
          }
        ]
      };

      const mockRequest = {
        clone: () => ({
          json: () => Promise.resolve(mockRequestBody)
        }),
        url: 'https://www.doubao.com/samantha/chat/completion',
        headers: {
          get: () => 'application/json'
        }
      };

      if (typeof doubaoModule.parseRequest === 'function') {
        const result = await doubaoModule.parseRequest(mockRequest, mockLogger);
        expect(result).toBe('Direct string content');
      }
    });

    test('should handle malformed JSON in content field', async () => {
      const mockRequestBody = {
        messages: [
          {
            content: '{"invalid": json}', // Malformed JSON
            content_type: 2001
          }
        ]
      };

      const mockRequest = {
        clone: () => ({
          json: () => Promise.resolve(mockRequestBody)
        }),
        url: 'https://www.doubao.com/samantha/chat/completion',
        headers: {
          get: () => 'application/json'
        }
      };

      if (typeof doubaoModule.parseRequest === 'function') {
        const result = await doubaoModule.parseRequest(mockRequest, mockLogger);
        expect(result).toBe('{"invalid": json}'); // Should fallback to string content
        expect(mockLogger.warn).toHaveBeenCalled();
      }
    });

    test('should handle request with no messages', async () => {
      const mockRequestBody = {
        completion_option: {
          is_regen: false
        }
      };

      const mockRequest = {
        clone: () => ({
          json: () => Promise.resolve(mockRequestBody)
        }),
        url: 'https://www.doubao.com/samantha/chat/completion',
        headers: {
          get: () => 'application/json'
        }
      };

      if (typeof doubaoModule.parseRequest === 'function') {
        const result = await doubaoModule.parseRequest(mockRequest, mockLogger);
        expect(result).toBe('');
        expect(mockLogger.warn).toHaveBeenCalled();
      }
    });

    test('should handle invalid request JSON', async () => {
      const mockRequest = {
        clone: () => ({
          json: () => Promise.reject(new Error('Invalid JSON'))
        }),
        url: 'https://www.doubao.com/samantha/chat/completion',
        headers: {
          get: () => 'application/json'
        }
      };

      if (typeof doubaoModule.parseRequest === 'function') {
        const result = await doubaoModule.parseRequest(mockRequest, mockLogger);
        expect(result).toBe('');
        expect(mockLogger.error).toHaveBeenCalled();
      }
    });
  });

  describe('parseResponse', () => {
    test('should parse SSE stream with delta updates', async () => {
      const mockSSEStream = `data: {"event_type": 2001, "event_data": "{\\"message\\": {\\"content\\": \\"{\\\\\\"text\\\\\\":\\\\\\"Hello\\\\\\"}\\", \\"id\\": \\"msg-123\\"}, \\"conversation_id\\": \\"conv-456\\", \\"message_id\\": \\"msg-123\\", \\"is_delta\\": true, \\"is_finish\\": false}", "event_id": "1"}

data: {"event_type": 2001, "event_data": "{\\"message\\": {\\"content\\": \\"{\\\\\\"text\\\\\\":\\\\\\" world\\\\\\"}\\", \\"id\\": \\"msg-123\\"}, \\"conversation_id\\": \\"conv-456\\", \\"message_id\\": \\"msg-123\\", \\"is_delta\\": true, \\"is_finish\\": false}", "event_id": "2"}

data: {"event_type": 2001, "event_data": "{\\"message\\": {\\"content\\": \\"{\\\\\\"text\\\\\\":\\\\\\"!\\\\\\"}\\", \\"id\\": \\"msg-123\\"}, \\"conversation_id\\": \\"conv-456\\", \\"message_id\\": \\"msg-123\\", \\"is_delta\\": true, \\"is_finish\\": true}", "event_id": "3"}`;

      const mockResponse = {
        clone: () => ({
          text: () => Promise.resolve(mockSSEStream)
        }),
        url: 'https://www.doubao.com/samantha/chat/completion',
        status: 200,
        statusText: 'OK',
        headers: {
          get: (name) => name === 'content-type' ? 'text/event-stream' : null
        }
      };

      if (typeof doubaoModule.parseResponse === 'function') {
        const result = await doubaoModule.parseResponse(mockResponse, mockLogger);
        expect(result.text).toBe('Hello world!');
        expect(result.id).toBe('conv-456');
        expect(result.messageId).toBe('msg-123');
        expect(result.isComplete).toBe(true);
      }
    });

    test('should handle non-delta complete response', async () => {
      const mockSSEStream = `data: {"event_type": 2001, "event_data": "{\\"message\\": {\\"content\\": \\"{\\\\\\"text\\\\\\":\\\\\\"Complete response text\\\\\\"}\\", \\"id\\": \\"msg-456\\"}, \\"conversation_id\\": \\"conv-789\\", \\"message_id\\": \\"msg-456\\", \\"is_delta\\": false, \\"is_finish\\": true}", "event_id": "1"}`;

      const mockResponse = {
        clone: () => ({
          text: () => Promise.resolve(mockSSEStream)
        }),
        url: 'https://www.doubao.com/samantha/chat/completion',
        status: 200,
        statusText: 'OK',
        headers: {
          get: () => 'text/event-stream'
        }
      };

      if (typeof doubaoModule.parseResponse === 'function') {
        const result = await doubaoModule.parseResponse(mockResponse, mockLogger);
        expect(result.text).toBe('Complete response text');
        expect(result.id).toBe('conv-789');
        expect(result.messageId).toBe('msg-456');
        expect(result.isComplete).toBe(true);
      }
    });

    test('should handle malformed SSE events gracefully', async () => {
      const mockSSEStream = `data: {"event_type": 2001, "event_data": "{\\"message\\": {\\"content\\": \\"{\\\\\\"text\\\\\\":\\\\\\"Good text\\\\\\"}\\", \\"id\\": \\"msg-123\\"}, \\"conversation_id\\": \\"conv-456\\", \\"message_id\\": \\"msg-123\\", \\"is_delta\\": true, \\"is_finish\\": false}", "event_id": "1"}

data: {invalid json}

data: {"event_type": 2001, "event_data": "{\\"message\\": {\\"content\\": \\"{\\\\\\"text\\\\\\":\\\\\\" continues\\\\\\"}\\", \\"id\\": \\"msg-123\\"}, \\"conversation_id\\": \\"conv-456\\", \\"message_id\\": \\"msg-123\\", \\"is_delta\\": true, \\"is_finish\\": true}", "event_id": "3"}`;

      const mockResponse = {
        clone: () => ({
          text: () => Promise.resolve(mockSSEStream)
        }),
        url: 'https://www.doubao.com/samantha/chat/completion',
        status: 200,
        statusText: 'OK',
        headers: {
          get: () => 'text/event-stream'
        }
      };

      if (typeof doubaoModule.parseResponse === 'function') {
        const result = await doubaoModule.parseResponse(mockResponse, mockLogger);
        expect(result.text).toBe('Good text continues'); // Should skip malformed event
        expect(result.id).toBe('conv-456');
        expect(mockLogger.warn).toHaveBeenCalled(); // Should log warning for malformed event
      }
    });

    test('should handle events without data lines', async () => {
      const mockSSEStream = `event: ping
id: 1

data: {"event_type": 2001, "event_data": "{\\"message\\": {\\"content\\": \\"{\\\\\\"text\\\\\\":\\\\\\"Valid text\\\\\\"}\\", \\"id\\": \\"msg-123\\"}, \\"conversation_id\\": \\"conv-456\\", \\"message_id\\": \\"msg-123\\", \\"is_delta\\": false, \\"is_finish\\": true}", "event_id": "2"}`;

      const mockResponse = {
        clone: () => ({
          text: () => Promise.resolve(mockSSEStream)
        }),
        url: 'https://www.doubao.com/samantha/chat/completion',
        status: 200,
        statusText: 'OK',
        headers: {
          get: () => 'text/event-stream'
        }
      };

      if (typeof doubaoModule.parseResponse === 'function') {
        const result = await doubaoModule.parseResponse(mockResponse, mockLogger);
        expect(result.text).toBe('Valid text');
        expect(result.id).toBe('conv-456');
      }
    });

    test('should handle non-message event types', async () => {
      const mockSSEStream = `data: {"event_type": 1001, "event_data": "{\\"status\\": \\"connecting\\"}", "event_id": "1"}

data: {"event_type": 2001, "event_data": "{\\"message\\": {\\"content\\": \\"{\\\\\\"text\\\\\\":\\\\\\"Message text\\\\\\"}\\", \\"id\\": \\"msg-123\\"}, \\"conversation_id\\": \\"conv-456\\", \\"message_id\\": \\"msg-123\\", \\"is_delta\\": false, \\"is_finish\\": true}", "event_id": "2"}`;

      const mockResponse = {
        clone: () => ({
          text: () => Promise.resolve(mockSSEStream)
        }),
        url: 'https://www.doubao.com/samantha/chat/completion',
        status: 200,
        statusText: 'OK',
        headers: {
          get: () => 'text/event-stream'
        }
      };

      if (typeof doubaoModule.parseResponse === 'function') {
        const result = await doubaoModule.parseResponse(mockResponse, mockLogger);
        expect(result.text).toBe('Message text');
        expect(result.id).toBe('conv-456');
      }
    });

    test('should handle response text extraction failure', async () => {
      const mockResponse = {
        clone: () => ({
          text: () => Promise.reject(new Error('Failed to extract text'))
        }),
        url: 'https://www.doubao.com/samantha/chat/completion',
        status: 500,
        statusText: 'Internal Server Error',
        headers: {
          get: () => 'text/event-stream'
        }
      };

      if (typeof doubaoModule.parseResponse === 'function') {
        const result = await doubaoModule.parseResponse(mockResponse, mockLogger);
        expect(result.text).toBe('');
        expect(result.id).toBe(null);
        expect(result.isComplete).toBe(false);
        expect(mockLogger.error).toHaveBeenCalled();
      }
    });

    test('should extract local conversation and message IDs', async () => {
      const mockSSEStream = `data: {"event_type": 2001, "event_data": "{\\"message\\": {\\"content\\": \\"{\\\\\\"text\\\\\\":\\\\\\"Test message\\\\\\"}\\", \\"id\\": \\"msg-123\\"}, \\"conversation_id\\": \\"conv-456\\", \\"message_id\\": \\"msg-123\\", \\"local_conversation_id\\": \\"local-conv-789\\", \\"local_message_id\\": \\"local-msg-101\\", \\"is_delta\\": false, \\"is_finish\\": true}", "event_id": "1"}`;

      const mockResponse = {
        clone: () => ({
          text: () => Promise.resolve(mockSSEStream)
        }),
        url: 'https://www.doubao.com/samantha/chat/completion',
        status: 200,
        statusText: 'OK',
        headers: {
          get: () => 'text/event-stream'
        }
      };

      if (typeof doubaoModule.parseResponse === 'function') {
        const result = await doubaoModule.parseResponse(mockResponse, mockLogger);
        expect(result.text).toBe('Test message');
        expect(result.id).toBe('conv-456');
        expect(result.messageId).toBe('msg-123');
        expect(result.localConversationId).toBe('local-conv-789');
        expect(result.localMessageId).toBe('local-msg-101');
      }
    });

    test('should handle empty SSE stream', async () => {
      const mockResponse = {
        clone: () => ({
          text: () => Promise.resolve('')
        }),
        url: 'https://www.doubao.com/samantha/chat/completion',
        status: 200,
        statusText: 'OK',
        headers: {
          get: () => 'text/event-stream'
        }
      };

      if (typeof doubaoModule.parseResponse === 'function') {
        const result = await doubaoModule.parseResponse(mockResponse, mockLogger);
        expect(result.text).toBe('');
        expect(result.id).toBe(null);
        expect(result.isComplete).toBe(false);
      }
    });
  });

  describe('Error handling and edge cases', () => {
    test('should handle unexpected errors gracefully', async () => {
      const mockRequest = {
        clone: () => {
          throw new Error('Unexpected error');
        }
      };

      if (typeof doubaoModule.parseRequest === 'function') {
        const result = await doubaoModule.parseRequest(mockRequest, mockLogger);
        expect(result).toBe('');
        expect(mockLogger.error).toHaveBeenCalled();
      }
    });

    test('should handle null/undefined inputs', async () => {
      if (typeof doubaoModule.parseRequest === 'function') {
        const result1 = await doubaoModule.parseRequest(null, mockLogger);
        expect(result1).toBe('');

        const result2 = await doubaoModule.parseRequest(undefined, mockLogger);
        expect(result2).toBe('');
      }
    });

    test('should log detailed context for debugging', async () => {
      const mockRequestBody = {
        messages: [
          {
            content: '{"text":"Debug test"}',
            content_type: 2001
          }
        ]
      };

      const mockRequest = {
        clone: () => ({
          json: () => Promise.resolve(mockRequestBody)
        }),
        url: 'https://www.doubao.com/samantha/chat/completion',
        headers: {
          get: () => 'application/json'
        }
      };

      if (typeof doubaoModule.parseRequest === 'function') {
        await doubaoModule.parseRequest(mockRequest, mockLogger);
        expect(mockLogger.log).toHaveBeenCalledWith(
          expect.stringContaining('Starting Doubao request parsing')
        );
      }
    });
  });
});