/**
 * Platform Logic for Claude.ai
 */

// Track recent conversations to prevent duplicates at platform level with memory limits
const recentClaudeConversations = new Map();
const CLAUDE_DUPLICATE_WINDOW = 5000; // 5 seconds
const MAX_CLAUDE_TRACKED = 100; // Limit memory usage for Claude conversations

export const config = {
    name: 'Claude',
    // This is a regex to match the chat conversation API endpoint
    apiEndpoint: /^\/api\/organizations\/[a-f0-9-]+\/chat_conversations\/[a-f0-9-]+$/,
};

// We don't need to parse the request for Claude, as all data is in the response.
export async function parseRequest(request, logger) {
    return '';
}

export async function parseResponse(response, logger) {
    logger.log("Starting to parse response...");
    try {
        const data = await response.clone().json();
        const conversationId = data.uuid;
        
        if (data.chat_messages && data.chat_messages.length >= 2) {
            const lastTwoMessages = data.chat_messages.slice(-2);
            const userMessage = lastTwoMessages.find(m => m.sender === 'human');
            const assistantMessage = lastTwoMessages.find(m => m.sender === 'assistant');

            if (userMessage && assistantMessage) {
                const userPrompt = userMessage.content.map(c => c.text).join('\n');
                const aiResponse = assistantMessage.content.map(c => c.text).join('\n');

                // Removed debug log for successfully extracted prompt and response to reduce console output
                // logger.log("Successfully extracted prompt and response.", { userPrompt, aiResponse, conversationId });

                // Check for duplicates at platform level before sending
                const contentKey = `${userPrompt}:${aiResponse}`;
                const now = Date.now();

                // Clean up old entries and enforce memory limits
                for (const [key, timestamp] of recentClaudeConversations.entries()) {
                    if (now - timestamp > CLAUDE_DUPLICATE_WINDOW) {
                        recentClaudeConversations.delete(key);
                    }
                }

                // Enforce memory limits
                if (recentClaudeConversations.size > MAX_CLAUDE_TRACKED) {
                    const entries = Array.from(recentClaudeConversations.entries());
                    entries.sort((a, b) => a[1] - b[1]); // Sort by timestamp
                    const toRemove = entries.slice(0, entries.length - MAX_CLAUDE_TRACKED);
                    toRemove.forEach(([key]) => recentClaudeConversations.delete(key));
                    // Removed debug log for cleaned up old Claude conversation entries to reduce console output
                    // logger.log(`Cleaned up ${toRemove.length} old Claude conversation entries for memory optimization`);
                }

                // Check if this conversation was already processed recently
                if (recentClaudeConversations.has(contentKey)) {
                    // Removed debug log for duplicate Claude conversation detection to reduce console output
                    // logger.log("Duplicate Claude conversation detected at platform level, skipping.", {
                    //     promptPreview: userPrompt.substring(0, 50) + '...',
                    //     responsePreview: aiResponse.substring(0, 50) + '...',
                    //     conversationId
                    // });
                    return { text: aiResponse, id: conversationId };
                }

                // Mark this conversation as processed
                recentClaudeConversations.set(contentKey, now);

                // We need to post a message back to the injector with the full conversation data
                // as we cannot get the prompt from the request.
                window.postMessage({
                    type: 'LLMLOG_CONVERSATION_UPDATE',
                    payload: {
                        platform: config.name,
                        prompt: userPrompt,
                        response: aiResponse,
                        url: window.location.href,
                        createdAt: new Date().toISOString(),
                        title: userPrompt.substring(0, 50)
                    }
                }, window.location.origin);

                return { text: aiResponse, id: conversationId };
            }
        }
    } catch (e) {
        logger.error("Error parsing Claude response:", e);
    }
    
    logger.log("Could not extract conversation data.");
    return { text: '', id: null };
}
