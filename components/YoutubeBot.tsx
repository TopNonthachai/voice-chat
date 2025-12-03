import React, { useEffect, useState, useRef } from 'react';
import ReactPlayer from 'react-player';
import { Socket } from 'socket.io-client';

interface YoutubeBotProps {
    socket: Socket | null;
    roomId: string;
    onClose: () => void; // ฟังก์ชันสำหรับคนที่ไม่ต้องการดู
}

interface VideoState {
    url: string;
    playing: boolean;
    played: number; // ตำแหน่งเวลา (0.0 - 1.0)
    timestamp: number; // เวลาที่ส่งข้อมูล (ใช้แก้เรื่อง Delay)
}

const YoutubeBot: React.FC<YoutubeBotProps> = ({ socket, roomId, onClose }) => {
const [url, setUrl] = useState('https://www.youtube.com/watch?v=LXb3EKWsInQ'); // คลิปเริ่มต้น
const [playing, setPlaying] = useState(false);
const [inputUrl, setInputUrl] = useState('');

const playerRef = useRef<any>(null);
const isRemoteUpdate = useRef(false); // ตัวกัน Loop

    useEffect(() => {
        if (!socket) return;

        // 1. รับคำสั่งจากเพื่อน (หรือ Server)
    socket.on('youtube-update', (state: VideoState) => {
        isRemoteUpdate.current = true; // บอกว่านี่คือคำสั่งจาก Server นะ อย่าส่งกลับ
        
        setUrl(state.url);
        setPlaying(state.playing);
        
        // ถ้าเวลาต่างกันมาก ให้ Seek ไปหาเพื่อน
        if (playerRef.current) {
            const currentTime = playerRef.current.getCurrentTime();
            const duration = playerRef.current.getDuration();
            const targetTime = state.played * duration;

            if (Math.abs(currentTime - targetTime) > 2) {
                playerRef.current.seekTo(state.played);
            }
        }
        
    // รีเซ็ตตัวกัน Loop หลังจากผ่านไปนิดนึง
    setTimeout(() => { isRemoteUpdate.current = false; }, 500);
    });

    // 2. รับสถานะตอนเพิ่งเข้าห้อง
    socket.on('youtube-sync-state', (state: VideoState) => {
        isRemoteUpdate.current = true;
        setUrl(state.url);
        setPlaying(state.playing);
    if (playerRef.current) playerRef.current.seekTo(state.played);
        setTimeout(() => { isRemoteUpdate.current = false; }, 1000);
    });

    return () => {
    socket.off('youtube-update');
    socket.off('youtube-sync-state');
    };
}, [socket]);

    // ฟังก์ชันส่งข้อมูลบอกเพื่อน
    const emitChange = (newPlaying: boolean, played = 0) => {
        if (isRemoteUpdate.current || !socket) return; // ถ้าเป็นการปรับจาก Server ไม่ต้องส่งต่อ

        const state: VideoState = {
        url,
        playing: newPlaying,
        played,
        timestamp: Date.now()
        };
        socket.emit('youtube-change', { roomId, videoState: state });
    };

    const handleUrlSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputUrl && socket) {
        setUrl(inputUrl);
        // เปลี่ยนเพลงถือเป็นการ Play ใหม่
        const state = { url: inputUrl, playing: true, played: 0, timestamp: Date.now() };
        socket.emit('youtube-change', { roomId, videoState: state });
        setInputUrl('');
        }
    };

    const ReactPlayerAny = ReactPlayer as any;
    return (
        <div className="bg-black/90 p-4 rounded-lg border border-discord-primary w-full max-w-2xl mb-4 shadow-2xl relative">
        {/* ส่วนหัว Bot */}
        <div className="flex justify-between items-center mb-3">
            <div className="flex items-center text-white">
            <i className="fab fa-youtube text-red-500 text-xl mr-2"></i>
            <span className="font-bold">Music Bot</span>
            </div>
            <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm bg-gray-800 px-2 py-1 rounded hover:bg-red-600 transition"
            >
            <i className="fas fa-times mr-1"></i> Disconnect Bot
            </button>
        </div>

        {/* จอ Youtube */}
       <div className="aspect-video bg-black rounded overflow-hidden relative">
           {/* ใช้ตัวแปรใหม่ที่เราสร้างขึ้น (ReactPlayerAny) */}
           <ReactPlayerAny
               ref={playerRef}
               url={url}
               playing={playing}
               controls={true}
               width="100%"
               height="100%"
               // Events เพื่อจับการกดของผู้ใช้
               onPlay={() => { setPlaying(true); emitChange(true, playerRef.current?.getCurrentTime() || 0); }}
               onPause={() => { setPlaying(false); emitChange(false, playerRef.current?.getCurrentTime() || 0); }}
               onSeek={(e: any) => { emitChange(playing, e); }}
           />
       </div>

        {/* ช่องเปลี่ยนเพลง */}
        <form onSubmit={handleUrlSubmit} className="mt-3 flex gap-2">
            <input 
            type="text" 
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder="Paste Youtube URL here..." 
            className="flex-1 bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-700 focus:border-red-500 outline-none"
            />
            <button type="submit" className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-bold">
            Change Video
            </button>
        </form>
        </div>
    );
};

export default YoutubeBot;