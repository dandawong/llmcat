/**
 * Capture Module
 * 
 * This module is responsible for managing platform-specific capture configurations.
 */

/**
 * Capture Module
 * 
 * This module is responsible for providing the paths to platform-specific
 * modules, so they can be dynamically imported by the content script.
 */

const platformModulePaths = {
    chatgpt: 'scripts/capture/platforms/chatgpt.js',
    gemini: 'scripts/capture/platforms/gemini.js',
    claude: 'scripts/capture/platforms/claude.js',
    tongyi: 'scripts/capture/platforms/tongyi.js',
    deepseek: 'scripts/capture/platforms/deepseek.js',
    doubao: 'scripts/capture/platforms/doubao.js',
};

export function getPlatformConfig({ platform }) {
    const path = platformModulePaths[platform] || null;
    if (path) {
        // The service worker can't resolve chrome.runtime.getURL,
        // so we return the relative path and let the content script handle it.
        return { modulePath: path };
    }
    return null;
}
