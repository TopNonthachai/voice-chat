import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import Peer from 'peerjs';
import AudioVisualizer from './AudioVisualizer';

// Initial Configuration
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
    
    // State
    const [peerNames, setPeerNames] = useState<{[key: string]: string}>({});
    const [myStream, setMyStream] = useState<MediaStream | null>(null);
    const [peers, setPeers] = useState<PeerUser[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [userId, setUserId] = useState<string>('');
    const [socketConnected, setSocketConnected] = useState(false);

    // Refs
    const socketRef = useRef<Socket | null>(null);
    const peerRef = useRef<Peer | null>(null);
    const peersMapRef = useRef<Map<string, any>>(new Map());
    const myStreamRef = useRef<MediaStream | null>(null);

    // Main Initialization Effect
    useEffect(() => {
        let mounted = true;

        const init = async () => {
            try {
                // 1. Get User Media
                if (!myStreamRef.current) {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: false,
                        audio: true,
                    });
                    if (mounted) {
                        setMyStream(stream);
                        myStreamRef.current = stream;
                    }
                }

                const localStream = myStreamRef.current;
                if (!localStream || !mounted) return;

                // 2. Initialize Socket
                console.log(`📡 Connecting to Socket at: ${socketUrl}`);
                const newSocket = io(socketUrl, {
                    transports: ['websocket', 'polling'],
                    reconnection: true,
                    reconnectionAttempts: 10
                });
                socketRef.current = newSocket;

                newSocket.on('connect', () => {
                    console.log("✅ Socket Connected! ID:", newSocket.id);
                    if (mounted) setSocketConnected(true);
                });

                // 3. Initialize PeerJS
                const newPeer = new Peer();
                peerRef.current = newPeer;

                newPeer.on('open', (id) => {
                    console.log("🆔 Peer ID opened:", id);
                    if (mounted) setUserId(id);
                });

                newPeer.on('call', (call) => {
                    console.log("📞 Incoming call from:", call.peer);
                    call.answer(localStream);
                    call.on('stream', (userVideoStream) => {
                        if (mounted) addPeerStream(call.peer, userVideoStream);
                    });
                });

                // Socket Event Listeners
                newSocket.on('user-connected', ({ userId: otherUserId, userName }: { userId: string, userName: string }) => {
                    console.log("👤 User connected:", userName, otherUserId);
                    setPeerNames(prev => ({ ...prev, [otherUserId]: userName }));
                    
                    // Call the new user
                    setTimeout(() => {
                        if (mounted && peerRef.current) {
                            console.log("📞 Calling user:", otherUserId);
                            const call = peerRef.current.call(otherUserId, localStream);
                            call.on('stream', (userVideoStream) => {
                                addPeerStream(otherUserId, userVideoStream);
                            });
                            call.on('close', () => {
                                removePeerStream(otherUserId);
                            });
                            peersMapRef.current.set(otherUserId, call);
                        }
                    }, 1000);
                });

                newSocket.on('existing-users', (users: {[key: string]: string}) => {
                    console.log("👥 Existing users in room:", users);
                    setPeerNames(prev => ({ ...prev, ...users }));
                });

                newSocket.on('user-disconnected', (disconnectedUserId: string) => {
                    console.log("🚫 User disconnected:", disconnectedUserId);
                    if (mounted) {
                        removePeerStream(disconnectedUserId);
                        if (peersMapRef.current.has(disconnectedUserId)) {
                            peersMapRef.current.get(disconnectedUserId).close();
                            peersMapRef.current.delete(disconnectedUserId);
                        }
                    }
                });

            } catch (err) {
                console.error("❌ Initialization error:", err);
            }
        };

        init();

        return () => {
            mounted = false;
            if (socketRef.current) socketRef.current.disconnect();
            if (peerRef.current) peerRef.current.destroy();
        };
    }, [roomId, socketUrl]);

    // Room Joining Effect
    useEffect(() => {
        if (socketConnected && userId && roomId && socketRef.current) {
            console.log(`🚀 Joining room ${roomId} as ${userId} (${myName})`);
            socketRef.current.emit('join-room', roomId, userId, myName);
        }
    }, [socketConnected, userId, roomId, myName]);

    // Helper Functions
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

    const leaveRoom = () => {
        if (myStreamRef.current) {
            myStreamRef.current.getTracks().forEach(track => track.stop());
        }
        if (peerRef.current) {
            peerRef.current.destroy();
        }
        navigate('/');
    };

    const copyRoomId = () => {
        if (roomId) {
            navigator.clipboard.writeText(roomId);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-discord-dark">
            {/* Header */}
            <header className="bg-discord-darkest p-4 shadow-md flex justify-between items-center z-10">
                <div className="flex items-center space-x-3">
                    <i className="fas fa-hashtag text-discord-muted text-xl"></i>
                    <h1 className="font-bold text-white tracking-wide">Voice Channel</h1>
                    <div className="flex items-center space-x-2">
                        <span className={`h-2 w-2 rounded-full ${socketConnected ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`}></span>
                        <span className="text-xs text-discord-muted hidden sm:inline">
                            {socketConnected ? 'Connected' : 'Connecting...'}
                        </span>
                    </div>
                </div>
                <div className="flex space-x-2 sm:space-x-4">
                    <button onClick={copyRoomId} className="bg-discord-primary hover:bg-blue-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded text-sm font-medium transition flex items-center">
                        <i className="fas fa-copy sm:mr-2"></i>
                        <span className="hidden sm:inline">Copy ID</span>
                    </button>
                    <button onClick={leaveRoom} className="bg-discord-danger hover:bg-red-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded text-sm font-medium transition flex items-center">
                        <i className="fas fa-phone-slash sm:mr-2"></i>
                        <span className="hidden sm:inline">Disconnect</span>
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-6 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {/* My Card */}
                    <div className="bg-discord-darker rounded-lg p-4 flex flex-col items-center justify-center relative border border-discord-darkest shadow-sm aspect-video group">
                        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 ${isMuted ? 'bg-discord-danger' : 'bg-discord-success'} relative overflow-hidden ring-4 ring-discord-darkest`}>
                            {myStream && (
                                <div className="absolute inset-0 opacity-50">
                                    <AudioVisualizer stream={myStream} isMuted={isMuted} height={96} />
                                </div>
                            )}
                            <img src={`https://picsum.photos/seed/${userId || 'me'}/200`} alt="Me" className="w-20 h-20 rounded-full border-4 border-discord-darker z-10" />
                        </div>
                        <div className="font-semibold text-white mb-1">{myName} (You)</div>
                        <div className="flex items-center space-x-2 text-xs text-discord-muted">
                            {isMuted ? <i className="fas fa-microphone-slash text-discord-danger"></i> : <i className="fas fa-microphone text-discord-success"></i>}
                            <span>{isMuted ? 'Muted' : 'Connected'}</span>
                        </div>
                        <div className="absolute bottom-4 right-4 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={toggleMute} className={`w-10 h-10 rounded-full flex items-center justify-center transition shadow-lg ${isMuted ? 'bg-white text-discord-danger' : 'bg-discord-dark text-white hover:bg-discord-light'}`}>
                                <i className={`fas ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                            </button>
                        </div>
                    </div>

                    {/* Remote Peers */}
                    {peers.map((peer) => (
                        <div key={peer.userId} className="bg-discord-darker rounded-lg p-4 flex flex-col items-center justify-center border border-discord-darkest shadow-sm aspect-video">
                            <div className="w-24 h-24 rounded-full bg-discord-primary flex items-center justify-center mb-4 relative overflow-hidden ring-4 ring-discord-darkest">
                                <div className="absolute inset-0 opacity-50">
                                    <AudioVisualizer stream={peer.stream} isMuted={false} height={96} />
                                </div>
                                <img src={`https://picsum.photos/seed/${peer.userId}/200`} alt="Peer" className="w-20 h-20 rounded-full border-4 border-discord-darker z-10" />
                                <audio ref={(audio) => { if (audio) { audio.srcObject = peer.stream; audio.play().catch(e => console.error("Auto-play prevented", e)); } }} />
                            </div>
                            <div className="font-semibold text-white mb-1 truncate w-full text-center">{peerNames[peer.userId] || 'Guest'}</div>
                            <div className="text-xs text-discord-success flex items-center">
                                <i className="fas fa-signal mr-1"></i> Live
                            </div>
                        </div>
                    ))}

                    {/* Waiting State */}
                    {peers.length === 0 && (
                        <div className="bg-discord-darker rounded-lg p-4 flex flex-col items-center justify-center border-2 border-dashed border-discord-light text-discord-muted aspect-video opacity-50">
                            <i className="fas fa-user-plus text-3xl mb-2"></i>
                            <p className="text-sm">Waiting for others...</p>
                        </div>
                    )}
                </div>
            </main>

            {/* Footer */}
            <footer className="bg-discord-darkest p-2 px-4 flex justify-between items-center text-xs text-discord-muted">
                <div className="flex items-center space-x-2">
                    <span className="font-mono bg-discord-dark px-1 rounded">{roomId}</span>
                </div>
                <div>{peers.length + 1} User{peers.length + 1 !== 1 ? 's' : ''} in room</div>
            </footer>
        </div>
    );
};

export default Room;