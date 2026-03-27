function createOpenAIId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeOpenAIContent(content) {
    if (content === null || content === undefined) {
        return '';
    }

    if (typeof content === 'string') {
        return content;
    }

    if (Array.isArray(content)) {
        const textParts = content
            .map(part => {
                if (typeof part === 'string') return part;
                if (part?.type === 'text') return part.text || '';
                if (part?.type === 'input_text') return part.text || '';
                return '';
            })
            .filter(Boolean);
        return textParts.join('\n');
    }

    return String(content);
}

function convertOpenAIMessageToAnthropic(message) {
    const role = message?.role || 'user';

    if (role === 'system') {
        return null;
    }

    if (role === 'assistant' && Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) {
        const content = [];
        const text = normalizeOpenAIContent(message.content);
        if (text) {
            content.push({ type: 'text', text });
        }

        for (const toolCall of message.tool_calls) {
            let input = {};
            const rawArgs = toolCall?.function?.arguments;
            if (typeof rawArgs === 'string' && rawArgs.trim()) {
                try {
                    input = JSON.parse(rawArgs);
                } catch {
                    input = { raw: rawArgs };
                }
            }

            content.push({
                type: 'tool_use',
                id: toolCall.id || createOpenAIId('call'),
                name: toolCall?.function?.name || 'tool',
                input
            });
        }

        return {
            role: 'assistant',
            content: content.length > 0 ? content : [{ type: 'text', text: '' }]
        };
    }

    if (role === 'tool') {
        return {
            role: 'user',
            content: [{
                type: 'tool_result',
                tool_use_id: message.tool_call_id || createOpenAIId('tool'),
                content: normalizeOpenAIContent(message.content)
            }]
        };
    }

    return {
        role,
        content: normalizeOpenAIContent(message.content)
    };
}

function convertOpenAIRequestToAnthropic(body = {}) {
    const inputMessages = Array.isArray(body.messages) ? body.messages : [];
    const systemMessages = inputMessages
        .filter(message => message?.role === 'system')
        .map(message => normalizeOpenAIContent(message.content))
        .filter(Boolean);

    const messages = inputMessages
        .map(convertOpenAIMessageToAnthropic)
        .filter(Boolean);

    const anthropicRequest = {
        model: body.model,
        messages,
        stream: !!body.stream,
        temperature: body.temperature,
        top_p: body.top_p,
        stop_sequences: Array.isArray(body.stop) ? body.stop : (body.stop ? [body.stop] : undefined)
    };

    if (typeof body.max_completion_tokens === 'number') {
        anthropicRequest.max_tokens = body.max_completion_tokens;
    } else if (typeof body.max_tokens === 'number') {
        anthropicRequest.max_tokens = body.max_tokens;
    }

    if (systemMessages.length > 0) {
        anthropicRequest.system = systemMessages.join('\n\n');
    }

    if (Array.isArray(body.tools) && body.tools.length > 0) {
        anthropicRequest.tools = body.tools
            .filter(tool => tool?.type === 'function' && tool.function?.name)
            .map(tool => ({
                name: tool.function.name,
                description: tool.function.description || '',
                input_schema: tool.function.parameters || { type: 'object' }
            }));
    }

    if (body.tool_choice) {
        if (typeof body.tool_choice === 'string') {
            anthropicRequest.tool_choice = body.tool_choice;
        } else if (body.tool_choice.type === 'function' && body.tool_choice.function?.name) {
            anthropicRequest.tool_choice = {
                type: 'tool',
                name: body.tool_choice.function.name
            };
        } else if (body.tool_choice.type) {
            anthropicRequest.tool_choice = body.tool_choice.type;
        }
    }

    return anthropicRequest;
}

function mapAnthropicStopReasonToOpenAI(stopReason) {
    if (stopReason === 'tool_use') return 'tool_calls';
    if (stopReason === 'max_tokens') return 'length';
    return 'stop';
}

function convertAnthropicToOpenAIResponse(response, actualModel) {
    const contentBlocks = Array.isArray(response.content) ? response.content : [];
    const textContent = contentBlocks
        .filter(block => block?.type === 'text')
        .map(block => block.text || '')
        .join('');
    const toolCalls = contentBlocks
        .filter(block => block?.type === 'tool_use')
        .map(block => ({
            id: block.id || createOpenAIId('call'),
            type: 'function',
            function: {
                name: block.name,
                arguments: JSON.stringify(block.input || {})
            }
        }));

    return {
        id: createOpenAIId('chatcmpl'),
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: actualModel || response.model,
        choices: [{
            index: 0,
            message: {
                role: 'assistant',
                content: textContent || null,
                ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
            },
            finish_reason: mapAnthropicStopReasonToOpenAI(response.stop_reason)
        }],
        usage: {
            prompt_tokens: response.usage?.input_tokens || 0,
            completion_tokens: response.usage?.output_tokens || 0,
            total_tokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
        }
    };
}

function streamChunkEnvelope(responseId, responseModel, choices) {
    return {
        id: responseId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: responseModel,
        choices
    };
}

async function streamAnthropicEventsToOpenAI(res, generator, responseModel) {
    const firstResult = await generator.next();
    const responseId = createOpenAIId('chatcmpl');
    let finishReason = null;
    let sawAssistantRole = false;
    const toolCallIndices = new Map();

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const writeChunk = (chunk) => {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        if (res.flush) res.flush();
    };

    const emitEvent = (event) => {
        if (event.type === 'message_start' && !sawAssistantRole) {
            sawAssistantRole = true;
            writeChunk(streamChunkEnvelope(responseId, responseModel, [
                { index: 0, delta: { role: 'assistant' }, finish_reason: null }
            ]));
            return;
        }

        if (event.type === 'content_block_delta') {
            if (event.delta?.type === 'text_delta' && event.delta.text) {
                writeChunk(streamChunkEnvelope(responseId, responseModel, [
                    { index: 0, delta: { content: event.delta.text }, finish_reason: null }
                ]));
            }
            if (event.delta?.type === 'input_json_delta' && typeof event.index === 'number') {
                const toolIndex = toolCallIndices.get(event.index);
                if (toolIndex !== undefined) {
                    writeChunk(streamChunkEnvelope(responseId, responseModel, [{
                        index: 0,
                        delta: {
                            tool_calls: [{
                                index: toolIndex,
                                function: {
                                    arguments: event.delta.partial_json || ''
                                }
                            }]
                        },
                        finish_reason: null
                    }]));
                }
            }
            return;
        }

        if (event.type === 'content_block_start') {
            if (event.content_block?.type === 'tool_use' && typeof event.index === 'number') {
                const toolIndex = toolCallIndices.size;
                toolCallIndices.set(event.index, toolIndex);
                writeChunk(streamChunkEnvelope(responseId, responseModel, [{
                    index: 0,
                    delta: {
                        tool_calls: [{
                            index: toolIndex,
                            id: event.content_block.id || createOpenAIId('call'),
                            type: 'function',
                            function: {
                                name: event.content_block.name || 'tool',
                                arguments: ''
                            }
                        }]
                    },
                    finish_reason: null
                }]));
            }
            return;
        }

        if (event.type === 'message_delta') {
            finishReason = mapAnthropicStopReasonToOpenAI(event.delta?.stop_reason);
            return;
        }

        if (event.type === 'message_stop') {
            writeChunk(streamChunkEnvelope(responseId, responseModel, [
                { index: 0, delta: {}, finish_reason: finishReason || 'stop' }
            ]));
        }
    };

    if (!firstResult.done) {
        emitEvent(firstResult.value);
    }

    for await (const event of generator) {
        emitEvent(event);
    }

    res.write('data: [DONE]\n\n');
    res.end();
}

export {
    createOpenAIId,
    normalizeOpenAIContent,
    convertOpenAIRequestToAnthropic,
    mapAnthropicStopReasonToOpenAI,
    convertAnthropicToOpenAIResponse,
    streamAnthropicEventsToOpenAI
};
