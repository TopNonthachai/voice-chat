import React, { useEffect, useState, useRef } from 'react';
import ReactPlayer from 'react-player';
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
    const [url, setUrl] = useState('https://soundcloud.com/lakeyinspired/chill-day');
    const [playing, setPlaying] = useState(false);
    const [played, setPlayed] = useState(0);
    const [inputUrl, setInputUrl] = useState('');
    const [duration, setDuration] = useState(0);
    
    const playerRef = useRef<any>(null);
    const isRemoteUpdate = useRef(false);

    useEffect(() => {
        if (!socket) return;

        const handleUpdate = (state: AudioState) => {
            if (state.url === url && state.playing === playing) return;

            isRemoteUpdate.current = true;
            setUrl(state.url);
            setPlaying(state.playing);
            setPlayed(state.played);
            
            if (playerRef.current) {
                const currentTime = playerRef.current.getCurrentTime() || 0;
                const totalDuration = playerRef.current.getDuration() || 1;
                // ถ้าเวลาต่างกันเกิน 2 วิ ค่อย Seek
                if (Math.abs(currentTime - (state.played * totalDuration)) > 2) {
                    playerRef.current.seekTo(state.played);
                }
            }
            setTimeout(() => { isRemoteUpdate.current = false; }, 1000);
        };

        socket.on('audio-update', handleUpdate);
        socket.on('audio-sync-state', handleUpdate);

        return () => {
            socket.off('audio-update');
            socket.off('audio-sync-state');
        };
    }, [socket, url, playing]);

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
            // 1. เปลี่ยนจอตัวเองทันที
            setUrl(inputUrl);
            setPlaying(true);
            setPlayed(0);

            // 2. บอกเพื่อน
            const state = { url: inputUrl, playing: true, played: 0, timestamp: Date.now() };
            socket.emit('audio-change', { roomId, audioState: state });
            setInputUrl('');
        }
    };

    const ReactPlayerAny = ReactPlayer as any;

    // Helper format time
    const formatTime = (seconds: number) => {
        if (!seconds || isNaN(seconds)) return "00:00";
        const date = new Date(seconds * 1000);
        const mm = date.getUTCMinutes();
        const ss = date.getUTCSeconds().toString().padStart(2, '0');
        return `${mm}:${ss}`;
    };

    return (
        <div className="bg-gradient-to-r from-purple-900 to-indigo-900 p-4 rounded-xl border border-purple-500 w-full max-w-md mb-4 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center text-white">
                    <div className={`w-2 h-2 bg-green-400 rounded-full mr-2 ${playing ? 'animate-pulse' : ''}`}></div>
                    <span className="font-bold text-sm uppercase tracking-wider">Music Station</span>
                </div>
                <button onClick={onClose} className="text-gray-300 hover:text-white">
                    <i className="fas fa-times"></i>
                </button>
            </div>

            <div className="hidden">
                <ReactPlayerAny
                    ref={playerRef}
                    url={url}
                    playing={playing}
                    width="0"
                    height="0"
                    onProgress={(p: any) => { 
                        if (!isRemoteUpdate.current) setPlayed(p.played); 
                    }}
                    onDuration={setDuration}
                    onEnded={() => setPlaying(false)}
                />
            </div>

            {/* Visualizer UI */}
            <div className="flex items-center justify-center mb-4 space-x-1 h-8">
                {[...Array(10)].map((_, i) => (
                    <div key={i} className={`w-1 bg-purple-400 rounded-full transition-all duration-100 ${playing ? 'animate-bounce' : 'h-1'}`} 
                        style={{ height: playing ? `${Math.random() * 100}%` : '4px', animationDelay: `${i * 0.1}s` }}>
                    </div>
                ))}
            </div>

            {/* Control Bar */}
            <div className="flex flex-col space-y-2">
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

                <div className="flex justify-center items-center gap-4">
                    <button 
                        onClick={() => { 
                            const newStatus = !playing;
                            setPlaying(newStatus); 
                            emitChange(newStatus, played); 
                        }}
                        className="w-12 h-12 bg-white rounded-full text-purple-900 flex items-center justify-center hover:scale-110 transition shadow-lg"
                    >
                        <i className={`fas ${playing ? 'fa-pause' : 'fa-play'} text-xl ml-1`}></i>
                    </button>
                </div>
            </div>

            <form onSubmit={handleUrlSubmit} className="mt-4 relative">
                <input 
                    type="text" 
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder="SoundCloud / YouTube URL..." 
                    className="w-full bg-black/30 text-white text-xs px-3 py-2 rounded-lg border border-purple-500/30 focus:border-purple-500 outline-none pr-8"
                />
                <button type="submit" className="absolute right-2 top-1.5 text-purple-400 hover:text-white">
                    <i className="fas fa-arrow-right"></i>
                </button>
            </form>
        </div>
    );
};

export default AudioBot;