/**
 * Unit Tests for ChatGPT Platform Module
 * 
 * Tests the ChatGPT-specific conversation parsing functionality.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Mock logger
const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

describe('ChatGPT Platform Module', () => {
  let chatgptModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    const module = await import('../../scripts/capture/platforms/chatgpt.js');
    console.log('Imported module:', module);
    chatgptModule = module;
  });

  describe('Module configuration', () => {
    test('should have correct configuration', () => {
      expect(chatgptModule.config).toBeDefined();
      expect(chatgptModule.config.name).toBe('ChatGPT');
      expect(chatgptModule.config.apiEndpoint).toBe('/backend-api/f/conversation');
    });
  });

  describe('parseRequest', () => {
    test('should parse user prompt from request body', async () => {
      const mockRequest = {
        clone: () => ({
          json: () => Promise.resolve({
            messages: [
              {
                author: { role: 'user' },
                content: { parts: ['Hello, how are you?'] }
              },
              {
                author: { role: 'assistant' },
                content: { parts: ['I am fine, thank you!'] }
              }
            ]
          })
        })
      };

      const result = await chatgptModule.parseRequest(mockRequest, mockLogger);
      
      expect(result).toBe('Hello, how are you?');
    });

    test('should handle multiple parts in user message', async () => {
      const mockRequest = {
        clone: () => ({
          json: () => Promise.resolve({
            messages: [
              {
                author: { role: 'user' },
                content: { parts: ['Hello', 'How are you?'] }
              }
            ]
          })
        })
      };

      const result = await chatgptModule.parseRequest(mockRequest, mockLogger);
      
      expect(result).toBe('Hello\nHow are you?');
    });

    test('should return empty string when no user message is found', async () => {
      const mockRequest = {
        clone: () => ({
          json: () => Promise.resolve({
            messages: [
              {
                author: { role: 'assistant' },
                content: { parts: ['Hello!'] }
              }
            ]
          })
        })
      };

      const result = await chatgptModule.parseRequest(mockRequest, mockLogger);
      
      expect(result).toBe('');
    });

    test('should handle malformed request body', async () => {
      const mockRequest = {
        clone: () => ({
          json: () => Promise.reject(new Error('Invalid JSON'))
        })
      };

      const result = await chatgptModule.parseRequest(mockRequest, mockLogger);
      
      expect(result).toBe('');
      expect(mockLogger.error).toHaveBeenCalledWith("Error parsing request:", expect.any(Error));
    });
  });

  describe('parseResponse', () => {
    test('should parse SSE stream with append pattern', async () => {
      const sseStream = [
        'data: {"conversation_id": "test-conversation-id"}',
        '',
        'data: {"p": "/message/content/parts/0", "o": "append", "v": "Hello"}',
        '',
        'data: {"p": "/message/content/parts/0", "o": "append", "v": " there!"}',
        '',
        'data: [DONE]'
      ].join('\n\n');

      // Create a mock reader that will return the encoded stream data
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(sseStream) })
          .mockResolvedValueOnce({ done: true, value: undefined })
      };

      const mockResponse = {
        clone: () => ({
          body: {
            getReader: () => mockReader
          }
        })
      };

      const result = await chatgptModule.parseResponse(mockResponse, mockLogger);
      console.log('Test result:', result);
      console.log('Mock logger calls:', mockLogger.log.mock.calls);
      
      expect(result.text).toBe('Hello there!');
      expect(result.id).toBe('test-conversation-id');
    });

    test('should parse SSE stream with simple value pattern', async () => {
      const sseStream = [
        'data: {"conversation_id": "test-conversation-id"}',
        '',
        'data: {"v": "Hello"}',
        '',
        'data: {"v": " there!"}',
        '',
        'data: [DONE]'
      ].join('\n\n');

      // Create a mock reader that will return the encoded stream data
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(sseStream) })
          .mockResolvedValueOnce({ done: true, value: undefined })
      };

      const mockResponse = {
        clone: () => ({
          body: {
            getReader: () => mockReader
          }
        })
      };

      const result = await chatgptModule.parseResponse(mockResponse, mockLogger);
      
      expect(result.text).toBe('Hello there!');
      expect(result.id).toBe('test-conversation-id');
    });

    test('should parse SSE stream with patch pattern', async () => {
      const sseStream = [
        'data: {"conversation_id": "test-conversation-id"}',
        '',
        'data: {"o": "patch", "v": [{"p": "/message/content/parts/0", "o": "append", "v": "Hello"}]}',
        '',
        'data: {"o": "patch", "v": [{"p": "/message/content/parts/0", "o": "append", "v": " there!"}]}',
        '',
        'data: [DONE]'
      ].join('\n\n');

      // Create a mock reader that will return the encoded stream data
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(sseStream) })
          .mockResolvedValueOnce({ done: true, value: undefined })
      };

      const mockResponse = {
        clone: () => ({
          body: {
            getReader: () => mockReader
          }
        })
      };

      const result = await chatgptModule.parseResponse(mockResponse, mockLogger);
      
      expect(result.text).toBe('Hello there!');
      expect(result.id).toBe('test-conversation-id');
    });

    test('should handle complete message object', async () => {
      const sseStream = [
        'data: {"message": {"author": {"role": "assistant"}, "status": "finished_successfully", "content": {"parts": ["This is a complete response."]}}, "conversation_id": "test-conversation-id"}',
        '',
        'data: [DONE]'
      ].join('\n\n');

      // Create a mock reader that will return the encoded stream data
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(sseStream) })
          .mockResolvedValueOnce({ done: true, value: undefined })
      };

      const mockResponse = {
        clone: () => ({
          body: {
            getReader: () => mockReader
          }
        })
      };

      const result = await chatgptModule.parseResponse(mockResponse, mockLogger);
      
      expect(result.text).toBe('This is a complete response.');
      expect(result.id).toBe('test-conversation-id');
    });

    test('should handle malformed SSE data', async () => {
      const sseStream = [
        'data: {"conversation_id": "test-conversation-id"}',
        '',
        'data: {"p": "/message/content/parts/0", "o": "append", "v": "Hello"}',
        '',
        'data: invalid json',
        '',
        'data: {"p": "/message/content/parts/0", "o": "append", "v": " there!"}',
        '',
        'data: [DONE]'
      ].join('\n\n');

      // Create a mock reader that will return the encoded stream data
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(sseStream) })
          .mockResolvedValueOnce({ done: true, value: undefined })
      };

      const mockResponse = {
        clone: () => ({
          body: {
            getReader: () => mockReader
          }
        })
      };

      const result = await chatgptModule.parseResponse(mockResponse, mockLogger);
      
      // Should still parse the valid parts
      expect(result.text).toBe('Hello there!');
      expect(result.id).toBe('test-conversation-id');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "Could not parse SSE data chunk or not a relevant message:", 
        "invalid json"
      );
    });

    test('should handle response parsing errors', async () => {
      // Create a mock reader that will reject with an error
      const mockReader = {
        read: jest.fn().mockRejectedValue(new Error('Stream error'))
      };

      const mockResponse = {
        clone: () => ({
          body: {
            getReader: () => mockReader
          }
        })
      };

      const result = await chatgptModule.parseResponse(mockResponse, mockLogger);
      
      expect(result.text).toBe('');
      expect(result.id).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith("Error in parseResponse:", expect.any(Error));
    });
  });
});
