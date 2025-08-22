/**
 * Tongyi Platform Module Tests
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
const mockThinkResponse = {
  body: {
    getReader: () => {
      const encoder = new TextEncoder();
      const streamData = `data: {"contentType":"think","msgStatus":"finished","contents":[{"content":"{\\"content\\":\\"Okay, the user just typed 42 again...\\"","contentType":"think","role":"assistant"},{"content":"This is the actual user response from thinking process.","contentType":"text","role":"assistant"}]}\n\n`;
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
    text: async () => `data: {"contentType":"think","msgStatus":"finished","contents":[{"content":"{\\"content\\":\\"Okay, the user just typed 42 again...\\"","contentType":"think","role":"assistant"},{"content":"This is the actual user response from thinking process.","contentType":"text","role":"assistant"}]}\n\n`
  })
};

const mockThinkResponseWithPluginCall = {
  body: {
    getReader: () => {
      const encoder = new TextEncoder();
      const streamData = `data: {"contentType":"think","msgStatus":"finished","contents":[{"content":"This contains pluginCall content","contentType":"text","role":"assistant"}]}\n\n`;
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
    text: async () => `data: {"contentType":"think","msgStatus":"finished","contents":[{"content":"This contains pluginCall content","contentType":"text","role":"assistant"}]}\n\n`
  })
};

const mockThinkResponseShort = {
  body: {
    getReader: () => {
      const encoder = new TextEncoder();
      const streamData = `data: {"contentType":"think","msgStatus":"finished","contents":[{"content":"Short thinking","contentType":"think","role":"assistant"}]}\n\n`;
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
    text: async () => `data: {"contentType":"think","msgStatus":"finished","contents":[{"content":"Short thinking","contentType":"think","role":"assistant"}]}\n\n`
  })
};

const mockIncrementalResponse = {
  body: {
    getReader: () => {
      const encoder = new TextEncoder();
      const streamData1 = `data: {"contentType":"text","msgStatus":"in_progress","contents":[{"content":"This is partial","role":"assistant"}]}\n\n`;
      const streamData2 = `data: {"contentType":"text","msgStatus":"in_progress","contents":[{"content":"This is partial response","role":"assistant"}]}\n\n`;
      const streamData3 = `data: {"contentType":"text","msgStatus":"finished","contents":[{"content":"This is partial response content","role":"assistant"}]}\n\n`;
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
    text: async () => `data: {"contentType":"text","msgStatus":"in_progress","contents":[{"content":"This is partial","role":"assistant"}]}\n\ndata: {"contentType":"text","msgStatus":"in_progress","contents":[{"content":"This is partial response","role":"assistant"}]}\n\ndata: {"contentType":"text","msgStatus":"finished","contents":[{"content":"This is partial response content","role":"assistant"}]}\n\ndata: [DONE]\n\n`
  })
};

const mockNormalResponse = {
  body: {
    getReader: () => {
      const encoder = new TextEncoder();
      const streamData = `data: {"contentType":"text","msgStatus":"finished","contents":[{"content":"This is a normal response.","role":"assistant","status":"finished"}]}\n\ndata: [DONE]\n\n`;
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
    text: async () => `data: {"contentType":"text","msgStatus":"finished","contents":[{"content":"This is a normal response.","role":"assistant","status":"finished"}]}\n\ndata: [DONE]\n\n`
  })
};

const mockPluginCallResponse = {
  body: {
    getReader: () => {
      const encoder = new TextEncoder();
      const streamData = `data: {"contentType":"text","msgStatus":"finished","contents":[{"content":"This contains pluginCall content","role":"assistant","status":"finished"}]}\n\ndata: [DONE]\n\n`;
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
    text: async () => `data: {"contentType":"text","msgStatus":"finished","contents":[{"content":"This contains pluginCall content","role":"assistant","status":"finished"}]}\n\ndata: [DONE]\n\n`
  })
};

describe('Tongyi Platform Module', () => {
  let tongyiModule;

  beforeAll(async () => {
    // Dynamically import the module
    tongyiModule = await import('../../scripts/capture/platforms/tongyi.js');
  });

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('parseRequest', () => {
    test('should parse request correctly', async () => {
      const mockRequest = {
        clone: () => ({
          json: async () => ({
            contents: [
              { role: 'user', content: 'Hello' },
              { role: 'assistant', content: 'Hi there' }
            ]
          })
        })
      };
      
      if (typeof tongyiModule.parseRequest === 'function') {
        const result = await tongyiModule.parseRequest(mockRequest, mockLogger);
        expect(result).toBe('Hello');
      }
    });
  });

  describe('parseResponse', () => {
    test('should extract actual response from think content type', async () => {
      if (typeof tongyiModule.parseResponse === 'function') {
        const result = await tongyiModule.parseResponse(mockThinkResponse, mockLogger);
        expect(result.text).toBe('This is the actual user response from thinking process.');
      }
    });

    test('should skip pluginCall content in think type', async () => {
      if (typeof tongyiModule.parseResponse === 'function') {
        const result = await tongyiModule.parseResponse(mockThinkResponseWithPluginCall, mockLogger);
        expect(result.text).toBe('');
      }
    });

    test('should skip short content in think type', async () => {
      if (typeof tongyiModule.parseResponse === 'function') {
        const result = await tongyiModule.parseResponse(mockThinkResponseShort, mockLogger);
        expect(result.text).toBe('');
      }
    });

    test('should handle incremental updates', async () => {
      if (typeof tongyiModule.parseResponse === 'function') {
        const result = await tongyiModule.parseResponse(mockIncrementalResponse, mockLogger);
        expect(result.text).toBe('This is partial response content');
      }
    });

    test('should parse normal text content', async () => {
      if (typeof tongyiModule.parseResponse === 'function') {
        const result = await tongyiModule.parseResponse(mockNormalResponse, mockLogger);
        expect(result.text).toBe('This is a normal response.');
      }
    });

    test('should skip pluginCall content', async () => {
      if (typeof tongyiModule.parseResponse === 'function') {
        const result = await tongyiModule.parseResponse(mockPluginCallResponse, mockLogger);
        expect(result.text).toBe('');
      }
    });
  });
});
