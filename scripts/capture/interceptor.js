/**
 * Interceptor Script (Main World)
 *
 * This script runs in the main world of the page and intercepts
 * fetch/XMLHttpRequest calls to capture AI conversations.
 * It dynamically loads platform-specific modules based on the
 * current website.
 *
 * Security Features:
 * - URL validation for dynamic imports
 * - Module integrity checks
 * - Secure error handling
 */

let platformModule;
let logger;

// Listen for real-time debug mode updates from the injector
window.addEventListener('message', (event) => {
    if (event.source === window && event.data.type === 'LLMLOG_DEBUG_MODE_UPDATE') {
        const { debugMode } = event.data.payload;
        if (logger && typeof logger.setDebugMode === 'function') {
            logger.setDebugMode(debugMode);
            console.log('LLMCat: Debug mode updated in interceptor:', debugMode);
        }
    }
    
    // Listen for recording enabled updates from the injector
    if (event.source === window && event.data.type === 'LLMLOG_RECORDING_ENABLED_UPDATE') {
        const { recordingEnabled } = event.data.payload;
        console.log('LLMCat: Recording enabled updated in interceptor:', recordingEnabled);
        // We could use this to modify behavior in the interceptor if needed
    }
});

// Security configuration for the interceptor
const INTERCEPTOR_SECURITY = {
    // Allowed module paths (relative to extension root)
    ALLOWED_MODULES: [
        'scripts/capture/platforms/chatgpt.js',
        'scripts/capture/platforms/gemini.js',
        'scripts/capture/platforms/claude.js',
        'scripts/capture/platforms/tongyi.js',
        'scripts/capture/platforms/deepseek.js',
        'scripts/capture/platforms/kimi.js',
        'scripts/capture/platforms/doubao.js',
        'modules/logger.js'
    ],

    // Maximum import timeout
    IMPORT_TIMEOUT: 10000 // 10 seconds
};

/**
 * Security validator for the interceptor
 */
class InterceptorSecurityValidator {
    /**
     * Validates if a module URL is safe to import
     * @param {string} url - The URL to validate
     * @returns {boolean} - True if URL is safe to import
     */
    static isValidModuleURL(url) {
        try {
            const urlObj = new URL(url);

            // Must be a chrome-extension URL
            if (urlObj.protocol !== 'chrome-extension:') {
                console.error('LLMCat Security: Non-extension URL blocked:', url);
                return false;
            }

            // Extract the path and check if it's in our allowed list
            const path = urlObj.pathname.substring(1); // Remove leading slash
            const isAllowed = INTERCEPTOR_SECURITY.ALLOWED_MODULES.includes(path);

            if (!isAllowed) {
                console.error('LLMCat Security: Unauthorized module path blocked:', path);
            }

            return isAllowed;
        } catch (error) {
            console.error('LLMCat Security: Invalid URL format:', url, error);
            return false;
        }
    }

    /**
     * Safely imports a module with validation and timeout
     * @param {string} url - The module URL to import
     * @returns {Promise<any>} - The imported module
     */
    static async safeImport(url) {
        // Validate URL first
        if (!this.isValidModuleURL(url)) {
            throw new Error(`Security validation failed for module: ${url}`);
        }

        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Module import timeout: ${url}`));
            }, INTERCEPTOR_SECURITY.IMPORT_TIMEOUT);
        });

        // Race between import and timeout
        try {
            const module = await Promise.race([
                import(url),
                timeoutPromise
            ]);

            return module;
        } catch (error) {
            if (logger) {
                logger.error('LLMCat Security: Module import failed:', url, error);
            } else {
                console.error('LLMCat Security: Module import failed:', url, error);
            }
            throw error;
        }
    }
}

// Track recent conversations to prevent duplicates with memory limits
const recentConversations = new Map();
const processedConversationIds = new Set();
const DUPLICATE_WINDOW_MS = 15000; // 15 seconds (balanced for page reloads vs new conversations)
const MAX_TRACKED_CONVERSATIONS = 1000; // Limit memory usage
const MAX_PROCESSED_IDS = 500; // Limit Set size

// Function to check if a conversation is a duplicate
function isDuplicateConversation(conversationData) {
    const now = Date.now();

    // Platform-specific duplicate detection windows
    const platformDuplicateWindows = {
        'Doubao': 30000, // 30 seconds for Doubao
        'Claude': 10000, // 10 seconds for Claude (faster responses)
        'default': 15000 // 15 seconds for other platforms
    };

    const duplicateWindowMs = platformDuplicateWindows[conversationData.platform] || platformDuplicateWindows.default;

    // Create multiple keys for different duplicate detection strategies
    const contentKey = `${conversationData.platform}:${conversationData.prompt}:${conversationData.response}`;
    const urlKey = conversationData.url;

    // Extract conversation ID from URL or conversation data for more robust detection
    let conversationId = null;
    let messageId = null;

    // For Doubao: use conversation_id and message_id from the conversation data
    if (conversationData.platform === 'Doubao') {
        conversationId = conversationData.conversationId || conversationData.id;
        messageId = conversationData.messageId;

        // Fallback to local IDs if primary IDs are not available
        if (!conversationId) {
            conversationId = conversationData.localConversationId;
        }
        if (!messageId) {
            messageId = conversationData.localMessageId;
        }
    } else if (conversationData.url) {
        // For other platforms: extract from URL patterns
        // For ChatGPT: extract from /c/conversation-id
        const chatgptMatch = conversationData.url.match(/\/c\/([a-f0-9-]+)/);
        // For Claude: extract from current URL or conversation data
        const claudeMatch = conversationData.url.match(/\/chat\/([a-f0-9-]+)/);
        // For Gemini: extract from /app/conversation-id
        const geminiMatch = conversationData.url.match(/\/app\/([a-f0-9-]+)/);
        // For Doubao: extract from /chat/conversation-id (URL fallback)
        const doubaoMatch = conversationData.url.match(/\/chat\/([a-f0-9-]+)/);

        conversationId = chatgptMatch?.[1] || claudeMatch?.[1] || geminiMatch?.[1] || doubaoMatch?.[1];
    }

    // Clean up old entries and enforce size limits
    for (const [existingKey, timestamp] of recentConversations.entries()) {
        if (now - timestamp > duplicateWindowMs) {
            recentConversations.delete(existingKey);
        }
    }

    // Enforce memory limits by removing oldest entries if needed
    if (recentConversations.size > MAX_TRACKED_CONVERSATIONS) {
        const entries = Array.from(recentConversations.entries());
        entries.sort((a, b) => a[1] - b[1]); // Sort by timestamp
        const toRemove = entries.slice(0, entries.length - MAX_TRACKED_CONVERSATIONS);
        toRemove.forEach(([key]) => recentConversations.delete(key));
        logger.log(`Cleaned up ${toRemove.length} old conversation entries for memory optimization`);
    }

    // Clean up processed IDs set if it gets too large
    if (processedConversationIds.size > MAX_PROCESSED_IDS) {
        processedConversationIds.clear();
        logger.log('Cleared processed conversation IDs for memory optimization');
    }

    // Strategy 1: Check by conversation ID + content (most reliable for true duplicates)
    if (conversationId) {
        let idContentKey;

        // For Doubao: use both conversation_id and message_id for more precise duplicate detection
        if (conversationData.platform === 'Doubao' && messageId) {
            idContentKey = `${conversationData.platform}:${conversationId}:${messageId}:${conversationData.prompt}:${conversationData.response}`;
        } else {
            idContentKey = `${conversationData.platform}:${conversationId}:${conversationData.prompt}:${conversationData.response}`;
        }

        if (processedConversationIds.has(idContentKey)) {
            logger.log('Duplicate conversation detected by ID + content, skipping.', {
                conversationId,
                messageId: messageId || 'none',
                platform: conversationData.platform,
                url: conversationData.url,
                reason: 'Same conversation/message ID with identical content (likely duplicate response)'
            });
            return true;
        }

        // For Doubao: also check for duplicate message IDs within the same conversation
        if (conversationData.platform === 'Doubao' && messageId) {
            const messageIdKey = `${conversationData.platform}:${conversationId}:${messageId}`;
            if (processedConversationIds.has(messageIdKey)) {
                logger.log('Duplicate Doubao message detected by message ID, skipping.', {
                    conversationId,
                    messageId,
                    reason: 'Same message ID already processed'
                });
                return true;
            }
            // Mark this message ID as processed
            processedConversationIds.add(messageIdKey);
        }

        // Mark this specific conversation content as processed
        processedConversationIds.add(idContentKey);

        // Clean up old entries for this conversation ID to prevent memory bloat
        const oldEntries = Array.from(processedConversationIds).filter(key =>
            key.startsWith(`${conversationData.platform}:${conversationId}:`) &&
            key !== idContentKey
        );
        // Keep only the last 10 entries per conversation to allow for conversation continuation
        if (oldEntries.length > 10) {
            oldEntries.slice(0, oldEntries.length - 10).forEach(key => {
                processedConversationIds.delete(key);
            });
        }
    }

    // Strategy 2: Check by content within time window
    if (recentConversations.has(contentKey)) {
        logger.log('Duplicate conversation detected by content, skipping.', {
            contentKey: contentKey.substring(0, 100) + '...'
        });
        return true;
    }

    // Strategy 3: Check by URL within time window (ONLY for page reloads, not new conversations)
    // This should only block if it's the EXACT same content on the same URL within a short time
    if (urlKey && recentConversations.has(contentKey)) {
        // Only block if we have both same URL AND same content within time window
        const urlTimeKey = `url:${urlKey}`;
        if (recentConversations.has(urlTimeKey)) {
            logger.log('Duplicate conversation detected by URL + content, skipping.', {
                url: urlKey,
                reason: 'Same URL and same content within time window (likely page reload)'
            });
            return true;
        }
    }

    // Always track URL with timestamp for reference, but don't block based on URL alone
    if (urlKey) {
        const urlTimeKey = `url:${urlKey}`;
        recentConversations.set(urlTimeKey, now);
    }

    // Add this conversation to the tracking map
    recentConversations.set(contentKey, now);

    // Removed debug log for new conversation detection to reduce console output
    // logger.log('New conversation detected, processing.', {
    //     platform: conversationData.platform,
    //     conversationId,
    //     hasUrl: !!conversationData.url,
    //     promptLength: conversationData.prompt.length,
    //     responseLength: conversationData.response.length
    // });

    return false;
}

// 1. Listen for messages from the injector and the platform module
window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data.type === 'LLMLOG_INIT') {
        const { modulePath, loggerPath, debugMode } = event.data.payload;

        // Use secure import for logger module
        InterceptorSecurityValidator.safeImport(loggerPath)
            .then(({ createLogger }) => {
                logger = createLogger(debugMode.data);
                logger.log('Interceptor initialized with security validation.', { debugMode });

                // Use secure import for platform module
                return InterceptorSecurityValidator.safeImport(modulePath);
            })
            .then(module => {
                platformModule = module;
                logger.log('Platform module loaded securely.', platformModule.config.name);

                // Initialize the appropriate interceptor based on platform
                if (platformModule.config.name === 'Gemini' || platformModule.config.name === 'DeepSeek') {
                    overrideXHR();
                } else {
                    overrideFetch();
                }
            })
            .catch(e => {
                console.error('LLMCat Security: Failed to load modules securely.', e);

                // Report security incident
                const incident = {
                    type: 'module_loading_failed',
                    timestamp: new Date().toISOString(),
                    url: window.location.href,
                    error: e.message,
                    modulePath: event.data.payload.modulePath,
                    loggerPath: event.data.payload.loggerPath
                };

                console.error('LLMCat Security Incident:', incident);

                // Attempt to notify the extension about the security incident
                try {
                    window.postMessage({
                        type: 'LLMLOG_SECURITY_INCIDENT',
                        payload: incident
                    }, window.location.origin);
                } catch (notifyError) {
                    console.error('Failed to notify about security incident:', notifyError);
                }

                // Don't proceed with initialization if module loading fails
            });
    }

    if (event.data.type === 'LLMLOG_CONVERSATION_UPDATE') {
        logger.log('Received conversation update from platform module.', event.data.payload);

        // Apply duplicate detection to Claude conversations too!
        const conversationData = event.data.payload;
        if (!isDuplicateConversation(conversationData)) {
            window.postMessage({ type: 'LLMLOG_CONVERSATION', payload: conversationData }, window.location.origin);
            logger.log('Sent Claude conversation data to bridge.', conversationData);
        } else {
            logger.log('Claude conversation blocked as duplicate.', {
                platform: conversationData.platform,
                promptPreview: conversationData.prompt.substring(0, 50) + '...',
                responsePreview: conversationData.response.substring(0, 50) + '...'
            });
        }
    }
});

// 2. Announce that the interceptor is ready and request the config
window.postMessage({ type: 'LLMLOG_INTERCEPTOR_READY' }, window.location.origin);


function overrideFetch() {
    if (!platformModule) {
        logger.error('No platform module loaded.');
        return;
    }

    const { config, parseRequest, parseResponse } = platformModule;
    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
        const url = args[0] instanceof Request ? args[0].url : args[0];
        const method = (args[0] instanceof Request ? args[0].method : (args[1] ? args[1].method : 'GET'))?.toUpperCase();
        const requestUrl = new URL(url, window.location.origin);

        const isMatch = config.apiEndpoint instanceof RegExp
            ? config.apiEndpoint.test(requestUrl.pathname)
            : requestUrl.pathname === config.apiEndpoint;

        // Removed debug log for request observation to reduce console output
        // logger.log('Saw a request.', {
        //     method,
        //     pathname: requestUrl.pathname,
        //     expected: config.apiEndpoint.toString(),
        //     match: isMatch
        // });

        // Intercept the target API call (POST or GET)
        if (isMatch) {
            const request = new Request(...args);
            // Removed debug log for target API call detection to reduce console output
            // logger.log('Target API call detected.', { url: requestUrl.href });

            const userPrompt = await parseRequest(request, logger);
            // Removed debug log for parsed user prompt to reduce console output
            // logger.log('Parsed user prompt.', { prompt: userPrompt });

            // Execute the original fetch but don't wait for our processing to complete
            const response = await originalFetch(request);

            // Clone the response for our processing
            const responseClone = response.clone();

            // Process the response asynchronously without blocking the original response
            // This ensures the page can still receive the stream in real-time
            setTimeout(async () => {
                try {
                    const responseData = await parseResponse(responseClone, logger);
                    const { text: aiResponse, id: conversationId, url: platformUrl, messageId, localConversationId, localMessageId } = responseData;
                    // Removed debug log for parsed AI response to reduce console output
                    // logger.log('Parsed AI response.', { response: aiResponse, conversationId, platformUrl, messageId, localConversationId, localMessageId });

                    // For Claude, the conversation data is sent via a custom event, so we skip this part.
                    if (config.name === 'Claude') {
                        return;
                    }

                    let conversationUrl = platformUrl || window.location.href;
                    if (conversationId) {
                        if (config.name === 'Tongyi') {
                            conversationUrl = `${window.location.origin}/?sessionId=${conversationId}`;
                        } else if (config.name === 'DeepSeek') {
                            conversationUrl = `${window.location.origin}/a/chat/s/${conversationId}`;
                        } else if (config.name === 'Kimi') {
                            // Kimi URL is handled by platformUrl
                        } else if (config.name === 'Doubao') {
                            conversationUrl = `${window.location.origin}/chat/${conversationId}`;
                        } else {
                            conversationUrl = `${window.location.origin}/c/${conversationId}`;
                        }
                    }

                    // Generate title using platform-specific function if available, otherwise use default
                    let title;
                    if (platformModule && typeof platformModule.generateTitle === 'function') {
                        title = platformModule.generateTitle(userPrompt);
                    } else {
                        title = userPrompt.substring(0, 50);
                    }

                    const conversationData = {
                        platform: config.name,
                        prompt: userPrompt,
                        response: aiResponse,
                        url: conversationUrl,
                        createdAt: new Date().toISOString(),
                        title: title,
                        conversationId: conversationId,
                        messageId: messageId,
                        localConversationId: localConversationId,
                        localMessageId: localMessageId
                    };

                    // Check for duplicates before sending
                    if (!isDuplicateConversation(conversationData)) {
                        window.postMessage({ type: 'LLMLOG_CONVERSATION', payload: conversationData }, window.location.origin);
                        // Removed debug log for sending conversation data to reduce console output
                        // logger.log('Sent conversation data to bridge.', conversationData);
                    }
                } catch (error) {
                    logger.error('Error processing response in background:', error);
                }
            }, 0);

            // Return the original response immediately to avoid blocking
            return response;
        }

        // For all other requests, pass them through without modification.
        return originalFetch(...args);
    };

    logger.log('`fetch` has been overridden.');
}

function overrideXHR() {
    if (!platformModule) {
        logger.error('No platform module loaded for XHR.');
        return;
    }

    const { config, parseRequest, parseResponse } = platformModule;
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...args) {
        this._llmlog_method = method;
        this._llmlog_url = url;
        return originalOpen.apply(this, [method, url, ...args]);
    };

    XMLHttpRequest.prototype.send = function (body) {
        const requestUrl = new URL(this._llmlog_url, window.location.origin);
        const method = this._llmlog_method.toUpperCase();

        if (method === 'POST') {
            // Removed debug log for XHR POST request observation to reduce console output
            // logger.log('(XHR) Saw a POST request.', {
            //     pathname: requestUrl.pathname,
            //     expected: config.apiEndpoint,
            //     match: config.apiEndpoint instanceof RegExp
            //         ? config.apiEndpoint.test(requestUrl.pathname)
            //         : requestUrl.pathname === config.apiEndpoint
            // });
        }

        const isMatch = config.apiEndpoint instanceof RegExp
            ? config.apiEndpoint.test(requestUrl.pathname)
            : requestUrl.pathname === config.apiEndpoint;

        if (method === 'POST' && isMatch) {
            // Removed debug log for XHR target API call detection to reduce console output
            // logger.log('(XHR) Target API call detected.', { url: requestUrl.href });

            // Add the URL to the mock request
            const mockRequest = {
                clone: () => mockRequest,
                json: async () => JSON.parse(body),
                formData: async () => {
                    const params = new URLSearchParams(body);
                    const formData = new FormData();
                    for (const [key, value] of params.entries()) {
                        formData.append(key, value);
                    }
                    return formData;
                },
                url: requestUrl.href
            };

            this.addEventListener('load', async () => {
                if (this.readyState === 4 && this.status === 200) {
                    logger.log('(XHR) Response loaded.');

                    const userPrompt = await parseRequest(mockRequest, logger);
                    // Removed debug log for XHR parsed user prompt to reduce console output
                    // logger.log('(XHR) Parsed user prompt.', { prompt: userPrompt });

                    // Mock a Response object for parseResponse
                    const mockResponse = {
                        clone: () => mockResponse,
                        text: async () => this.responseText,
                    };

                    const responseData = await parseResponse(mockResponse, logger);
                    const { text: aiResponse, id: conversationId, url: platformUrl, messageId, localConversationId, localMessageId } = responseData;
                    // Removed debug log for XHR parsed AI response to reduce console output
                    // logger.log('(XHR) Parsed AI response.', { response: aiResponse, conversationId, platformUrl, messageId, localConversationId, localMessageId });

                    let conversationUrl = platformUrl || window.location.href;
                    if (conversationId) {
                        if (config.name === 'Tongyi') {
                            conversationUrl = `${window.location.origin}/?sessionId=${conversationId}`;
                        } else if (config.name === 'DeepSeek') {
                            conversationUrl = `${window.location.origin}/a/chat/s/${conversationId}`;
                        } else if (config.name === 'Kimi') {
                            // Kimi URL is handled by platformUrl
                        } else if (config.name === 'Doubao') {
                            conversationUrl = `${window.location.origin}/chat/${conversationId}`;
                        } else {
                            conversationUrl = `${window.location.origin}/c/${conversationId}`;
                        }
                    }

                    // Generate title using platform-specific function if available, otherwise use default
                    let title;
                    if (platformModule && typeof platformModule.generateTitle === 'function') {
                        title = platformModule.generateTitle(userPrompt);
                    } else {
                        title = userPrompt.substring(0, 50);
                    }

                    const conversationData = {
                        platform: config.name,
                        prompt: userPrompt,
                        response: aiResponse,
                        url: conversationUrl,
                        createdAt: new Date().toISOString(),
                        title: title,
                        conversationId: conversationId,
                        messageId: messageId,
                        localConversationId: localConversationId,
                        localMessageId: localMessageId
                    };

                    // Check for duplicates before sending
                    if (!isDuplicateConversation(conversationData)) {
                        window.postMessage({ type: 'LLMLOG_CONVERSATION', payload: conversationData }, window.location.origin);
                        // Removed debug log for XHR sending conversation data to reduce console output
                        // logger.log('(XHR) Sent conversation data to bridge.', conversationData);
                    }
                }
            });
        }

        return originalSend.apply(this, arguments);
    };

    logger.log('`XMLHttpRequest` has been overridden.');
}
