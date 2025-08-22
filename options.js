// This script will handle the logic for the options page.
// For example, loading and saving settings.
// And displaying statistics.

import { createLogger } from './modules/logger.js';

// Initialize logger with default debug mode disabled
const logger = createLogger(false); // LLMCat logger

// Listen for changes to debug logging setting
chrome.storage.local.get({ debugLoggingEnabled: false }, (items) => {
  logger.setDebugMode(items.debugLoggingEnabled);
});

document.addEventListener('DOMContentLoaded', () => {
  const recordingEnabled = document.getElementById('recording-enabled');
  const debugLoggingEnabled = document.getElementById('debug-logging-enabled');

  // Initialize recording icon
  initializeRecordingIcon();

  // Load saved settings
  chrome.storage.local.get({ recordingEnabled: true }, (items) => {
    recordingEnabled.checked = items.recordingEnabled;
    updateRecordingIcon(items.recordingEnabled);
  });

  chrome.storage.local.get({ debugLoggingEnabled: false }, (items) => {
    debugLoggingEnabled.checked = items.debugLoggingEnabled;
  });

  // Save settings on change
  recordingEnabled.addEventListener('change', () => {
    const enabled = recordingEnabled.checked;
    chrome.storage.local.set({ recordingEnabled: enabled }, () => {
      // Notify the service worker of the change
      chrome.runtime.sendMessage({
        namespace: 'settings',
        action: 'update',
        payload: { key: 'recordingEnabled', value: enabled }
      });
      
      // Update the icon when the setting changes
      updateRecordingIcon(enabled);
    });
  });

  debugLoggingEnabled.addEventListener('change', () => {
    const enabled = debugLoggingEnabled.checked;
    chrome.storage.local.set({ debugLoggingEnabled: enabled }, () => {
      // Notify the service worker of the change
      chrome.runtime.sendMessage({
        namespace: 'settings',
        action: 'update',
        payload: { key: 'debugLoggingEnabled', value: enabled }
      });
    });
  });

  document.getElementById('export-json').addEventListener('click', () => exportData('json'));
  document.getElementById('export-markdown').addEventListener('click', () => exportData('markdown'));

  loadStatistics();
});

// Initialize recording icon based on current state
function initializeRecordingIcon() {
  // Get initial recording state
  chrome.storage.local.get(['recordingEnabled'], (result) => {
    const isRecording = result.recordingEnabled !== false; // Default to true if not set
    updateRecordingIcon(isRecording);
  });

  // Listen for recording state updates
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'LLMLOG_RECORDING_ENABLED_UPDATE') {
      updateRecordingIcon(message.payload.recordingEnabled);
    }
  });
}

// Update recording icon based on state
function updateRecordingIcon(isRecording) {
  const recordingIcon = document.getElementById('recording-icon');
  if (recordingIcon) {
    recordingIcon.src = isRecording 
      ? 'icons/icon-recording-on.png' 
      : 'icons/icon-recording-off.png';
    recordingIcon.alt = isRecording 
      ? 'Recording is enabled' 
      : 'Recording is disabled';
  }
}

function exportData(format) {
  // For export, we still need all conversations, so we'll use the old method
  // but we could optimize this in the future by implementing a streaming export
  chrome.runtime.sendMessage({ namespace: 'database', action: 'getAllConversations' }, (response) => {
    if (response.status === 'success') {
      const data = response.data;
      let content = '';
      let mimeType = '';
      let fileExtension = '';

      if (format === 'json') {
        content = JSON.stringify(data, null, 2);
        mimeType = 'application/json';
        fileExtension = 'json';
      } else if (format === 'markdown') {
        content = convertToMarkdown(data);
        mimeType = 'text/markdown';
        fileExtension = 'md';
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `llmcat_export_${new Date().toISOString().split('T')[0]}.${fileExtension}`;
      a.click();
      URL.revokeObjectURL(url);

    } else {
      logger.error("Error exporting data:", response.message);
    }
  });
}

function convertToMarkdown(data) {
  let markdown = '# LLMCat Export\n\n';
  data.forEach(conv => {
    markdown += `## ${conv.title} (${conv.platform})\n\n`;
    markdown += `**URL:** ${conv.url}\n\n`;
    markdown += `**Date:** ${new Date(conv.createdAt).toLocaleString()}\n\n`;
    markdown += `### Prompt\n\n${conv.prompt}\n\n`;
    markdown += `### Response\n\n${conv.response}\n\n`;
    markdown += '---\n\n';
  });
  return markdown;
}

function loadStatistics() {
  // Load statistics using pagination to avoid loading all conversations at once
  loadStatisticsPaginated();
}

async function loadStatisticsPaginated() {
  const container = document.getElementById('statistics-container');
  container.innerHTML = '<p>Loading statistics...</p>';

  try {
    // Get total count first
    const countResponse = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        namespace: 'database',
        action: 'getTotalConversationCount'
      }, resolve);
    });

    if (countResponse.status !== 'success') {
      throw new Error(countResponse.message);
    }

    const totalConversations = countResponse.data.totalCount;

    if (totalConversations === 0) {
      container.innerHTML = '<p>No conversations recorded yet.</p>';
      return;
    }

    // Calculate statistics by processing conversations in batches
    const batchSize = 100;
    let totalPromptWords = 0;
    let totalResponseWords = 0;
    const platformCount = {};
    let processedCount = 0;

    for (let page = 1; processedCount < totalConversations; page++) {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          namespace: 'database',
          action: 'getConversations',
          payload: { page, limit: batchSize }
        }, resolve);
      });

      if (response.status !== 'success') {
        throw new Error(response.message);
      }

      const conversations = response.data;

      conversations.forEach(conv => {
        // Count words in prompt and response
        totalPromptWords += conv.prompt.split(/\s+/).filter(word => word.length > 0).length;
        totalResponseWords += conv.response.split(/\s+/).filter(word => word.length > 0).length;

        // Count platforms
        if (!platformCount[conv.platform]) {
          platformCount[conv.platform] = 0;
        }
        platformCount[conv.platform]++;
      });

      processedCount += conversations.length;

      // Update progress
      container.innerHTML = `<p>Loading statistics... (${processedCount}/${totalConversations})</p>`;

      // If we got fewer conversations than requested, we've reached the end
      if (conversations.length < batchSize) {
        break;
      }
    }

    // Display the calculated statistics
    displayCalculatedStatistics({
      totalConversations,
      totalPromptWords,
      totalResponseWords,
      platformCount
    });

  } catch (error) {
    logger.error("Error loading statistics:", error);
    container.innerHTML = '<p>Error loading statistics.</p>';
  }
}

function displayCalculatedStatistics({ totalConversations, totalPromptWords, totalResponseWords, platformCount }) {
  const container = document.getElementById('statistics-container');

  const totalPrompts = totalConversations; // Each conversation has one prompt
  const avgPromptLength = totalPrompts > 0 ? (totalPromptWords / totalPrompts).toFixed(2) : 0;
  const avgResponseLength = totalConversations > 0 ? (totalResponseWords / totalConversations).toFixed(2) : 0;

  // Get most used platform
  let mostUsedPlatform = '';
  let maxCount = 0;
  for (const [platform, count] of Object.entries(platformCount)) {
    if (count > maxCount) {
      maxCount = count;
      mostUsedPlatform = platform;
    }
  }

  // Generate HTML for statistics
  let statsHTML = `
    <ul>
      <li><strong>Total Conversations:</strong> ${totalConversations}</li>
      <li><strong>Total Prompts:</strong> ${totalPrompts}</li>
      <li><strong>Total Prompt Words:</strong> ${totalPromptWords}</li>
      <li><strong>Total Response Words:</strong> ${totalResponseWords}</li>
      <li><strong>Average Prompt Length (words):</strong> ${avgPromptLength}</li>
      <li><strong>Average Response Length (words):</strong> ${avgResponseLength}</li>
      <li><strong>Most Used Platform:</strong> ${mostUsedPlatform} (${maxCount} conversations)</li>
    </ul>
  `;

  // Add platform breakdown
  statsHTML += `<h3>Platform Breakdown</h3><ul>`;
  for (const [platform, count] of Object.entries(platformCount)) {
    statsHTML += `<li>${platform}: ${count} conversations</li>`;
  }
  statsHTML += `</ul>`;

  container.innerHTML = statsHTML;
}