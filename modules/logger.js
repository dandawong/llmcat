/**
 * Centralized Logger Module
 *
 * Provides a conditional logger that can be enabled or disabled for debugging.
 */

// This is a factory function because the logger needs to be instantiated
// differently in different script contexts (some don't have access to chrome.* APIs).
export function createLogger(initialDebugMode) {
    let debugMode = initialDebugMode;

    // Auto-update debug mode when settings change
    if (chrome && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && 'debugLoggingEnabled' in changes) {
                const newValue = !!changes.debugLoggingEnabled.newValue;
                if (debugMode !== newValue) {
                    if (newValue) {
                        console.log(`LLMCat: Logger debug mode auto-updated to: ${newValue}`);
                    }
                    debugMode = newValue;
                }
            }
        });
    }
    
    const loggerInstance = {
        setDebugMode(mode) {
            debugMode = !!mode;
        },
        log: (...args) => {
            if (debugMode) {
                console.log('LLMCat:', ...args);
            }
        },
        error: (...args) => {
            // Errors should always be logged, regardless of debug mode.
            console.error('LLMCat:', ...args);
        },
        warn: (...args) => {
            if (debugMode) {
                console.warn('LLMCat:', ...args);
            }
        },
        info: (...args) => {
            if (debugMode) {
                console.info('LLMCat:', ...args);
            }
        }
    };

    return loggerInstance;
}
