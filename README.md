# VoiceCord — watch and listen together

React/Vite frontend with an Express + Socket.IO server and optional PeerJS voice chat.

## Local development

Requires Node.js 22 or newer.

```sh
npm ci
npm run server
# In another terminal:
npm run dev
```

Open http://localhost:3000. Alternatively, build once and use the backend to serve the complete app:

```sh
npm run build
npm start
```

Open http://localhost:3001. No Gemini API key is needed for rooms or YouTube playback.

## Listen together

1. Create a room, then use **Copy invite link** to invite friends.
2. Paste an individual YouTube video link and choose **Add to queue**.
3. Each participant presses **Join audio** to allow playback in their browser.
4. **Play all**, **Pause all**, the seek slider and **Next** control the whole room. Volume only affects your device.
5. Everyone can add, remove, select and reorder queue entries. The next queued song starts when the current song ends.

Room connection works even when microphone permission is denied. Microphone permission and PeerJS connectivity are needed for voice chat only.

The server owns playback time and queue order. Clients fetch the current snapshot on joining, reconnecting and returning to the tab, and correct drift locally. Playback is approximate across networks and buffering; it is not sample-accurate audio synchronization.

## Existing Render deployment

Production URL: https://my-voice-chat.onrender.com

Use a Render **Web Service** running this repository (a static site alone cannot host Socket.IO).

- Build command: `npm ci && npm run build`
- Start command: `npm start` (existing `node server.js` also works)
- The backend reads Render's `PORT` environment variable.
- Build the frontend on each deployment; `dist` is generated output.

Changing local files does not update Render. Deploy the updated repository revision using the service's configured deployment workflow.

## Limits

- Queue and playback state are held in memory and reset when the service restarts or redeploys.
- Run a single server instance. Multiple instances require shared room state and a Socket.IO adapter.
- Individual YouTube links and raw video IDs are supported; importing a full YouTube playlist is not implemented.
- Videos that disallow embedding, regional restrictions, ads and browser autoplay restrictions may affect playback.
- Queue entries currently show a thumbnail and video ID instead of fetched video titles.
- Anyone with the room link can control playback. There are no host-only permissions yet.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Tests use real local Socket.IO connections to cover shared state, late join, pause, seek to zero, queue operations, duplicate end reports, room isolation and reconnection. Browser QA verifies the embedded player and shared pause control. Cross-device playback and voice still need testing with friends on separate networks.
