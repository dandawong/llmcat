/**
 * Platform Logic for Doubao (豆包)
 */

export const config = {
    name: 'Doubao',
    apiEndpoint: '/samantha/chat/completion',
    duplicateWindow: 30000 // 30 seconds
};

/**
 * Generate conversation title from user prompt
 * @param {string} prompt - The user's prompt text
 * @returns {string} - Generated title
 */
export function generateTitle(prompt) {
    try {
        // Handle empty or missing prompts
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            return 'Doubao Conversation';
        }

        // Sanitize and normalize the prompt
        let title = prompt.trim();
        
        // Remove excessive whitespace and normalize line breaks
        title = title.replace(/\s+/g, ' ');
        
        // Remove potentially dangerous HTML/script tags but keep normal punctuation
        title = title.replace(/<[^>]*>/g, ''); // Remove HTML tags
        title = title.replace(/[<>]/g, ''); // Remove remaining angle brackets
        
        // Truncate to 50 characters if longer
        if (title.length > 50) {
            title = title.substring(0, 50).trim();
            // Ensure we don't cut off in the middle of a word
            const lastSpaceIndex = title.lastIndexOf(' ');
            if (lastSpaceIndex > 30) { // Only trim at word boundary if it's not too short
                title = title.substring(0, lastSpaceIndex);
            }
            title += '...';
        }

        // Final validation - ensure we have a meaningful title
        if (title.length < 3) {
            return 'Doubao Conversation';
        }

        return title;
    } catch (error) {
        // Fallback to default title on any error
        return 'Doubao Conversation';
    }
}

export async function parseRequest(request, logger) {
    try {
        logger.log("Starting Doubao request parsing");
        
        // Clone and parse request body with error handling
        let requestBody;
        try {
            requestBody = await request.clone().json();
            logger.log("Successfully parsed request JSON, body structure:", {
                hasMessages: !!requestBody.messages,
                messagesLength: requestBody.messages ? requestBody.messages.length : 0,
                messageTypes: requestBody.messages ? requestBody.messages.map(m => typeof m) : []
            });
        } catch (jsonError) {
            logger.error("Failed to parse request as JSON:", {
                error: jsonError.message,
                stack: jsonError.stack,
                requestUrl: request.url,
                contentType: request.headers.get('content-type')
            });
            return '';
        }

        // Validate request structure
        if (!requestBody || typeof requestBody !== 'object') {
            logger.warn("Request body is not a valid object:", {
                bodyType: typeof requestBody,
                bodyValue: requestBody
            });
            return '';
        }

        // Extract user prompt from messages array
        if (!requestBody.messages) {
            logger.warn("Request body missing 'messages' property:", {
                availableKeys: Object.keys(requestBody)
            });
            return '';
        }

        if (!Array.isArray(requestBody.messages)) {
            logger.warn("Request 'messages' property is not an array:", {
                messagesType: typeof requestBody.messages,
                messagesValue: requestBody.messages
            });
            return '';
        }

        if (requestBody.messages.length === 0) {
            logger.warn("Request 'messages' array is empty");
            return '';
        }

        const userMessage = requestBody.messages[0];
        logger.log("Processing first message:", {
            messageType: typeof userMessage,
            hasContent: !!userMessage.content,
            contentType: typeof userMessage.content
        });

        // Handle the nested JSON structure: messages[0].content contains JSON string
        if (!userMessage.content) {
            logger.warn("User message missing 'content' property:", {
                messageKeys: Object.keys(userMessage)
            });
            return '';
        }

        try {
            // Parse the content field which contains JSON string with text property
            const contentData = JSON.parse(userMessage.content);
            logger.log("Successfully parsed message content JSON:", {
                hasText: !!contentData.text,
                textType: typeof contentData.text,
                contentKeys: Object.keys(contentData)
            });

            if (contentData.text && typeof contentData.text === 'string') {
                logger.log("Successfully extracted user prompt:", {
                    promptLength: contentData.text.length,
                    promptPreview: contentData.text.substring(0, 100) + (contentData.text.length > 100 ? '...' : '')
                });
                return contentData.text;
            } else {
                logger.warn("Content data missing valid text property:", {
                    textValue: contentData.text,
                    textType: typeof contentData.text
                });
            }
        } catch (contentParseError) {
            logger.warn("Failed to parse message content as JSON:", {
                error: contentParseError.message,
                stack: contentParseError.stack,
                contentValue: userMessage.content,
                contentType: typeof userMessage.content,
                contentLength: userMessage.content ? userMessage.content.length : 0
            });
            
            // Fallback: if content is already a string, return it directly
            if (typeof userMessage.content === 'string') {
                logger.log("Using content as fallback string:", {
                    contentLength: userMessage.content.length,
                    contentPreview: userMessage.content.substring(0, 100) + (userMessage.content.length > 100 ? '...' : '')
                });
                return userMessage.content;
            }
        }

        logger.warn("Could not extract user prompt from request - all parsing attempts failed");
        return '';
    } catch (error) {
        logger.error("Unexpected error parsing Doubao request:", {
            error: error.message,
            stack: error.stack,
            requestUrl: request ? request.url : 'unknown',
            requestMethod: request ? request.method : 'unknown'
        });
        return '';
    }
}

export async function parseResponse(response, logger) {
    try {
        logger.log("Starting Doubao response parsing");
        
        // Clone and extract response text with error handling
        let responseText;
        try {
            responseText = await response.clone().text();
            logger.log("Successfully extracted response text:", {
                textLength: responseText.length,
                contentType: response.headers.get('content-type'),
                status: response.status,
                statusText: response.statusText
            });
        } catch (textError) {
            logger.error("Failed to extract response text:", {
                error: textError.message,
                stack: textError.stack,
                responseUrl: response.url,
                responseStatus: response.status
            });
            return { 
                text: '', 
                id: null, 
                messageId: null,
                localConversationId: null,
                localMessageId: null,
                isComplete: false
            };
        }

        // Validate response text
        if (!responseText || typeof responseText !== 'string') {
            logger.warn("Invalid response text:", {
                textType: typeof responseText,
                textValue: responseText
            });
            return { 
                text: '', 
                id: null, 
                messageId: null,
                localConversationId: null,
                localMessageId: null,
                isComplete: false
            };
        }

        // Parse Server-Sent Events stream
        const events = responseText.split('\n\n').filter(Boolean);
        logger.log("Split SSE stream into events:", {
            totalEvents: events.length,
            firstEventPreview: events[0] ? events[0].substring(0, 200) + '...' : 'none'
        });

        let fullText = '';
        let conversationId = null;
        let messageId = null;
        let localConversationId = null;
        let localMessageId = null;
        let isComplete = false;
        let processedEvents = 0;
        let skippedEvents = 0;
        let errorEvents = 0;

        for (let i = 0; i < events.length; i++) {
            const eventBlock = events[i];
            logger.log(`Processing SSE event ${i + 1}/${events.length}:`, {
                eventLength: eventBlock.length,
                eventPreview: eventBlock.substring(0, 100) + (eventBlock.length > 100 ? '...' : '')
            });

            try {
                const lines = eventBlock.split('\n');
                let dataLine = lines.find(line => line.startsWith('data:'));

                if (!dataLine) {
                    logger.log(`Event ${i + 1} has no data line, skipping:`, {
                        availableLines: lines.map(line => line.substring(0, 50) + (line.length > 50 ? '...' : ''))
                    });
                    skippedEvents++;
                    continue;
                }

                const dataString = dataLine.substring(5).trim();

                // Skip empty data lines
                if (!dataString) {
                    logger.log(`Event ${i + 1} has empty data line, skipping`);
                    skippedEvents++;
                    continue;
                }

                // Parse event data JSON
                let eventData;
                try {
                    eventData = JSON.parse(dataString);
                    logger.log(`Event ${i + 1} parsed successfully:`, {
                        eventType: eventData.event_type,
                        hasEventData: !!eventData.event_data,
                        eventId: eventData.event_id
                    });
                } catch (eventJsonError) {
                    logger.warn(`Failed to parse event ${i + 1} JSON, skipping:`, {
                        error: eventJsonError.message,
                        dataString: dataString.substring(0, 200) + (dataString.length > 200 ? '...' : ''),
                        dataLength: dataString.length
                    });
                    errorEvents++;
                    continue;
                }

                // Filter to process only message events (type 2001)
                if (eventData.event_type !== 2001) {
                    logger.log(`Event ${i + 1} is not a message event (type ${eventData.event_type}), skipping`);
                    skippedEvents++;
                    continue;
                }

                if (!eventData.event_data) {
                    logger.warn(`Event ${i + 1} missing event_data property:`, {
                        availableKeys: Object.keys(eventData)
                    });
                    skippedEvents++;
                    continue;
                }

                // Parse nested event_data JSON
                let messageData;
                try {
                    messageData = JSON.parse(eventData.event_data);
                    logger.log(`Event ${i + 1} message data parsed:`, {
                        hasMessage: !!messageData.message,
                        isDelta: messageData.is_delta,
                        isFinish: messageData.is_finish,
                        status: messageData.status,
                        conversationId: messageData.conversation_id,
                        messageId: messageData.message_id
                    });
                } catch (messageJsonError) {
                    logger.warn(`Failed to parse event ${i + 1} message data JSON, skipping:`, {
                        error: messageJsonError.message,
                        eventData: eventData.event_data.substring(0, 200) + (eventData.event_data.length > 200 ? '...' : ''),
                        eventDataLength: eventData.event_data.length
                    });
                    errorEvents++;
                    continue;
                }

                // Extract conversation and message IDs for duplicate detection
                if (messageData.conversation_id) {
                    conversationId = messageData.conversation_id;
                    logger.log(`Event ${i + 1} updated conversation ID:`, conversationId);
                }
                if (messageData.message_id) {
                    messageId = messageData.message_id;
                    logger.log(`Event ${i + 1} updated message ID:`, messageId);
                }
                if (messageData.local_conversation_id) {
                    localConversationId = messageData.local_conversation_id;
                    logger.log(`Event ${i + 1} updated local conversation ID:`, localConversationId);
                }
                if (messageData.local_message_id) {
                    localMessageId = messageData.local_message_id;
                    logger.log(`Event ${i + 1} updated local message ID:`, localMessageId);
                }

                // Handle delta response reconstruction
                if (messageData.message && messageData.message.content) {
                    try {
                        const contentData = JSON.parse(messageData.message.content);
                        logger.log(`Event ${i + 1} content data parsed:`, {
                            hasText: !!contentData.text,
                            textType: typeof contentData.text,
                            textLength: contentData.text ? contentData.text.length : 0
                        });
                        
                        // Check if this is a delta update
                        if (messageData.is_delta === true && contentData.text && typeof contentData.text === 'string') {
                            // Concatenate delta text content to build complete response
                            const previousLength = fullText.length;
                            fullText += contentData.text;
                            logger.log(`Event ${i + 1} added delta text chunk:`, {
                                chunkLength: contentData.text.length,
                                chunkPreview: contentData.text.substring(0, 50) + (contentData.text.length > 50 ? '...' : ''),
                                previousTotalLength: previousLength,
                                newTotalLength: fullText.length
                            });
                        } else if (messageData.is_delta === false && contentData.text && typeof contentData.text === 'string') {
                            // Non-delta content, use as complete text
                            fullText = contentData.text;
                            logger.log(`Event ${i + 1} set complete text content:`, {
                                textLength: contentData.text.length,
                                textPreview: contentData.text.substring(0, 100) + (contentData.text.length > 100 ? '...' : '')
                            });
                        } else {
                            logger.log(`Event ${i + 1} content not processed:`, {
                                isDelta: messageData.is_delta,
                                hasText: !!contentData.text,
                                textType: typeof contentData.text
                            });
                        }
                    } catch (contentParseError) {
                        logger.warn(`Event ${i + 1} failed to parse message content JSON:`, {
                            error: contentParseError.message,
                            stack: contentParseError.stack,
                            contentValue: messageData.message.content.substring(0, 200) + (messageData.message.content.length > 200 ? '...' : ''),
                            contentLength: messageData.message.content.length
                        });
                        errorEvents++;
                    }
                } else {
                    logger.log(`Event ${i + 1} missing message content:`, {
                        hasMessage: !!messageData.message,
                        messageKeys: messageData.message ? Object.keys(messageData.message) : []
                    });
                }

                // Check completion flags to determine when response is complete
                if (messageData.is_finish === true) {
                    logger.log(`Event ${i + 1} indicates response completion (is_finish=true)`);
                    isComplete = true;
                    break;
                }

                // Additional completion check for status
                if (messageData.status && messageData.status === 200) {
                    logger.log(`Event ${i + 1} has status 200, response may be complete`);
                }

                processedEvents++;

            } catch (eventProcessingError) {
                logger.error(`Unexpected error processing event ${i + 1}, skipping:`, {
                    error: eventProcessingError.message,
                    stack: eventProcessingError.stack,
                    eventBlock: eventBlock.substring(0, 200) + (eventBlock.length > 200 ? '...' : '')
                });
                errorEvents++;
                continue;
            }
        }

        logger.log("SSE stream processing complete:", {
            totalEvents: events.length,
            processedEvents: processedEvents,
            skippedEvents: skippedEvents,
            errorEvents: errorEvents,
            finalTextLength: fullText.length,
            isComplete: isComplete,
            conversationId: conversationId,
            messageId: messageId,
            localConversationId: localConversationId,
            localMessageId: localMessageId
        });

        logger.log("Final response text preview:", {
            textLength: fullText.length,
            textPreview: fullText.substring(0, 200) + (fullText.length > 200 ? '...' : '')
        });

        return {
            text: fullText,
            id: conversationId,
            messageId: messageId,
            localConversationId: localConversationId,
            localMessageId: localMessageId,
            isComplete: isComplete
        };
    } catch (error) {
        logger.error("Unexpected error parsing Doubao response:", {
            error: error.message,
            stack: error.stack,
            responseUrl: response ? response.url : 'unknown',
            responseStatus: response ? response.status : 'unknown',
            responseStatusText: response ? response.statusText : 'unknown'
        });
        return { 
            text: '', 
            id: null, 
            messageId: null,
            localConversationId: null,
            localMessageId: null,
            isComplete: false
        };
    }
}