/**
 * Admin chatbot widget — communicates with POST /api/agent/chat.
 * Manages a single session per browser tab (sessionId stored in memory).
 */
(function () {
  const CHAT_API = '/api/agent/chat';
  let sessionId = null;
  let isProcessing = false;

  const panel = document.getElementById('chat-panel');
  const messages = document.getElementById('chat-messages');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  const fab = document.getElementById('chat-fab');
  const typing = document.getElementById('chat-typing');

  function togglePanel() {
    const isOpen = panel.classList.toggle('open');
    fab.classList.toggle('active', isOpen);
    if (isOpen) input.focus();
  }

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function appendMessage(text, role) {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + role;
    div.textContent = text;
    messages.insertBefore(div, typing);
    scrollToBottom();
  }

  function setLoading(loading) {
    isProcessing = loading;
    input.disabled = loading;
    sendBtn.disabled = loading;
    typing.classList.toggle('visible', loading);
    if (loading) scrollToBottom();
  }

  async function sendMessage() {
    const text = input.value.trim();
    if (!text || isProcessing) return;

    appendMessage(text, 'user');
    input.value = '';
    setLoading(true);

    try {
      const res = await fetch(CHAT_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: sessionId }),
      });

      const result = await res.json();

      if (!res.ok || !result.success) {
        const errMsg = result.error?.message || 'Something went wrong. Please try again.';
        appendMessage(errMsg, 'error');
      } else {
        sessionId = result.data.sessionId;
        appendMessage(result.data.response, 'assistant');
      }
    } catch (err) {
      appendMessage('Unable to reach the server. Please check your connection.', 'error');
    } finally {
      setLoading(false);
      input.focus();
    }
  }

  fab.addEventListener('click', togglePanel);
  sendBtn.addEventListener('click', sendMessage);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  input.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 80) + 'px';
  });
})();
