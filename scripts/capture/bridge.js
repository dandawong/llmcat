/**
 * Bridge Script (Content Script - Isolated World)
 *
 * This script acts as a bridge between the main world (interceptor) and
 * the extension's background service worker.
 */

// Suppress "Extension context invalidated" error messages in console during development
if (typeof window !== 'undefined') {
    window.addEventListener('error', function(e) {
        // Suppress the "Extension context invalidated" error messages in console
        if (e.message && e.message.includes('Extension context invalidated')) {
            // Prevent the error from appearing in console
            e.stopImmediatePropagation();
            return false;
        }
    });
}

// Import logger dynamically to avoid module resolution issues in content scripts
let bridgeCreateLogger;

// Dynamically import the logger module
(async () => {
    try {
        const loggerModule = await import(chrome.runtime.getURL('modules/logger.js'));
        bridgeCreateLogger = loggerModule.createLogger;
    } catch (error) {
        console.error('LLMCat: Failed to load logger module:', error);
        // Fallback logger
        bridgeCreateLogger = (debugMode) => ({
            setDebugMode: () => {},
            log: debugMode ? console.log.bind(console, 'LLMCat:') : () => {},
            error: debugMode ? console.error.bind(console, 'LLMCat:') : () => {},
            warn: debugMode ? console.warn.bind(console, 'LLMCat:') : () => {},
            info: debugMode ? console.info.bind(console, 'LLMCat:') : () => {}
        });
    }
})();


let platformModulePath = null;
let debugLoggingEnabled = false;
let recordingEnabled = true;
let interceptorReady = false;
let serviceWorkerReady = false;
let initializationRetryCount = 0;
let bridgeLogger = null;
const MAX_RETRY_COUNT = 5;
const RETRY_DELAY = 1000; // 1 second

function sendInitMessageToInterceptor() {
    // Only proceed if both the path is available and the interceptor is ready
    if (!platformModulePath || !interceptorReady) {
        if (debugLoggingEnabled && bridgeLogger) bridgeLogger.log('LLMCat Bridge: Not ready to send init message.', {
            platformModulePath: !!platformModulePath,
            interceptorReady
        });
        return;
    }

    if (debugLoggingEnabled && bridgeLogger) bridgeLogger.log('LLMCat Bridge: Sending init message to interceptor.');
    
    const fullModuleUrl = chrome.runtime.getURL(platformModulePath);
    const loggerUrl = chrome.runtime.getURL('modules/logger.js');
    
    // Send the correct message type that the interceptor is expecting
    window.postMessage({
        type: 'LLMLOG_INIT',
        payload: {
            modulePath: fullModuleUrl,
            loggerPath: loggerUrl,
            debugMode: debugLoggingEnabled
        }
    }, window.location.origin);
}

// Robust sendMessage wrapper with enhanced error handling
function sendMessageRobust(message, callback) {
    if (debugLoggingEnabled && bridgeLogger) {
        bridgeLogger.log('LLMLog Bridge: Sending message:', message);
    }
    
    try {
        const promise = chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                const error = chrome.runtime.lastError;
                if (error.message.includes('Extension context invalidated')) {
                    if (debugLoggingEnabled && bridgeLogger) bridgeLogger.warn('LLMCat Bridge: Extension context invalidated. Service worker likely restarted. This is expected.');
                } else if (error.message.includes('Receiving end does not exist')) {
                    // Suppress "Receiving end does not exist" errors as they are often benign
                    // Only log in debug mode to avoid console spam
                    if (debugLoggingEnabled && bridgeLogger) {
                        bridgeLogger.warn('LLMCat Bridge: Service worker not ready (this is normal during reloads). Message:', 
                            message.namespace + '.' + message.action);
                    }
                    return; // Simply return without processing further
                } else if (error.message.includes('back/forward cache')) {
                    // Handle back/forward cache issue gracefully
                    if (debugLoggingEnabled && bridgeLogger) bridgeLogger.warn('LLMCat Bridge: Page moved to back/forward cache, message channel closed. This is expected.');
                } else if (error.message.includes('message channel is closed')) {
                    // Handle closed message channel gracefully
                    if (debugLoggingEnabled && bridgeLogger) bridgeLogger.warn('LLMCat Bridge: Message channel closed. This can happen during navigation.');
                } else {
                    if (bridgeLogger) bridgeLogger.error('LLMCat Bridge: Runtime error:', error.message, 'Message:', message);
                }
                return;
            }
            
            if (debugLoggingEnabled && bridgeLogger) {
                bridgeLogger.log('LLMCat Bridge: Received response:', response);
            }
            
            if (callback) {
                callback(response);
            }
        });
        
        if (promise && typeof promise.catch === 'function') {
            promise.catch(error => {
                if (error.message.includes('Extension context invalidated')) {
                    if (debugLoggingEnabled && bridgeLogger) bridgeLogger.warn('LLMCat Bridge: Extension context invalidated. Service worker likely restarted. This is expected.');
                } else if (error.message.includes('Receiving end does not exist')) {
                    // Suppress "Receiving end does not exist" errors as they are often benign
                    // Only log in debug mode to avoid console spam
                    if (debugLoggingEnabled && bridgeLogger) {
                        bridgeLogger.warn('LLMCat Bridge: Service worker not ready for promise (this is normal during reloads). Message:', 
                            message.namespace + '.' + message.action);
                    }
                    return; // Simply return without processing further
                } else {
                    if (bridgeLogger) bridgeLogger.error('LLMCat Bridge: Promise error:', error, 'Message:', message);
                }
            });
        }
    } catch (error) {
        if (error.message.includes('Extension context invalidated')) {
            if (debugLoggingEnabled && bridgeLogger) bridgeLogger.warn('LLMCat Bridge: Extension context invalidated. Service worker likely restarted. This is expected.');
        } else if (error.message.includes('Receiving end does not exist')) {
            // Suppress "Receiving end does not exist" errors as they are often benign
            // Only log in debug mode to avoid console spam
            if (debugLoggingEnabled && bridgeLogger) {
                bridgeLogger.warn('LLMCat Bridge: Service worker not ready for catch (this is normal during reloads). Message:', 
                    message.namespace + '.' + message.action);
            }
            return; // Simply return without processing further
        } else {
            if (bridgeLogger) bridgeLogger.error('LLMCat Bridge: Failed to send message:', error, 'Message:', message);
        }
    }
}

// Listen for messages from the interceptor (main world)
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    // Handle conversation data from the interceptor
    if (event.data.type === 'LLMLOG_CONVERSATION') {
        // Only save conversation if recording is enabled
        if (recordingEnabled) {
            if (debugLoggingEnabled && bridgeLogger) bridgeLogger.log('LLMCat Bridge: Received conversation from interceptor.', event.data.payload);

            sendMessageRobust({
                namespace: 'database',
                action: 'saveConversation',
                payload: event.data.payload
            }, response => {
                if (debugLoggingEnabled && bridgeLogger) {
                    if (response && response.status === 'success') {
                        bridgeLogger.log('LLMCat Bridge: Conversation saved successfully.', response.data);
                    } else if (response && response.status === 'error') {
                        bridgeLogger.error('LLMCat Bridge: Error saving conversation:', response.message);
                    } else {
                        bridgeLogger.log('LLMCat Bridge: Save confirmation received.', response);
                    }
                }
            });
        } else {
            if (debugLoggingEnabled && bridgeLogger) bridgeLogger.log('LLMCat Bridge: Recording disabled, ignoring conversation.', event.data.payload);
        }
    }

    // Handle ready signal from the interceptor
    if (event.data.type === 'LLMLOG_INTERCEPTOR_READY') {
        if (debugLoggingEnabled && bridgeLogger) bridgeLogger.log('LLMCat Bridge: Interceptor is ready.');
        interceptorReady = true;
        sendInitMessageToInterceptor(); // Attempt to send the init message now
    }
    
    // Handle recording enabled updates from service worker
    if (event.data.type === 'LLMLOG_RECORDING_ENABLED_UPDATE') {
        const { recordingEnabled: newRecordingEnabled } = event.data.payload;
        recordingEnabled = newRecordingEnabled;
        if (debugLoggingEnabled && bridgeLogger) bridgeLogger.log('LLMCat Bridge: Recording enabled updated:', recordingEnabled);
    }
});

// Keep the service worker alive
let serviceWorkerPort = null;
let pageLoadTime = Date.now();

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'LLMLOG_RECORDING_ENABLED_UPDATE') {
        const { recordingEnabled: newRecordingEnabled } = message.payload;
        recordingEnabled = newRecordingEnabled;
        if (debugLoggingEnabled && bridgeLogger) bridgeLogger.log('LLMCat Bridge: Recording enabled updated:', recordingEnabled);
    } else if (message.type === 'LLMLOG_DEBUG_MODE_UPDATE') {
        const { debugMode: newDebugMode } = message.payload;
        debugLoggingEnabled = newDebugMode;
        if (bridgeLogger) bridgeLogger.setDebugMode(debugLoggingEnabled);
        if (debugLoggingEnabled && bridgeLogger) bridgeLogger.log('LLMCat Bridge: Debug mode updated:', debugLoggingEnabled);
    }
});

function connectToServiceWorker() {
    try {
        serviceWorkerPort = chrome.runtime.connect({ name: 'llmlog-bridge' });
        if (debugLoggingEnabled && bridgeLogger) bridgeLogger.log('LLMCat Bridge: Connecting to service worker...');

        serviceWorkerPort.onDisconnect.addListener(() => {
            const timeSincePageLoad = Date.now() - pageLoadTime;
            const isRecentPageLoad = timeSincePageLoad < 5000; // Within 5 seconds of page load

            // Only log warning if it's not shortly after page load (which indicates extension reload)
            if (!isRecentPageLoad && debugLoggingEnabled && bridgeLogger) {
                // bridgeLogger.warn('LLMCat Bridge: Service worker port disconnected. Reconnecting...');
            } else if (debugLoggingEnabled && bridgeLogger) {
                bridgeLogger.log('LLMCat Bridge: Reconnecting to service worker after page reload...');
            }
            
            serviceWorkerPort = null; // Clear the old port
            
            // Add a small delay before reconnecting to avoid spamming
            setTimeout(connectToServiceWorker, 1000);
        });
    } catch (error) {
        // Suppress "Extension context invalidated" errors as they are normal during development
        if (error.message && error.message.includes('Extension context invalidated')) {
            if (debugLoggingEnabled && bridgeLogger) {
                bridgeLogger.log('LLMCat Bridge: Extension context invalidated. This is normal during development. Reconnecting...');
            }
            // This is expected during extension reload, reconnect after delay
            setTimeout(connectToServiceWorker, 1000);
        } else {
            // For other unexpected errors, still log them
            if (bridgeLogger) {
                bridgeLogger.error('LLMCat Bridge: Unexpected error during service worker connection:', error);
            }
            // Retry connection after delay
            setTimeout(connectToServiceWorker, 1000);
        }
    }
}

// Suppress "Extension context invalidated" error messages in console during development
if (typeof window !== 'undefined') {
    window.addEventListener('error', function(e) {
        // Suppress the "Extension context invalidated" error messages in console
        if (e.message && e.message.includes('Extension context invalidated')) {
            // Prevent the error from appearing in console
            e.stopImmediatePropagation();
            return false;
        }
    });
}


// Request platform configuration with retry logic
function requestPlatformConfig(platformName, retryCount = 0) {
    if (debugLoggingEnabled && bridgeLogger) bridgeLogger.log(`LLMLog Bridge: Requesting platform config for ${platformName} (attempt ${retryCount + 1})`);

    sendMessageRobust({
        namespace: 'capture',
        action: 'getPlatformConfig',
        payload: { platform: platformName }
    }, (response) => {
        // sendMessageRobust already handles chrome.runtime.lastError
        // Check if response indicates an error or is null/undefined
        if (!response || (response && response.status === 'error')) {
            if (bridgeLogger) bridgeLogger.error('LLMCat Bridge: Error getting platform module path:', response?.message || 'No response received');
            
            // Retry if we haven't exceeded max retries
            if (retryCount < MAX_RETRY_COUNT) {
                setTimeout(() => {
                    requestPlatformConfig(platformName, retryCount + 1);
                }, RETRY_DELAY * (retryCount + 1)); // Exponential backoff
            }
            return;
        }
        
        // Handle both wrapped and unwrapped responses
        let modulePath = null;
        if (response) {
            if (response.modulePath) {
                // Direct response format
                modulePath = response.modulePath;
            } else if (response.status === 'success' && response.data && response.data.modulePath) {
                // Wrapped response format
                modulePath = response.data.modulePath;
            } else if (response.status === 'error') {
                if (bridgeLogger) bridgeLogger.error('LLMCat Bridge: Error from service worker:', response.message);

                // Retry on error if we haven't exceeded max retries
                if (retryCount < MAX_RETRY_COUNT) {
                    setTimeout(() => {
                        requestPlatformConfig(platformName, retryCount + 1);
                    }, RETRY_DELAY * (retryCount + 1));
                }
                return;
            }
        }

        if (modulePath) {
            platformModulePath = modulePath;
            if (debugLoggingEnabled && bridgeLogger) bridgeLogger.log('LLMCat Bridge: Platform module path received and stored.', platformModulePath);
            sendInitMessageToInterceptor(); // Attempt to send the init message now
        } else {
            if (bridgeLogger) bridgeLogger.error('LLMCat Bridge: Did not receive a valid platform module path.', response);
            
            // Retry if we haven't exceeded max retries
            if (retryCount < MAX_RETRY_COUNT) {
                setTimeout(() => {
                    requestPlatformConfig(platformName, retryCount + 1);
                }, RETRY_DELAY * (retryCount + 1));
            }
        }
    });
}

// Determine the platform and fetch the config from the service worker
async function initializeBridge() {
    // Wait for logger to be available
    while (!bridgeCreateLogger) {
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Initialize logger with default debug mode
    bridgeLogger = bridgeCreateLogger(debugLoggingEnabled);

    // First get debug settings
    sendMessageRobust({
        namespace: 'settings',
        action: 'get',
        payload: { key: 'debugLoggingEnabled' }
    }, (response) => {
        // Handle wrapped response format
        if (response && response.status === 'success') {
            debugLoggingEnabled = response.data;
            // Update logger with new debug mode
            if (bridgeLogger) bridgeLogger.setDebugMode(debugLoggingEnabled);
        } else if (typeof response === 'boolean') {
            debugLoggingEnabled = response;
            // Update logger with new debug mode
            if (bridgeLogger) bridgeLogger.setDebugMode(debugLoggingEnabled);
        }

        if (debugLoggingEnabled && bridgeLogger) bridgeLogger.log('LLMCat Bridge: Debug logging enabled');
    });
    
    // Get recording enabled setting
    sendMessageRobust({
        namespace: 'settings',
        action: 'get',
        payload: { key: 'recordingEnabled' }
    }, (response) => {
        // Handle wrapped response format
        if (response && response.status === 'success') {
            recordingEnabled = response.data;
        } else if (typeof response === 'boolean') {
            recordingEnabled = response;
        }

        if (debugLoggingEnabled && bridgeLogger) bridgeLogger.log('LLMCat Bridge: Recording enabled:', recordingEnabled);
    });
    
    connectToServiceWorker(); // Establish the persistent connection
    
    // Detect platform
    let platformName = null;
    if (window.location.hostname.includes('chat.openai') || window.location.hostname.includes('chatgpt')) {
        platformName = 'chatgpt';
    } else if (window.location.hostname.includes('gemini.google')) {
        platformName = 'gemini';
    } else if (window.location.hostname.includes('claude.ai')) {
        platformName = 'claude';
    }
    
    if (platformName) {
        if (debugLoggingEnabled && bridgeLogger) bridgeLogger.log(`LLMLog Bridge: Platform detected: ${platformName}. Requesting config.`);

        // Add a small delay to ensure service worker is ready
        setTimeout(() => {
            requestPlatformConfig(platformName);
        }, 500);
    } else {
        if (debugLoggingEnabled && bridgeLogger) bridgeLogger.log('LLMCat Bridge: No supported platform detected for hostname:', window.location.hostname);
    }
}

// Diagnostic function for troubleshooting
function diagnosticInfo() {
    return {
        hostname: window.location.hostname,
        platformModulePath,
        debugLoggingEnabled,
        recordingEnabled,
        interceptorReady,
        serviceWorkerReady,
        initializationRetryCount,
        serviceWorkerPortConnected: !!serviceWorkerPort,
        timestamp: new Date().toISOString()
    };
}

// Make diagnostic function available globally for debugging
window.llmlogDiagnostic = diagnosticInfo;

initializeBridge();

