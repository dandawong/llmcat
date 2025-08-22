/**
 * Platform Logic for Gemini
 */

export const config = {
    name: 'Gemini',
    apiEndpoint: '/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate',
};

export async function parseRequest(request, logger) {
    // Removed debug log for starting to parse Gemini request to reduce console output
    // logger.log("Starting to parse Gemini request...", { timestamp: new Date().toISOString() });
    try {
        const formData = await request.clone().formData();
        const f_req_str = formData.get('f.req');
        if (f_req_str) {
            // Removed debug log for found f.req string to reduce console output
            // logger.log("Found f.req string.", { length: f_req_str.length, preview: f_req_str.substring(0, 100) });
            // First parse of the f.req string
            const f_req = JSON.parse(f_req_str);

            // The prompt is in a double-encoded JSON string in the second element
            if (Array.isArray(f_req) && typeof f_req[1] === 'string') {
                const prompt_data_str = f_req[1];
                // Second parse
                const prompt_data = JSON.parse(prompt_data_str);

                if (Array.isArray(prompt_data) && Array.isArray(prompt_data[0]) && typeof prompt_data[0][0] === 'string') {
                    const prompt = prompt_data[0][0];
                    // Removed debug log for extracted Gemini prompt to reduce console output
                    // logger.log("Extracted Gemini prompt:", { prompt, length: prompt.length });
                    return prompt;
                }
            }
        }
    } catch (e) {
        logger.error("Error parsing Gemini request:", e);
    }
    // logger.log("Could not extract Gemini prompt.");
    // Removed debug log for could not extract Gemini prompt to reduce console output
    return '';
}

export async function parseResponse(response, logger) {
    // Removed debug log for starting to parse Gemini response to reduce console output
    // logger.log("Starting to parse Gemini response...", { timestamp: new Date().toISOString() });
    try {
        const rawText = await response.clone().text();
        // Removed debug log for raw Gemini response text received to reduce console output
        // logger.log("Raw Gemini response text received.", { length: rawText.length, preview: rawText.substring(0, 200) });

        // The response is a stream of JSON arrays, sometimes prefixed with numbers or ")]}'".
        // We need to find the JSON that contains the conversation data.
        const lines = rawText.split('\n');
        let fullText = '';
        let conversationId = '';

        for (const line of lines) {
            if (!line.startsWith('[[')) continue; // Skip non-JSON lines

            try {
                const data = JSON.parse(line);
                // Removed debug log for parsed a line of JSON data to reduce console output
                // logger.log("Parsed a line of JSON data.", data);

                // Check if this line contains the main response content
                const wrbFr = data.find(item => item[0] === 'wrb.fr');
                if (wrbFr) {
                    const payloadStr = wrbFr[2];
                    if (payloadStr) {
                        const payload = JSON.parse(payloadStr);
                        // Removed debug log for parsed wrb.fr payload to reduce console output
                        // logger.log("Parsed wrb.fr payload.", payload);

                        // Extract Conversation ID from the second element
                        if (Array.isArray(payload[1]) && payload[1].length > 0 && typeof payload[1][0] === 'string' && payload[1][0].startsWith('c_')) {
                            conversationId = payload[1][0].substring(2); // Remove "c_" prefix
                            // Removed debug log for found Conversation ID to reduce console output
                            // logger.log("Found Conversation ID:", conversationId);
                        }

                        // Extract the main text content from the fifth element
                        if (Array.isArray(payload[4]) && payload[4].length > 0) {
                            const contentArray = payload[4][0];
                            if (Array.isArray(contentArray) && contentArray.length > 1) {
                                // The text is usually the second element in this nested array
                                fullText = contentArray[1][0];
                                // Removed debug log for found response text to reduce console output
                                // logger.log("Found response text:", fullText);
                            }
                        }
                    }
                }
            } catch (e) {
                // Not all lines are valid JSON, which is expected.
                logger.warn("Could not parse a line.", { line, error: e });
            }
        }

        if (fullText && fullText.trim().length > 0) {
            // Removed debug log for successfully extracted text and ID to reduce console output
            // logger.log("Successfully extracted text and ID.", { fullText, conversationId });
            const url = conversationId ? `${typeof window !== 'undefined' ? window.location.origin : 'https://gemini.google.com'}/app/${conversationId}` : null;
            return { text: fullText, id: conversationId, url };
        } else {
            // Removed debug log for could not find the main response text to reduce console output
            // logger.log("Could not find the main response text in any of the lines.");
            return { text: '', id: null, url: null };
        }

    } catch (e) {
        logger.error("Error parsing Gemini response:", e);
        return { text: '', id: null, url: null };
    }
}
