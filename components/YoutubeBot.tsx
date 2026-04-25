import React, { useEffect, useState, useRef } from 'react';
import ReactPlayer from 'react-player'; 
import { Socket } from 'socket.io-client';

const ReactPlayerAny = ReactPlayer as any;

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
    const [isReady, setIsReady] = useState(false);
    
    const playerRef = useRef<any>(null);
    const isRemoteUpdate = useRef(false);

    // ฟังก์ชันช่วยดึง Video ID จาก URL ของ YouTube
    const getYouTubeID = (url: string) => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : url;
    };

    useEffect(() => {
        if (!socket) {
            console.warn("⚠️ [YoutubeBot] No socket connection");
            return;
        }

        const handleUpdate = (state: VideoState) => {
            const currentID = getYouTubeID(url);
            const incomingID = getYouTubeID(state.url);

            // ถ้าเป็น Video เดียวกันและกำลังเล่น/หยุดเหมือนกัน ให้ข้ามไป
            if (currentID === incomingID && state.playing === playing) {
                return;
            }

            isRemoteUpdate.current = true;
            console.log(`📥 [YoutubeBot] Syncing: ${incomingID} (Playing: ${state.playing})`);
            
            if (currentID !== incomingID) {
                setUrl(state.url);
                setPlaying(state.playing);
            } else {
                setPlaying(state.playing);
            }
            
            if (playerRef.current && state.played > 0) {
                const currentTime = playerRef.current.getCurrentTime();
                if (Math.abs(currentTime - state.played) > 5) {
                    playerRef.current.seekTo(state.played, 'seconds');
                }
            }
            
            // ปลดล็อค Remote Update หลังจาก UI อัปเดตเสร็จ
            setTimeout(() => { isRemoteUpdate.current = false; }, 1500);
        };

        socket.on('youtube-update', handleUpdate);
        socket.on('youtube-sync-state', handleUpdate);

        return () => {
            socket.off('youtube-update');
            socket.off('youtube-sync-state');
        };
    }, [socket, url, playing]);

    const emitChange = (newPlaying: boolean) => {
        // ถ้าเป็นการอัปเดตที่มาจากคนอื่น (Remote) ห้ามส่งกลับไปหา Server (ป้องกัน Loop)
        if (isRemoteUpdate.current || !socket) return;
        
        const played = playerRef.current ? playerRef.current.getCurrentTime() : 0;
        const state: VideoState = {
            url,
            playing: newPlaying,
            played,
            timestamp: Date.now()
        };
        console.log(`📤 [YoutubeBot] Emitting Change: ${getYouTubeID(url)}`);
        socket.emit('youtube-change', { roomId, videoState: state });
    };

    const handleUrlSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const cleanUrl = inputUrl.trim();
        console.log(`👤 [User] Processing URL: ${cleanUrl}`);
        
        if (!cleanUrl) return;

        // บังคับเปลี่ยน State ภายในก่อน
        setUrl(cleanUrl);
        setPlaying(true);
        setIsReady(false);
        
        if (socket && socket.connected) {
            console.log("📤 [YoutubeBot] Emitting youtube-change to server...");
            const state = { 
                url: cleanUrl, 
                playing: true, 
                played: 0, 
                timestamp: Date.now() 
            };
            socket.emit('youtube-change', { roomId, videoState: state });
            setInputUrl('');
        } else {
            console.error("❌ [YoutubeBot] Cannot emit: Socket not connected!");
            alert("Error: Signaling server not connected. Please refresh.");
        }
    };

    return (
        <div className="bg-black/90 p-4 rounded-lg border border-discord-primary w-full max-w-2xl mb-4 shadow-2xl relative">
            <div className="flex justify-between items-center mb-3">
                <div className="flex items-center text-white">
                    <i className="fab fa-youtube text-red-500 text-xl mr-2"></i>
                    <span className="font-bold">Video Player</span>
                    {!isReady && <span className="ml-2 text-xs text-yellow-400 animate-pulse">(Loading...)</span>}
                </div>
                <button 
                    onClick={onClose}
                    className="text-gray-400 hover:text-white text-sm bg-gray-800 px-2 py-1 rounded hover:bg-red-600 transition"
                >
                    Close
                </button>
            </div>

            <div 
                className="bg-black rounded overflow-hidden relative group border-2 border-red-500" 
                style={{ width: '100%', height: '360px' }}
            >
                <ReactPlayerAny
                    ref={playerRef}
                    url={url}
                    playing={playing}
                    controls={true}
                    width="100%"
                    height="100%"
                    onReady={() => {
                        console.log("✅ [YoutubeBot] Player Ready");
                        setIsReady(true);
                    }}
                    onPlay={() => emitChange(true)}
                    onPause={() => emitChange(false)}
                    onError={(e: any) => console.error("❌ [YoutubeBot] Error:", e)}
                />
            </div>

            <form onSubmit={handleUrlSubmit} className="mt-3 flex gap-2">
                <input 
                    type="text" 
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    placeholder="Paste YouTube Link here..." 
                    className="flex-1 bg-gray-800 text-white text-sm px-3 py-2 rounded border border-gray-700 focus:border-red-500 outline-none"
                />
                <button type="submit" className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-bold transition-all active:scale-95">
                    Load
                </button>
            </form>
        </div>
    );
};

export default YoutubeBot;