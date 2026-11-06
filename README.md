# mellow — watch and listen together

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
- Queue entries fetch the real video title and channel through YouTube oEmbed, with the video ID as a fallback. No API key is required.
- Anyone with the room link can control playback. There are no host-only permissions yet.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Tests use real local Socket.IO connections to cover shared state, late join, pause, seek to zero, queue operations, duplicate end reports, room isolation and reconnection. Browser QA verifies the embedded player and shared pause control. Cross-device playback and voice still need testing with friends on separate networks.

## mellow update

Invite links show a required name and avatar form. Edit the profile from the room header. Twelve character presets, random selection, and JPG/PNG/WebP uploads (up to 3 MB, cropped into a small JPEG) are available. Avatars are shared with room participants; your chosen profile is saved locally. PNGtuber is labelled as movement while speaking. No (You) suffix is shown.

Click the video surface to play/pause for the whole room. The embedded player does not intercept clicks. Join listening and leave listening are local actions, separate from room playback. Leaving unmounts the player; rejoining catches up.

Shuffle consumes a server-owned bag and plays every song once before the next round. Repeat queue starts a new round after exhaustion. Without repeat, playback stops. Duplicate video entries are rejected; manually selecting a previously heard song is an explicit replay.

The new interface uses cream, olive and terracotta, responsive layouts and Thai labels. Profile sharing, shuffle rounds, duplicate end reports and repeat behavior are covered by integration tests. Browser QA covers invitation setup, both clients seeing shared modes, video click pause/play, and leaving listening while the room continues.

If port 3001 is occupied, set PORT to another port and open that backend directly. The Vite development server on 3000/5173 still uses backend 3001; production uses its current origin.

## Profiles and activity

Profiles have an optional status (up to 80 characters), empty by default. Edit or clear it from the profile form. The microphone toggle is on your own profile card. The UI calls the shared space a room.

The queue sidebar has Queue and History tabs. The server records successful add/remove/reorder/select/play/pause/seek/skip/shuffle/repeat actions with the participant name and server timestamp. Automatic transitions are attributed to the system. Everyone in the room, including late joiners, receives the same last 100 entries; history resets on server restart. Invalid commands and duplicate end reports do not create entries. Removed song details remain in history.

## Room chat and attachments

The sidebar includes Queue, Chat and History tabs. Chat shows the sender name, avatar and timestamp, retains the last 100 messages per room, and badges unread messages while another tab is open. Enter sends; Shift+Enter adds a line break. Text is limited to 1,000 characters and rendered as plain text.

The attachment button supports files up to 5 MB, optional captions, raster image previews and downloads. Files are kept in server memory (20 MB per room, 100 MB total). Downloads and previews require an active connection in the same room. Files attached to messages removed from the 100-message history are also removed. All messages and files disappear when the server restarts or deploys. No external storage or API key is required.

Client submission IDs prevent duplicate delivery when retrying the same send on an existing room identity. Server-side checks reject blank or oversized messages, files over the limit, and requests from outside the room. Integration tests cover text delivery, retries, late join history, room isolation, attachment download, PNG preview and upload size limits. Browser QA covers sending a message and attaching/sending a sample text file from the chat tab.

## Expiry, video titles and resync

Attachments expire 24 hours after upload. A server timer removes expired buffers at least every minute, and each file request/history sync also checks expiry. Room/global memory counters are released. The original message remains with an expired attachment indicator; expired downloads return HTTP 410. Files can disappear sooner on server restart or history eviction. Expiry timestamps are displayed beside downloads.

Real video titles and channel names are fetched server-side from YouTube oEmbed without an API key. Fetches have a 5-second timeout, coalesce concurrent requests, and cache successful results for 24 hours. Metadata updates are broadcast without changing playback time or adding an activity-log event. If unavailable, the video ID remains usable.

The player shows connection/sync status and a manual resync button. Resync fetches a read-only room snapshot and seeks only the requesting local player. Disconnected rooms keep the sidebar mounted while reconnecting; reconnect accepts a fresh server snapshot even after a server restart resets revisions. Playlists still live in server memory: this update does not add a database or permanent playlist storage.
