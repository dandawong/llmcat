import { createLogger } from './logger.js';

// Create logger instance with default debug mode disabled
const logger = createLogger(false);

const LOG_STORAGE_KEY = 'llmcat_debug_logs';
const MAX_LOG_ENTRIES = 500;

export async function addLog(logEntry) {
    try {
        const { [LOG_STORAGE_KEY]: logs = [] } = await chrome.storage.session.get(LOG_STORAGE_KEY);
        logs.push(logEntry);

        // Trim logs if they exceed the max count
        if (logs.length > MAX_LOG_ENTRIES) {
            logs.splice(0, logs.length - MAX_LOG_ENTRIES);
        }

        await chrome.storage.session.set({ [LOG_STORAGE_KEY]: logs });
        return { status: 'success' };
    } catch (error) {
        logger.error("Error adding log:", error);
        return { status: 'error', error: error.message };
    }
}

export async function getLogs() {
    try {
        const { [LOG_STORAGE_KEY]: logs = [] } = await chrome.storage.session.get(LOG_STORAGE_KEY);
        return { status: 'success', data: [...logs].reverse() }; // Show newest first, avoid mutating original
    } catch (error) {
        logger.error("Error getting logs:", error);
        return { status: 'error', error: error.message };
    }
}

export async function clearLogs() {
    try {
        await chrome.storage.session.remove(LOG_STORAGE_KEY);
        return { status: 'success' };
    } catch (error) {
        logger.error("Error clearing logs:", error);
        return { status: 'error', error: error.message };
    }
}