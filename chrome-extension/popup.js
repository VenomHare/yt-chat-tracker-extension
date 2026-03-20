(function() {
  'use strict';

  const state = {
    chatLog: [],
    deletedChats: [],
    currentFilter: 'all',
    searchQuery: '',
    maxDisplay: 200
  };

  const elements = {
    chatList: document.getElementById('chatList'),
    emptyState: document.getElementById('emptyState'),
    totalCount: document.getElementById('totalCount'),
    deletedCount: document.getElementById('deletedCount'),
    searchInput: document.getElementById('searchInput'),
    clearSearch: document.getElementById('clearSearch'),
    clearLog: document.getElementById('clearLog'),
    tabs: document.querySelectorAll('.tab')
  };

  function formatTime(timestamp) {
    const date = new Date(parseInt(timestamp) / 1000);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }

  function highlightText(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    return escaped.replace(regex, '<span class="highlight">$1</span>');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getBadgeClass(badge) {
    const badgeLower = badge.toLowerCase();
    if (badgeLower.includes('owner')) return 'owner';
    if (badgeLower.includes('moderator')) return 'moderator';
    if (badgeLower.includes('member')) return 'member';
    if (badgeLower.includes('new')) return 'new-member';
    return '';
  }

  function getChatType(message) {
    if (message.deleted || message.timedOut) return 'deleted';
    if (message.type === 'membership') return 'membership';
    if (message.type === 'paid') return 'paid';
    return 'text';
  }

  function createChatItem(message) {
    const type = getChatType(message);
    const item = document.createElement('div');
    item.className = `chat-item ${type}`;
    item.dataset.id = message.id;

    const badges = message.badges || [];
    const badgesHtml = badges.length > 0
      ? `<div class="chat-badges">${badges.map(b => `<span class="badge ${getBadgeClass(b)}">${escapeHtml(b)}</span>`).join('')}</div>`
      : '';

    const headerHtml = message.header ? `<div class="chat-content">${highlightText(message.header, state.searchQuery)}</div>` : '';
    const textHtml = message.text ? `<div class="chat-content ${!message.text.trim() ? 'emoji-only' : ''}">${highlightText(message.text, state.searchQuery)}</div>` : '';

    const deletedLabel = (message.deleted || message.timedOut)
      ? `<span class="deleted-label"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>${message.timedOut ? 'Timeout' : 'Deleted'}</span>`
      : '';

    const typeLabels = {
      deleted: 'Deleted',
      membership: 'Member',
      paid: 'Super Chat',
      text: 'Chat'
    };

    item.innerHTML = `
      <div class="chat-header">
        <span class="chat-author">${highlightText(message.author, state.searchQuery)}</span>
        ${badgesHtml}
      </div>
      ${headerHtml}
      ${textHtml}
      <div class="chat-meta">
        <span class="chat-time">${formatTime(message.timestamp)}</span>
        <span class="chat-type ${type}-type">${typeLabels[type]}</span>
        ${deletedLabel}
      </div>
    `;

    return item;
  }

  function renderChats() {
    const filtered = state.chatLog.filter(msg => {
      if (state.currentFilter === 'deleted') {
        return msg.deleted || msg.timedOut;
      }
      return true;
    });

    const searched = filtered.filter(msg => {
      if (!state.searchQuery) return true;
      const query = state.searchQuery.toLowerCase();
      return (
        msg.author.toLowerCase().includes(query) ||
        (msg.text && msg.text.toLowerCase().includes(query)) ||
        (msg.header && msg.header.toLowerCase().includes(query))
      );
    });

    const displayChats = searched.slice(-state.maxDisplay);

    elements.chatList.innerHTML = '';
    elements.emptyState.classList.add('hidden');

    if (displayChats.length === 0) {
      elements.chatList.appendChild(elements.emptyState);
      elements.emptyState.classList.remove('hidden');
      if (state.searchQuery) {
        document.querySelector('.empty-text').textContent = 'No matches found';
        document.querySelector('.empty-subtext').textContent = 'Try a different search term';
      } else if (state.currentFilter === 'deleted') {
        document.querySelector('.empty-text').textContent = 'No deleted chats';
        document.querySelector('.empty-subtext').textContent = 'Deleted messages will appear here';
      } else {
        document.querySelector('.empty-text').textContent = 'No chats yet';
        document.querySelector('.empty-subtext').textContent = 'Watch a YouTube live stream to start tracking';
      }
      return;
    }

    displayChats.forEach((msg, index) => {
      const item = createChatItem(msg);
      item.style.animationDelay = `${Math.min(index * 0.02, 0.3)}s`;
      elements.chatList.appendChild(item);
    });

    elements.chatList.scrollTop = elements.chatList.scrollHeight;
  }

  function updateStats() {
    const total = state.chatLog.length;
    const deleted = state.chatLog.filter(m => m.deleted || m.timedOut).length;
    elements.totalCount.textContent = total;
    elements.deletedCount.textContent = deleted;
  }

  async function fetchData() {
    try {
      const [chatResponse, deletedResponse] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'getChatLog' }),
        chrome.runtime.sendMessage({ type: 'getDeletedChats' })
      ]);

      if (chatResponse && chatResponse.chatLog) {
        state.chatLog = chatResponse.chatLog;
      }
      if (deletedResponse && deletedResponse.deletedChats) {
        state.deletedChats = deletedResponse.deletedChats;
      }

      updateStats();
      renderChats();
    } catch (error) {
      console.error('Failed to fetch chat data:', error);
    }
  }

  function setupEventListeners() {
    elements.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value.trim();
      elements.clearSearch.classList.toggle('visible', state.searchQuery.length > 0);
      renderChats();
    });

    elements.clearSearch.addEventListener('click', () => {
      elements.searchInput.value = '';
      state.searchQuery = '';
      elements.clearSearch.classList.remove('visible');
      renderChats();
    });

    elements.tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        elements.tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.currentFilter = tab.dataset.filter;
        renderChats();
      });
    });

    elements.clearLog.addEventListener('click', async () => {
      if (confirm('Clear all chat logs? This cannot be undone.')) {
        try {
          await chrome.runtime.sendMessage({ type: 'clearChatLog' });
          state.chatLog = [];
          state.deletedChats = [];
          updateStats();
          renderChats();
        } catch (error) {
          console.error('Failed to clear chat log:', error);
        }
      }
    });
  }

  function init() {
    setupEventListeners();
    fetchData();
    setInterval(fetchData, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
