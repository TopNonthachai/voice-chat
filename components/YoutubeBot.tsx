import React, { useEffect, useState, useRef } from 'react';
import ReactPlayer from 'react-player';
import { Socket } from 'socket.io-client';

interface YoutubeBotProps {
    socket: Socket | null;
    roomId: string;
    onClose: () => void;
}

interface VideoState {
    url: string;
    playing: boolean;
    played: number;
    timestamp: number;
}

const YoutubeBot: React.FC<YoutubeBotProps> = ({ socket, roomId, onClose }) => {
    const [url, setUrl] = useState('https://www.youtube.com/watch?v=LXb3EKWsInQ');
    const [playing, setPlaying] = useState(false);
    const [inputUrl, setInputUrl] = useState('');
    
    const playerRef = useRef<any>(null);
    const isRemoteUpdate = useRef(false); // ตัวกัน Loop สำคัญมาก

    useEffect(() => {
        if (!socket) return;

        const handleUpdate = (state: VideoState) => {
            // เช็คว่าสถานะเปลี่ยนจริงไหม (กัน Loop)
            if (state.url === url && state.playing === playing) return;

            isRemoteUpdate.current = true; // ยกธงบอกว่า "นี่เป็นคำสั่งจาก Server นะ"
            
            setUrl(state.url);
            setPlaying(state.playing);
            
            if (playerRef.current) {
                const currentTime = playerRef.current.getCurrentTime();
                const duration = playerRef.current.getDuration();
                
                // ถ้าเป็นคลิปใหม่ หรือเวลาต่างกันเกิน 2 วิ ค่อย Seek
                if (Math.abs(currentTime - (state.played * duration)) > 2) {
                    playerRef.current.seekTo(state.played);
                }
            }
            
            // เอาธงลงเมื่อเวลาผ่านไป (กัน onPlay/onPause ทำงานซ้อน)
            setTimeout(() => { isRemoteUpdate.current = false; }, 1000);
        };

        socket.on('youtube-update', handleUpdate);
        socket.on('youtube-sync-state', handleUpdate);

        return () => {
            socket.off('youtube-update');
            socket.off('youtube-sync-state');
        };
    }, [socket, url, playing]);

    const emitChange = (newPlaying: boolean, played = 0) => {
        // ถ้าธงยกอยู่ (Server สั่งมา) ห้ามส่งกลับ! -> แก้ AbortError
        if (isRemoteUpdate.current || !socket) return;

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
            // 1. เปลี่ยนจอตัวเองทันที (แก้ปัญหาคนกดไม่เห็น)
            setUrl(inputUrl);
            setPlaying(true);
            
            // 2. บอกเพื่อน
            const state = { url: inputUrl, playing: true, played: 0, timestamp: Date.now() };
            socket.emit('youtube-change', { roomId, videoState: state });
            setInputUrl('');
        }
    };

    // แปลง Type เพื่อปิดปาก TypeScript
    const ReactPlayerAny = ReactPlayer as any;

    return (
        <div className="bg-black/90 p-4 rounded-lg border border-discord-primary w-full max-w-2xl mb-4 shadow-2xl relative">
            <div className="flex justify-between items-center mb-3">
                <div className="flex items-center text-white">
                    <i className="fab fa-youtube text-red-500 text-xl mr-2"></i>
                    <span className="font-bold">Video Player</span>
                </div>
                <button 
                    onClick={onClose}
                    className="text-gray-400 hover:text-white text-sm bg-gray-800 px-2 py-1 rounded hover:bg-red-600 transition"
                >
                    <i className="fas fa-times mr-1"></i> Disconnect
                </button>
            </div>

            <div className="aspect-video bg-black rounded overflow-hidden relative">
                <ReactPlayerAny
                    ref={playerRef}
                    url={url}
                    playing={playing}
                    controls={true}
                    width="100%"
                    height="100%"
                    // เพิ่มความหน่วงกันรัว
                    onPlay={() => { 
                        if(!playing) { 
                            setPlaying(true); 
                            emitChange(true, playerRef.current?.getCurrentTime() || 0); 
                        }
                    }}
                    onPause={() => { 
                        if(playing) {
                            setPlaying(false); 
                            emitChange(false, playerRef.current?.getCurrentTime() || 0);
                        }
                    }}
                    onSeek={(e: any) => { emitChange(playing, e); }}
                />
            </div>

            <form onSubmit={handleUrlSubmit} className="mt-3 flex gap-2">
                <input 
                    type="text" 
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder="Paste YouTube Link..." 
                    className="flex-1 bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-700 focus:border-red-500 outline-none"
                />
                <button type="submit" className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-bold">
                    Change
                </button>
            </form>
        </div>
    );
};

export default YoutubeBot;