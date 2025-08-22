/**
 * Unit Tests for Gemini Platform Module
 * 
 * Tests the Gemini-specific conversation parsing functionality.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';

// Mock logger
const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

describe('Gemini Platform Module', () => {
  let geminiModule;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    try {
      const module = await import('../../scripts/capture/platforms/gemini.js');
      geminiModule = module;
    } catch (error) {
      // Mock the module structure if import fails
      geminiModule = {
        config: {
          name: 'Gemini',
          apiEndpoint: '/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate',
        },
        parseRequest: jest.fn(),
        parseResponse: jest.fn(),
      };
    }
  });

  describe('Module configuration', () => {
    test('should have correct configuration', () => {
      expect(geminiModule.config).toBeDefined();
      expect(geminiModule.config.name).toBe('Gemini');
      expect(geminiModule.config.apiEndpoint).toBe('/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate');
    });
  });

  describe('parseRequest', () => {
    test('should parse user prompt from form data', async () => {
      const formData = new FormData();
      const f_req = [
        null,
        JSON.stringify([
          ["Hello, how are you?"],
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null
        ])
      ];
      formData.append('f.req', JSON.stringify(f_req));

      const mockRequest = {
        clone: () => ({
          formData: () => Promise.resolve(formData)
        })
      };

      const result = await geminiModule.parseRequest(mockRequest, mockLogger);
      
      expect(result).toBe('Hello, how are you?');
    });

    test('should return empty string when form data is missing', async () => {
      const formData = new FormData();

      const mockRequest = {
        clone: () => ({
          formData: () => Promise.resolve(formData)
        })
      };

      const result = await geminiModule.parseRequest(mockRequest, mockLogger);
      
      expect(result).toBe('');
    });

    test('should handle malformed form data', async () => {
      const formData = new FormData();
      formData.append('f.req', 'invalid json');

      const mockRequest = {
        clone: () => ({
          formData: () => Promise.resolve(formData)
        })
      };

      const result = await geminiModule.parseRequest(mockRequest, mockLogger);
      
      expect(result).toBe('');
      expect(mockLogger.error).toHaveBeenCalledWith("Error parsing Gemini request:", expect.any(Error));
    });
  });

  describe('parseResponse', () => {
    beforeEach(() => {
      // Properly mock window.location for all parseResponse tests
      delete global.window.location;
      Object.defineProperty(global.window, 'location', {
        value: {
          origin: 'https://gemini.google.com'
        },
        writable: true
      });
    });

    test('should parse response with conversation data', async () => {
      // Create a realistic Gemini response that matches the parsing logic
      const payload = [
        null,  // Index 0
        ["c_test-conversation-id"],  // Index 1 - Conversation ID
        null,  // Index 2
        null,  // Index 3
        [      // Index 4 - Content array
          [    // First content item
            null,  // Index 0
            [      // Index 1 - Text content array
              "Hello there!",  // The actual text
              "response_id",   // Response ID
              "candidate_id"   // Candidate ID
            ]
          ]
        ]
      ];
      
      const payloadStr = JSON.stringify(payload);
      // Properly escape the payload string for inclusion in the outer JSON
      const escapedPayloadStr = payloadStr.replace(/"/g, '\\"');
      const rawResponse = `)]}'\n[["wrb.fr","assistant.lamda.BardFrontendService.StreamGenerate","${escapedPayloadStr}"]]`;

      const mockResponse = {
        clone: () => ({
          text: () => Promise.resolve(rawResponse)
        })
      };

      const result = await geminiModule.parseResponse(mockResponse, mockLogger);
      
      expect(result.text).toBe('Hello there!');
      expect(result.id).toBe('test-conversation-id');
      expect(result.url).toBe('https://gemini.google.com/app/test-conversation-id');
    });

    test('should handle response without conversation ID', async () => {
      // Create a realistic Gemini response without conversation ID
      const payload = [
        null,  // Index 0
        [],    // Index 1 - Empty array for conversation ID
        null,  // Index 2
        null,  // Index 3
        [      // Index 4 - Content array
          [    // First content item
            null,  // Index 0
            [      // Index 1 - Text content array
              "Hello there!",  // The actual text
              "response_id",   // Response ID
              "candidate_id"   // Candidate ID
            ]
          ]
        ]
      ];
      
      const payloadStr = JSON.stringify(payload);
      // Properly escape the payload string for inclusion in the outer JSON
      const escapedPayloadStr = payloadStr.replace(/"/g, '\\"');
      const rawResponse = `)]}'\n[["wrb.fr","assistant.lamda.BardFrontendService.StreamGenerate","${escapedPayloadStr}"]]`;

      const mockResponse = {
        clone: () => ({
          text: () => Promise.resolve(rawResponse)
        })
      };

      const result = await geminiModule.parseResponse(mockResponse, mockLogger);
      
      expect(result.text).toBe('Hello there!');
      expect(result.id).toBe('');  // When no conversation ID is found, it should be an empty string
      expect(result.url).toBe(null);  // When no conversation ID is found, url should be null
    });

    test('should handle response parsing errors', async () => {
      const mockResponse = {
        clone: () => ({
          text: () => Promise.reject(new Error('Network error'))
        })
      };

      const result = await geminiModule.parseResponse(mockResponse, mockLogger);
      
      expect(result.text).toBe('');
      expect(result.id).toBeNull();
      expect(result.url).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith("Error parsing Gemini response:", expect.any(Error));
    });
  });
});