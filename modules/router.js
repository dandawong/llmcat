/**
 * Message Router Module
 * 
 * This module acts as a central hub for all incoming messages from
 * different parts of the extension. It routes messages to the appropriate
 * handler based on a defined namespace and action.
 */

import * as logStorage from './log-storage.js';
import * as storage from './storage.js';
import * as capture from './capture.js';
import { createLogger } from './logger.js';
import { getSetting, setSetting } from './settings.js';
import * as cspReporter from './csp-reporter.js';

let logger;

// We need to initialize the logger asynchronously
async function initializeLogger() {
    const debugLoggingEnabled = await getSetting('debugLoggingEnabled');
    logger = createLogger(debugLoggingEnabled);
}

const routes = {
    logging: {
        addLog: (payload) => logStorage.addLog(payload),
        getLogs: () => logStorage.getLogs(),
        clearLogs: () => logStorage.clearLogs(),
    },
    database: {
        saveConversation: (payload) => storage.saveConversation(payload),
        getAllConversations: () => storage.getAllConversations(),
        getConversations: (payload) => storage.getConversations(payload),
        getAllConversationsForSearch: () => storage.getAllConversations(), // For performance optimization
        getTotalConversationCount: (payload) => storage.getTotalConversationCount(payload?.search),
        deleteConversation: (payload) => storage.deleteConversation(payload),
    },
    capture: {
        getPlatformConfig: (payload) => {
            const config = capture.getPlatformConfig(payload);
            // Router needs to handle sync and async functions.
            // This one is sync, so we can just resolve it.
            return Promise.resolve(config);
        }
    },
    settings: {
        get: (payload) => getSetting(payload.key),
        set: (payload) => setSetting(payload.key, payload.value),
    },
    security: {
        reportCSPViolation: (payload) => cspReporter.storeViolation ? cspReporter.storeViolation(payload) : Promise.resolve({ status: 'error', message: 'CSP reporter not available' }),
        getCSPViolations: () => cspReporter.getStoredViolations(),
        clearCSPViolations: () => cspReporter.clearStoredViolations(),
        getViolationStats: () => cspReporter.getViolationStats(),
        checkCSPConfiguration: () => Promise.resolve(cspReporter.checkCSPConfiguration()),
    }
};

// A wrapper to standardize the response format.
const responseWrapper = (handler) => async (payload) => {
    try {
        const result = await handler(payload);
        // If the result is already in the desired format, return it directly.
        if (result && typeof result === 'object' && 'status' in result) {
            return result;
        }
        // Otherwise, wrap the successful result.
        return { status: 'success', data: result };
    } catch (error) {
        // Catch any unexpected errors from the handler.
        logger.error(`Error in handler:`, error);
        return { status: 'error', message: error.message, details: error };
    }
};

// Apply the wrapper to all route handlers that don't already return a unified response.
// logStorage and storage modules are assumed to already return the correct format.
routes.capture.getPlatformConfig = responseWrapper(routes.capture.getPlatformConfig);
routes.settings.get = responseWrapper(routes.settings.get);
routes.settings.set = responseWrapper(routes.settings.set);


function handleMessage(message, sender, sendResponse) {
    const { namespace, action, payload } = message;

    if (namespace && routes[namespace] && typeof routes[namespace][action] === 'function') {
        logger.log(`Routing message: ${namespace}.${action}`, { from: sender.tab ? `Tab ${sender.tab.id}` : 'Extension' });

        // The responseWrapper ensures all responses are standardized.
        routes[namespace][action](payload)
            .then(sendResponse)
            .catch(error => {
                // This catch is a fallback for catastrophic errors, e.g., if a promise was rejected.
                logger.error(`Unhandled rejection in router for ${namespace}.${action}:`, error);
                sendResponse({
                    status: 'error',
                    message: 'An unexpected error occurred in the router.',
                    details: error.message
                });
            });

        return true; // Keep channel open for async response
    } else {
        logger.warn(`No route found for message:`, message);
        sendResponse({ status: 'error', message: 'Action not found' });
    }
}

export async function initialize() {
    await initializeLogger();
    chrome.runtime.onMessage.addListener(handleMessage);
    logger.log("Message router initialized.");
}
