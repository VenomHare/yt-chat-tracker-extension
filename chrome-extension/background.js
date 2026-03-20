const targetUrl = 'youtubei/v1/live_chat/get_live_chat';
const pendingRequests = new Map();
const chatLog = [];
const deletedChats = [];
let debuggerEnabled = false;

function enableDebugger(tabId) {
  if (debuggerEnabled) return;
  chrome.debugger.attach({ tabId }, '1.0', () => {
    debuggerEnabled = true;
    chrome.debugger.sendCommand({ tabId }, 'Network.enable');
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'enableDebugger' && message.tabId) {
    enableDebugger(message.tabId);
  }
  if (message.type === 'getChatLog') {
    sendResponse({ chatLog });
  }
  if (message.type === 'clearChatLog') {
    chatLog.length = 0;
    sendResponse({ cleared: true });
  }
  if (message.type === 'getDeletedChats') {
    sendResponse({ deletedChats });
  }
});

function logChatMessages(data) {
  const actions = data?.continuationContents?.liveChatContinuation?.actions;
  if (!actions || !Array.isArray(actions)) return;

  for (const action of actions) {
    const removeAction = action.removeChatItemAction;
    if (removeAction) {
      const targetId = removeAction.targetItemId;
      const removed = chatLog.find(m => m.id === targetId);
      if (removed) {
        removed.deleted = true;
        deletedChats.push({ ...removed, deletedAt: Date.now() });
        console.log(`[DELETED] ${removed.author}: ${removed.text || removed.header}`);
      } else {
        console.log(`[DELETED] Unknown message with id: ${targetId}`);
      }
      continue;
    }

    const timeoutAction = action.removeChatItemByAuthorAction;
    if (timeoutAction) {
      const channelId = timeoutAction.externalChannelId;
      const timedOutMsgs = chatLog.filter(m => m.channelId === channelId && !m.deleted);
      for (const msg of timedOutMsgs) {
        msg.deleted = true;
        msg.timedOut = true;
        deletedChats.push({ ...msg, deletedAt: Date.now() });
      }
      console.log(`[TIMEOUT] All messages from channel ${channelId} deleted (${timedOutMsgs.length} messages)`);
      continue;
    }

    const item = action.addChatItemAction?.item;
    if (!item) continue;

    const textMsg = item.liveChatTextMessageRenderer;
    if (textMsg) {
      const text = textMsg.message?.runs?.map(r => {
        if (r.text) return r.text;
        if (r.emoji?.shortcuts?.[0]) return r.emoji.shortcuts[0];
        if (r.emoji?.emojiId) return r.emoji.emojiId;
        return '';
      }).join('') || '';
      const author = textMsg.authorName?.simpleText || 'Unknown';
      const channelId = textMsg.authorExternalChannelId || '';
      const timestamp = textMsg.timestampUsec || '';
      const badges = textMsg.authorBadges?.map(b => b.liveChatAuthorBadgeRenderer?.tooltip) || [];
      const msg = { id: textMsg.id, type: 'text', author, channelId, timestamp, badges, text };
      chatLog.push(msg);
      console.log(`[CHAT] ${author}${badges.length ? ` [${badges.join(', ')}]` : ''}: ${text}`);
      continue;
    }

    const membershipMsg = item.liveChatMembershipItemRenderer;
    if (membershipMsg) {
      const header = membershipMsg.header?.runs?.map(r => {
        if (r.text) return r.text;
        if (r.emoji?.shortcuts?.[0]) return r.emoji.shortcuts[0];
        if (r.emoji?.emojiId) return r.emoji.emojiId;
        return '';
      }).join('') || '';
      const author = membershipMsg.authorName?.simpleText || 'Unknown';
      const channelId = membershipMsg.authorExternalChannelId || '';
      const msg = { id: membershipMsg.id, type: 'membership', author, channelId, header };
      chatLog.push(msg);
      console.log(`[MEMBERSHIP] ${author}: ${header}`);
      continue;
    }

    const paidMsg = item.liveChatPaidMessageRenderer;
    if (paidMsg) {
      const text = paidMsg.message?.runs?.map(r => {
        if (r.text) return r.text;
        if (r.emoji?.shortcuts?.[0]) return r.emoji.shortcuts[0];
        if (r.emoji?.emojiId) return r.emoji.emojiId;
        return '';
      }).join('') || '';
      const author = paidMsg.authorName?.simpleText || 'Unknown';
      const msg = { id: paidMsg.id, type: 'paid', author, text };
      chatLog.push(msg);
      console.log(`[PAID] ${author}: ${text}`);
    }
  }
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === 'Network.responseReceived') {
    const url = params.response.url;
    if (url.includes(targetUrl)) {
      pendingRequests.set(params.requestId, true);
      chrome.debugger.sendCommand(
        { tabId: source.tabId },
        'Network.getResponseBody',
        { requestId: params.requestId, binary: false },
        (response) => {
          if (response && response.body) {
            try {
              const data = JSON.parse(response.body);
              logChatMessages(data);
              console.log(data);
            } catch (e) {
              console.log(response.body);
            }
          }
        }
      );
    }
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.url && tab.url.includes('youtube.com/watch')) {
    setTimeout(() => enableDebugger(tabId), 2000);
  }
});
