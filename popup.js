// ===================================================================================
// new_popup.js - Modernized Popup Logic
// ===================================================================================
// This script is a modernized version of popup.js, adapted to work with the
// Tailwind CSS-based new_popup.html.
//
// Key Changes:
// 1.  UI Templates: All hardcoded HTML strings (like conversation items, toasts,
//     and dialogs) have been rewritten with Tailwind CSS classes.
// 2.  Click Outside to Close: Added a feature to the detail view where clicking
//     the background overlay returns the user to the list view.
// 3.  Code Comments: Added detailed comments explaining the modifications.
// ===================================================================================

// Import logger module
import { createLogger } from './modules/logger.js';

// Create logger instance with debug mode disabled by default
const logger = createLogger(false); // LLMCat logger

// Listen for changes to debug logging setting
chrome.storage.local.get({ debugLoggingEnabled: false }, (items) => {
  logger.setDebugMode(items.debugLoggingEnabled);
});

// Initialize recording icon based on current state
function initializeRecordingIcon() {
  const recordingIcon = document.getElementById('recording-icon');
  
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

// Memory-optimized conversation management
const MAX_CACHED_CONVERSATIONS = 200; // Limit cache size to prevent memory issues
let allConversations = []; // Cache conversations with size limit
let currentView = 'list'; // 'list' or 'detail'
let currentPage = 1;
let currentSearch = '';
let isLoading = false;
let hasMorePages = true;
const PAGE_SIZE = 20;

// Scroll position management
let savedScrollTop = 0; // Save scroll position when navigating to detail view

// Event listener cleanup tracking
const eventListenerCleanup = new Set();

// Performance Integration - Try to load advanced modules, fallback to simple implementation
let performanceIntegration = null;
let useAdvancedPerformance = false;

// Try to load advanced performance modules
try {
  import('./modules/performance-integration.js').then(module => {
    performanceIntegration = module.performanceIntegration;
    useAdvancedPerformance = true;

    // Initialize performance integration
    performanceIntegration.initialize(document.getElementById('app'), {
      enableProgressiveSearch: true,
      enableSearchCache: true,
      enableAsyncDOM: true,
      enablePerformanceMonitoring: true,
      debugMode: false
    }).then(() => {
      logger.info('🚀 Advanced performance integration loaded');
    }).catch(error => {
      logger.warn('Failed to initialize advanced performance:', error);
      useAdvancedPerformance = false;
    });
  }).catch(error => {
    logger.warn('Advanced performance modules not available, using fallback:', error);
    useAdvancedPerformance = false;
  });
} catch (error) {
  logger.warn('Performance integration not available:', error);
  useAdvancedPerformance = false;
}

// Simple Performance Integration (Fallback)
const simplePerformance = {
  searchCache: new Map(),
  searchDebounceTimer: null,

  // Debounced search to avoid excessive API calls
  debouncedSearch(searchTerm, callback, delay = 300) {
    clearTimeout(this.searchDebounceTimer);
    this.searchDebounceTimer = setTimeout(() => {
      callback(searchTerm);
    }, delay);
  },

  // Simple search cache
  getCachedSearch(searchTerm) {
    const cached = this.searchCache.get(searchTerm);
    if (cached && Date.now() - cached.timestamp < 60000) { // 1 minute cache
      return cached.results;
    }
    return null;
  },

  setCachedSearch(searchTerm, results) {
    // Keep cache size reasonable
    if (this.searchCache.size > 50) {
      const firstKey = this.searchCache.keys().next().value;
      this.searchCache.delete(firstKey);
    }
    this.searchCache.set(searchTerm, {
      results: results,
      timestamp: Date.now()
    });
  },

  // Clear cache when needed
  clearCache() {
    this.searchCache.clear();
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  // Setup simple performance integration
  setupPerformanceEventListeners();
  logger.info('✅ Simple performance integration initialized');

  // Initialize memory monitoring (legacy support)
  try {
    const { getMemoryMonitor } = await import('./modules/memory-monitor.js');
    const memoryMonitor = getMemoryMonitor(false);
    memoryMonitor.startMonitoring(60000); // Check every minute

    // Listen for emergency cleanup events
    window.addEventListener('llmlog-emergency-cleanup', () => {
      logger.warn('Emergency memory cleanup triggered');
      cleanupMemory();
    });
  } catch (error) {
    logger.warn('Memory monitoring not available:', error);
  }

  // Initialize recording icon state
  initializeRecordingIcon();

  loadConversations();

  // Configure marked to use highlight.js for syntax highlighting.
  marked.setOptions({
    gfm: true,
    breaks: true
  });

  const searchInput = document.getElementById('search-input');

  // Enhanced search with simple performance integration
  const optimizedSearch = DOMOptimizer.debounce(async (searchTerm) => {
    try {
      // Dispatch search started event for monitoring
      window.dispatchEvent(new CustomEvent('llmlog-search-started', {
        detail: { searchTerm, timestamp: Date.now() }
      }));

      // Use simple performance-optimized search
      DOMOptimizer.measurePerformance('Search Operation', () => {
        handleSearch(searchTerm);
      });
    } catch (error) {
      logger.error('Search failed:', error);
      hideSearchLoadingIndicator();
    }
  }, 300);

  searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.trim();

    // Show search loading indicator immediately for non-empty searches
    if (searchTerm.length > 0) {
      showSearchLoadingIndicator();
    } else {
      hideSearchLoadingIndicator();
    }

    // Use optimized debounced search
    optimizedSearch(searchTerm.toLowerCase());
  });

  document.getElementById('back-button').addEventListener('click', () => {
    showListView();
  });
});

/**
 * Setup performance-related event listeners
 */
function setupPerformanceEventListeners() {
  // Listen for conversation selection from performance integration
  window.addEventListener('llmlog-conversation-selected', (e) => {
    const conversation = e.detail.conversation;
    showDetailView(conversation);
  });

  // Listen for conversation deletion from performance integration
  window.addEventListener('llmlog-conversation-delete', (e) => {
    const conversationId = e.detail.id;
    deleteConversation(conversationId);
  });

  // Dispatch search events for performance monitoring
  window.addEventListener('llmlog-search-started', (e) => {
    logger.info('🔍 Search started:', e.detail);
  });

  window.addEventListener('llmlog-search-completed', (e) => {
    logger.info('✅ Search completed:', e.detail);
    hideSearchLoadingIndicator();

    // Update search status if available
    updateSearchStatus(e.detail.resultCount, {
      searchTime: e.detail.duration,
      fromCache: e.detail.fromCache
    });
  });
}

/**
 * Update search status display
 * @param {number} resultCount - Number of results
 * @param {Object} metadata - Search metadata
 */
function updateSearchStatus(resultCount, metadata = {}) {
  // Create or update search status element
  let statusElement = document.getElementById('search-status');
  if (!statusElement) {
    statusElement = document.createElement('div');
    statusElement.id = 'search-status';
    statusElement.className = 'text-xs text-slate-500 px-4 py-2 border-b border-slate-200';

    const header = document.querySelector('#list-view header');
    if (header) {
      header.appendChild(statusElement);
    }
  }

  let statusText = `${resultCount} result${resultCount !== 1 ? 's' : ''}`;

  if (metadata.searchTime) {
    statusText += ` (${metadata.searchTime.toFixed(0)}ms)`;
  }

  if (metadata.fromCache) {
    statusText += ' (cached)';
  }

  statusElement.textContent = statusText;
  statusElement.style.display = resultCount > 0 || currentSearch ? 'block' : 'none';
}

function loadConversations(reset = true) {
  if (isLoading) return;

  if (reset) {
    currentPage = 1;
    allConversations = [];
    hasMorePages = true;
  }

  if (!hasMorePages) return;

  isLoading = true;
  showLoadingIndicator();

  const payload = {
    page: currentPage,
    limit: PAGE_SIZE,
    search: currentSearch
  };

  chrome.runtime.sendMessage({ namespace: 'database', action: 'getConversations', payload }, (response) => {
    isLoading = false;
    hideLoadingIndicator();

    if (chrome.runtime.lastError) {
      UIFeedback.showErrorMessage(chrome.runtime.lastError.message, 'Failed to load conversations');
      return;
    }

    if (response && response.status === 'success') {
      const newConversations = response.data;
      const pagination = response.pagination;

      if (reset) {
        allConversations = newConversations;
      } else {
        allConversations = [...allConversations, ...newConversations];
      }

      // Memory optimization: Limit cache size to prevent memory issues
      if (allConversations.length > MAX_CACHED_CONVERSATIONS) {
        // Keep only the most recent conversations
        allConversations = allConversations.slice(-MAX_CACHED_CONVERSATIONS);
        logger.info(`Cache trimmed to ${MAX_CACHED_CONVERSATIONS} conversations for memory optimization`);
      }

      hasMorePages = pagination.hasMore;
      currentPage = pagination.page + 1;

      renderConversations(allConversations, !reset);
      updateLoadMoreButton();

      // Cache search results for performance
      if (reset && currentSearch) {
        simplePerformance.setCachedSearch(currentSearch, allConversations);
      }

      // Dispatch search completed event
      window.dispatchEvent(new CustomEvent('llmlog-search-completed', {
        detail: {
          searchTerm: currentSearch,
          resultCount: allConversations.length,
          duration: Date.now() - (window.searchStartTime || Date.now()),
          fromCache: false
        }
      }));

      if (reset && allConversations.length > 0) {
        // UIFeedback.showInfoMessage(`Loaded ${allConversations.length} conversations`);
      } else if (!reset && newConversations.length > 0) {
        // UIFeedback.showInfoMessage(`Loaded ${newConversations.length} more conversations`);
      }
    } else {
      const errorMessage = response ? response.message : "No response received";
      UIFeedback.showErrorMessage(errorMessage, 'Failed to load conversations');
    }
  });
}

async function handleSearch(searchTerm) {
  currentSearch = searchTerm;
  window.searchStartTime = Date.now(); // Track search start time
  hideSearchLoadingIndicator(); // Hide search loading indicator

  // When the search term is cleared, reset to the initial view.
  if (!searchTerm) {
    simplePerformance.clearCache(); // Clear any previous search caches
    loadConversations(true);
    return;
  }

  if (searchTerm.trim()) {
    logger.info(`🔍 Searching for "${searchTerm}"...`);
  }

  // Use advanced performance integration if available
  if (useAdvancedPerformance && performanceIntegration) {
    try {
      // Use progressive search with advanced performance features
      const onProgress = (results, isComplete, metadata = {}) => {
        renderConversations(results, false); // Don't append, replace

        if (isComplete) {
          allConversations = results; // Update the cache with search results
          hideSearchLoadingIndicator();

          // Dispatch search completed event
          window.dispatchEvent(new CustomEvent('llmlog-search-completed', {
            detail: {
              searchTerm: searchTerm,
              resultCount: results.length,
              duration: Date.now() - (window.searchStartTime || Date.now()),
              fromCache: metadata.fromCache || false
            }
          }));
        }
      };

      // Get all conversations for search
      const allConversationsResponse = await chrome.runtime.sendMessage({
        namespace: 'database',
        action: 'getAllConversationsForSearch'
      });

      if (allConversationsResponse.status === 'success') {
        await performanceIntegration.performOptimizedSearch(
          searchTerm,
          allConversationsResponse.data,
          onProgress
        );
      } else {
        throw new Error('Failed to get conversations for search');
      }

      return;
    } catch (error) {
      logger.warn('Advanced search failed, falling back to simple search:', error);
      useAdvancedPerformance = false;
    }
  }

  // Fallback to simple performance integration
  simplePerformance.debouncedSearch(searchTerm, (debouncedTerm) => {
    // Check cache first
    const cachedResults = simplePerformance.getCachedSearch(debouncedTerm);
    if (cachedResults) {
      logger.info('🎯 Using cached search results');
      renderConversations(cachedResults);

      // Dispatch search completed event for cached results
      window.dispatchEvent(new CustomEvent('llmlog-search-completed', {
        detail: {
          searchTerm: debouncedTerm,
          resultCount: cachedResults.length,
          duration: 0,
          fromCache: true
        }
      }));
      return;
    }

    // Perform new search
    loadConversations(true); // Reset and load with new search
  });
}

function loadMoreConversations() {
  loadConversations(false); // Don't reset, append to existing
}

// Virtual Scrolling Implementation (largely unchanged, as it handles data, not presentation)
class VirtualScrollList {
  constructor(container, itemHeight = 120, bufferSize = 5) { // Adjusted item height for new design
    this.container = container;
    this.itemHeight = itemHeight;
    this.bufferSize = bufferSize;
    this.items = [];
    this.visibleStart = 0;
    this.visibleEnd = 0;
    this.scrollTop = 0;
    this.containerHeight = 0;
    this.totalHeight = 0;

    this.viewport = null;
    this.spacerTop = null;
    this.spacerBottom = null;

    this.init();
  }

  init() {
    this.container.innerHTML = '';
    this.viewport = document.createElement('div');
    this.viewport.className = 'virtual-scroll-viewport h-full overflow-y-auto custom-scrollbar';

    this.spacerTop = document.createElement('div');
    this.spacerTop.className = 'virtual-scroll-spacer-top';

    this.content = document.createElement('div');
    this.content.className = 'virtual-scroll-content';

    this.spacerBottom = document.createElement('div');
    this.spacerBottom.className = 'virtual-scroll-spacer-bottom';

    this.viewport.appendChild(this.spacerTop);
    this.viewport.appendChild(this.content);
    this.viewport.appendChild(this.spacerBottom);
    this.container.appendChild(this.viewport);

    // Make sure the container takes full height
    this.container.style.height = '100%';
    this.container.style.display = 'block';
    
    // Store bound handlers for proper cleanup
    this.scrollHandler = this.handleScroll.bind(this);
    this.resizeHandler = this.updateContainerHeight.bind(this);

    this.viewport.addEventListener('scroll', this.scrollHandler);

    // Use a longer delay to ensure the element is fully rendered
    setTimeout(() => {
      this.updateContainerHeight();
      logger.info(`Initial container height: ${this.containerHeight}`);
      if (this.viewport) {
        logger.info(`Initial viewport dimensions: scrollHeight=${this.viewport.scrollHeight}, clientHeight=${this.viewport.clientHeight}`);
        // If we have a saved scroll position, restore it after initialization
        if (savedScrollTop > 0) {
          this.viewport.scrollTop = savedScrollTop;
          this.scrollTop = savedScrollTop;
          logger.info(`Restored scroll position after initialization: ${savedScrollTop}`);
        }
      }
    }, 100);
    
    window.addEventListener('resize', this.resizeHandler);
  }

  updateContainerHeight() {
    if (this.viewport) {
      this.containerHeight = this.viewport.clientHeight;
    }
  }

  setItems(items) {
    this.items = items;
    this.totalHeight = items.length * this.itemHeight;
    this.updateContainerHeight();
    this.updateVisibleRange();
    this.render();
  }

  handleScroll() {
    if (this.viewport) {
      this.scrollTop = this.viewport.scrollTop;
      this.updateVisibleRange();
      this.render();
    }
  }

  forceUpdate() {
    if (this.viewport) {
      // Don't override the current scrollTop when forcing an update
      // this.scrollTop = this.viewport.scrollTop;
      this.updateContainerHeight();
      this.updateVisibleRange();
      this.render();
    }
  }

  updateVisibleRange() {
    if (this.items.length === 0) {
      this.visibleStart = 0;
      this.visibleEnd = 0;
      return;
    }
    this.updateContainerHeight();
    const visibleItemCount = Math.ceil(this.containerHeight / this.itemHeight);
    this.visibleStart = Math.max(0, Math.floor(this.scrollTop / this.itemHeight) - this.bufferSize);
    this.visibleEnd = Math.min(this.items.length, this.visibleStart + visibleItemCount + (this.bufferSize * 2));
  }

  render() {
    DOMOptimizer.batchDOMUpdates(() => {
      const topHeight = this.visibleStart * this.itemHeight;
      const bottomHeight = Math.max(0, (this.items.length - this.visibleEnd) * this.itemHeight);
      
      this.spacerTop.style.height = `${topHeight}px`;
      this.spacerBottom.style.height = `${bottomHeight}px`;

      const fragment = DOMOptimizer.createDocumentFragment();
      for (let i = this.visibleStart; i < this.visibleEnd; i++) {
        const item = this.items[i];
        if (item) {
          const element = this.createItemElement(item, i);
          fragment.appendChild(element);
        }
      }
      this.content.innerHTML = '';
      this.content.appendChild(fragment);
    });
  }

  createItemElement(conversation, index) {
    const dateString = new Date(conversation.createdAt).toLocaleString();
    // Platform-specific color mapping
    const platformColors = {
      chatgpt: 'bg-green-500',
      gemini: 'bg-blue-500',
      claude: 'bg-orange-500',
      kimi: 'bg-indigo-500',
      deepseek: 'bg-purple-500',
      doubao: 'bg-pink-500',
      tongyi: 'bg-cyan-500',
      default: 'bg-slate-500'
    };
    const platformUrls = {
        chatgpt: 'https://chat.openai.com/',
        gemini: 'https://gemini.google.com/',
        claude: 'https://claude.ai/',
        kimi: 'https://www.kimi.com/',
        deepseek: 'https://chat.deepseek.com/',
        doubao: 'https://www.doubao.com/',
        tongyi: 'https://tongyi.aliyun.com/',
        default: '#'
    };
    const platformKey = conversation.platform.toLowerCase();
    const platformColor = platformColors[platformKey] || platformColors.default;
    const platformUrl = platformUrls[platformKey] || platformUrls.default;

    const templateData = {
      id: conversation.id,
      index: index,
      platform: conversation.platform,
      platformColor: platformColor,
      platformUrl: platformUrl,
      title: escapeHTML(conversation.title),
      date: dateString,
      preview: escapeHTML(conversation.prompt.substring(0, 120)) + '...', // Increased preview length
      ariaLabel: `Conversation: ${conversation.title} from ${conversation.platform}, ${dateString}`
    };

    const item = DOMOptimizer.createElementFromTemplate(CONVERSATION_ITEM_TEMPLATE, templateData);
    
    if (!item) return document.createElement('div'); // Should not happen

    item.style.height = `${this.itemHeight}px`;
    item.style.minHeight = `${this.itemHeight}px`;

    const handleActivation = () => showDetailView(conversation);

    item.addEventListener('click', handleActivation);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleActivation();
      }
    });

    const platformLink = item.querySelector('.platform-link');
    if (platformLink) {
        platformLink.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(platformLink.href, '_blank');
        });
    }

    const optionButton = item.querySelector('.option-button');
    if (optionButton) {
      optionButton.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteConversation(conversation.id);
      });
    }

    const exportButton = item.querySelector('.export-button');
    if (exportButton) {
      exportButton.addEventListener('click', (e) => {
        e.stopPropagation();
        exportConversationAsMarkdown(conversation);
      });
    }

    return item;
  }

  scrollToTop() {
    this.viewport.scrollTop = 0;
  }

  destroy() {
    if (this.viewport && this.scrollHandler) {
      this.viewport.removeEventListener('scroll', this.scrollHandler);
    }
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
    }

    // Clean up DOM references to prevent memory leaks
    this.viewport = null;
    this.spacerTop = null;
    this.spacerBottom = null;
    this.content = null;
    this.items = [];
  }
}

let virtualScrollList = null;

function renderConversations(conversations, append = false) {
  DOMOptimizer.measurePerformance('Render Conversations', () => {
    const listElement = document.getElementById('conversation-list');

    if (!conversations || conversations.length === 0) {
      if (!append) {
        if (virtualScrollList) {
          virtualScrollList.destroy();
          virtualScrollList = null;
        }
        // ** MODIFICATION: Updated empty state with Tailwind classes **
        listElement.innerHTML = `
          <div class="empty-state text-center py-10 px-4 flex flex-col items-center justify-center h-full">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-slate-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
            <p class="empty-message text-slate-500" role="status" aria-live="polite">No conversations recorded yet.</p>
            <p class="text-xs text-slate-400 mt-2">Start a conversation on a supported platform to see it here.</p>
          </div>`;
      }
      return;
    }

    // Remove overflow class from parent container to prevent double scrolling
    listElement.classList.remove('overflow-y-auto');
    
    if (!virtualScrollList) {
      virtualScrollList = new VirtualScrollList(listElement, 120, 5);
    }

    if (append) {
      const existingItems = virtualScrollList ? virtualScrollList.items : [];
      const newItems = [...existingItems];
      conversations.forEach(conv => {
        if (!newItems.find(item => item.id === conv.id)) {
          newItems.push(conv);
        }
      });
      virtualScrollList.setItems(newItems);
    } else {
      virtualScrollList.setItems(conversations);
    }

    if (virtualScrollList) {
      setTimeout(() => virtualScrollList.forceUpdate(), 10);
    }

    if (accessibilityManager) {
      accessibilityManager.onConversationsRendered();
    }
  });
}

function showDetailView(conversation) {
  currentView = 'detail';

  // Save scroll position before switching to detail view
  if (virtualScrollList && virtualScrollList.viewport) {
    // Try different methods to get scroll position
    savedScrollTop = virtualScrollList.viewport.scrollTop || 
                    virtualScrollList.viewport.pageYOffset || 
                    (document.documentElement && document.documentElement.scrollTop) || 0;
  }

  setTimeout(() => {
    if (virtualScrollList) {
      // Update the internal scroll position before updating visible range
      document.documentElement.scrollTop = 0;
      virtualScrollList.updateVisibleRange();
      virtualScrollList.render();
    }
  }, 10);
  
  document.getElementById('list-view').classList.add('hidden');
  const detailView = document.getElementById('detail-view');
  detailView.classList.remove('hidden');

  document.getElementById('detail-title').textContent = conversation.title;

  const detailElement = document.getElementById('conversation-detail');
  // ** MODIFICATION: Rewrote detail view HTML with Tailwind classes **
  detailElement.innerHTML = `
    <div class="space-y-6">
      <div class="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs text-slate-600 space-y-2">
        <p><strong>Platform:</strong> <span class="font-medium">${escapeHTML(conversation.platform)}</span></p>
        <p><strong>Date:</strong> <span class="font-medium">${new Date(conversation.createdAt).toLocaleString()}</span></p>
        <p><strong>URL:</strong> <a href="${conversation.url}" target="_blank" class="text-blue-600 hover:underline break-all" aria-label="Open conversation URL in new tab">${escapeHTML(conversation.url)}</a></p>
      </div>
      <div class="detail-section">
        <div class="flex justify-between items-center mb-2 pb-2 border-b border-slate-200">
          <h2 class="text-lg font-semibold text-slate-700">Prompt</h2>
          <button id="copy-prompt-button" class="copy-button bg-gray-200 text-slate-500 hover:text-blue-500 hover:bg-gray-300 rounded-full p-1.5 transition-colors" aria-label="Copy prompt" title="Copy prompt">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </button>
        </div>
        <div class="detail-content prose prose-sm max-w-none" role="region" aria-label="User prompt">
          ${// Use marked to parse potential markdown in prompt, then DOMPurify to sanitize
            DOMPurify.sanitize(marked.parse(conversation.prompt || ''))
          }
        </div>
      </div>
      <div class="detail-section">
        <div class="flex justify-between items-center mb-2 pb-2 border-b border-slate-200">
          <h2 class="text-lg font-semibold text-slate-700">Response</h2>
          <button id="copy-response-button" class="copy-button bg-gray-200 text-slate-500 hover:text-blue-500 hover:bg-gray-300 rounded-full p-1.5 transition-colors" aria-label="Copy response" title="Copy response">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </button>
        </div>
        <div class="detail-content prose prose-sm max-w-none" role="region" aria-label="AI response">
          ${DOMPurify.sanitize(marked.parse(conversation.response || ''))}
        </div>
      </div>
    </div>
  `;

  enhanceCodeBlocks(detailElement);

  // Add event listeners for the new copy buttons
  const copyPromptButton = document.getElementById('copy-prompt-button');
  if (copyPromptButton) {
    copyPromptButton.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(conversation.prompt).then(() => {
        UIFeedback.showSuccessMessage('Prompt copied to clipboard');
      }).catch(err => {
        logger.error('Failed to copy prompt: ', err);
        UIFeedback.showErrorMessage('Failed to copy prompt');
      });
    });
  }

  const copyResponseButton = document.getElementById('copy-response-button');
  if (copyResponseButton) {
    copyResponseButton.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(conversation.response).then(() => {
        UIFeedback.showSuccessMessage('Response copied to clipboard');
      }).catch(err => {
        logger.error('Failed to copy response: ', err);
        UIFeedback.showErrorMessage('Failed to copy response');
      });
    });
  }

  setTimeout(() => {
    detailElement.focus();
    if (accessibilityManager) {
      accessibilityManager.announceToScreenReader(`Viewing conversation: ${conversation.title}. Press Escape to go back to list.`);
    }
  }, 100);

  // ** NEW FEATURE: Click outside to close **
  // Add an event listener to the detail view itself to handle clicks on the background/padding area.
  detailView.addEventListener('click', handleDetailViewClick);
}

// ** NEW FEATURE: Handler for the "Click outside to close" functionality **
function handleDetailViewClick(event) {
    // If the click is on the #detail-view itself (the gray background) and not its children, go back.
    if (event.target === event.currentTarget) {
        showListView();
    }
}

function enhanceCodeBlocks(container) {
  const codeElements = container.querySelectorAll('pre code');
  codeElements.forEach(codeEl => {
    hljs.highlightElement(codeEl);
    const preEl = codeEl.parentElement;
    if (preEl.querySelector('.copy-button')) return;

    // ** MODIFICATION: Rewrote copy button with Tailwind classes **
    const button = document.createElement('button');
    button.className = 'copy-button absolute top-2 right-2 px-2 py-1 text-xs bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 transition-colors';
    button.textContent = 'Copy';
    
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(codeEl.innerText).then(() => {
        button.textContent = 'Copied!';
        setTimeout(() => {
          button.textContent = 'Copy';
        }, 2000);
      }).catch(err => {
        logger.error('Failed to copy code: ', err);
        button.textContent = 'Error';
      });
    });
    preEl.style.position = 'relative'; // Ensure parent is positioned for absolute child
    preEl.appendChild(button);
  });
}

function showListView() {
  currentView = 'list';
  const detailView = document.getElementById('detail-view');
  detailView.classList.add('hidden');
  document.getElementById('list-view').classList.remove('hidden');

  // Restore scroll position when returning to list view
  if (virtualScrollList && virtualScrollList.viewport) {
    // Ensure the viewport is fully rendered before setting scroll position
    setTimeout(() => {
      if (virtualScrollList && virtualScrollList.viewport) {
        document.documentElement.scrollTop = savedScrollTop;
        virtualScrollList.updateVisibleRange();
        virtualScrollList.render();
      }
    }, 10); // Increased delay to ensure DOM is fully rendered
  }

  // ** NEW FEATURE: Cleanup for "Click outside to close" **
  // Remove the event listener when we go back to the list view to prevent memory leaks.
  detailView.removeEventListener('click', handleDetailViewClick);

  setTimeout(() => {
    const conversationList = document.getElementById('conversation-list');
    conversationList.focus();
    if (accessibilityManager) {
      accessibilityManager.announceToScreenReader('Returned to conversation list. Use arrow keys to navigate conversations.');
      accessibilityManager.updateFocusableItems();
    }
  }, 100);
}

function showLoadingIndicator() {
  if (virtualScrollList && virtualScrollList.viewport) {
    let loadingIndicator = virtualScrollList.viewport.querySelector('.loading-indicator');
    if (!loadingIndicator) {
      loadingIndicator = document.createElement('div');
      // ** MODIFICATION: Rewrote loading indicator with Tailwind classes **
      loadingIndicator.className = 'loading-indicator p-4 text-center text-sm text-slate-500';
      loadingIndicator.innerHTML = '<p>Loading conversations...</p>';
      virtualScrollList.viewport.appendChild(loadingIndicator);
    }
  } else {
    // Fallback for when virtual scroll is not available
    const listElement = document.getElementById('conversation-list');
    if (listElement && !listElement.querySelector('.loading-indicator')) {
      const loadingIndicator = document.createElement('div');
      loadingIndicator.className = 'loading-indicator p-4 text-center text-sm text-slate-500';
      loadingIndicator.innerHTML = '<p>Loading conversations...</p>';
      listElement.appendChild(loadingIndicator);
    }
  }
}

function hideLoadingIndicator() {
  if (virtualScrollList && virtualScrollList.viewport) {
    const loadingIndicator = virtualScrollList.viewport.querySelector('.loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.remove();
    }
  }
}

function updateLoadMoreButton() {
  const container = virtualScrollList ? virtualScrollList.viewport : document.getElementById('conversation-list');
  if (!container) return;

  let loadMoreButton = container.querySelector('.load-more-button');
  let endMessage = container.querySelector('.end-message');

  if (hasMorePages && allConversations.length > 0) {
    if (!loadMoreButton) {
      loadMoreButton = document.createElement('button');
      // ** MODIFICATION: Rewrote load more button with Tailwind classes **
      loadMoreButton.className = 'load-more-button block w-11/12 mx-auto my-4 px-4 py-3 text-sm font-semibold bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500';
      loadMoreButton.innerHTML = '📚 Load More Conversations';
      loadMoreButton.addEventListener('click', () => {
        loadMoreButton.innerHTML = '⏳ Loading...';
        loadMoreButton.disabled = true;
        loadMoreConversations();
      });
      container.appendChild(loadMoreButton);
    }
    loadMoreButton.style.display = 'block';
    loadMoreButton.innerHTML = '📚 Load More Conversations';
    loadMoreButton.disabled = false;
    if (endMessage) endMessage.style.display = 'none';
  } else if (allConversations.length > 0) {
    if (loadMoreButton) loadMoreButton.style.display = 'none';
    if (!endMessage) {
      endMessage = document.createElement('div');
      // ** MODIFICATION: Rewrote end message with Tailwind classes **
      endMessage.className = 'end-message text-center text-sm text-green-600 p-4 my-4 bg-green-50 border border-green-200 rounded-lg';
      endMessage.innerHTML = '🎉 You\'ve reached the end! All conversations loaded.';
      container.appendChild(endMessage);
    }
    endMessage.style.display = 'block';
  } else {
    if (loadMoreButton) loadMoreButton.style.display = 'none';
    if (endMessage) endMessage.style.display = 'none';
  }
}


function exportConversationAsMarkdown(conversation) {
  const { title, url, createdAt, prompt, response, platform } = conversation;

  // Sanitize title for use in a filename
  const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = `${safeTitle}.md`;

  const markdownContent = `
# ${title}

- **Platform:** ${platform}
- **Date:** ${new Date(createdAt).toLocaleString()}
- **URL:** [${url}](${url})

---

## Prompt

${prompt}

---

## Response

${response}
  `;

  const blob = new Blob([markdownContent.trim()], { type: 'text/markdown;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(blobUrl);

  UIFeedback.showSuccessMessage(`Exported "${title}" as Markdown.`);
}

async function deleteConversation(id) {
  const conversation = allConversations.find(conv => conv.id == id);
  if (!conversation) {
    UIFeedback.showErrorMessage('Conversation not found');
    return;
  }

  const confirmed = await UIFeedback.showConfirmDialog(
    `Are you sure you want to delete this conversation?\n\n"${conversation.prompt.substring(0, 100)}..."`,
    'Delete Conversation',
    { confirmText: 'Delete', cancelText: 'Cancel' }
  );

  if (!confirmed) return;

  UIFeedback.showInfoMessage('Deleting conversation...');

  chrome.runtime.sendMessage({ namespace: 'database', action: 'deleteConversation', payload: { id: id } }, (response) => {
    if (chrome.runtime.lastError) {
      UIFeedback.showErrorMessage(chrome.runtime.lastError.message, 'Failed to delete conversation');
      return;
    }

    if (response && response.status === 'success') {
      allConversations = allConversations.filter(conv => conv.id !== id);
      
      // Re-render the list with the item removed
      renderConversations(allConversations, false);

      if (currentView === 'detail') {
        showListView();
      }

      if (allConversations.length < PAGE_SIZE / 2 && hasMorePages) {
        loadMoreConversations();
      }

      UIFeedback.showSuccessMessage('Conversation deleted successfully');

      if (accessibilityManager) {
        accessibilityManager.updateFocusableItems();
      }
    } else {
      const errorMessage = response ? response.message : 'Unknown error occurred';
      UIFeedback.showErrorMessage(errorMessage, 'Failed to delete conversation');
    }
  });
}

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showSearchLoadingIndicator() {
  const searchLoadingIndicator = document.getElementById('search-loading-indicator');
  if (searchLoadingIndicator) {
    searchLoadingIndicator.classList.remove('hidden');
  }
}

function hideSearchLoadingIndicator() {
  const searchLoadingIndicator = document.getElementById('search-loading-indicator');
  if (searchLoadingIndicator) {
    searchLoadingIndicator.classList.add('hidden');
  }
}

function cleanupVirtualScrolling() {
  if (virtualScrollList) {
    virtualScrollList.destroy();
    virtualScrollList = null;
  }
}

function handleResize() {
  if (virtualScrollList) {
    virtualScrollList.updateContainerHeight();
    virtualScrollList.updateVisibleRange();
    virtualScrollList.render();
  }
}

// Accessibility and keyboard navigation (logic is unchanged)
class AccessibilityManager {
  constructor() {
    this.currentFocusIndex = -1;
    this.focusableItems = [];
    this.init();
  }

  init() {
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    this.updateFocusableItems();
  }

  handleKeyDown(event) {
    const { key, ctrlKey, metaKey } = event;

    if (currentView === 'list') {
      this.handleListViewKeyDown(event);
    } else if (currentView === 'detail') {
      this.handleDetailViewKeyDown(event);
    }

    if (key === 'Escape') {
      if (currentView === 'detail') {
        event.preventDefault();
        this.goBackToList();
      }
    }

    if ((ctrlKey || metaKey) && key === 'f') {
      event.preventDefault();
      this.focusSearch();
    }
  }

  handleListViewKeyDown(event) {
    const { key, shiftKey } = event;
    switch (key) {
      case 'ArrowDown': event.preventDefault(); this.navigateList(1); break;
      case 'ArrowUp': event.preventDefault(); this.navigateList(-1); break;
      case 'Enter': case ' ': event.preventDefault(); this.activateCurrentItem(); break;
      case 'Delete': case 'Backspace': if (shiftKey) { event.preventDefault(); this.deleteCurrentItem(); } break;
      case 'Home': event.preventDefault(); this.navigateToFirst(); break;
      case 'End': event.preventDefault(); this.navigateToLast(); break;
    }
  }

  handleDetailViewKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.goBackToList();
    }
  }

  navigateList(direction) {
    this.updateFocusableItems();
    if (this.focusableItems.length === 0) return;
    this.currentFocusIndex += direction;
    if (this.currentFocusIndex >= this.focusableItems.length) this.currentFocusIndex = 0;
    else if (this.currentFocusIndex < 0) this.currentFocusIndex = this.focusableItems.length - 1;
    this.focusCurrentItem();
    this.announceCurrentItem();
  }

  navigateToFirst() {
    this.updateFocusableItems();
    if (this.focusableItems.length > 0) {
      this.currentFocusIndex = 0;
      this.focusCurrentItem();
      this.announceCurrentItem();
    }
  }

  navigateToLast() {
    this.updateFocusableItems();
    if (this.focusableItems.length > 0) {
      this.currentFocusIndex = this.focusableItems.length - 1;
      this.focusCurrentItem();
      this.announceCurrentItem();
    }
  }

  updateFocusableItems() {
    if (virtualScrollList && virtualScrollList.content) {
      this.focusableItems = Array.from(virtualScrollList.content.querySelectorAll('.conversation-item'));
    }
  }

  focusCurrentItem() {
    if (this.currentFocusIndex >= 0 && this.currentFocusIndex < this.focusableItems.length) {
      const item = this.focusableItems[this.currentFocusIndex];
      item.focus();
      item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  activateCurrentItem() {
    if (this.currentFocusIndex >= 0 && this.currentFocusIndex < this.focusableItems.length) {
      this.focusableItems[this.currentFocusIndex].click();
    }
  }

  deleteCurrentItem() {
    if (this.currentFocusIndex >= 0 && this.currentFocusIndex < this.focusableItems.length) {
      const item = this.focusableItems[this.currentFocusIndex];
      const conversationId = item.getAttribute('data-conversation-id');
      if (conversationId) deleteConversation(conversationId);
    }
  }

  announceCurrentItem() {
    if (this.currentFocusIndex >= 0 && this.currentFocusIndex < this.focusableItems.length) {
      const item = this.focusableItems[this.currentFocusIndex];
      const title = item.querySelector('.item-title')?.textContent || '';
      const platform = item.querySelector('.platform-badge')?.textContent || '';
      const date = item.querySelector('.item-date')?.textContent || '';
      const announcement = `${title} from ${platform}, ${date}. ${this.currentFocusIndex + 1} of ${this.focusableItems.length}`;
      this.announceToScreenReader(announcement);
    }
  }

  announceToScreenReader(message) {
    const statusElement = document.getElementById('list-status');
    if (statusElement) statusElement.textContent = message;
  }

  focusSearch() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }

  goBackToList() {
    const backButton = document.getElementById('back-button');
    if (backButton) backButton.click();
  }

  onConversationsRendered() {
    this.updateFocusableItems();
    const count = this.focusableItems.length;
    if (count > 0) {
      this.announceToScreenReader(`${count} conversations loaded. Use arrow keys to navigate.`);
    }
  }
}

// UI Feedback and Error Handling System
class UIFeedback {
  static showToast(message, type = 'info', duration = 4000) {
    const existingToasts = document.querySelectorAll(`.toast.toast-${type}`);
    existingToasts.forEach(toast => toast.remove());

    const toast = document.createElement('div');
    // ** MODIFICATION: Rewrote toast with Tailwind classes **
    const typeClasses = {
      info: 'bg-blue-100 border-blue-500 text-blue-800',
      success: 'bg-green-100 border-green-500 text-green-800',
      warning: 'bg-yellow-100 border-yellow-500 text-yellow-800',
      error: 'bg-red-100 border-red-500 text-red-800',
    };
    toast.className = `toast fixed bottom-5 left-1/2 -translate-x-1/2 w-11/12 max-w-md p-4 rounded-lg shadow-lg border-l-4 flex items-center justify-between transition-transform duration-300 translate-y-20 opacity-0 ${typeClasses[type]}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');

    toast.innerHTML = `
      <div class="toast-content flex-grow">${escapeHTML(message)}</div>
      <button class="toast-close ml-4 text-xl font-bold opacity-70 hover:opacity-100">&times;</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => this.hideToast(toast));
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.remove('translate-y-20', 'opacity-0'), 10);
    if (duration > 0) setTimeout(() => this.hideToast(toast), duration);
    return toast;
  }

  static hideToast(toast) {
    if (toast && toast.parentNode) {
      toast.classList.add('translate-y-20', 'opacity-0');
      setTimeout(() => toast.remove(), 300);
    }
  }

  static showConfirmDialog(message, title = 'Confirm Action', options = {}) {
    return new Promise((resolve) => {
      const dialog = document.createElement('div');
      
      let className = 'confirm-dialog-overlay fixed inset-0 flex items-center justify-center z-50 p-4 fade-in';
      if (CSS.supports('(backdrop-filter: blur(4px)) or (-webkit-backdrop-filter: blur(4px))')) {
        className += ' supports-backdrop-filter';
      } else {
        className += ' no-supports-backdrop-filter';
      }
      dialog.className = className;

      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');

      dialog.innerHTML = `
        <div class="confirm-dialog bg-white rounded-lg shadow-xl w-full max-w-sm">
          <div class="p-5 border-b border-slate-200">
            <h3 class="text-lg font-semibold text-slate-800">${escapeHTML(title)}</h3>
          </div>
          <div class="p-5">
            <p class="text-sm text-slate-600 whitespace-pre-wrap">${escapeHTML(message)}</p>
          </div>
          <div class="p-4 bg-slate-50 flex justify-end gap-3 rounded-b-lg">
            <button class="dialog-button-cancel px-4 py-2 text-sm font-medium bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors">
              ${options.cancelText || 'Cancel'}
            </button>
            <button class="dialog-button-confirm px-4 py-2 text-sm font-medium text-white bg-red-600 border border-red-600 rounded-md hover:bg-red-700 transition-colors">
              ${options.confirmText || 'Confirm'}
            </button>
          </div>
        </div>
      `;

      const cleanup = () => {
        dialog.remove();
        document.removeEventListener('keydown', handleKeyDown);
      };

      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          cleanup();
          resolve(false);
        }
      };

      dialog.querySelector('.dialog-button-cancel').addEventListener('click', () => { cleanup(); resolve(false); });
      dialog.querySelector('.dialog-button-confirm').addEventListener('click', () => { cleanup(); resolve(true); });
      dialog.addEventListener('click', (e) => { if (e.target === dialog) { cleanup(); resolve(false); } });
      document.addEventListener('keydown', handleKeyDown);

      document.body.appendChild(dialog);
      setTimeout(() => dialog.querySelector('.dialog-button-confirm').focus(), 100);
    });
  }

  static showErrorMessage(error, context = '') {
    let message = 'An unexpected error occurred.';
    if (typeof error === 'string') message = error;
    else if (error && error.message) message = error.message;
    if (context) message = `${context}: ${message}`;
    logger.error('Error:', error);
    this.showToast(message, 'error', 6000);
  }

  static showSuccessMessage(message) { this.showToast(message, 'success', 3000); }
  static showWarningMessage(message) { this.showToast(message, 'warning', 4000); }
  static showInfoMessage(message) { this.showToast(message, 'info', 3000); }
}

// DOM Optimization Utilities (unchanged)
class DOMOptimizer {
  static createDocumentFragment() { return document.createDocumentFragment(); }
  static batchDOMUpdates(callback) { requestAnimationFrame(() => callback()); }
  static createElementFromTemplate(template, data = {}) {
    const container = document.createElement('div');
    container.innerHTML = template;
    const element = container.firstElementChild;
    if (element && data) this.replacePlaceholders(element, data);
    return element;
  }
  static replacePlaceholders(element, data) {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) textNodes.push(node);
    textNodes.forEach(textNode => {
      let content = textNode.textContent;
      Object.keys(data).forEach(key => {
        const placeholder = `{{${key}}}`;
        if (content.includes(placeholder)) content = content.replace(new RegExp(placeholder, 'g'), data[key]);
      });
      textNode.textContent = content;
    });
    const allElements = [element, ...element.querySelectorAll('*')];
    allElements.forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        let value = attr.value;
        Object.keys(data).forEach(key => {
          const placeholder = `{{${key}}}`;
          if (value.includes(placeholder)) value = value.replace(new RegExp(placeholder, 'g'), data[key]);
        });
        attr.value = value;
      });
    });
  }
  static measurePerformance(name, callback) {
    const startTime = performance.now();
    callback();
    const endTime = performance.now();
    // Removed debug log for performance measurement to reduce console output
    // logger.log(`${name} took ${(endTime - startTime).toFixed(2)}ms`);
  }
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => { clearTimeout(timeout); func(...args); };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
}

// ** MODIFICATION: Rewrote conversation item template with Tailwind CSS **
const CONVERSATION_ITEM_TEMPLATE = `
  <div class="conversation-item virtual-item flex flex-col justify-between p-4 m-1.5 bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 cursor-pointer"
       role="listitem"
       tabindex="0"
       data-conversation-id="{{id}}"
       data-index="{{index}}"
       aria-label="{{ariaLabel}}">
    
    <div class="flex items-start justify-between">
      <h3 class="item-title text-sm font-semibold text-slate-800 truncate pr-16">{{title}}</h3>
      <p class="item-date text-xs text-slate-500 flex-shrink-0">{{date}}</p>
    </div>

    <p class="item-preview text-xs text-slate-600 mt-2 p-2 bg-slate-50 rounded-md border-l-2 border-slate-300 overflow-hidden" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">
      <strong>Prompt:</strong> {{preview}}
    </p>

    <div class="flex items-center justify-between mt-2">
        <a href="{{platformUrl}}" target="_blank" rel="noopener noreferrer" class="platform-link" title="Visit {{platform}}">
            <span class="platform-badge text-xs font-medium text-white px-2.5 py-0.5 rounded-full transition-transform duration-200 hover:scale-110 {{platformColor}}">{{platform}}</span>
        </a>
        <div class="flex items-center gap-1">
            <button class="export-button text-slate-400 hover:text-blue-500 hover:bg-blue-100 rounded-full p-1.5 transition-colors" aria-label="Export conversation: {{title}}" title="Export as Markdown">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            </button>
            <button class="option-button text-slate-400 hover:text-red-500 hover:bg-red-100 rounded-full p-1.5 transition-colors" aria-label="Delete conversation: {{title}}" title="Delete">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            </button>
        </div>
    </div>
  </div>
`;

// Memory cleanup function
function cleanupMemory() {
  // Clear conversation cache
  allConversations = [];

  // Cleanup virtual scrolling
  if (virtualScrollList) {
    virtualScrollList.destroy();
    virtualScrollList = null;
  }

  // Clear any remaining event listeners
  eventListenerCleanup.forEach(cleanup => {
    try {
      cleanup();
    } catch (e) {
      logger.warn('Error during cleanup:', e);
    }
  });
  eventListenerCleanup.clear();
}

/**
 * Cleanup performance integration resources
 */
function cleanupPerformanceIntegration() {
  try {
    simplePerformance.clearCache();
    clearTimeout(simplePerformance.searchDebounceTimer);
    logger.log('🧹 Simple performance integration cleaned up');
  } catch (error) {
    logger.warn('Error cleaning up performance integration:', error);
  }
}

/**
 * Get performance metrics for debugging
 * Call this from browser console: getPerformanceMetrics()
 */
window.getPerformanceMetrics = function() {
  if (performanceIntegration) {
    const metrics = performanceIntegration.getPerformanceMetrics();
    logger.table(metrics);
    return metrics;
  } else {
    logger.warn('Performance integration not available');
    return null;
  }
};

// Initialize systems
const accessibilityManager = new AccessibilityManager();
window.addEventListener('resize', handleResize);
window.addEventListener('beforeunload', () => {
  cleanupMemory();
  cleanupPerformanceIntegration();
});
window.addEventListener('unload', () => {
  cleanupMemory();
  cleanupPerformanceIntegration();
});
