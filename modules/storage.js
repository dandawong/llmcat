/**
 * Storage Module (Repository Pattern)
 *
 * This module encapsulates all interactions with the IndexedDB,
 * providing a clean, promise-based API for the rest of the application.
 */

import { createLogger } from './logger.js';

const logger = createLogger('storage');

const DB_NAME = 'LLMCatDB';
const DB_VERSION = 2; // Incremented for new indexes
const STORE_NAME = 'conversations';

let dbPromise = null;

function getDB() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject("Error opening database");
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                const oldVersion = event.oldVersion;

                // Create store if it doesn't exist
                let store;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                } else {
                    store = event.target.transaction.objectStore(STORE_NAME);
                }

                // Create indexes for efficient searching
                if (oldVersion < 1) {
                    // Original index
                    if (!store.indexNames.contains('createdAt')) {
                        store.createIndex('createdAt', 'createdAt', { unique: false });
                    }
                }

                // Enhanced indexes for performance optimization (v2)
                if (oldVersion < 2) {
                    // Platform index for filtering
                    if (!store.indexNames.contains('platform')) {
                        store.createIndex('platform', 'platform', { unique: false });
                    }

                    // Title index for search optimization
                    if (!store.indexNames.contains('title')) {
                        store.createIndex('title', 'title', { unique: false });
                    }

                    // URL index for duplicate detection
                    if (!store.indexNames.contains('url')) {
                        store.createIndex('url', 'url', { unique: false });
                    }

                    // Compound indexes for complex queries
                    if (!store.indexNames.contains('platform_createdAt')) {
                        store.createIndex('platform_createdAt', ['platform', 'createdAt'], { unique: false });
                    }

                    if (!store.indexNames.contains('createdAt_platform')) {
                        store.createIndex('createdAt_platform', ['createdAt', 'platform'], { unique: false });
                    }
                }

                if (oldVersion < 2) {
                    // New search indexes for performance optimization
                    if (!store.indexNames.contains('platform')) {
                        store.createIndex('platform', 'platform', { unique: false });
                    }
                    if (!store.indexNames.contains('title')) {
                        store.createIndex('title', 'title', { unique: false });
                    }
                    if (!store.indexNames.contains('url')) {
                        store.createIndex('url', 'url', { unique: false });
                    }

                    // Compound indexes for multi-field searches
                    if (!store.indexNames.contains('platform_createdAt')) {
                        store.createIndex('platform_createdAt', ['platform', 'createdAt'], { unique: false });
                    }
                    if (!store.indexNames.contains('createdAt_platform')) {
                        store.createIndex('createdAt_platform', ['createdAt', 'platform'], { unique: false });
                    }
                }
            };
            request.onsuccess = (event) => resolve(event.target.result);
        });
    }
    return dbPromise;
}

export async function saveConversation(conversationData) {
    try {
        const db = await getDB();
        const readTransaction = db.transaction(STORE_NAME, 'readonly');
        const store = readTransaction.objectStore(STORE_NAME);
        const index = store.index('createdAt');
        const cursorRequest = index.openCursor(null, 'prev');

        const lastRecord = await new Promise((resolve, reject) => {
            cursorRequest.onsuccess = (event) => {
                const cursor = event.target.result;
                resolve(cursor ? cursor.value : null);
            };
            cursorRequest.onerror = (event) => reject(event.target.error);
        });

        if (lastRecord) {
            const timeDifference = new Date(conversationData.createdAt).getTime() - new Date(lastRecord.createdAt).getTime();
            const isDuplicateContent = lastRecord.prompt === conversationData.prompt &&
                lastRecord.response === conversationData.response &&
                lastRecord.platform === conversationData.platform;

            // Check for URL-based duplicates (same conversation page)
            const isDuplicateUrl = lastRecord.url === conversationData.url &&
                lastRecord.url &&
                conversationData.url;

            // Extended window for different platforms
            const duplicateWindow = conversationData.platform === 'Gemini' ? 15000 :
                                  conversationData.platform === 'Claude' ? 10000 : 5000;

            // More comprehensive duplicate detection
            if ((isDuplicateContent || isDuplicateUrl) && timeDifference < duplicateWindow) {
                logger.log('Duplicate conversation detected, skipping save.', {
                    platform: conversationData.platform,
                    timeDifference,
                    window: duplicateWindow,
                    duplicateType: isDuplicateUrl ? 'URL' : 'Content',
                    url: conversationData.url
                });
                return { status: 'success', data: { id: lastRecord.id, duplicate: true } };
            }
        }

        // Additional check: Search for existing conversations with same URL AND same content
        // Only block if it's truly the same conversation (same URL + same prompt + same response)
        if (conversationData.url) {
            const existingConversation = await findConversationByUrlAndContent(
                conversationData.url,
                conversationData.prompt,
                conversationData.response
            );
            if (existingConversation) {
                logger.log('Identical conversation already exists, skipping save.', {
                    existingId: existingConversation.id,
                    url: conversationData.url,
                    platform: conversationData.platform,
                    reason: 'Same URL, prompt, and response found in database'
                });
                return { status: 'success', data: { id: existingConversation.id, duplicate: true } };
            }
        }

        const writeTransaction = db.transaction(STORE_NAME, 'readwrite');
        const writeStore = writeTransaction.objectStore(STORE_NAME);
        const addRequest = writeStore.add(conversationData);

        const newId = await new Promise((resolve, reject) => {
            addRequest.onsuccess = (event) => resolve(event.target.result);
            addRequest.onerror = (event) => reject(event.target.error);
        });

        return { status: 'success', data: { id: newId } };
    } catch (error) {
        return { status: 'error', message: error.message, details: error };
    }
}

export async function getAllConversations() {
    try {
        const db = await getDB();
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index('createdAt');
        const request = index.getAll();

        const result = await new Promise((resolve, reject) => {
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });

        return { status: 'success', data: result.reverse() };
    } catch (error) {
        return { status: 'error', message: error.message, details: error };
    }
}

/**
 * Get conversations with pagination support and optimized search
 * @param {Object} options - Pagination options
 * @param {number} options.page - Page number (1-based)
 * @param {number} options.limit - Number of conversations per page
 * @param {string} options.search - Search term to filter conversations
 * @param {string} options.platform - Platform filter (optional)
 * @returns {Promise<Object>} Result object with conversations, pagination info, and status
 */
export async function getConversations({ page = 1, limit = 50, search = '', platform = '' } = {}) {
    try {
        const db = await getDB();

        // Use optimized search if search term is provided
        if (search && search.trim().length > 0) {
            return await getConversationsWithSearch({ page, limit, search, platform });
        }

        // Use platform filter if specified
        if (platform && platform.trim().length > 0) {
            return await getConversationsByPlatform({ page, limit, platform });
        }

        // Default: get all conversations sorted by creation date
        return await getAllConversationsPaginated({ page, limit });

    } catch (error) {
        return { status: 'error', message: error.message, details: error };
    }
}

/**
 * Get all conversations with pagination (no filters)
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>} Result object with conversations and pagination info
 */
async function getAllConversationsPaginated({ page, limit }) {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('createdAt');

    const conversations = [];
    const skip = (page - 1) * limit;
    let skipped = 0;

    return new Promise((resolve, reject) => {
        const request = index.openCursor(null, 'prev'); // Newest first

        request.onsuccess = (event) => {
            const cursor = event.target.result;

            if (cursor && conversations.length < limit) {
                if (skipped >= skip) {
                    conversations.push(cursor.value);
                } else {
                    skipped++;
                }
                cursor.continue();
            } else {
                resolve({
                    status: 'success',
                    data: conversations,
                    pagination: {
                        page,
                        limit,
                        hasMore: cursor !== null && conversations.length === limit
                    }
                });
            }
        };

        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * Get conversations filtered by platform using index
 * @param {Object} options - Filter and pagination options
 * @returns {Promise<Object>} Result object with conversations and pagination info
 */
async function getConversationsByPlatform({ page, limit, platform }) {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('platform_createdAt');

    const conversations = [];
    const skip = (page - 1) * limit;
    let skipped = 0;

    return new Promise((resolve, reject) => {
        // Use compound index for efficient platform + date sorting
        const keyRange = IDBKeyRange.bound([platform, 0], [platform, Date.now()]);
        const request = index.openCursor(keyRange, 'prev'); // Newest first within platform

        request.onsuccess = (event) => {
            const cursor = event.target.result;

            if (cursor && conversations.length < limit) {
                if (skipped >= skip) {
                    conversations.push(cursor.value);
                } else {
                    skipped++;
                }
                cursor.continue();
            } else {
                resolve({
                    status: 'success',
                    data: conversations,
                    pagination: {
                        page,
                        limit,
                        hasMore: cursor !== null && conversations.length === limit
                    }
                });
            }
        };

        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * Get conversations with search functionality using optimized approach
 * @param {Object} options - Search and pagination options
 * @returns {Promise<Object>} Result object with conversations and pagination info
 */
async function getConversationsWithSearch({ page, limit, search, platform = '' }) {
    const db = await getDB();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    // Use platform index if platform filter is specified
    const index = platform ? store.index('platform_createdAt') : store.index('createdAt');

    const conversations = [];
    const skip = (page - 1) * limit;
    let count = 0;
    let skipped = 0;

    // Optimize search by converting to lowercase once
    const searchLower = search.toLowerCase().trim();
    const searchTerms = searchLower.split(/\s+/).filter(term => term.length > 0);

    return new Promise((resolve, reject) => {
        let request;

        if (platform) {
            // Search within specific platform
            const keyRange = IDBKeyRange.bound([platform, 0], [platform, Date.now()]);
            request = index.openCursor(keyRange, 'prev');
        } else {
            // Search across all conversations
            request = index.openCursor(null, 'prev');
        }

        request.onsuccess = (event) => {
            const cursor = event.target.result;

            if (cursor && conversations.length < limit) {
                const conversation = cursor.value;

                // Enhanced search matching with multiple terms
                const matchesSearch = searchTerms.every(term => {
                    return (conversation.title && conversation.title.toLowerCase().includes(term)) ||
                           (conversation.prompt && conversation.prompt.toLowerCase().includes(term)) ||
                           (conversation.response && conversation.response.toLowerCase().includes(term)) ||
                           (conversation.platform && conversation.platform.toLowerCase().includes(term));
                });

                if (matchesSearch) {
                    if (skipped >= skip) {
                        conversations.push(conversation);
                    } else {
                        skipped++;
                    }
                    count++;
                }

                cursor.continue();
            } else {
                resolve({
                    status: 'success',
                    data: conversations,
                    pagination: {
                        page,
                        limit,
                        hasMore: cursor !== null && conversations.length === limit,
                        totalCount: count,
                        search
                    }
                });
            }
        };

        request.onerror = (event) => reject(event.target.error);
    });
}

/**
 * Get total count of conversations, optionally filtered by search term
 * @param {string} search - Optional search term to filter conversations
 * @returns {Promise<Object>} Result object with total count and status
 */
export async function getTotalConversationCount(search = '') {
    try {
        const db = await getDB();
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);

        if (!search) {
            // If no search filter, use the faster count method
            const countRequest = store.count();
            const totalCount = await new Promise((resolve, reject) => {
                countRequest.onsuccess = (event) => resolve(event.target.result);
                countRequest.onerror = (event) => reject(event.target.error);
            });

            return { status: 'success', data: { totalCount } };
        } else {
            // If search filter is provided, we need to iterate through records
            const index = store.index('createdAt');
            let count = 0;

            // Optimize search by converting to lowercase once
            const searchLower = search.toLowerCase().trim();

            return new Promise((resolve, reject) => {
                const request = index.openCursor();

                request.onsuccess = (event) => {
                    const cursor = event.target.result;

                    if (cursor) {
                        const conversation = cursor.value;
                        // Optimized search: convert search term to lowercase once
                        const matchesSearch =
                            (conversation.title && conversation.title.toLowerCase().includes(searchLower)) ||
                            (conversation.prompt && conversation.prompt.toLowerCase().includes(searchLower)) ||
                            (conversation.response && conversation.response.toLowerCase().includes(searchLower)) ||
                            (conversation.platform && conversation.platform.toLowerCase().includes(searchLower));

                        if (matchesSearch) {
                            count++;
                        }

                        cursor.continue();
                    } else {
                        resolve({ status: 'success', data: { totalCount: count } });
                    }
                };

                request.onerror = (event) => {
                    reject(event.target.error);
                };
            });
        }
    } catch (error) {
        return { status: 'error', message: error.message, details: error };
    }
}

export async function deleteConversation({ id }) {
    try {
        const db = await getDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(id);

        await new Promise((resolve, reject) => {
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });

        return { status: 'success', data: { id } };
    } catch (error) {
        return { status: 'error', message: error.message, details: error };
    }
}

/**
 * Find a conversation by its URL and content (for precise duplicate detection)
 * @param {string} url - The conversation URL to search for
 * @param {string} prompt - The conversation prompt
 * @param {string} response - The conversation response
 * @returns {Promise<Object|null>} The conversation object if found, null otherwise
 */
async function findConversationByUrlAndContent(url, prompt, response) {
    try {
        const db = await getDB();
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.openCursor();

        return new Promise((resolve, reject) => {
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    const conversation = cursor.value;
                    if (conversation.url === url &&
                        conversation.prompt === prompt &&
                        conversation.response === response) {
                        resolve(conversation);
                        return;
                    }
                    cursor.continue();
                } else {
                    resolve(null); // No conversation found with this URL and content
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        logger.error('Error finding conversation by URL and content:', error);
        return null;
    }
}

/**
 * Close the database connection (for testing purposes)
 */
export async function closeDB() {
    if (dbPromise) {
        try {
            const db = await dbPromise;
            db.close();
            dbPromise = null;
        } catch (error) {
            logger.error('Error closing database:', error);
        }
    }
}
