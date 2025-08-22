/**
 * Platform Logic for DeepSeek
 */

export const config = {
    name: 'DeepSeek',
    apiEndpoint: '/api/v0/chat/completion',
};

let currentSessionId = null;

export async function parseRequest(request, logger) {
    try {
        const requestBody = await (typeof request.clone === 'function' ? request.clone().json() : request.json());
        if (requestBody.prompt) {
            currentSessionId = requestBody.chat_session_id;
            return requestBody.prompt;
        }
    } catch (e) {
        logger.error("Error parsing request:", e);
    }
    return '';
}

export async function parseResponse(response, logger) {
    const sseStream = await response.clone().text();
    // Removed debug log for raw SSE stream to reduce console output
    // logger.log("Raw SSE Stream:", sseStream);
    const messages = sseStream.split('\n\n').filter(Boolean);
    let fullText = '';
    let startCapturing = false;

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

        try {
            const data = JSON.parse(dataString);
            // Removed debug log for parsed SSE data to reduce console output
            // logger.log("Parsed SSE data:", data);

            if (data.p === 'response/content' && data.o === 'APPEND') {
                startCapturing = true;
            }

            if (startCapturing) {
                if  (data.v && typeof data.v === 'string') {
                    fullText += data.v;
                }
            }
        } catch (e) {
            logger.warn("Could not parse SSE data chunk:", dataString);
        }
    }
    
    // logger.log("Final reconstructed response:", fullText);
    // Removed debug log for final reconstructed response to reduce console output
    const sessionId = currentSessionId;
    currentSessionId = null; // Reset for the next request
    return { text: fullText, id: sessionId };
}