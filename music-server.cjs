const { randomUUID } = require('node:crypto');

function videoId(input) {
    if (typeof input !== 'string') return null;
    input = input.trim();
    if (/^[\w-]{11}$/.test(input)) return input;
    try {
        const url = new URL(input);
        if (!['https:', 'http:'].includes(url.protocol)) return null;
        const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
        const id = host === 'youtu.be' ? url.pathname.split('/')[1]
            : ['youtube.com', 'youtube-nocookie.com'].includes(host)
                ? url.searchParams.get('v') || (/^\/(shorts|embed|live)\//.test(url.pathname) ? url.pathname.split('/')[2] : '') : '';
        return /^[\w-]{11}$/.test(id || '') ? id : null;
    } catch { return null; }
}

function registerMusic(io) {
    const rooms = new Map();
    const empty = () => ({ queue: [], currentId: null, playing: false, position: 0, updatedAt: Date.now(), revision: 0 });
    function snapshot(state) {
        const now = Date.now();
        return { ...state, position: state.position + (state.playing ? Math.max(0, now - state.updatedAt) / 1000 : 0), updatedAt: now };
    }
    io.on('connection', socket => {
        socket.on('music-sync', ({ roomId } = {}) => {
            if (!socket.rooms.has(roomId)) return;
            if (!rooms.has(roomId)) rooms.set(roomId, empty());
            socket.emit('music-state', snapshot(rooms.get(roomId)));
        });
        socket.on('music-command', (data = {}, ack = () => {}) => {
            if (typeof ack !== 'function') ack = () => {};
            const { roomId, action } = data;
            if (!socket.rooms.has(roomId)) return ack({ error: 'Join the room first.' });
            const state = rooms.get(roomId) || empty();
            const next = snapshot(state);
            next.queue = [...state.queue];
            const select = id => {
                next.currentId = id;
                next.position = 0;
                next.playing = Boolean(id);
            };
            switch (action) {
                case 'add': {
                    const id = videoId(data.url);
                    if (!id) return ack({ error: 'Please paste a valid YouTube video link (not a playlist-only link).' });
                    if (next.queue.length >= 100) return ack({ error: 'The queue is full (100 songs).' });
                    const item = { id: randomUUID(), videoId: id, title: `YouTube · ${id}` };
                    next.queue.push(item);
                    if (!next.currentId) select(item.id);
                    break;
                }
                case 'play':
                case 'pause':
                case 'seek': {
                    if (!next.currentId || data.currentId !== next.currentId) return ack({ error: 'The song changed. Try again.' });
                    if (action === 'seek') {
                        if (!Number.isFinite(data.position) || data.position < 0 || data.position > 86400) return ack({ error: 'Invalid playback position.' });
                        next.position = data.position;
                    } else next.playing = action === 'play';
                    break;
                }
                case 'select':
                    if (!next.queue.some(item => item.id === data.id)) return ack({ error: 'Song not found.' });
                    select(data.id);
                    break;
                case 'ended':
                    // Only the first report for this playback revision may advance the queue.
                    if (data.revision !== state.revision || data.currentId !== state.currentId || !state.playing) return ack({ ok: true });
                    if (!Number.isFinite(data.duration) || data.duration <= 0 || next.position < data.duration - 3) return ack({ ok: true });
                    // fall through
                case 'next': {
                    const index = next.queue.findIndex(item => item.id === next.currentId);
                    const following = next.queue[index + 1];
                    if (following) select(following.id);
                    else { next.playing = false; if (action === 'ended') next.position = data.duration; }
                    break;
                }
                case 'remove': {
                    const index = next.queue.findIndex(item => item.id === data.id);
                    if (index < 0) return ack({ error: 'Song not found.' });
                    next.queue.splice(index, 1);
                    if (data.id === next.currentId) select(next.queue[index]?.id || next.queue[index - 1]?.id || null);
                    break;
                }
                case 'move': {
                    const index = next.queue.findIndex(item => item.id === data.id);
                    const target = index + data.direction;
                    if (![-1, 1].includes(data.direction) || index < 0 || target < 0 || target >= next.queue.length) return ack({ error: 'Cannot move this song.' });
                    [next.queue[index], next.queue[target]] = [next.queue[target], next.queue[index]];
                    break;
                }
                default: return ack({ error: 'Unknown command.' });
            }
            next.revision++;
            rooms.set(roomId, next);
            io.to(roomId).emit('music-state', next);
            ack({ ok: true });
        });
    });
    return { rooms, snapshot };
}
module.exports = { registerMusic, videoId };
