(function() {
  console.log('[LiveChatTracker] Extension loaded on:', window.location.href);
  
  chrome.runtime.sendMessage({ type: 'enableDebugger', tabId: null });
})();
