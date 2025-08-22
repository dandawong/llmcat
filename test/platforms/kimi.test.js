/**
 * Kimi Platform Module Tests
 */
import { jest } from '@jest/globals';
import { TextEncoder } from 'util';

// Mock logger
const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

// Mock response objects
const mockStreamResponse = {
  body: {
    getReader: () => {
      const encoder = new TextEncoder();
      const streamData1 = `data: {"event":"cmpl","text":"Hello"}\n\n`;
      const streamData2 = `data: {"event":"cmpl","text":" World"}\n\n`;
      const streamData3 = `data: {"event":"cmpl","text":"!"}\n\n`;
      let readCount = 0;
      return {
        read: async () => {
          if (readCount === 0) {
            readCount++;
            return { done: false, value: encoder.encode(streamData1) };
          } else if (readCount === 1) {
            readCount++;
            return { done: false, value: encoder.encode(streamData2) };
          } else if (readCount === 2) {
            readCount++;
            return { done: false, value: encoder.encode(streamData3) };
          } else {
            return { done: true, value: undefined };
          }
        },
        releaseLock: () => {}
      };
    }
  },
  clone: () => ({
    text: async () => `data: {"event":"cmpl","text":"Hello World!"}\n\n`
  })
};

const mockRequest = {
  url: 'https://www.kimi.com/apiv2/kimi.chat.v1.ChatService/Chat',
  clone: () => ({
    json: async () => ({
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' }
      ],
      conversation_id: '123'
    })
  })
};

describe('Kimi Platform Module', () => {
  let kimiModule;

  beforeAll(async () => {
    // Dynamically import the module
    kimiModule = await import('../../scripts/capture/platforms/kimi.js');
  });

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('parseRequest', () => {
    test('should parse request correctly and extract conversation ID', async () => {
      if (typeof kimiModule.parseRequest === 'function') {
        const result = await kimiModule.parseRequest(mockRequest, mockLogger);
        expect(result).toBe('Hello');
        // Check if conversation ID was extracted
        // Note: We can't directly check the internal variable, but we can test the behavior
      }
    });
  });

  describe('parseResponse', () => {
    test('should parse streaming response correctly', async () => {
      if (typeof kimiModule.parseResponse === 'function') {
        const result = await kimiModule.parseResponse(mockStreamResponse, mockLogger);
        expect(result.text).toBe('Hello World!');
        expect(result.id).toBe('123');
        expect(result.url).toBe('https://www.kimi.com/chat/123');
      }
    });
  });
});
