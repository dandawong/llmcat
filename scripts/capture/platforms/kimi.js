/**
 * Platform Logic for Kimi
 */

export const config = {
    name: 'Kimi',
    apiEndpoint: /^\/(apiv2\/kimi\.chat\.v1\.ChatService\/Chat|api\/chat\/.+\/completion\/)/,
};

let currentConversationId = null;

// Helper function to check if the request is for the new API format
function isUsingNewAPIFormat(url) {
    return url.includes('/apiv2/kimi.chat.v1.ChatService/Chat');
}

// Helper function to extract conversation ID from URL (old format)
function extractConversationIdFromURL(url) {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        // URL format is /api/chat/{id}/completion/...
        const chatIndex = pathParts.indexOf('chat');
        if (chatIndex > -1 && chatIndex + 1 < pathParts.length) {
            return pathParts[chatIndex + 1];
        }
    } catch (e) {
        // Ignore URL parsing errors
    }
    return null;
}

// Helper function to extract user message (old format)
function extractUserMessageOldFormat(requestBody) {
    if (requestBody.messages && requestBody.messages.length > 0) {
        const userMessage = requestBody.messages.find(msg => msg.role === 'user');
        if (userMessage) {
            return userMessage.content;
        }
    }
    return '';
}

// Helper function to extract user message (new format)
function extractUserMessageNewFormat(requestBody) {
    // Try to extract user message from the new format
    if (requestBody.message && 
        requestBody.message.blocks && 
        requestBody.message.blocks.length > 0 && 
        requestBody.message.blocks[0].text && 
        requestBody.message.blocks[0].text.content) {
        return requestBody.message.blocks[0].text.content;
    }
    
    // Fallback to the old format
    return extractUserMessageOldFormat(requestBody);
}

export async function parseRequest(request, logger) {
    try {
        // Log request details if available
        if (request.method && request.url) {
            const requestDetails = {
                method: request.method,
                url: request.url
            };
            
            // Only try to log headers if they exist
            if (request.headers && typeof request.headers.entries === 'function') {
                requestDetails.headers = Object.fromEntries(request.headers.entries());
            }
            
            logger.log("Kimi request details:", requestDetails);
        }
        
        // Determine if we're using the new API format
        const isNewFormat = isUsingNewAPIFormat(request.url);
        
        // Try to get JSON data directly first (for compatibility with test mocks)
        try {
            const requestBody = await request.clone().json();
            logger.log("Kimi request JSON content (direct):", JSON.stringify(requestBody));
            
            // Extract conversation ID based on API format
            if (isNewFormat) {
                // New format: Extract conversation ID from the request body
                if (requestBody.chat_id) {
                    currentConversationId = requestBody.chat_id;
                } else if (requestBody.conversation_id) {
                    currentConversationId = requestBody.conversation_id;
                }
            } else {
                // Old format: Extract conversation ID from the request URL
                currentConversationId = extractConversationIdFromURL(request.url);
            }
            
            // Try to extract user message based on API format
            let userMessage = '';
            if (isNewFormat) {
                userMessage = extractUserMessageNewFormat(requestBody);
            } else {
                userMessage = extractUserMessageOldFormat(requestBody);
            }
            
            if (userMessage) {
                return userMessage;
            }
            
            // If we get here, we couldn't extract a message
            logger.warn("Kimi request JSON doesn't contain recognizable message format");
            return '';
        } catch (jsonError) {
            // If direct JSON parsing fails, try to read as binary data
            logger.log("Kimi direct JSON parsing failed, trying binary approach");
        }
        
        // Try to read as binary data
        const arrayBuffer = await request.clone().arrayBuffer();
        logger.log("Kimi request binary data length:", arrayBuffer.byteLength);
        
        // Convert to Uint8Array for easier manipulation
        const byteArray = new Uint8Array(arrayBuffer);
        
        // Find the first occurrence of '{' character
        let startIndex = -1;
        for (let i = 0; i < byteArray.length; i++) {
            if (byteArray[i] === 123) { // 123 is the ASCII code for '{'
                startIndex = i;
                break;
            }
        }
        
        // If we didn't find '{', we can't process this request
        if (startIndex === -1) {
            logger.warn("Kimi request does not contain JSON data (no '{' character found)");
            // Log first 100 bytes as hex for debugging
            const hexString = Array.from(byteArray.slice(0, Math.min(100, byteArray.length)))
                .map(byte => byte.toString(16).padStart(2, '0')).join(' ');
            logger.log("Kimi request binary data (first 100 bytes hex):", hexString);
            return '';
        }
        
        logger.log("Kimi request JSON data starts at index:", startIndex);
        
        // Extract data from the first '{' onwards
        const jsonDataBytes = byteArray.slice(startIndex);
        
        // Try to convert to text
        let requestText = '';
        try {
            const decoder = new TextDecoder('utf-8');
            requestText = decoder.decode(jsonDataBytes);
        } catch (decodeError) {
            logger.warn("Could not decode Kimi request JSON data as UTF-8 text");
            // Convert to hex string for logging purposes
            const hexString = Array.from(jsonDataBytes)
                .map(byte => byte.toString(16).padStart(2, '0')).join(' ');
            logger.log("Kimi request JSON data (hex):", hexString);
            return ''; // Can't process binary data directly
        }
        
        logger.log("Kimi request JSON content:", requestText);
        
        // Try to parse as JSON
        const requestBody = JSON.parse(requestText);
        
        // Extract conversation ID based on API format
        if (isNewFormat) {
            // New format: Extract conversation ID from the request body
            if (requestBody.chat_id) {
                currentConversationId = requestBody.chat_id;
            } else if (requestBody.conversation_id) {
                currentConversationId = requestBody.conversation_id;
            }
        } else {
            // Old format: Extract conversation ID from the request URL
            currentConversationId = extractConversationIdFromURL(request.url);
        }
        
        // Try to extract user message based on API format
        let userMessage = '';
        if (isNewFormat) {
            userMessage = extractUserMessageNewFormat(requestBody);
        } else {
            userMessage = extractUserMessageOldFormat(requestBody);
        }
        
        if (userMessage) {
            return userMessage;
        }
    } catch (e) {
        logger.error("Error parsing Kimi request:", e);
        // If JSON parsing fails, log the error and try to handle non-JSON format
        logger.warn("Kimi request is not in JSON format, need to implement alternative parsing");
    }
    return '';
}

// Helper function to process SSE stream incrementally with support for both formats
function processSSEStream(sseStream, logger) {
    logger.log("Kimi processing SSE stream, length:", sseStream.length);
    
    // Auto-detect format based on stream content
    const isNewFormat = sseStream.includes('\x00\x00\x00\x00');
    logger.log("Kimi detected format:", isNewFormat ? "new" : "old");
    
    // Check if this is the new Kimi format (4 null bytes + ASCII char separator)
    // or the old SSE format (\n\n separator)
    let messageBlocks = [];
    
    if (isNewFormat) {
        // Check for new Kimi format first
        if (sseStream.includes('\x00\x00\x00\x00')) {
            logger.log("Kimi detected new format with null byte separators");
            // New parsing logic for Kimi's updated format
            // The format uses 4 null bytes + 1 character (any character) as separator between JSON objects
            let lastIndex = 0;
            
            // Find all occurrences of 4 consecutive null bytes followed by any character
            for (let i = 0; i < sseStream.length - 4; i++) {
                if (sseStream.charCodeAt(i) === 0 && 
                    sseStream.charCodeAt(i + 1) === 0 && 
                    sseStream.charCodeAt(i + 2) === 0 && 
                    sseStream.charCodeAt(i + 3) === 0) {
                    // Found a separator (4 null bytes + 1 character), extract the JSON block
                    const block = sseStream.substring(lastIndex, i);
                    if (block.trim().length > 0) {
                        messageBlocks.push(block);
                    }
                    // Move past the separator (4 null bytes + 1 char)
                    lastIndex = i + 5;
                    // Skip ahead to avoid reprocessing
                    i += 4;
                }
            }
            
            // Add the last block if it exists
            const lastBlock = sseStream.substring(lastIndex);
            if (lastBlock.trim().length > 0) {
                messageBlocks.push(lastBlock);
            }
        } else {
            // Fallback to old SSE format parsing for compatibility with tests
            logger.log("Kimi using fallback to old SSE format parsing in new format handler");
            messageBlocks = sseStream.split('\n\n').filter(Boolean);
        }
    } else {
        // Old format: Use old SSE format parsing
        logger.log("Kimi using old SSE format parsing");
        messageBlocks = sseStream.split('\n\n').filter(Boolean);
    }
    
    // logger.log("Kimi SSE message blocks count:", messageBlocks.length);
    // Removed debug log for Kimi SSE message blocks count to reduce console output
    let fullText = '';

    for (const messageBlock of messageBlocks) {
        // Removed debug log for Kimi processing message block to reduce console output
        // logger.log("Kimi processing message block:", messageBlock);
        
        // For the new format, clean the message block by removing null bytes
        let cleanBlock = messageBlock;
        if (isNewFormat && sseStream.includes('\x00\x00\x00\x00')) {
            cleanBlock = messageBlock.replace(/\x00/g, '').trim();
        }
        
        if (!cleanBlock) {
            // Removed debug log for Kimi skipping empty message block to reduce console output
            // logger.log("Kimi skipping empty message block");
            continue;
        }
        
        // Extract data string based on format
        let dataString = null;
        if (cleanBlock.startsWith('data:')) {
            // Old SSE format
            dataString = cleanBlock.substring(5).trim();
        } else {
            // New Kimi format or direct JSON
            dataString = cleanBlock;
        }
        
        if (!dataString) {
            // Removed debug log for Kimi skipping message block without data to reduce console output
            // logger.log("Kimi skipping message block without data");
            continue;
        }

        // Find the first occurrence of '{' character in the data string
        let startIndex = -1;
        for (let i = 0; i < dataString.length; i++) {
            if (dataString.charCodeAt(i) === 123) { // 123 is the ASCII code for '{'
                startIndex = i;
                break;
            }
        }
        
        // If we didn't find '{', we can't process this data
        if (startIndex === -1) {
            // Removed debug log for Kimi SSE data does not contain JSON to reduce console output
            // logger.warn("Kimi SSE data does not contain JSON (no '{' character found):", dataString);
            continue;
        }
        
        // Extract JSON data from the first '{' onwards
        const jsonData = dataString.substring(startIndex);
        // Removed debug log for Kimi SSE JSON data to reduce console output
        // logger.log("Kimi SSE JSON data:", jsonData);

        try {
            const data = JSON.parse(jsonData);
            // Removed debug log for Kimi Parsed SSE data to reduce console output
            // logger.log("Kimi Parsed SSE data:", data);

            if (isNewFormat) {
                // Handle different types of chunks for new format
                if (data.op === 'append' && data.block && data.block.text && data.block.text.content) {
                    // Append chunk - add text content to fullText
                    fullText += data.block.text.content;
                    // Removed debug log for Kimi appended text to reduce console output
                    // logger.log("Kimi appended text:", data.block.text.content);
                } else if (data.op === 'set' && data.message && data.message.status) {
                    // Set chunk - log status information
                    // Removed debug log for Kimi set message status to reduce console output
                    // logger.log("Kimi set message status:", data.message.status);
                } else if (data.done) {
                    // End chunk - log completion
                    // Removed debug log for Kimi response completed to reduce console output
                    // logger.log("Kimi response completed at event offset:", data.eventOffset);
                } else if (data.text) {
                    // Handle test format and simple text format
                    fullText += data.text;
                    // Removed debug log for Kimi appended text from data.text to reduce console output
                    // logger.log("Kimi appended text from data.text:", data.text);
                } else if (data.event === 'cmpl' && data.text) {
                    // Handle another possible format
                    fullText += data.text;
                    // Removed debug log for Kimi appended text from cmpl event to reduce console output
                    // logger.log("Kimi appended text from cmpl event:", data.text);
                } else {
                    // Other chunk types
                    // Removed debug log for Kimi received other chunk type to reduce console output
                    // logger.log("Kimi received other chunk type:", data);
                }
            } else {
                // Handle old format
                if (data.event === 'cmpl' && data.text) {
                    fullText += data.text;
                }
            }
        } catch (e) {
            logger.warn("Could not parse Kimi SSE JSON data:", jsonData);
        }
    }
    
    // Filter out non-Unicode characters
    const filteredText = fullText.replace(/[^\x09\x0A\x0D\x20-\uFFFF]/g, '');
    // Removed debug log for Kimi filtered response text to reduce console output
    // logger.log("Kimi filtered response text:", filteredText);
    
    const conversationId = currentConversationId;
    
    // Construct the URL from the conversation ID
    const url = conversationId ? `https://www.kimi.com/chat/${conversationId}` : null;

    return { text: filteredText, id: conversationId, url };
}

export async function parseResponse(response, logger) {
    // Log the response details if available
    const responseDetails = {};
    if ('status' in response) responseDetails.status = response.status;
    if ('statusText' in response) responseDetails.statusText = response.statusText;
    if (response.headers && typeof response.headers.entries === 'function') {
        responseDetails.headers = Object.fromEntries(response.headers.entries());
    }
    logger.log("Kimi response details:", responseDetails);
    
    // Instead of waiting for the entire response, we'll process it as a stream
    // This allows for real-time updates without blocking
    const reader = response.body.getReader();
    
    // Try to use TextDecoder if available, otherwise fall back to simple decoding
    let decoder;
    try {
        decoder = new TextDecoder('utf-8');
    } catch (e) {
        // Fallback decoder for environments where TextDecoder is not available
        decoder = {
            decode: (value, options) => {
                // Simple UTF-8 decoding fallback
                if (typeof Buffer !== 'undefined') {
                    return Buffer.from(value).toString('utf8');
                }
                // Manual UTF-8 decoding as a last resort
                const bytes = new Uint8Array(value);
                let result = '';
                for (let i = 0; i < bytes.length; i++) {
                    const byte = bytes[i];
                    if (byte < 0x80) {
                        result += String.fromCharCode(byte);
                    } else if (byte < 0xE0) {
                        const nextByte = bytes[++i];
                        result += String.fromCharCode(((byte & 0x1F) << 6) | (nextByte & 0x3F));
                    } else if (byte < 0xF0) {
                        const nextByte1 = bytes[++i];
                        const nextByte2 = bytes[++i];
                        result += String.fromCharCode(((byte & 0x0F) << 12) | ((nextByte1 & 0x3F) << 6) | (nextByte2 & 0x3F));
                    } else {
                        const nextByte1 = bytes[++i];
                        const nextByte2 = bytes[++i];
                        const nextByte3 = bytes[++i];
                        let codePoint = ((byte & 0x07) << 18) | ((nextByte1 & 0x3F) << 12) | ((nextByte2 & 0x3F) << 6) | (nextByte3 & 0x3F);
                        codePoint -= 0x10000;
                        result += String.fromCharCode((codePoint >> 10) | 0xD800, (codePoint & 0x3FF) | 0xDC00);
                    }
                }
                return result;
            }
        };
    }
    
    let fullSSEStream = '';
    let result = { text: '', id: null, url: null };
    let lastProcessedLength = 0;
    
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                logger.log("Kimi response stream completed");
                break;
            }
            
            // Log chunk read
            logger.log("Kimi reading response chunk, byte length:", value.byteLength);
            
            // Log the raw chunk data
            logger.log("Kimi response chunk (raw):", value);
            
            // Decode the chunk and add it to our SSE stream
            const chunk = decoder.decode(value, { stream: true });
            logger.log("Kimi response chunk (decoded):", chunk);
            
            fullSSEStream += chunk;
            logger.log("Kimi accumulated stream length:", fullSSEStream.length);
            
            // Only process if we have new data
            if (fullSSEStream.length > lastProcessedLength) {
                logger.log("Kimi processing new data in stream");
                // Process the current stream to get the latest state
                result = processSSEStream(fullSSEStream, logger);
                logger.log("Kimi processed result:", result);
                lastProcessedLength = fullSSEStream.length;
            }
            
            // Log after processing chunk
            logger.log("Kimi finished processing chunk, accumulated stream length:", fullSSEStream.length);
        }
        
        // Final processing
        result = processSSEStream(fullSSEStream, logger);
        // Reset conversation ID for the next request
        currentConversationId = null;
        return result;
    } catch (error) {
        logger.error("Error reading response stream:", error);
        // Fallback to the original method if streaming fails
        try {
            const sseStream = await response.clone().text();
            const result = processSSEStream(sseStream, logger);
            // Reset conversation ID for the next request
            currentConversationId = null;
            return result;
        } catch (fallbackError) {
            logger.error("Error in fallback method:", fallbackError);
            // Reset conversation ID for the next request
            currentConversationId = null;
            return { text: '', id: null, url: null };
        }
    } finally {
        reader.releaseLock();
    }
}
