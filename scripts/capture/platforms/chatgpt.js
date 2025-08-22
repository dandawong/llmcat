/**
 * Platform Logic for ChatGPT
 */

export const config = {
    name: 'ChatGPT',
    apiEndpoint: '/backend-api/f/conversation',
};

export async function parseRequest(request, logger) {
    try {
        const requestBody = await request.clone().json();
        const userMessage = requestBody.messages?.find(m => m.author.role === 'user');
        if (userMessage && userMessage.content && Array.isArray(userMessage.content.parts)) {
            return userMessage.content.parts.join('\n');
        }
    } catch (e) { 
        logger.error("Error parsing request:", e); 
    }
    return '';
}

export async function parseResponse(response, logger) {
    try {
        const reader = response.clone().body.getReader();
        const decoder = new TextDecoder();
        let sseStream = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            sseStream += decoder.decode(value, { stream: true });
        }
        // Removed debug log for raw SSE stream to reduce console output
        // logger.log("Raw SSE Stream:", sseStream);
        const messages = sseStream.split('\n\n').filter(Boolean);
        let fullText = '';
        let conversationId = null;
        
        for (const messageBlock of messages) {
            const lines = messageBlock.split('\n');
            let dataString = null;
            for (const line of lines) {
                if (line.startsWith('data:')) {
                    dataString = line.substring(5).trim();
                    break; // Found the data line for this block
                }
            }
    
            if (!dataString) continue;
            if (dataString === '[DONE]') break;
    
            try {
                const data = JSON.parse(dataString);
                // Removed debug log for parsed SSE data to reduce console output
                // logger.log("Parsed SSE data:", data);
    
                if (data.conversation_id) {
                    conversationId = data.conversation_id;
                }
    
                let textChunk = null;
    
                // Pattern 1: {"p": "/message/content/parts/0", "o": "append", "v": "text"}
                if (data.p === '/message/content/parts/0' && data.o === 'append' && typeof data.v === 'string') {
                    textChunk = data.v;
                }
                // Pattern 2: {"v": "text"} - As seen in the new logs
                else if (data.v && typeof data.v === 'string' && data.p === undefined && data.o === undefined) {
                    textChunk = data.v;
                }
                // Pattern 3: {"p": "", "o": "patch", "v": [ ... ]}
                else if (data.o === 'patch' && Array.isArray(data.v)) {
                    for (const patch of data.v) {
                        if (patch.p === '/message/content/parts/0' && patch.o === 'append' && typeof patch.v === 'string') {
                            textChunk = (textChunk || '') + patch.v;
                        }
                    }
                }
                // Logic for a complete message object (less common for streaming, but good to have)
                else if (data.message?.author?.role === 'assistant' && data.message?.status === 'finished_successfully') {
                    const parts = data.message.content?.parts;
                    if (Array.isArray(parts) && parts.length > 0) {
                        fullText = parts.join(''); // This is a full message, replace any accumulated text.
                        // Removed debug log for full message object to reduce console output
                        // logger.log("Full message object received, replacing text:", fullText);
                        textChunk = null; // Prevent double counting
                    }
                }
    
                if (textChunk) {
                    fullText += textChunk;
                    // Removed debug log for appended chunk to reduce console output
                    // logger.log(`Appended chunk: "${textChunk}". Current full text: "${fullText}"`);
                }
    
            } catch (e) {
                // It's common for some data chunks not to be JSON (e.g., 'v1'), so we'll warn instead of error.
                logger.warn("Could not parse SSE data chunk or not a relevant message:", dataString);
            }
        }
        
        // logger.log("Final reconstructed response:", fullText);
        // Removed debug log for final reconstructed response to reduce console output
        return { text: fullText, id: conversationId };
    } catch (e) {
        logger.error("Error in parseResponse:", e);
        return { text: '', id: null }; // Return a default object on error
    }
}
