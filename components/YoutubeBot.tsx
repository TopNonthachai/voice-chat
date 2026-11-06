import React, { useEffect, useRef, useState } from 'react';
import ReactPlayer from 'react-player';
import { Socket } from 'socket.io-client';

interface Track { id: string; videoId: string; title: string }
interface MusicState {
    queue: Track[]; currentId: string | null; playing: boolean;
    position: number; updatedAt: number; revision: number;
}
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const YoutubeBot: React.FC<{ socket: Socket | null; roomId: string }> = ({ socket, roomId }) => {
    const [state, setState] = useState<MusicState | null>(null);
    const [input, setInput] = useState('');
    const [error, setError] = useState('');
    const [enabled, setEnabled] = useState(false);
    const [ready, setReady] = useState(false);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const player = useRef<HTMLVideoElement>(null);
    const latest = useRef<MusicState | null>(null);
    const receivedAt = useRef(0);
    const readyRef = useRef(false);
    const current = state?.queue.find(item => item.id === state.currentId);
    const targetPosition = () => {
        const value = latest.current;
        return value ? value.position + (value.playing ? (performance.now() - receivedAt.current) / 1000 : 0) : 0;
    };
    const align = () => {
        if (!readyRef.current || !player.current || !latest.current) return;
        const target = targetPosition();
        if (Math.abs(player.current.currentTime - target) > 1.2) player.current.currentTime = target;
    };
    useEffect(() => {
        if (!socket) return;
        const update = (next: MusicState) => {
            if (latest.current && next.revision < latest.current.revision) return;
            if (latest.current?.currentId !== next.currentId) {
                readyRef.current = false;
                setReady(false);
                setDuration(0);
                setError('');
            }
            latest.current = next;
            receivedAt.current = performance.now();
            setState(next);
            setPosition(next.position);
            align();
        };
        const sync = () => socket.emit('music-sync', { roomId });
        socket.on('music-state', update);
        socket.on('connect', sync);
        sync();
        const timer = window.setInterval(() => { align(); setPosition(targetPosition()); }, 1000);
        const visible = () => { if (document.visibilityState === 'visible') sync(); };
        document.addEventListener('visibilitychange', visible);
        return () => {
            socket.off('music-state', update);
            socket.off('connect', sync);
            clearInterval(timer);
            document.removeEventListener('visibilitychange', visible);
        };
    }, [socket, roomId]);

    const command = (action: string, extra: Record<string, unknown> = {}, onSuccess?: () => void) => {
        if (!socket?.connected) { setError('Reconnecting to the room…'); return; }
        setError('');
        socket.timeout(8000).emit('music-command', {
            roomId, action, currentId: latest.current?.currentId, revision: latest.current?.revision, ...extra
        }, (timeout: Error | null, result: { error?: string }) => {
            if (timeout) { setError('No response. Reconnect and check the queue before trying again.'); return; }
            if (result?.error) setError(result.error);
            else onSuccess?.();
        });
    };
    const enable = () => {
        setEnabled(true);
        align();
        if (latest.current?.playing) {
            player.current?.play()?.catch(() => setError('Press Join audio again to allow playback in this browser.'));
        }
    };

    return <section className="bg-discord-darkest rounded-xl p-4 mb-6 max-w-5xl mx-auto border border-discord-light">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div><h2 className="text-xl font-bold text-white">Listen together</h2>
                <p className="text-sm text-gray-400">One room, one shared queue. Everyone can control playback.</p></div>
            <button onClick={enable} className="bg-discord-primary text-white rounded px-4 py-2">{enabled ? 'Rejoin audio / sync' : 'Join audio'}</button>
        </div>
        {current ? <div className="bg-black rounded overflow-hidden" style={{ aspectRatio: '16/9', minHeight: 200 }}>
            <ReactPlayer key={current.id} ref={player} src={`https://www.youtube.com/watch?v=${current.videoId}`}
                playing={Boolean(state?.playing && enabled)} volume={volume} controls={false} playsInline width="100%" height="100%"
                onLoadedMetadata={() => { readyRef.current = true; setReady(true); align(); }}
                onDurationChange={() => setDuration(player.current?.duration || 0)}
                onTimeUpdate={() => { const d = player.current?.duration; if (d && Number.isFinite(d)) setDuration(d); }}
                onEnded={() => {
                    if (enabled && latest.current?.currentId === current.id)
                        command('ended', { duration: player.current?.duration });
                }}
                onError={() => setError('This video could not play here. It may be restricted or embedding may be disabled. Try another video or skip.')} />
        </div> : <div className="rounded bg-black/30 p-10 text-center text-gray-400">Paste a YouTube video link below to start the room.</div>}
        {current && <div className="mt-3 space-y-3">
            <p className="text-sm text-gray-400">{!ready ? 'Loading video…' : !enabled ? 'Press Join audio to hear this room.' : state?.playing ? 'Playing together' : 'Paused for everyone'}</p>
            <div className="flex items-center gap-3">
                <button disabled={!ready} onClick={() => { setEnabled(true); command(state?.playing ? 'pause' : 'play'); }} className="bg-discord-primary text-white rounded px-4 py-2 disabled:opacity-50">{state?.playing ? 'Pause all' : 'Play all'}</button>
                <button onClick={() => command('next')} className="bg-discord-light text-white rounded px-4 py-2">Next</button>
                <span className="text-sm tabular-nums">{time(position)} / {time(duration)}</span>
            </div>
            <input aria-label="Seek for everyone" type="range" min="0" max={duration || 1} step="0.5"
                disabled={!ready || !duration} value={Math.min(position, duration || 0)}
                onChange={e => command('seek', { position: Number(e.target.value) })} className="w-full" />
            <label className="flex items-center gap-3 text-sm">Your volume
                <input aria-label="Your volume" type="range" min="0" max="1" step="0.05" value={volume}
                    onChange={e => setVolume(Number(e.target.value))} />
            </label>
        </div>}
        <form className="flex flex-wrap gap-2 mt-4" onSubmit={e => {
            e.preventDefault(); const submitted = input.trim();
            if (submitted) command('add', { url: submitted }, () => setInput(value => value.trim() === submitted ? '' : value));
        }}>
            <input aria-label="YouTube video link" value={input} onChange={e => setInput(e.target.value)}
                placeholder="Paste a YouTube video link…" className="flex-1 min-w-0 bg-discord-dark rounded px-3 py-2 text-white" />
            <button disabled={!input.trim()} className="bg-red-600 disabled:opacity-50 text-white px-4 py-2 rounded">Add to queue</button>
        </form>
        {error && <p role="alert" className="text-yellow-300 mt-3">{error}</p>}
        <h3 className="font-bold mt-5 mb-2">Shared queue ({state?.queue.length || 0})</h3>
        <ol className="space-y-2 max-h-72 overflow-y-auto">
            {state?.queue.map((item, index) => <li key={item.id} className={`flex flex-wrap items-center gap-2 p-2 rounded ${item.id === current?.id ? 'bg-discord-primary/30' : 'bg-discord-dark'}`}>
                <img src={`https://i.ytimg.com/vi/${item.videoId}/default.jpg`} alt="" className="w-16 rounded" />
                <button onClick={() => command('select', { id: item.id })} className="flex-1 text-left text-sm">{index + 1}. {item.title}{item.id === current?.id ? ' · Current' : ''}</button>
                <button aria-label={`Move song ${index + 1} up`} disabled={index === 0} onClick={() => command('move', { id: item.id, direction: -1 })} className="p-2 disabled:opacity-30">↑</button>
                <button aria-label={`Move song ${index + 1} down`} disabled={index === state.queue.length - 1} onClick={() => command('move', { id: item.id, direction: 1 })} className="p-2 disabled:opacity-30">↓</button>
                <button aria-label={`Remove song ${index + 1}`} onClick={() => command('remove', { id: item.id })} className="p-2 text-red-300">Remove</button>
            </li>)}
        </ol>
        <p className="text-xs text-gray-400 mt-3">Queue songs with individual video links. The queue resets when the server restarts.</p>
    </section>;
};
export default YoutubeBot;
