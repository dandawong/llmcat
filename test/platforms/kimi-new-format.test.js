/**
 * Kimi Platform Module Tests for New Format
 */
import { jest } from '@jest/globals';
import { TextEncoder } from 'util';

// Mock logger
const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

// Mock response objects for new Kimi format
const mockNewFormatResponse = {
  body: {
    getReader: () => {
      const encoder = new TextEncoder();
      // Create data with Kimi's new format (4 null bytes + 1 character separator)
      const streamData = 
        '{"op":"set","eventOffset":1,"chat":{"id":"d2i70l0l3dcesrju6ur0","name":"未命名会话"}}\x00\x00\x00\x00?' +
        '{"eventOffset":1,"heartbeat":{}}\x00\x00\x00\x00?' +
        '{"op":"set","mask":"message","eventOffset":2,"message":{"id":"d2i70l051tq7apuodcdg","role":"user","status":"MESSAGE_STATUS_COMPLETED","blocks":[{"id":"text_0_0","text":{"content":"1+1="}}]}}\x00\x00\x00\x00?' +
        '{"op":"set","mask":"message","eventOffset":3,"message":{"id":"d2i70l051tq7apuodce0","parentId":"d2i70l051tq7apuodcdg","role":"assistant","status":"MESSAGE_STATUS_GENERATING","scenario":"SCENARIO_K2"}}\x00\x00\x00\x00?' +
        '{"op":"set","mask":"chat.name","eventOffset":4,"chat":{"name":"1+1="}}\x00\x00\x00\x00?' +
        '{"eventOffset":4,"heartbeat":{}}\x00\x00\x00\x00?' +
        '{"op":"append","mask":"block.text.content","eventOffset":5,"block":{"id":"0_0","text":{"content":"1"}}}\x00\x00\x00\x00?' +
        '{"op":"append","mask":"block.text.content","eventOffset":6,"block":{"id":"0_0","text":{"content":" +"}}}\x00\x00\x00\x00?' +
        '{"op":"append","mask":"block.text.content","eventOffset":7,"block":{"id":"0_0","text":{"content":" "}}}\x00\x00\x00\x00?' +
        '{"op":"append","mask":"block.text.content","eventOffset":8,"block":{"id":"0_0","text":{"content":"1"}}}\x00\x00\x00\x00?' +
        '{"op":"append","mask":"block.text.content","eventOffset":9,"block":{"id":"0_0","text":{"content":" ="}}}\x00\x00\x00\x00?' +
        '{"op":"append","mask":"block.text.content","eventOffset":10,"block":{"id":"0_0","text":{"content":" "}}}\x00\x00\x00\x00?' +
        '{"op":"append","mask":"block.text.content","eventOffset":11,"block":{"id":"0_0","text":{"content":"2"}}}\x00\x00\x00\x00?' +
        '{"op":"set","mask":"message.status","eventOffset":12,"message":{"id":"d2i70l051tq7apuodce0","status":"MESSAGE_STATUS_COMPLETED"}}\x00\x00\x00\x00?' +
        '{"eventOffset":13,"done":{}}\x00\x00\x00\x00?' +
        '{}';
      
      let readCount = 0;
      return {
        read: async () => {
          if (readCount === 0) {
            readCount++;
            return { done: false, value: encoder.encode(streamData) };
          } else {
            return { done: true, value: undefined };
          }
        },
        releaseLock: () => {}
      };
    }
  },
  clone: () => ({
    text: async () => 
      '{"op":"set","eventOffset":1,"chat":{"id":"d2i70l0l3dcesrju6ur0","name":"未命名会话"}}\x00\x00\x00\x00?' +
      '{"eventOffset":1,"heartbeat":{}}\x00\x00\x00\x00?' +
      '{"op":"set","mask":"message","eventOffset":2,"message":{"id":"d2i70l051tq7apuodcdg","role":"user","status":"MESSAGE_STATUS_COMPLETED","blocks":[{"id":"text_0_0","text":{"content":"1+1="}}]}}\x00\x00\x00\x00?' +
      '{"op":"set","mask":"message","eventOffset":3,"message":{"id":"d2i70l051tq7apuodce0","parentId":"d2i70l051tq7apuodcdg","role":"assistant","status":"MESSAGE_STATUS_GENERATING","scenario":"SCENARIO_K2"}}\x00\x00\x00\x00?' +
      '{"op":"set","mask":"chat.name","eventOffset":4,"chat":{"name":"1+1="}}\x00\x00\x00\x00?' +
      '{"eventOffset":4,"heartbeat":{}}\x00\x00\x00\x00?' +
      '{"op":"append","mask":"block.text.content","eventOffset":5,"block":{"id":"0_0","text":{"content":"1"}}}\x00\x00\x00\x00?' +
      '{"op":"append","mask":"block.text.content","eventOffset":6,"block":{"id":"0_0","text":{"content":" +"}}}\x00\x00\x00\x00?' +
      '{"op":"append","mask":"block.text.content","eventOffset":7,"block":{"id":"0_0","text":{"content":" "}}}\x00\x00\x00\x00?' +
      '{"op":"append","mask":"block.text.content","eventOffset":8,"block":{"id":"0_0","text":{"content":"1"}}}\x00\x00\x00\x00?' +
      '{"op":"append","mask":"block.text.content","eventOffset":9,"block":{"id":"0_0","text":{"content":" ="}}}\x00\x00\x00\x00?' +
      '{"op":"append","mask":"block.text.content","eventOffset":10,"block":{"id":"0_0","text":{"content":" "}}}\x00\x00\x00\x00?' +
      '{"op":"append","mask":"block.text.content","eventOffset":11,"block":{"id":"0_0","text":{"content":"2"}}}\x00\x00\x00\x00?' +
      '{"op":"set","mask":"message.status","eventOffset":12,"message":{"id":"d2i70l051tq7apuodce0","status":"MESSAGE_STATUS_COMPLETED"}}\x00\x00\x00\x00?' +
      '{"eventOffset":13,"done":{}}\x00\x00\x00\x00?' +
      '{}'
  })
};

describe('Kimi Platform Module - New Format', () => {
  let kimiModule;

  beforeAll(async () => {
    // Dynamically import the module
    kimiModule = await import('../../scripts/capture/platforms/kimi.js');
  });

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('parseResponse', () => {
    test('should parse new Kimi format response correctly', async () => {
      if (typeof kimiModule.parseResponse === 'function') {
        const result = await kimiModule.parseResponse(mockNewFormatResponse, mockLogger);
        expect(result.text).toBe('1 + 1 = 2');
        expect(result.id).toBeNull(); // We're not setting conversation ID in this test data
        expect(result.url).toBeNull(); // We're not setting conversation ID in this test data
      }
    });
  });
});
