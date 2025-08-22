// modules/settings.js

const defaultSettings = {
  debugLoggingEnabled: false,
  recordingEnabled: true,
};

/**
 * Retrieves a setting value.
 * @param {string} key - The key of the setting to retrieve.
 * @returns {Promise<any>} A promise that resolves with the setting value.
 */
export async function getSetting(key) {
  return new Promise((resolve) => {
    // Check if chrome.storage.local is available (it won't be in test environment)
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] ?? defaultSettings[key]);
      });
    } else {
      // Fallback for test environment or when chrome.storage is not available
      resolve(defaultSettings[key]);
    }
  });
}

/**
 * Sets a setting value.
 * @param {string} key - The key of the setting to set.
 * @param {any} value - The value to set.
 * @returns {Promise<void>} A promise that resolves when the setting has been saved.
 */
export async function setSetting(key, value) {
  return new Promise((resolve) => {
    // Check if chrome.storage.local is available (it won't be in test environment)
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [key]: value }, () => {
        resolve();
      });
    } else {
      // Fallback for test environment or when chrome.storage is not available
      resolve();
    }
  });
}

