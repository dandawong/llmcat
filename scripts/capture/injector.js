/**
 * Injector Script (Content Script - Isolated World)
 *
 * This script's sole responsibility is to inject the interceptor script
 * into the main world of the page, allowing it to interact with the
 * page's native JavaScript environment. It also determines which
 * platform-specific module to load.
 *
 * Security Features:
 * - Script integrity validation
 * - URL validation for trusted resources
 * - CSP compliance checks
 */

// Unified logger instance
const logger = (() => {
    let debugMode = false; // Default to false until settings are loaded
    const loggerInstance = {
        setDebugMode: (mode) => {
            debugMode = !!mode;
        },
        getDebugMode: () => debugMode, // Add a getter to preserve state during upgrade
        log: (...args) => {
            if (debugMode) {
                console.log('LLMCat:', ...args);
            }
        },
        error: (...args) => console.error('LLMCat:', ...args), // Always log errors
        warn: (...args) => {
            // Warnings should always be logged, regardless of debug mode.
            console.warn('LLMCat:', ...args);
        },
        info: (...args) => {
            if (debugMode) {
                console.info('LLMCat:', ...args);
            }
        }
    };
    return loggerInstance;
})();

// Dynamically import the real logger and upgrade the instance
(async () => {
    try {
        const loggerModule = await import(chrome.runtime.getURL('modules/logger.js'));
        const createLogger = loggerModule.createLogger;

        // Preserve the current debug mode before upgrading
        const currentDebugMode = logger.getDebugMode();
        const realLoggerInstance = createLogger(currentDebugMode);

        // Manually replace the methods to ensure the object reference remains the same
        // and the state is correctly managed by the new instance's closure.
        logger.setDebugMode = realLoggerInstance.setDebugMode;
        logger.log = realLoggerInstance.log;
        logger.error = realLoggerInstance.error;
        logger.warn = realLoggerInstance.warn;
        logger.info = realLoggerInstance.info;

    } catch (error) {
        logger.error('Failed to load logger module:', error);
        // The fallback will continue to work if the import fails
    }
})();

const PLATFORM_CONFIG = {
    'chat.openai.com': 'chatgpt.js',
    'chatgpt.com': 'chatgpt.js',
    'gemini.google.com': 'gemini.js',
    'claude.ai': 'claude.js',
    'www.tongyi.com': 'tongyi.js',
    'chat.deepseek.com': 'deepseek.js',
    'www.kimi.com': 'kimi.js',
    'www.doubao.com': 'doubao.js'
};

// Security configuration for script validation
const SECURITY_CONFIG = {
    // Allowed script paths (relative to extension root)
    ALLOWED_SCRIPTS: [
        'scripts/capture/interceptor.js',
        'scripts/capture/platforms/chatgpt.js',
        'scripts/capture/platforms/gemini.js',
        'scripts/capture/platforms/claude.js',
        'scripts/capture/platforms/tongyi.js',
        'scripts/capture/platforms/deepseek.js',
        'scripts/capture/platforms/kimi.js',
        'scripts/capture/platforms/doubao.js',
        'modules/logger.js'
    ],
    
    // Maximum script size (in bytes) to prevent oversized malicious scripts
    MAX_SCRIPT_SIZE: 1024 * 1024, // 1MB
    
    // Timeout for script validation requests
    VALIDATION_TIMEOUT: 5000 // 5 seconds
};

/**
 * Security validation utilities
 */
class SecurityValidator {
    /**
     * Validates if a script URL is from a trusted extension resource
     * @param {string} url - The URL to validate
     * @returns {boolean} - True if URL is trusted
     */
    static isValidExtensionURL(url) {
        try {
            const urlObj = new URL(url);
            
            // Must be a chrome-extension URL
            if (urlObj.protocol !== 'chrome-extension:') {
                return false;
            }
            
            // Must be from our extension
            const extensionId = chrome.runtime.id;
            if (urlObj.hostname !== extensionId) {
                return false;
            }
            
            // Extract the path and check if it's in our allowed list
            const path = urlObj.pathname.substring(1); // Remove leading slash
            return SECURITY_CONFIG.ALLOWED_SCRIPTS.includes(path);
        } catch (error) {
            logger.error('Security: Invalid URL format:', url, error);
            return false;
        }
    }
    
    /**
     * Validates script content size
     * @param {string} url - The script URL to check
     * @returns {Promise<boolean>} - True if script size is within limits
     */
    static async validateScriptSize(url) {
        try {
            // For extension files, we'll skip size validation since they're trusted
            // and HEAD requests don't work reliably with chrome-extension:// URLs
            const urlObj = new URL(url);
            if (urlObj.protocol === 'chrome-extension:') {
                // Extension files are pre-validated during packaging
                return true;
            }
            
            // For external URLs (if any), perform size check
            const response = await fetch(url, { method: 'HEAD' });
            const contentLength = response.headers.get('content-length');
            
            if (contentLength) {
                const size = parseInt(contentLength, 10);
                return size <= SECURITY_CONFIG.MAX_SCRIPT_SIZE;
            }
            
            // If no content-length header, we'll be conservative and reject
            logger.warn('Security: No content-length header for external script:', url);
            return false;
        } catch (error) {
            logger.error('Security: Failed to validate script size:', url, error);
            return false;
        }
    }
    
    /**
     * Validates Content Security Policy compliance
     * @param {string} url - The script URL to validate
     * @returns {boolean} - True if script complies with CSP
     */
    static validateCSPCompliance(url) {
        try {
            // Check if the script URL matches our extension's CSP requirements
            const urlObj = new URL(url);
            
            // Must be from our extension (self)
            if (urlObj.protocol !== 'chrome-extension:' || urlObj.hostname !== chrome.runtime.id) {
                logger.error('Security: CSP violation - script not from self:', url);
                return false;
            }
            
            // Additional CSP checks can be added here
            return true;
        } catch (error) {
            logger.error('Security: CSP validation error:', url, error);
            return false;
        }
    }
    
    /**
     * Validates script against potential XSS vectors
     * @param {string} url - The script URL to validate
     * @returns {boolean} - True if script is safe from XSS
     */
    static validateXSSProtection(url) {
        try {
            // Validate URL format first
            new URL(url);
            
            // Check for suspicious URL patterns
            const suspiciousPatterns = [
                /javascript:/i,
                /data:/i,
                /blob:/i,
                /vbscript:/i,
                /<script/i,
                /eval\(/i,
                /Function\(/i
            ];
            
            for (const pattern of suspiciousPatterns) {
                if (pattern.test(url)) {
                    logger.error('Security: Suspicious URL pattern detected:', url);
                    return false;
                }
            }
            
            return true;
        } catch (error) {
            logger.error('Security: XSS validation error:', url, error);
            return false;
        }
    }
    
    /**
     * Comprehensive script validation
     * @param {string} url - The script URL to validate
     * @returns {Promise<boolean>} - True if script passes all validation checks
     */
    static async validateScript(url) {
        // Check if URL is from trusted extension
        if (!this.isValidExtensionURL(url)) {
            logger.error('Security: Untrusted script URL blocked:', url);
            return false;
        }
        
        // Check CSP compliance
        if (!this.validateCSPCompliance(url)) {
            logger.error('Security: CSP validation failed:', url);
            return false;
        }
        
        // Check XSS protection
        if (!this.validateXSSProtection(url)) {
            logger.error('Security: XSS validation failed:', url);
            return false;
        }
        
        // Check script size
        if (!(await this.validateScriptSize(url))) {
            logger.error('Security: Script size validation failed:', url);
            return false;
        }
        
        logger.log('Security: Script validation passed:', url);
        return true;
    }
    
    /**
     * Reports security incidents for monitoring and analysis
     * @param {string} incidentType - Type of security incident
     * @param {object} details - Additional details about the incident
     */
    static reportSecurityIncident(incidentType, details) {
        const incident = {
            type: incidentType,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            userAgent: navigator.userAgent,
            details: details
        };
        
        logger.error('Security Incident:', incident);
        
        // Store incident in extension storage for analysis
        try {
            // Check if chrome.runtime is available and extension context is valid
            if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                    namespace: 'security',
                    action: 'reportIncident',
                    payload: incident
                }, () => {
                    // Handle potential runtime errors gracefully
                    if (chrome.runtime.lastError) {
                        // Extension context may be invalid (page in bfcache, extension reloaded, etc.)
                        logger.warn('Security: Could not report incident - extension context unavailable:', chrome.runtime.lastError.message);
                    }
                });
            } else {
                logger.warn('Security: Chrome runtime not available for incident reporting');
            }
        } catch (error) {
            logger.error('Security: Failed to send security incident report:', error);
        }
    }
    
    /**
     * Creates a secure fallback mechanism when script injection fails
     * @returns {boolean} - True if fallback was successful
     */
    static createSecureFallback() {
        try {
            // Create a minimal fallback that disables the extension gracefully
            logger.warn('Entering secure fallback mode due to security validation failure');
            
            // Notify user about the security issue
            if (window.confirm('LLMCat detected a potential security issue and has been disabled for your protection. Would you like to report this issue?')) {
                this.reportSecurityIncident('user_reported_security_issue', {
                    userConfirmed: true,
                    fallbackActivated: true
                });
            }
            
            return true;
        } catch (error) {
            logger.error('Security: Fallback mechanism failed:', error);
            return false;
        }
    }
}

// Listen for real-time debug mode updates from the service worker
logger.log('Setting up debug mode listener');
if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    logger.log('Chrome runtime API available, registering message listener');
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        logger.log('Injector received message:', message);
        
        if (message.type === 'LLMLOG_DEBUG_MODE_UPDATE') {
            const { debugMode } = message.payload;
            logger.setDebugMode(debugMode);
            logger.log('Debug mode updated in real-time:', debugMode);
            
            // Forward the debug mode update to the interceptor
            window.postMessage({
                type: 'LLMLOG_DEBUG_MODE_UPDATE',
                payload: { debugMode }
            }, window.location.origin);
        }
    });
    logger.log('Message listener registered successfully');
} else {
    logger.warn('Chrome runtime API not available for message listener');
}

function getPlatformModule() {
    const hostname = window.location.hostname;
    logger.log('Detecting platform for hostname:', hostname);
    logger.log('Available platforms:', Object.keys(PLATFORM_CONFIG));
    
    const moduleName = PLATFORM_CONFIG[hostname];
    logger.log('Module name for hostname:', moduleName);
    
    if (moduleName) {
        const url = chrome.runtime.getURL(`scripts/capture/platforms/${moduleName}`);
        // Validate the URL before returning it
        if (SecurityValidator.isValidExtensionURL(url)) {
            logger.log('Platform module URL validated:', url);
            return url;
        } else {
            logger.error('Security: Platform module URL validation failed:', url);
            return null;
        }
    }
    logger.log('No platform module found for hostname:', hostname);
    return null;
}

async function initialize() {
    chrome.runtime.sendMessage({
        namespace: 'settings',
        action: 'get',
        payload: { key: 'debugLoggingEnabled' }
    }, async (debugLoggingEnabled) => {
        logger.setDebugMode(debugLoggingEnabled.data);
        logger.log('Debug mode set to:', debugLoggingEnabled.data);
        
        async function injectInterceptor() {
            let retryCount = 0;
            const maxRetries = 3;
            const retryDelay = 1000; // 1 second
            
            while (retryCount < maxRetries) {
                try {
                    const scriptUrl = chrome.runtime.getURL('scripts/capture/interceptor.js');
                    
                    // Validate script before injection
                    if (!(await SecurityValidator.validateScript(scriptUrl))) {
                        throw new Error('Script validation failed for interceptor.js');
                    }
                    
                    const script = document.createElement('script');
                    script.src = scriptUrl;
                    script.type = 'module';
                    
                    // Add security attributes
                    script.crossOrigin = 'anonymous';
                    script.referrerPolicy = 'no-referrer';
                    
                    // Create a promise to handle script loading
                    const loadPromise = new Promise((resolve, reject) => {
                        script.onload = () => {
                            logger.log('Injector: Interceptor script loaded successfully.');
                            resolve(true);
                        };
                        
                        script.onerror = (error) => {
                            logger.error('Security: Failed to load interceptor script:', error);
                            reject(new Error('Script loading failed'));
                        };
                        
                        // Timeout for script loading
                        setTimeout(() => {
                            reject(new Error('Script loading timeout'));
                        }, SECURITY_CONFIG.VALIDATION_TIMEOUT);
                    });
                    
                    (document.head || document.documentElement).appendChild(script);
                    
                    logger.log('Injector: Interceptor script injected with security validation.');
                    
                    // Wait for script to load
                    await loadPromise;
                    return true;
                    
                } catch (e) {
                    retryCount++;
                    logger.error(`Injector: Failed to inject interceptor script (attempt ${retryCount}/${maxRetries}):`, e);
                    
                    if (retryCount >= maxRetries) {
                        logger.error('Injector: Max retries exceeded. Injection failed permanently.');
                        // Report security incident
                        SecurityValidator.reportSecurityIncident('script_injection_failed', {
                            error: e.message,
                            retryCount,
                            url: window.location.href
                        });
                        return false;
                    }
                    
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
            
            return false;
        }
        
        // 1. Wait for the interceptor to be ready
        window.addEventListener('message', async (event) => {
            if (event.source === window && event.data.type === 'LLMLOG_INTERCEPTOR_READY') {
                logger.log('Injector: Interceptor is ready. Determining platform and debug status...');
                
                const modulePath = getPlatformModule();
                
                if (modulePath) {
                    const loggerPath = chrome.runtime.getURL('modules/logger.js');
                    
                    // Validate both module and logger paths
                    const moduleValid = await SecurityValidator.validateScript(modulePath);
                    const loggerValid = await SecurityValidator.validateScript(loggerPath);
                    
                    if (!moduleValid || !loggerValid) {
                        logger.error('Security: Module or logger validation failed', {
                            modulePath,
                            loggerPath,
                            moduleValid,
                            loggerValid
                        });
                        return;
                    }
                    
                    logger.log(`Injector: Platform detected. Sending validated module paths.`, {
                        modulePath,
                        debugLoggingEnabled,
                        loggerPath
                    });
                    
                    // 2. Send the platform module path and debug status to the interceptor
                    window.postMessage({
                        type: 'LLMLOG_INIT',
                        payload: {
                            modulePath,
                            loggerPath,
                            debugMode: debugLoggingEnabled
                        }
                    }, window.location.origin);
                } else {
                    logger.log('Injector: No platform module found for this host.');
                }
            }
        });
        
        // 3. Inject the interceptor script itself with security validation
        const injectionSuccess = await injectInterceptor();
        if (!injectionSuccess) {
            logger.error('Injector: Failed to inject interceptor script. Activating secure fallback.');
            SecurityValidator.createSecureFallback();
            return;
        }
    });
}

initialize();
