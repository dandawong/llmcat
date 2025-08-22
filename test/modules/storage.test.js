/**
 * Unit Tests for Storage Module
 * 
 * Tests the IndexedDB storage functionality for conversations.
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import 'fake-indexeddb/auto';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

describe('Storage Module', () => {
  let storageModule;
  
  beforeEach(async () => {
    // Reset IndexedDB for each test
    global.indexedDB = new FDBFactory();
    global.IDBKeyRange = FDBKeyRange;
    
    // Clear the module cache to ensure fresh import
    jest.resetModules();
    
    // Import the storage module freshly for each test
    storageModule = await import('../../modules/storage.js');
    
    // Reset the dbPromise in the storage module
    storageModule.dbPromise = null;
  });

  afterEach(async () => {
    // Close database connection after each test
    if (storageModule.closeDB) {
      await storageModule.closeDB();
    }
    
    // Clean up IndexedDB after each test
    if (global.indexedDB && global.indexedDB._databases) {
      global.indexedDB._databases.clear();
    }
  });

  describe('saveConversation', () => {
    test('should save a new conversation', async () => {
      const conversationData = {
        platform: 'ChatGPT',
        prompt: 'Test prompt',
        response: 'Test response',
        title: 'Test conversation',
        url: 'https://chat.openai.com/c/test-id',
        createdAt: new Date().toISOString()
      };
      
      const result = await storageModule.saveConversation(conversationData);
      
      expect(result.status).toBe('success');
      expect(result.data.id).toBeDefined();
      expect(result.data.duplicate).toBeUndefined();
    });

    test('should detect and skip duplicate conversations based on content within time window', async () => {
      const conversationData1 = {
        platform: 'ChatGPT',
        prompt: 'Test prompt',
        response: 'Test response',
        title: 'Test conversation',
        url: 'https://chat.openai.com/c/test-id-1',
        createdAt: new Date().toISOString()
      };
      
      // Save first conversation
      const result1 = await storageModule.saveConversation(conversationData1);
      expect(result1.status).toBe('success');
      
      // Create a similar conversation within the duplicate time window (5 seconds for ChatGPT)
      const conversationData2 = {
        platform: 'ChatGPT',
        prompt: 'Test prompt',
        response: 'Test response',
        title: 'Test conversation',
        url: 'https://chat.openai.com/c/test-id-2',
        createdAt: new Date(Date.now() + 3000).toISOString() // 3 seconds later
      };
      
      const result2 = await storageModule.saveConversation(conversationData2);
      
      expect(result2.status).toBe('success');
      expect(result2.data.duplicate).toBe(true);
      expect(result2.data.id).toBe(result1.data.id);
    });

    test('should detect and skip duplicate conversations based on URL', async () => {
      const conversationData1 = {
        platform: 'ChatGPT',
        prompt: 'Test prompt 1',
        response: 'Test response 1',
        title: 'Test conversation 1',
        url: 'https://chat.openai.com/c/test-id',
        createdAt: new Date().toISOString()
      };
      
      // Save first conversation
      const result1 = await storageModule.saveConversation(conversationData1);
      expect(result1.status).toBe('success');
      
      // Create a conversation with the same URL but different content
      const conversationData2 = {
        platform: 'ChatGPT',
        prompt: 'Test prompt 2',
        response: 'Test response 2',
        title: 'Test conversation 2',
        url: 'https://chat.openai.com/c/test-id', // Same URL
        createdAt: new Date(Date.now() + 10000).toISOString() // 10 seconds later
      };
      
      const result2 = await storageModule.saveConversation(conversationData2);
      
      expect(result2.status).toBe('success');
      // When URL is the same but content is different, it should still be saved as a new conversation
      expect(result2.data.id).not.toBe(result1.data.id);
    });

    test('should detect and skip duplicate conversations based on identical URL and content', async () => {
      const conversationData1 = {
        platform: 'ChatGPT',
        prompt: 'Test prompt',
        response: 'Test response',
        title: 'Test conversation',
        url: 'https://chat.openai.com/c/test-id',
        createdAt: new Date().toISOString()
      };
      
      // Save first conversation
      const result1 = await storageModule.saveConversation(conversationData1);
      expect(result1.status).toBe('success');
      
      // Create a conversation with the same URL and identical content
      const conversationData2 = {
        platform: 'ChatGPT',
        prompt: 'Test prompt',
        response: 'Test response',
        title: 'Test conversation',
        url: 'https://chat.openai.com/c/test-id', // Same URL
        createdAt: new Date(Date.now() + 1000).toISOString() // 1 second later
      };
      
      const result2 = await storageModule.saveConversation(conversationData2);
      
      expect(result2.status).toBe('success');
      // When URL and content are identical, it should be detected as duplicate
      expect(result2.data.duplicate).toBe(true);
      expect(result2.data.id).toBe(result1.data.id);
    });
  });

  describe('getAllConversations', () => {
    test('should retrieve all conversations in reverse chronological order', async () => {
      // Save multiple conversations
      const conversation1 = {
        platform: 'ChatGPT',
        prompt: 'Prompt 1',
        response: 'Response 1',
        title: 'Conversation 1',
        url: 'https://chat.openai.com/c/test-1',
        createdAt: new Date(Date.now() - 10000).toISOString()
      };
      
      const conversation2 = {
        platform: 'Claude',
        prompt: 'Prompt 2',
        response: 'Response 2',
        title: 'Conversation 2',
        url: 'https://claude.ai/chat/test-2',
        createdAt: new Date(Date.now() - 5000).toISOString()
      };
      
      const result1 = await storageModule.saveConversation(conversation1);
      const result2 = await storageModule.saveConversation(conversation2);
      
      expect(result1.status).toBe('success');
      expect(result2.status).toBe('success');
      
      // Retrieve all conversations
      const getResult = await storageModule.getAllConversations();
      
      expect(getResult.status).toBe('success');
      expect(getResult.data.length).toBe(2);
      expect(getResult.data[0].id).toBe(result2.data.id); // Most recent first
      expect(getResult.data[1].id).toBe(result1.data.id);
    });

    test('should return empty array when no conversations exist', async () => {
      const result = await storageModule.getAllConversations();
      
      expect(result.status).toBe('success');
      expect(result.data).toEqual([]);
    });
  });

  describe('getConversations', () => {
    test('should retrieve conversations with pagination', async () => {
      // Save multiple conversations
      const conversations = [];
      for (let i = 0; i < 10; i++) {
        const conversation = {
          platform: 'ChatGPT',
          prompt: `Prompt ${i}`,
          response: `Response ${i}`,
          title: `Conversation ${i}`,
          url: `https://chat.openai.com/c/test-${i}`,
          createdAt: new Date(Date.now() + i * 1000).toISOString()
        };
        const result = await storageModule.saveConversation(conversation);
        expect(result.status).toBe('success');
        conversations.push({ ...conversation, id: result.data.id });
      }
      
      // Retrieve first page
      const result1 = await storageModule.getConversations({ page: 1, limit: 5 });
      
      expect(result1.status).toBe('success');
      expect(result1.data.length).toBe(5);
      expect(result1.pagination.page).toBe(1);
      expect(result1.pagination.limit).toBe(5);
      expect(result1.pagination.hasMore).toBe(true);
      
      // Check that conversations are in reverse chronological order
      expect(result1.data[0].id).toBe(conversations[9].id);
      expect(result1.data[1].id).toBe(conversations[8].id);
      
      // Retrieve second page
      const result2 = await storageModule.getConversations({ page: 2, limit: 5 });
      
      expect(result2.status).toBe('success');
      expect(result2.data.length).toBe(5);
      expect(result2.pagination.page).toBe(2);
      expect(result2.pagination.limit).toBe(5);
      expect(result2.pagination.hasMore).toBe(false);
      
      // Check that conversations are in reverse chronological order
      expect(result2.data[0].id).toBe(conversations[4].id);
      expect(result2.data[1].id).toBe(conversations[3].id);
    });

    test('should search conversations by content', async () => {
      // Save conversations with different content
      const conversation1 = {
        platform: 'ChatGPT',
        prompt: 'Hello world',
        response: 'How can I help you today?',
        title: 'Greeting conversation',
        url: 'https://chat.openai.com/c/test-1',
        createdAt: new Date().toISOString()
      };
      
      const conversation2 = {
        platform: 'Claude',
        prompt: 'Goodbye world',
        response: 'See you later!',
        title: 'Farewell conversation',
        url: 'https://claude.ai/chat/test-2',
        createdAt: new Date().toISOString()
      };
      
      await storageModule.saveConversation(conversation1);
      const result2 = await storageModule.saveConversation(conversation2);
      
      // Search for conversations containing "goodbye"
      const result = await storageModule.getConversations({ search: 'goodbye' });
      
      expect(result.status).toBe('success');
      expect(result.data.length).toBe(1);
      expect(result.data[0].id).toBe(result2.data.id);
      expect(result.data[0].prompt).toBe('Goodbye world');
    });
  });

  describe('getTotalConversationCount', () => {
    test('should return total count of conversations', async () => {
      // Save multiple conversations
      for (let i = 0; i < 5; i++) {
        const conversation = {
          platform: 'ChatGPT',
          prompt: `Prompt ${i}`,
          response: `Response ${i}`,
          title: `Conversation ${i}`,
          url: `https://chat.openai.com/c/test-${i}`,
          createdAt: new Date(Date.now() + i * 1000).toISOString()
        };
        await storageModule.saveConversation(conversation);
      }
      
      const result = await storageModule.getTotalConversationCount();
      
      expect(result.status).toBe('success');
      expect(result.data.totalCount).toBe(5);
    });

    test('should return filtered count when search term is provided', async () => {
      // Save conversations with different content
      const conversation1 = {
        platform: 'ChatGPT',
        prompt: 'Hello world',
        response: 'How can I help you today?',
        title: 'Greeting conversation',
        url: 'https://chat.openai.com/c/test-1',
        createdAt: new Date().toISOString()
      };
      
      const conversation2 = {
        platform: 'Claude',
        prompt: 'Goodbye world',
        response: 'See you later!',
        title: 'Farewell conversation',
        url: 'https://claude.ai/chat/test-2',
        createdAt: new Date().toISOString()
      };
      
      await storageModule.saveConversation(conversation1);
      await storageModule.saveConversation(conversation2);
      
      // Get count of conversations containing "goodbye"
      const result = await storageModule.getTotalConversationCount('goodbye');
      
      expect(result.status).toBe('success');
      expect(result.data.totalCount).toBe(1);
    });
  });

  describe('deleteConversation', () => {
    test('should delete a conversation by ID', async () => {
      // Save a conversation
      const conversationData = {
        platform: 'ChatGPT',
        prompt: 'Test prompt',
        response: 'Test response',
        title: 'Test conversation',
        url: 'https://chat.openai.com/c/test-id',
        createdAt: new Date().toISOString()
      };
      
      const saveResult = await storageModule.saveConversation(conversationData);
      expect(saveResult.status).toBe('success');
      
      // Delete the conversation
      const deleteResult = await storageModule.deleteConversation({ id: saveResult.data.id });
      
      expect(deleteResult.status).toBe('success');
      expect(deleteResult.data.id).toBe(saveResult.data.id);
      
      // Verify the conversation is deleted
      const getResult = await storageModule.getAllConversations();
      expect(getResult.status).toBe('success');
      expect(getResult.data.length).toBe(0);
    });
  });
});