import React, { useEffect, useRef, useState } from 'react';
import ReactPlayer from 'react-player';
import RoomChat from './RoomChat';
import { Socket } from 'socket.io-client';
interface Track { id: string; videoId: string; title: string }
interface Activity { id: string; timestamp: number; actor: string; action: string; message: string; title: string; position?: number }
interface MusicState {
    queue: Track[]; currentId: string | null; playing: boolean; position: number;
    updatedAt: number; revision: number; generation: number; shuffle: boolean; repeat: boolean; finished: boolean; activity: Activity[];
}
const time = (s: number) => `${Math.floor(Math.max(0, s || 0) / 60)}:${String(Math.floor(Math.max(0, s || 0) % 60)).padStart(2, '0')}`;
export default function YoutubeBot({ socket, roomId }: { socket: Socket | null; roomId: string }) {
    const [state, setState] = useState<MusicState | null>(null);
    const [input, setInput] = useState('');
    const [activeTab, setActiveTab] = useState<'queue' | 'chat' | 'log'>('queue');
    const [unread, setUnread] = useState(0);
    const [error, setError] = useState('');
    const [enabled, setEnabled] = useState(false);
    const [ready, setReady] = useState(false);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(0.7);
    const [seek, setSeek] = useState<number | null>(null);
    const player = useRef<HTMLVideoElement>(null);
    const latest = useRef<MusicState | null>(null);
    const receivedAt = useRef(0);
    const readyRef = useRef(false);
    const enabledRef = useRef(false);
    const current = state?.queue.find(item => item.id === state.currentId);
    const targetPosition = () => {
        const value = latest.current;
        return value ? value.position + (value.playing ? (performance.now() - receivedAt.current) / 1000 : 0) : 0;
    };
    const align = () => {
        const element = player.current;
        if (!enabledRef.current || !readyRef.current || !element || !latest.current || element.ended) return;
        const target = Math.min(targetPosition(), Number.isFinite(element.duration) ? Math.max(0, element.duration - 0.1) : Infinity);
        if (Math.abs(element.currentTime - target) > 1.5) element.currentTime = target;
    };
    useEffect(() => {
        if (!socket) return;
        const update = (next: MusicState) => {
            if (latest.current && next.revision < latest.current.revision) return;
            if (latest.current?.generation !== next.generation) {
                readyRef.current = false; setReady(false); setDuration(0); setError(''); setSeek(null);
            }
            latest.current = next; receivedAt.current = performance.now();
            setState(next); setPosition(next.position); align();
        };
        const sync = () => socket.emit('music-sync', { roomId });
        socket.on('music-state', update); socket.on('connect', sync); sync();
        const timer = window.setInterval(() => { align(); setPosition(targetPosition()); }, 1000);
        const visible = () => { if (document.visibilityState === 'visible') sync(); };
        document.addEventListener('visibilitychange', visible);
        return () => {socket.off('music-state', update); socket.off('connect', sync); clearInterval(timer); document.removeEventListener('visibilitychange', visible);};
    }, [socket, roomId]);
    const command = (action: string, extra: Record<string, unknown> = {}, success?: () => void) => {
        if (!socket?.connected) {setError('กำลังเชื่อมต่อห้องใหม่…'); return;}
        setError('');
        socket.timeout(8000).emit('music-command', {roomId, action, currentId: latest.current?.currentId, revision: latest.current?.revision, generation: latest.current?.generation, ...extra},
            (timeout: Error | null, result: {error?: string}) => {
                if (timeout) setError('ไม่ได้รับคำตอบจากห้อง ลองเชื่อมต่อใหม่');
                else if (result?.error) setError(result.error);
                else success?.();
            });
    };
    const toggleListening = () => {
        enabledRef.current = !enabledRef.current;
        if (!enabledRef.current) {player.current?.pause(); readyRef.current = false; setReady(false);}
        setEnabled(enabledRef.current); setError('');
    };
    const togglePlayback = () => {
        if (!enabledRef.current) {toggleListening(); return;}
        command(latest.current?.playing ? 'pause' : 'play');
    };
    const commitSeek = () => {if (seek !== null) {command('seek', {position:seek}); setSeek(null);}};
    return <section className="listening-layout">
        <div className="player-panel"><div className="panel-top"><div><span className="eyebrow">THE LISTENING ROOM</span><h2>เพลงนี้ มีเราอยู่ด้วยกัน</h2></div><span className="live-pill"><i /> LIVE ROOM</span></div>
        <div className="video-stage">
            {current ? <>{enabled ? <div className="video-media" inert>
                <ReactPlayer key={`${current.id}-${state?.generation}`} ref={player} src={`https://www.youtube.com/watch?v=${current.videoId}`}
                    playing={Boolean(state?.playing)} volume={volume} controls={false} playsInline width="100%" height="100%"
                    onLoadedMetadata={() => {readyRef.current = true; setReady(true); setDuration(player.current?.duration || 0); align();}}
                    onDurationChange={() => setDuration(player.current?.duration || 0)}
                    onEnded={() => {if (enabledRef.current) command('ended', {duration:player.current?.duration});}}
                    onError={() => setError('คลิปนี้เล่นในห้องไม่ได้ อาจจำกัดการฝังวิดีโอ ลองข้ามหรือเปลี่ยนเพลงครับ')} />
            </div> : <img className="video-cover" src={`https://i.ytimg.com/vi/${current.videoId}/hqdefault.jpg`} alt="ภาพตัวอย่างเพลงปัจจุบัน" />}
            <button className={`video-toggle ${!enabled ? 'not-listening' : ''}`} onClick={togglePlayback} aria-label={!enabled ? 'เข้าฟังเพลง' : state?.playing ? 'หยุดให้ทุกคน' : 'เล่นให้ทุกคน'}>
                <span className="video-toggle-icon">{!enabled ? '♫' : state?.playing ? 'Ⅱ' : '▶'}</span><span className="video-toggle-label">{!enabled ? 'เข้าฟังเพลงด้วยกัน' : state?.playing ? 'หยุดให้ทุกคน' : 'เล่นให้ทุกคน'}</span>
            </button></> : <div className="empty-stage"><span className="empty-disc">♫</span><h3>เพลงแรกของห้อง จะเป็นเพลงอะไรดี?</h3><p>วางลิงก์ YouTube ในคิวด้านข้าง แล้วเริ่มฟังด้วยกัน</p></div>}
        </div>
        <div className="now-playing"><div><span className="eyebrow">{state?.playing ? 'NOW PLAYING' : 'TAKE A BREATHER'}</span><h3>{current ? current.title : 'รอเพลงโปรดของคุณ'}</h3></div><span className="play-status">{!enabled ? 'ยังไม่ได้เข้าฟัง' : !ready && current ? 'กำลังโหลด…' : state?.playing ? 'กำลังฟังด้วยกัน' : 'หยุดพักเพลง'}</span></div>
        <div className="timeline"><input aria-label="เลื่อนเวลาให้ทุกคน" type="range" min="0" max={duration || 1} step="0.5" disabled={!ready || !duration} value={seek ?? Math.min(position, duration || 0)}
            onChange={e => setSeek(Number(e.target.value))} onPointerUp={commitSeek} onKeyUp={commitSeek} onBlur={commitSeek} /><div><span>{time(seek ?? position)}</span><span>{time(duration)}</span></div></div>
        <div className="transport"><div className="transport-main"><button className="round-btn play" disabled={!current} onClick={() => command(state?.playing ? 'pause' : 'play')} aria-label={state?.playing ? 'หยุดให้ทุกคน' : 'เล่นให้ทุกคน'}>{state?.playing ? 'Ⅱ' : '▶'}</button><button className="round-btn" disabled={!current} onClick={() => command('next')} aria-label="เพลงถัดไป">↠</button><div className="transport-caption"><strong>{state?.playing ? 'Pause all' : 'Play all'}</strong><span>ควบคุมพร้อมกันทั้งห้อง</span></div></div><label className="volume">♫<input aria-label="ระดับเสียงของคุณ" type="range" min="0" max="1" step="0.05" value={volume} onChange={e => setVolume(Number(e.target.value))} /></label></div>
        <div className="listening-bar"><div><span className={`status-dot ${enabled ? 'on' : ''}`} /><span>{enabled ? 'คุณอยู่ในห้องฟังเพลง' : 'เข้าฟังเมื่อคุณพร้อม'}</span></div><button className={`btn ${enabled ? 'secondary' : 'primary'}`} onClick={toggleListening}>{enabled ? 'ออกจากการฟัง' : 'เข้าฟัง YouTube'} {enabled ? '↗' : '♫'}</button></div>
        {error && <p role="alert" className="notice">{error}</p>}
        </div>
        <aside className="queue-panel"><div className="panel-top"><div><span className="eyebrow">PICK THE NEXT VIBE</span><h2>คิวของพวกเรา <span className="count">{state?.queue.length || 0}</span></h2></div><span className="queue-symbol">≋</span></div>
        <div className="queue-tabs" role="tablist" aria-label="คิวเพลงและประวัติ" onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const tabs=['queue','chat','log'] as const;const index=tabs.indexOf(activeTab);const next=tabs[e.key==='Home'?0:e.key==='End'?2:(index+(e.key==='ArrowRight'?1:2))%3];setActiveTab(next);document.getElementById(`music-${next}-tab`)?.focus();}}}>
            <button id="music-queue-tab" role="tab" aria-selected={activeTab==='queue'} aria-controls="music-queue-panel" tabIndex={activeTab==='queue'?0:-1} onClick={()=>setActiveTab('queue')}>♫ คิวเพลง</button>
            <button id="music-chat-tab" role="tab" aria-selected={activeTab==='chat'} aria-controls="music-chat-panel" tabIndex={activeTab==='chat'?0:-1} onClick={()=>setActiveTab('chat')}>☏ แชต {unread>0&&<span className="unread-badge">{unread>99?'99+':unread}</span>}</button>
            <button id="music-log-tab" role="tab" aria-selected={activeTab==='log'} aria-controls="music-log-panel" tabIndex={activeTab==='log'?0:-1} onClick={()=>setActiveTab('log')}>◷ ประวัติ <span>{state?.activity?.length || 0}</span></button>
        </div>
        <div id="music-queue-panel" role="tabpanel" aria-labelledby="music-queue-tab" hidden={activeTab!=='queue'} className="queue-content">
        <form className="add-song" onSubmit={e => {e.preventDefault(); const value=input.trim();if(value) command('add',{url:value},()=>setInput(''));}}><label htmlFor="song-url">เพิ่มเพลงเข้าห้อง</label><div><input id="song-url" type="text" value={input} onChange={e=>setInput(e.target.value)} placeholder="วางลิงก์ YouTube ที่นี่…" /><button className="btn primary" disabled={!input.trim()} aria-label="เพิ่มเพลง">＋</button></div></form>
        <div className="queue-modes"><button className="mode-button" aria-pressed={Boolean(state?.shuffle)} onClick={()=>command('shuffle',{enabled:!state?.shuffle})}><span>⤨ สุ่มคิว</span><b>{state?.shuffle?'เปิด':'ปิด'}</b></button><button className="mode-button" aria-pressed={Boolean(state?.repeat)} onClick={()=>command('repeat',{enabled:!state?.repeat})}><span>↻ วนทั้งคิว</span><b>{state?.repeat?'เปิด':'ปิด'}</b></button></div><p className="micro">{state?.shuffle?'สุ่มไม่ซ้ำจนฟังครบทุกเพลงในรอบ':'เล่นตามลำดับในคิว'} · {state?.repeat?'ฟังครบแล้วเริ่มรอบใหม่':'ฟังครบแล้วหยุด'}</p>
        <ol className="song-list">{state?.queue.map((item,index)=><li key={item.id} className={item.id===current?.id?'current':''}>
            <button className="song-select" onClick={()=>command('select',{id:item.id})}><span className="song-number">{item.id===current?.id?'♫':String(index+1).padStart(2,'0')}</span><img src={`https://i.ytimg.com/vi/${item.videoId}/default.jpg`} alt="" /><span><strong>{item.title}</strong><small>{item.id===current?.id?'กำลังเลือกฟัง':'YouTube · พร้อมเล่น'}</small></span></button>
            <div className="song-actions"><button aria-label={`ย้ายเพลง ${index+1} ขึ้น`} disabled={index===0} onClick={()=>command('move',{id:item.id,direction:-1})}>↑</button><button aria-label={`ย้ายเพลง ${index+1} ลง`} disabled={index===state.queue.length-1} onClick={()=>command('move',{id:item.id,direction:1})}>↓</button><button aria-label={`ลบเพลง ${index+1}`} onClick={()=>command('remove',{id:item.id})}>×</button></div>
        </li>)}</ol>{!state?.queue.length&&<div className="empty-queue"><span>✦</span><p>คิวว่าง แต่บรรยากาศพร้อมแล้ว</p><small>ทุกคนในห้องช่วยกันเพิ่มเพลงได้</small></div>}
        </div>
        <div id="music-chat-panel" role="tabpanel" aria-labelledby="music-chat-tab" hidden={activeTab!=='chat'}><RoomChat socket={socket} roomId={roomId} active={activeTab==='chat'} onUnread={setUnread}/></div>
        <div id="music-log-panel" role="tabpanel" aria-labelledby="music-log-tab" hidden={activeTab!=='log'} className="activity-panel">
            <p className="micro activity-intro">ความเคลื่อนไหวของเพลงในห้อง · ล่าสุดอยู่ด้านบน</p>
            {state?.activity?.length ? <ol className="activity-list">{[...state.activity].reverse().map(entry=><li key={entry.id}>
                <span className="activity-mark" aria-hidden="true">{entry.action==='add'?'＋':entry.action==='remove'?'−':entry.action==='pause'?'Ⅱ':entry.action==='play'?'▶':'♫'}</span>
                <div><p><strong>{entry.actor}</strong> {entry.message}{entry.position!==undefined ? ` ไปที่ ${time(entry.position)}`:''}</p>{entry.title&&<span className="activity-song">{entry.title}</span>}<time dateTime={new Date(entry.timestamp).toISOString()}>{new Date(entry.timestamp).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time></div>
            </li>)}</ol> : <div className="empty-queue"><span>◷</span><p>ยังไม่มีความเคลื่อนไหว</p><small>เมื่อมีคนจัดการเพลง ประวัติจะแสดงที่นี่</small></div>}
            <p className="queue-footnote">เก็บ 100 รายการล่าสุดในห้องนี้<br />ประวัติจะเริ่มใหม่เมื่อเซิร์ฟเวอร์รีสตาร์ต</p>
        </div>
        <div className="queue-footnote" hidden={activeTab!=='queue'}>↗ เพิ่มด้วยลิงก์วิดีโอทีละเพลง<br />คิวจะเริ่มใหม่เมื่อเซิร์ฟเวอร์รีสตาร์ต</div></aside>
    </section>;
}
