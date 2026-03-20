# Chats-yt — YouTube Live Chat Tracker

## Overview

Chrome Extension that intercepts YouTube live chat API responses via Chrome Debugger Protocol and maintains in-memory logs of all chat activity.

## Architecture

```
YouTube Live Page
       │
       ▼
content.js (injected on youtube.com/*)
       │
       │ chrome.runtime.sendMessage
       ▼
background.js (Chrome debugger listener)
       │
       ▼
Network.responseReceived → get_live_chat endpoint
       │
       ▼
logChatMessages() → chatLog[] / deletedChats[]
```

## Files

| File | Purpose |
|------|---------|
| `chrome-extension/background.js` | Main logic: debugger attachment, network interception, message parsing |
| `chrome-extension/content.js` | Lightweight loader injected into YouTube pages |
| `chrome-extension/manifest.json` | Extension config (permissions, manifest v2) |

## Data Structures

### `chatLog[]`
Array of all intercepted chat messages. Never removes items.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | YouTube message ID |
| `type` | string | `text`, `membership`, or `paid` |
| `author` | string | Display name |
| `channelId` | string | Author's YouTube channel ID |
| `timestamp` | string | Microsecond timestamp |
| `text` | string | Message content (text messages only) |
| `header` | string | Membership message content |
| `badges` | string[] | Badge labels (e.g. `Owner`, `Moderator`) |
| `deleted` | boolean | True if removed by mod/streamer |
| `timedOut` | boolean | True if removed via author timeout |

### `deletedChats[]`
Copy of messages that were deleted (either individually or via timeout). Preserved separately for history.

| Field | Type | Description |
|-------|------|-------------|
| `*` | | All fields from `chatLog` entry |
| `deletedAt` | number | Unix timestamp when deleted |

## Message Parsing

`logChatMessages(data)` parses `data.continuationContents.liveChatContinuation.actions[]`:

| Action | Handler | Renderer |
|--------|----------|----------|
| `addChatItemAction` | Pushes to `chatLog` | `liveChatTextMessageRenderer`, `liveChatMembershipItemRenderer`, `liveChatPaidMessageRenderer` |
| `removeChatItemAction` | Marks by `targetItemId`, pushes to `deletedChats` | — |
| `removeChatItemByAuthorAction` | Marks all by `externalChannelId`, pushes to `deletedChats` | — |

### Text Processing
Each `runs[]` array element is processed:
1. `r.text` → use as-is
2. `r.emoji.shortcuts[0]` → emoji shortcode (e.g. `:wilted_flower:`)
3. `r.emoji.emojiId` → fallback emoji identifier

## Extension API

Messages via `chrome.runtime.sendMessage`:

| Message | Response |
|---------|----------|
| `{ type: 'enableDebugger', tabId }` | — |
| `{ type: 'getChatLog' }` | `{ chatLog }` |
| `{ type: 'getDeletedChats' }` | `{ deletedChats }` |
| `{ type: 'clearChatLog' }` | `{ cleared: true }` |

## Network Interception

- Target URL: `youtubei/v1/live_chat/get_live_chat`
- Method: Chrome Debugger Protocol (`Network.responseReceived` + `Network.getResponseBody`)
- Auto-attaches debugger when visiting `youtube.com/watch`
