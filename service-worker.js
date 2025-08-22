import { initialize as initializeRouter } from './modules/router.js';
import { createLogger } from './modules/logger.js';
import { getSetting } from './modules/settings.js';

let logger; // LLMCat logger

// Function to update the extension icon based on recording state
async function updateIcon(recordingEnabled) {
    const iconPath = recordingEnabled ? 'icons/icon-recording-on.png' : 'icons/icon-recording-off.png';
    
    // For Manifest V3 (Chrome)
    if (chrome && chrome.action) {
        try {
            await chrome.action.setIcon({ path: iconPath });
        } catch (error) {
            logger.error("Error setting icon (MV3):", error);
        }
    }
    // For Manifest V2 (Legacy) or Firefox MV2/MV3 with browser API
    else if (browser && browser.browserAction) {
        try {
            await browser.browserAction.setIcon({ path: iconPath });
        } catch (error) {
            logger.error("Error setting icon (MV2/Browser):", error);
        }
    }
}

// Listen for setting updates from options page and broadcast to all tabs
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.namespace === 'settings' && message.action === 'update') {
        logger.log('Service worker received setting update, broadcasting to tabs:', message.payload);
        
        // Broadcast the setting update to all tabs
        chrome.tabs.query({}, (tabs) => {
            logger.log('Found tabs to broadcast to:', tabs.length);
            tabs.forEach(tab => {
                if (tab.id) {
                    try {
                        if (message.payload.key === 'debugLoggingEnabled') {
                            chrome.tabs.sendMessage(tab.id, {
                                type: 'LLMLOG_DEBUG_MODE_UPDATE',
                                payload: { debugMode: message.payload.value }
                            });
                            logger.log('Sent debug mode update to tab:', tab.id);
                        } else if (message.payload.key === 'recordingEnabled') {
                            chrome.tabs.sendMessage(tab.id, {
                                type: 'LLMLOG_RECORDING_ENABLED_UPDATE',
                                payload: { recordingEnabled: message.payload.value }
                            });
                            logger.log('Sent recording enabled update to tab:', tab.id);
                            
                            // Update the extension icon when recording state changes
                            updateIcon(message.payload.value);
                        }
                    } catch (e) {
                        logger.warn('Failed to send setting update to tab:', tab.id, e.message);
                        // Ignore errors for tabs where content script is not injected
                    }
                }
            });
        });
    }
});

// Keep the service worker alive
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'keep-alive') {
        // This listener itself is enough to keep the service worker alive.
        // You can add a log here for debugging if needed.
        // logger?.log('Keep-alive alarm triggered.');
    }
});

// Initialize core modules with memory optimization
async function main() {
    const debugLoggingEnabled = await getSetting('debugLoggingEnabled');
    logger = createLogger(debugLoggingEnabled);

    // Setup the keep-alive alarm with optimized timing
    chrome.alarms.create('keep-alive', {
        delayInMinutes: 0.1, // Start after 6 seconds
        periodInMinutes: 0.33 // Trigger every 20 seconds
    });

    // Handle connections from content scripts with cleanup
    chrome.runtime.onConnect.addListener(port => {
        logger.log(`Connection established from ${port.name}`);

        // Set up cleanup when port disconnects
        port.onDisconnect.addListener(() => {
            logger.log(`Port ${port.name} disconnected.`);
            // Trigger garbage collection hint if available
            if (typeof gc === 'function') {
                setTimeout(() => {
                    try {
                        gc();
                    } catch (e) {
                        // Ignore errors
                    }
                }, 1000);
            }
        });
    });

    try {
        await initializeRouter();
        logger.log("LLMLog Service Worker initialized successfully.");

        // Start memory monitoring if available
        try {
            const { getMemoryMonitor } = await import('./modules/memory-monitor.js');
            const memoryMonitor = getMemoryMonitor(debugLoggingEnabled);
            memoryMonitor.startMonitoring(120000); // Check every 2 minutes for service worker
        } catch (error) {
            logger.log('Memory monitoring not available in service worker');
        }

    } catch (e) {
        logger.error("Failed to initialize Service Worker:", e);
    }
}

// Set initial icon based on current state when the service worker starts
chrome.storage.local.get(['recordingEnabled'], (result) => {
    const isEnabled = result.recordingEnabled ?? true; // Default to true if not set
    updateIcon(isEnabled);
});

// Listen for storage changes to update icon when settings change externally
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.recordingEnabled) {
        const newValue = changes.recordingEnabled.newValue;
        updateIcon(newValue);
    }
});

main();

chrome.runtime.onInstalled.addListener(details => {
    if (details.reason === 'install' || details.reason === 'update') {
        const targetPatterns = [
            "https://chat.openai.com/*",
            "https://chatgpt.com/*",
            "https://gemini.google.com/*",
            "https://claude.ai/*",
            "https://*.tongyi.com/*",
            "https://chat.deepseek.com/*",
            "https://www.kimi.com/*",
            "https://www.doubao.com/*"
        ];

        chrome.tabs.query({ url: targetPatterns }, tabs => {
            if (tabs && tabs.length > 0) {
                tabs.forEach(tab => {
                    if (tab.id) {
                        chrome.tabs.reload(tab.id);
                    }
                });
            }
        });
    }
});
