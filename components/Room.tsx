import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import Peer from 'peerjs';
import AudioVisualizer from './AudioVisualizer';

// กำหนด URL ของ Socket Server
const getSocketUrl = () => {
    if (window.location.hostname === 'localhost') return 'http://localhost:3001';
    return window.location.origin;
};

interface PeerUser {
  userId: string;
  stream: MediaStream;
}

const Room: React.FC = () => {
    const { roomId } = useParams<{ roomId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const myName = location.state?.userName || 'Guest';
    const socketUrl = getSocketUrl();
    
    const [peerNames, setPeerNames] = useState<{[key: string]: string}>({});
    const [myStream, setMyStream] = useState<MediaStream | null>(null);
    const [peers, setPeers] = useState<PeerUser[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [userId, setUserId] = useState<string>('');
    const [socketConnected, setSocketConnected] = useState(false);

    const socketRef = useRef<Socket | null>(null);
    const peerRef = useRef<Peer | null>(null);
    const peersMapRef = useRef<Map<string, any>>(new Map());
    const myStreamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        let mounted = true;

        const init = async () => {
            try {
                // 1. ขอสิทธิ์ไมโครโฟน
                const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
                if (mounted) {
                    setMyStream(stream);
                    myStreamRef.current = stream;
                }

                // 2. เชื่อมต่อ Socket.io
                const socket = io(socketUrl, {
                    transports: ['websocket', 'polling'],
                    reconnection: true
                });
                socketRef.current = socket;

                socket.on('connect', () => {
                    console.log("✅ Socket Connected:", socket.id);
                    setSocketConnected(true);
                });

                // 3. เชื่อมต่อ PeerJS
                const peer = new Peer();
                peerRef.current = peer;

                peer.on('open', (id) => {
                    console.log("🆔 My Peer ID:", id);
                    setUserId(id);
                });

                peer.on('call', (call) => {
                    console.log("📞 Receiving call from:", call.peer);
                    call.answer(stream);
                    call.on('stream', (remoteStream) => {
                        if (mounted) addPeerStream(call.peer, remoteStream);
                    });
                });

                // 4. ฟังเหตุการณ์จาก Socket
                socket.on('user-connected', ({ userId: otherId, userName }: { userId: string, userName: string }) => {
                    console.log("👤 User Joined:", userName);
                    setPeerNames(prev => ({ ...prev, [otherId]: userName }));
                    
                    // หน่วงเวลาเล็กน้อยเพื่อให้ Peer ปลายทางพร้อมรับสาย
                    setTimeout(() => {
                        if (peerRef.current && mounted) {
                            const call = peerRef.current.call(otherId, stream);
                            call.on('stream', (remoteStream) => {
                                addPeerStream(otherId, remoteStream);
                            });
                            peersMapRef.current.set(otherId, call);
                        }
                    }, 1500);
                });

                socket.on('existing-users', (users: {[key: string]: string}) => {
                    setPeerNames(prev => ({ ...prev, ...users }));
                });

                socket.on('user-disconnected', (id: string) => {
                    removePeerStream(id);
                    if (peersMapRef.current.has(id)) {
                        peersMapRef.current.get(id).close();
                        peersMapRef.current.delete(id);
                    }
                });

            } catch (err) {
                console.error("Initialization failed:", err);
                alert("Please allow microphone access to use voice chat.");
            }
        };

        init();

        return () => {
            mounted = false;
            if (socketRef.current) socketRef.current.disconnect();
            if (peerRef.current) peerRef.current.destroy();
            if (myStreamRef.current) myStreamRef.current.getTracks().forEach(t => t.stop());
        };
    }, []);

    // เมื่อพร้อมแล้วให้ Join Room
    useEffect(() => {
        if (socketConnected && userId && roomId) {
            socketRef.current?.emit('join-room', roomId, userId, myName);
        }
    }, [socketConnected, userId, roomId, myName]);

    const addPeerStream = (id: string, stream: MediaStream) => {
        setPeers(prev => {
            if (prev.find(p => p.userId === id)) return prev;
            return [...prev, { userId: id, stream }];
        });
    };

    const removePeerStream = (id: string) => {
        setPeers(prev => prev.filter(p => p.userId !== id));
    };

    const toggleMute = () => {
        if (myStreamRef.current) {
            const audioTrack = myStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    };

    const copyRoomId = () => {
        if (roomId) navigator.clipboard.writeText(roomId);
    };

    const leaveRoom = () => {
        navigate('/');
    };

    return (
        <div className="flex flex-col h-screen bg-discord-dark">
            <header className="bg-discord-darkest p-4 shadow-md flex justify-between items-center z-10">
                <div className="flex items-center space-x-3">
                    <i className="fas fa-hashtag text-discord-muted text-xl"></i>
                    <h1 className="font-bold text-white tracking-wide">Voice Channel</h1>
                    <div className="flex items-center space-x-2">
                        <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`}></span>
                        <span className="text-xs text-discord-muted">
                            {socketConnected ? 'Connected' : 'Connecting...'}
                        </span>
                    </div>
                </div>
                <div className="flex space-x-2">
                    <button onClick={copyRoomId} className="bg-discord-primary hover:bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium transition">
                        Copy ID
                    </button>
                    <button onClick={leaveRoom} className="bg-discord-danger hover:bg-red-600 text-white px-4 py-2 rounded text-sm font-medium transition">
                        Disconnect
                    </button>
                </div>
            </header>

            <main className="flex-1 p-6 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {/* My Card */}
                    <div className="bg-discord-darker rounded-lg p-4 flex flex-col items-center justify-center relative border border-discord-darkest aspect-video">
                        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 ${isMuted ? 'bg-discord-danger' : 'bg-discord-success'} relative overflow-hidden ring-4 ring-discord-darkest`}>
                            {myStream && (
                                <div className="absolute inset-0 opacity-50">
                                    <AudioVisualizer stream={myStream} isMuted={isMuted} height={96} />
                                </div>
                            )}
                            <img src={`https://picsum.photos/seed/${userId || 'me'}/200`} alt="Me" className="w-20 h-20 rounded-full border-4 border-discord-darker z-10" />
                        </div>
                        <div className="font-semibold text-white mb-1">{myName} (You)</div>
                        <div className="absolute bottom-4 right-4">
                            <button onClick={toggleMute} className={`w-10 h-10 rounded-full flex items-center justify-center transition shadow-lg ${isMuted ? 'bg-white text-discord-danger' : 'bg-discord-dark text-white'}`}>
                                <i className={`fas ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                            </button>
                        </div>
                    </div>

                    {/* Remote Peers */}
                    {peers.map((peer) => (
                        <div key={peer.userId} className="bg-discord-darker rounded-lg p-4 flex flex-col items-center justify-center border border-discord-darkest aspect-video">
                            <div className="w-24 h-24 rounded-full bg-discord-primary flex items-center justify-center mb-4 relative overflow-hidden ring-4 ring-discord-darkest">
                                <div className="absolute inset-0 opacity-50">
                                    <AudioVisualizer stream={peer.stream} isMuted={false} height={96} />
                                </div>
                                <img src={`https://picsum.photos/seed/${peer.userId}/200`} alt="Peer" className="w-20 h-20 rounded-full border-4 border-discord-darker z-10" />
                                <audio autoPlay ref={(audio) => { if (audio) audio.srcObject = peer.stream; }} />
                            </div>
                            <div className="font-semibold text-white mb-1">{peerNames[peer.userId] || 'Guest'}</div>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
};

export default Room;