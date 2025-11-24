// Configuração da API
const API_BASE_URL = window.location.origin;

// Elementos do DOM
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');
const suggestionsContainer = document.getElementById('suggestions-container');

// Estado
let isProcessing = false;

/**
 * Adiciona uma mensagem ao chat
 */
function addMessage(text, type = 'user') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type} max-w-[80%] rounded-lg p-4`;

    if (type === 'user') {
        messageDiv.classList.add('self-end', 'ml-auto');
    } else {
        messageDiv.classList.add('self-start');
    }

    const header = document.createElement('p');
    header.className = 'font-semibold mb-1';
    header.textContent = type === 'user' ? '👤 Você' : '🤖 Assistente IA';

    const content = document.createElement('p');
    content.textContent = text;

    messageDiv.appendChild(header);
    messageDiv.appendChild(content);
    chatMessages.appendChild(messageDiv);

    // Scroll para o final
    scrollToBottom();
}

/**
 * Mostra indicador de digitação
 */
function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typing-indicator';
    typingDiv.className = 'message message-ai max-w-[80%] rounded-lg p-4 self-start';

    typingDiv.innerHTML = `
        <p class="font-semibold mb-1">🤖 Assistente IA</p>
        <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        </div>
    `;

    chatMessages.appendChild(typingDiv);
    scrollToBottom();
}

/**
 * Remove indicador de digitação
 */
function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typing-indicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

/**
 * Scroll automático para o final do chat
 */
function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Envia mensagem para a API
 */
async function sendMessage(message) {
    if (isProcessing || !message.trim()) return;

    isProcessing = true;
    sendButton.disabled = true;
    messageInput.disabled = true;

    // Adicionar mensagem do usuário
    addMessage(message, 'user');
    messageInput.value = '';

    // Mostrar indicador de digitação
    showTypingIndicator();

    // Esconder sugestões após primeira mensagem
    if (suggestionsContainer) {
        suggestionsContainer.style.display = 'none';
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/chat/message`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message })
        });

        const data = await response.json();

        hideTypingIndicator();

        if (data.success) {
            addMessage(data.message, 'ai');

            // Log do SQL gerado (opcional, para debug)
            if (data.sql) {
                console.log('SQL gerado:', data.sql);
            }
        } else {
            addMessage(data.error || 'Erro ao processar sua mensagem', 'error');
        }
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        hideTypingIndicator();
        addMessage('Erro de conexão. Verifique se o servidor está rodando.', 'error');
    } finally {
        isProcessing = false;
        sendButton.disabled = false;
        messageInput.disabled = false;
        messageInput.focus();
    }
}

/**
 * Carrega sugestões de perguntas
 */
async function loadSuggestions() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/chat/suggestions`);
        const data = await response.json();

        if (data.success && data.suggestions) {
            displaySuggestions(data.suggestions);
        }
    } catch (error) {
        console.error('Erro ao carregar sugestões:', error);
        // Mostrar sugestões padrão
        displaySuggestions([
            'Quantos registros existem no total?',
            'Mostre os dados mais recentes',
            'Qual é a distribuição por categoria?'
        ]);
    }
}

/**
 * Exibe sugestões de perguntas
 */
function displaySuggestions(suggestions) {
    suggestionsContainer.innerHTML = '<p class="text-gray-400 text-sm mb-2 w-full">💡 Sugestões de perguntas:</p>';

    suggestions.forEach(suggestion => {
        const button = document.createElement('button');
        button.className = 'suggestion-btn px-4 py-2 rounded-lg text-sm transition-all';
        button.textContent = suggestion;
        button.onclick = () => {
            messageInput.value = suggestion;
            messageInput.focus();
        };
        suggestionsContainer.appendChild(button);
    });
}

/**
 * Verifica saúde da API
 */
async function checkHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/chat/health`);
        const data = await response.json();

        if (data.success) {
            console.log('✅ API está funcionando:', data);
        } else {
            console.warn('⚠️ API com problemas:', data);
        }
    } catch (error) {
        console.error('❌ Erro ao verificar saúde da API:', error);
    }
}

// Event Listeners
chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageInput.value.trim();
    if (message) {
        sendMessage(message);
    }
});

// Permitir envio com Enter
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
    }
});

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Chat IA inicializado');
    checkHealth();
    loadSuggestions();
    messageInput.focus();
});
