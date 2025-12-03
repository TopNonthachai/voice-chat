import React, { useEffect, useState, useRef } from 'react';
import ReactPlayer from 'react-player'; // ใช้ตัวเดิมแต่รองรับทุกค่าย (SC, YT)
import { Socket } from 'socket.io-client';

interface AudioBotProps {
  socket: Socket | null;
  roomId: string;
  onClose: () => void;
}

interface AudioState {
  url: string;
  playing: boolean;
  played: number;
  timestamp: number;
}

const AudioBot: React.FC<AudioBotProps> = ({ socket, roomId, onClose }) => {
    // Default เพลง Lofi (SoundCloud หรือ Youtube ก็ได้)
    const [url, setUrl] = useState('https://soundcloud.com/lakeyinspired/chill-day'); 
    const [playing, setPlaying] = useState(false);
    const [played, setPlayed] = useState(0); // 0.0 - 1.0
    const [inputUrl, setInputUrl] = useState('');
    const [duration, setDuration] = useState(0);
    
    const playerRef = useRef<any>(null);
    const isRemoteUpdate = useRef(false);

    useEffect(() => {
        if (!socket) return;

        // รับคำสั่ง Sync
        const handleUpdate = (state: AudioState) => {
        isRemoteUpdate.current = true;
        setUrl(state.url);
        setPlaying(state.playing);
        setPlayed(state.played); // อัปเดต UI Progress bar
        
        if (playerRef.current) {
            const currentTime = playerRef.current.getCurrentTime();
            const totalDuration = playerRef.current.getDuration();
            const targetTime = state.played * totalDuration;

            // ถ้าเวลาต่างกันเกิน 2 วิ ค่อย Seek (เพื่อความเนียน)
            if (Math.abs(currentTime - targetTime) > 2) {
            playerRef.current.seekTo(state.played);
            }
        }
        setTimeout(() => { isRemoteUpdate.current = false; }, 500);
        };

        socket.on('audio-update', handleUpdate);
        socket.on('audio-sync-state', handleUpdate);

        return () => {
        socket.off('audio-update');
        socket.off('audio-sync-state');
        };
    }, [socket]);

    // ฟังก์ชันบอก Server
    const emitChange = (newPlaying: boolean, newPlayed: number) => {
        if (isRemoteUpdate.current || !socket) return;
        
        const state: AudioState = {
        url,
        playing: newPlaying,
        played: newPlayed,
        timestamp: Date.now()
        };
        socket.emit('audio-change', { roomId, audioState: state });
    };

    const handleUrlSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputUrl && socket) {
        setUrl(inputUrl);
        const state = { url: inputUrl, playing: true, played: 0, timestamp: Date.now() };
        socket.emit('audio-change', { roomId, audioState: state });
        setInputUrl('');
        }
    };

    // แปลงวินาทีเป็นนาที:วินาที
    const formatTime = (seconds: number) => {
        const date = new Date(seconds * 1000);
        const hh = date.getUTCHours();
        const mm = date.getUTCMinutes();
        const ss = date.getUTCSeconds().toString().padStart(2, '0');
        if (hh) return `${hh}:${mm.toString().padStart(2, '0')}:${ss}`;
        return `${mm}:${ss}`;
    };
    
    const ReactPlayerAny = ReactPlayer as any;
    return (
        <div className="bg-gradient-to-r from-purple-900 to-indigo-900 p-4 rounded-xl border border-purple-500 w-full max-w-md mb-4 shadow-2xl">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
            <div className="flex items-center text-white">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2"></div>
            <span className="font-bold text-sm uppercase tracking-wider">Music Station</span>
            </div>
            <button onClick={onClose} className="text-gray-300 hover:text-white">
            <i className="fas fa-times"></i>
            </button>
        </div>

        {/* Hidden Player (ซ่อนไว้แต่ยังทำงาน) */}
        <div className="hidden">
            <ReactPlayerAny
                ref={playerRef}
                url={url}
                playing={playing}
                width="0"
                height="0"
                onProgress={(p) => { 
                    // อัปเดต Progress bar เฉพาะตอนเล่น
                    if (!isRemoteUpdate.current) setPlayed(p.played); 
                }}
                onDuration={setDuration}
                onEnded={() => setPlaying(false)}
            />
        </div>

        {/* Visualizer UI (เท่ๆ) */}
        <div className="flex items-center justify-center mb-4 space-x-1 h-8">
            {[...Array(10)].map((_, i) => (
                <div key={i} className={`w-1 bg-purple-400 rounded-full transition-all duration-100 ${playing ? 'animate-bounce' : 'h-1'}`} 
                    style={{ height: playing ? `${Math.random() * 100}%` : '4px', animationDelay: `${i * 0.1}s` }}>
                </div>
            ))}
        </div>

        {/* Control Bar */}
        <div className="flex flex-col space-y-2">
            {/* Progress Bar */}
            <input
            type="range"
            min={0}
            max={0.999999}
            step="any"
            value={played}
            onChange={(e) => {
                const val = parseFloat(e.target.value);
                setPlayed(val);
                playerRef.current?.seekTo(val);
                emitChange(playing, val);
            }}
            className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
            />
            
            <div className="flex justify-between text-xs text-gray-400 font-mono">
            <span>{formatTime(duration * played)}</span>
            <span>{formatTime(duration)}</span>
            </div>

            {/* Play/Pause Buttons */}
            <div className="flex justify-center items-center gap-4">
            <button 
                onClick={() => { setPlaying(!playing); emitChange(!playing, played); }}
                className="w-12 h-12 bg-white rounded-full text-purple-900 flex items-center justify-center hover:scale-110 transition shadow-lg"
            >
                <i className={`fas ${playing ? 'fa-pause' : 'fa-play'} text-xl ml-1`}></i>
            </button>
            </div>
        </div>

        {/* Input URL */}
        <form onSubmit={handleUrlSubmit} className="mt-4 relative">
            <input 
            type="text" 
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="SoundCloud / YouTube URL..." 
            className="w-full bg-black/30 text-white text-xs px-3 py-2 rounded-lg border border-purple-500/30 focus:border-purple-500 outline-none pr-8"
            />
            <i className="fas fa-link absolute right-3 top-2.5 text-gray-400 text-xs"></i>
        </form>
        </div>
    );
};

export default AudioBot;