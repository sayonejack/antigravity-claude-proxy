window.Components = window.Components || {};

window.Components.chatPlayground = () => ({
    models: [],
    selectedModel: '',
    systemPrompt: '',
    userInput: '',
    maxTokens: 2048,
    temperature: '',
    sending: false,
    sessions: [],
    activeSessionId: null,

    init() {
        this.models = this.normalizeModels(Alpine.store('data').models || []);
        this.pickDefaultModel();
        this.startNewChat();

        this.$watch('$store.data.models', (models) => {
            this.models = this.normalizeModels(models || []);
            this.pickDefaultModel();
        });
    },

    normalizeModels(models) {
        return (models || [])
            .map((model) => {
                if (typeof model === 'string') {
                    return { id: model, description: model };
                }
                if (model && typeof model === 'object' && typeof model.id === 'string') {
                    return {
                        id: model.id,
                        description: model.description || model.id
                    };
                }
                return null;
            })
            .filter(Boolean);
    },

    pickDefaultModel() {
        if (this.selectedModel) return;
        const candidates = (this.models || []).map(m => m.id).filter(Boolean);
        this.selectedModel = candidates.find(id => id.includes('claude-sonnet')) ||
            candidates.find(id => id.includes('claude')) ||
            candidates.find(id => id.includes('gemini')) ||
            candidates[0] ||
            'claude-sonnet-4-6-thinking';
    },

    get activeSession() {
        return this.sessions.find(session => session.id === this.activeSessionId) || null;
    },

    get messages() {
        return this.activeSession?.messages || [];
    },

    startNewChat() {
        const id = `chat_${Date.now()}`;
        const session = {
            id,
            title: `New chat ${this.sessions.length + 1}`,
            createdAt: Date.now(),
            messages: [
                {
                    role: 'assistant',
                    text: 'Chat playground is ready. Pick a model and send a message.'
                }
            ]
        };
        this.sessions.unshift(session);
        this.activeSessionId = id;
        this.userInput = '';
    },

    selectSession(id) {
        this.activeSessionId = id;
    },

    clearChat() {
        if (!this.activeSession) return;
        this.activeSession.messages = [];
        this.userInput = '';
    },

    toAnthropicMessages() {
        return (this.activeSession?.messages || [])
            .filter(msg => msg.role === 'user' || msg.role === 'assistant')
            .map(msg => ({
                role: msg.role,
                content: msg.text
            }));
    },

    pushMessage(message) {
        if (!this.activeSession) {
            this.startNewChat();
        }
        this.activeSession.messages.push(message);
        if (message.role === 'user' && this.activeSession.title.startsWith('New chat')) {
            this.activeSession.title = message.text.slice(0, 28) || this.activeSession.title;
        }
    },

    extractAssistantText(response) {
        const blocks = response?.content;
        if (!Array.isArray(blocks)) return '';
        const rendered = blocks
            .map((block) => {
                if (block?.type === 'text' && typeof block?.text === 'string') {
                    return block.text;
                }
                if (block?.type === 'thinking' && typeof block?.thinking === 'string') {
                    return `[thinking]\n${block.thinking}`;
                }
                if (block?.type === 'tool_use') {
                    return `[tool_use] ${block.name || 'tool'} ${JSON.stringify(block.input || {})}`;
                }
                if (block?.type === 'tool_result') {
                    return `[tool_result] ${typeof block.content === 'string' ? block.content : JSON.stringify(block.content || {})}`;
                }
                return '';
            })
            .filter(Boolean)
            .join('\n\n');
        return rendered;
    },

    async sendMessage() {
        const content = this.userInput.trim();
        if (!content || this.sending) return;

        this.pickDefaultModel();
        this.pushMessage({ role: 'user', text: content });
        this.userInput = '';
        this.sending = true;

        const password = Alpine.store('global').webuiPassword;

        try {
            const payload = {
                model: this.selectedModel,
                system: this.systemPrompt.trim() || undefined,
                messages: this.toAnthropicMessages(),
                max_tokens: Number(this.maxTokens) || 2048,
                temperature: this.temperature === '' ? undefined : Number(this.temperature)
            };

            const { response, newPassword } = await window.utils.request('/api/chat/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }, password);

            if (newPassword) Alpine.store('global').webuiPassword = newPassword;
            const data = await response.json();
            if (!response.ok || data.status !== 'ok') {
                throw new Error(data.error || `HTTP ${response.status}`);
            }

            const text = this.extractAssistantText(data.response) || '(empty response)';
            this.pushMessage({ role: 'assistant', text });
        } catch (error) {
            this.pushMessage({ role: 'assistant', text: `Error: ${error.message}` });
            Alpine.store('global').showToast(`Chat failed: ${error.message}`, 'error');
        } finally {
            this.sending = false;
        }
    }
});
