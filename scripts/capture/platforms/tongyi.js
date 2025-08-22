/**
 * Platform Logic for Tongyi Qianwen
 */

export const config = {
    name: 'Tongyi',
    apiEndpoint: '/dialog/conversation',
};

export async function parseRequest(request, logger) {
    try {
        const requestBody = await request.clone().json();
        if (requestBody.contents && Array.isArray(requestBody.contents)) {
            const userMessage = requestBody.contents.find(m => m.role === 'user');
            if (userMessage && userMessage.content) {
                return userMessage.content;
            }
        }
    } catch (e) {
        logger.error("Error parsing request:", e);
    }
    return '';
}

// Helper function to process SSE stream incrementally
function processSSEStream(sseStream, logger) {
    const messages = sseStream.split('\n\n').filter(Boolean);
    let fullText = '';
    let sessionId = null;
    let lastTextContent = null;  // Keep track of the last text content for incremental updates

    for (const messageBlock of messages) {
        const lines = messageBlock.split('\n');
        let dataString = null;
        for (const line of lines) {
            if (line.startsWith('data:')) {
                dataString = line.substring(5).trim();
                break;
            }
        }

        if (!dataString) continue;
        if (dataString === '[DONE]') break;

        try {
            const data = JSON.parse(dataString);
            // Removed debug log for parsed SSE data to reduce console output
            // logger.log("Parsed SSE data:", data);

            if (data.sessionId) {
                sessionId = data.sessionId;
            }

            // Handle think content type - look for the actual text response within it
            if (data.contentType === 'think') {
                // Removed debug log for processing think content type to reduce console output
                // logger.log("Processing think content type");
                // For think content, we need to look at all contents and find the one with contentType 'text'
                if (data.contents && Array.isArray(data.contents) && data.contents.length > 0) {
                    // Look for the content with contentType 'text' (the actual response)
                    const textContent = data.contents.find(content => 
                        content && content.contentType === 'text' && 
                        content.content && typeof content.content === 'string'
                    );
                    
                    if (textContent) {
                        // Skip content that contains pluginCall
                        if (textContent.content.includes('pluginCall')) {
                            // Removed debug log for skipping pluginCall content in think type to reduce console output
                            // logger.log("Skipping pluginCall content in think type");
                        } else {
                            // For think content with text type, we want to update incrementally
                            // but only if the content has changed
                            if (textContent.content !== lastTextContent) {
                                fullText = textContent.content;
                                lastTextContent = textContent.content;
                                // Removed debug log for extracted actual text response from think content to reduce console output
                                // logger.log("Extracted actual text response from think content (incremental update)");
                            }
                        }
                    } else {
                        // If no text content found, try to process other contents
                        for (const content of data.contents) {
                            if (content && content.content && typeof content.content === 'string') {
                                // Skip content that contains pluginCall
                                if (content.content.includes('pluginCall')) {
                                    // Removed debug log for skipping pluginCall content in think type to reduce console output
                                    // logger.log("Skipping pluginCall content in think type");
                                    continue;
                                }
                                
                                // For think content that isn't JSON, we might still want to extract it
                                // if it looks like a proper response
                                if (content.content.length > 100) {  // Another arbitrary threshold
                                    if (content.content !== lastTextContent) {
                                        fullText = content.content;
                                        lastTextContent = content.content;
                                        // Removed debug log for extracted long text content from think type to reduce console output
                                        // logger.log("Extracted long text content from think type (incremental update)");
                                    }
                                    break;
                                }
                            }
                        }
                    }
                }
                continue;  // Skip further processing for think content
            }

            // Handle regular text content type
            if (data.contents && Array.isArray(data.contents) && data.contents.length > 0) {
                const content = data.contents[0];
                if (content && content.content && typeof content.content === 'string') {
                    // Skip content that contains pluginCall
                    if (content.content.includes('pluginCall')) {
                        // Removed debug log for skipping pluginCall content to reduce console output
                        // logger.log("Skipping pluginCall content");
                        continue;
                    }
                    
                    // For regular text content, we want to build up the text incrementally
                    // until we reach the finished status
                    if (data.msgStatus !== 'finished') {
                        // Accumulate text for incremental updates
                        if (content.content !== lastTextContent) {
                            fullText = content.content;
                            lastTextContent = content.content;
                            // Removed debug log for updated text content to reduce console output
                            // logger.log("Updated text content (incremental update)");
                        }
                    } else {
                        // When finished, set the final text
                        fullText = content.content;
                        // Removed debug log for final text content set to reduce console output
                        // logger.log("Final text content set");
                    }
                }
            }
        } catch (e) {
            logger.warn("Could not parse SSE data chunk:", dataString);
        }
    }
    
    // logger.log("Final reconstructed response:", fullText);
    // Removed debug log for final reconstructed response to reduce console output
    return { text: fullText, id: sessionId };
}

export async function parseResponse(response, logger) {
    // Instead of waiting for the entire response, we'll process it as a stream
    // This allows for real-time updates without blocking
    const reader = response.body.getReader();
    
    // Use TextDecoder for robust UTF-8 decoding.
    // A fallback is provided for older environments, though TextDecoder is standard in extension contexts.
    let decoder;
    try {
        decoder = new TextDecoder('utf-8', { fatal: true }); // Throw error on invalid data
    } catch (e) {
        // A much simpler, though less robust, fallback.
        logger.warn("TextDecoder not available. Using a simple fallback which may not handle all characters correctly.");
        decoder = {
            decode: (value) => {
                try {
                    // This works for simple ASCII and some UTF-8 but is not fully compliant.
                    return decodeURIComponent(escape(String.fromCharCode.apply(null, new Uint8Array(value))));
                } catch (err) {
                    logger.error("Error in fallback decoder:", err);
                    return ''; // Return empty string on failure
                }
            }
        };
    }
    
    let fullSSEStream = '';
    let result = { text: '', id: null };
    let lastProcessedLength = 0;
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // Decode the chunk and add it to our SSE stream
            const chunk = decoder.decode(value, { stream: true });
            fullSSEStream += chunk;
            
            // Only process if we have new data
            if (fullSSEStream.length > lastProcessedLength) {
                // Process the current stream to get the latest state
                result = processSSEStream(fullSSEStream, logger);
                lastProcessedLength = fullSSEStream.length;
            }
        }
        
        // Final processing
        result = processSSEStream(fullSSEStream, logger);
        return result;
    } catch (error) {
        logger.error("Error reading response stream:", error);
        // Fallback to the original method if streaming fails
        try {
            const sseStream = await response.clone().text();
            return processSSEStream(sseStream, logger);
        } catch (fallbackError) {
            logger.error("Error in fallback method:", fallbackError);
            return { text: '', id: null };
        }
    } finally {
        reader.releaseLock();
    }
}
