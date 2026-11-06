const { createTitleResolver } = require('./youtube-metadata.cjs');
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

function registerMusic(io, {resolveTitle=createTitleResolver()}={}) {
    const rooms = new Map();
    const empty = () => ({ queue: [], currentId: null, playing: false, position: 0, updatedAt: Date.now(), revision: 0, generation: 0, shuffle: false, repeat: false, remaining: [], finished: false, activity: [] });
    function snapshot(state) {
        const now = Date.now();
        return { ...state, position: state.position + (state.playing ? Math.max(0, now - state.updatedAt) / 1000 : 0), updatedAt: now };
    }
    io.on('connection', socket => {
        socket.on('music-sync', ({ roomId } = {}, ack) => {
            if (!socket.rooms.has(roomId)) return;
            if (!rooms.has(roomId)) rooms.set(roomId, empty());
            const current=snapshot(rooms.get(roomId));
            socket.emit('music-state', current);
            if(typeof ack==='function')ack({ok:true,state:current});
        });
        socket.on('music-command', (data = {}, ack = () => {}) => {
            if (typeof ack !== 'function') ack = () => {};
            const { roomId, action } = data;
            if (!socket.rooms.has(roomId)) return ack({ error: 'Join the room first.' });
            const state = rooms.get(roomId) || empty();
            const next = snapshot(state);
            next.queue = [...state.queue];
            next.remaining = [...state.remaining];
            const select = id => {
                next.currentId = id;
                next.position = 0;
                next.playing = Boolean(id);
                next.finished = false;
                next.generation++;
                next.remaining = next.remaining.filter(value => value !== id);
            };
            const shuffled = ids => {
                for (let i = ids.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [ids[i], ids[j]] = [ids[j], ids[i]];
                }
                return ids;
            };
            const advance = () => {
                let id;
                if (next.shuffle) {
                    next.remaining = next.remaining.filter(id => next.queue.some(item => item.id === id));
                    if (!next.remaining.length && next.repeat) {
                        next.remaining = shuffled(next.queue.map(item => item.id));
                        if (next.remaining[0] === next.currentId && next.remaining.length > 1)
                            [next.remaining[0], next.remaining[1]] = [next.remaining[1], next.remaining[0]];
                    }
                    id = next.remaining.shift();
                } else {
                    const index = next.queue.findIndex(item => item.id === next.currentId);
                    id = next.queue[index + 1]?.id || (next.repeat ? next.queue[0]?.id : null);
                }
                if (id) select(id);
                else { next.playing = false; next.finished = true; if (action === 'ended') next.position = data.duration; }
            };
            switch (action) {
                case 'add': {
                    const id = videoId(data.url);
                    if (!id) return ack({ error: 'Please paste a valid YouTube video link (not a playlist-only link).' });
                    if (next.queue.some(item => item.videoId === id)) return ack({ error: 'เพลงนี้อยู่ในคิวแล้ว' });
                    if (next.queue.length >= 100) return ack({ error: 'The queue is full (100 songs).' });
                    const item = { id: randomUUID(), videoId: id, title: `YouTube · ${id}` };
                    next.queue.push(item);
                    if (next.shuffle) next.remaining.push(item.id);
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
                        next.finished = false;
                    } else if (action === 'play' && next.finished) {
                        if (next.shuffle) { next.remaining = shuffled(next.queue.map(item => item.id)); select(next.remaining.shift()); }
                        else select(next.queue[0]?.id || null);
                    } else next.playing = action === 'play';
                    break;
                }
                case 'select':
                    if (!next.queue.some(item => item.id === data.id)) return ack({ error: 'Song not found.' });
                    select(data.id);
                    break;
                case 'ended':
                    // Only the first report for this playback revision may advance the queue.
                    if ((data.generation !== undefined ? data.generation !== state.generation : data.revision !== state.revision) || data.currentId !== state.currentId || !state.playing) return ack({ ok: true });
                    if (!Number.isFinite(data.duration) || data.duration <= 0 || next.position < data.duration - 3) return ack({ ok: true });
                    // fall through
                case 'next': {
                    advance();
                    break;
                }
                case 'shuffle':
                    if (typeof data.enabled !== 'boolean') return ack({ error: 'Invalid shuffle mode.' });
                    if (next.shuffle !== data.enabled) {
                        next.shuffle = data.enabled;
                        next.remaining = shuffled(next.queue.filter(item => item.id !== next.currentId).map(item => item.id));
                    }
                    break;
                case 'repeat':
                    if (typeof data.enabled !== 'boolean') return ack({ error: 'Invalid repeat mode.' });
                    next.repeat = data.enabled;
                    break;
                case 'remove': {
                    const index = next.queue.findIndex(item => item.id === data.id);
                    if (index < 0) return ack({ error: 'Song not found.' });
                    next.queue.splice(index, 1);
                    next.remaining = next.remaining.filter(id => id !== data.id);
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
            const affected = (action === 'add' ? next.queue.at(-1) : state.queue.find(item => item.id === (data.id || state.currentId)));
            const labels = {
                add: 'เพิ่มเพลงเข้าคิว', remove: 'ลบเพลงออกจากคิว', select: 'เลือกเล่นเพลง',
                play: 'เล่นเพลงให้ทุกคน', pause: 'หยุดเพลงให้ทุกคน', seek: 'เลื่อนเวลาเพลง',
                next: 'ข้ามไปเพลงถัดไป', ended: next.playing ? 'เล่นเพลงถัดไปอัตโนมัติ' : 'เล่นครบคิวแล้ว',
                move: data.direction === -1 ? 'ย้ายเพลงขึ้น' : 'ย้ายเพลงลง',
                shuffle: data.enabled ? 'เปิดสุ่มคิว' : 'ปิดสุ่มคิว', repeat: data.enabled ? 'เปิดวนทั้งคิว' : 'ปิดวนทั้งคิว'
            };
            const target = ['next', 'ended'].includes(action) ? next.queue.find(item => item.id === next.currentId) : affected;
            next.activity = [...(state.activity || []), {
                id: randomUUID(), timestamp: Date.now(), actor: action === 'ended' ? 'ระบบ' : socket.data.userName || 'Guest',
                action, message: labels[action], trackId: target?.id, title: target?.title || '',
                position: action === 'seek' ? data.position : undefined
            }].slice(-100);
            next.revision++;
            rooms.set(roomId, next);
            io.to(roomId).emit('music-state', next);
            ack({ ok: true });
            if(action==='add') {
                const added=next.queue.at(-1);
                Promise.resolve().then(()=>resolveTitle(added.videoId)).then(metadata=>{
                    if(!metadata)return;
                    const current=rooms.get(roomId);
                    if(!current?.queue.some(item=>item.id===added.id))return;
                    const updated={...current,revision:current.revision+1,
                        queue:current.queue.map(item=>item.id===added.id?{...item,title:metadata.title,author:metadata.author}:item),
                        activity:current.activity.map(entry=>entry.trackId===added.id?{...entry,title:metadata.title}:entry)};
                    rooms.set(roomId,updated);io.to(roomId).emit('music-state',snapshot(updated));
                }).catch(()=>{});
            }
        });
    });
    return { rooms, snapshot };
}
module.exports = { registerMusic, videoId };
