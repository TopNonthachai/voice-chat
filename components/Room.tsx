import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import Peer from 'peerjs';
import AudioVisualizer from './AudioVisualizer';

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
    const [noiseSuppression, setNoiseSuppression] = useState(true);
    const [isPNGtuber, setIsPNGtuber] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
    const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
    const [userId, setUserId] = useState<string>('');
    const [socketConnected, setSocketConnected] = useState(false);

    const socketRef = useRef<Socket | null>(null);
    const peerRef = useRef<Peer | null>(null);
    const screenPeerRef = useRef<Peer | null>(null);
    const peersMapRef = useRef<Map<string, any>>(new Map());
    const myStreamRef = useRef<MediaStream | null>(null);

    const handleSpeaking = (id: string, isSpeaking: boolean) => {
        setActiveSpeakers(prev => {
            const newSet = new Set(prev);
            if (isSpeaking) {
                newSet.add(id);
            } else {
                newSet.delete(id);
            }
            return newSet;
        });
    };

    const toggleNoiseSuppression = async () => {
        const newState = !noiseSuppression;
        setNoiseSuppression(newState);
        
        // Re-acquire stream with new constraints
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: false, 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: newState,
                    autoGainControl: true
                } 
            });
            
            // Replace tracks in existing calls
            const audioTrack = stream.getAudioTracks()[0];
            if (myStreamRef.current) {
                myStreamRef.current.getAudioTracks().forEach(t => t.stop());
                myStreamRef.current.addTrack(audioTrack);
                
                // Update PeerJS calls
                peersMapRef.current.forEach((call) => {
                    const sender = call.peerConnection.getSenders().find((s: any) => s.track.kind === 'audio');
                    if (sender) sender.replaceTrack(audioTrack);
                });
            }
            setMyStream(stream);
            myStreamRef.current = stream;
        } catch (err) {
            console.error("Failed to toggle noise suppression:", err);
        }
    };

    useEffect(() => {
        let mounted = true;

        const init = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: false, 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    } 
                });
                if (mounted) {
                    setMyStream(stream);
                    myStreamRef.current = stream;
                }

                const socket = io(socketUrl, {
                    transports: ['websocket', 'polling'],
                    reconnection: true
                });
                socketRef.current = socket;

                socket.on('connect', () => {
                    console.log("✅ Socket Connected:", socket.id);
                    setSocketConnected(true);
                });

                // --- ปรับการตั้งค่า PeerJS เพื่อเจาะ Firewall ---
                const peer = new Peer({
                    config: {
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' },
                            { urls: 'stun:stun2.l.google.com:19302' },
                            { urls: 'stun:stun3.l.google.com:19302' },
                            { urls: 'stun:stun4.l.google.com:19302' },
                            { urls: 'stun:global.stun.twilio.com:3478' } // เพิ่ม TWILIO STUN
                        ],
                        iceCandidatePoolSize: 10,
                    },
                    debug: 3
                });
                peerRef.current = peer;

                peer.on('open', (id) => {
                    console.log("🆔 My Peer ID:", id);
                    setUserId(id);
                });

                peer.on('call', (call) => {
                    console.log("📞 [Incoming Call] from:", call.peer);
                    call.answer(stream);
                    
                    call.on('stream', (remoteStream) => {
                        console.log("🔊 [Stream Received] from:", call.peer);
                        if (mounted) addPeerStream(call.peer, remoteStream);
                    });

                    const pc = (call as any).peerConnection as RTCPeerConnection;
                    if (pc) {
                        pc.oniceconnectionstatechange = () => {
                            console.log(`🌐 [ICE State] with ${call.peer}: ${pc.iceConnectionState}`);
                        };
                    }
                });

                peer.on('error', (err) => {
                    console.error("❌ [PeerJS Error]:", err.type, err);
                });

                socket.on('user-connected', ({ userId: otherId, userName }: { userId: string, userName: string }) => {
                    console.log("👤 [Socket] User Joined:", userName, "(ID:", otherId, ")");
                    setPeerNames(prev => ({ ...prev, [otherId]: userName }));
                    
                    setTimeout(() => {
                        if (peerRef.current && mounted) {
                            console.log("📡 [Outgoing Call] Calling:", otherId);
                            const call = peerRef.current.call(otherId, stream);
                            
                            if (call) {
                                call.on('stream', (remoteStream) => {
                                    console.log("🔊 [Outgoing Stream Received] from:", otherId);
                                    addPeerStream(otherId, remoteStream);
                                });

                                const pc = (call as any).peerConnection as RTCPeerConnection;
                                if (pc) {
                                    pc.oniceconnectionstatechange = () => {
                                        console.log(`🌐 [ICE State] with ${otherId}: ${pc.iceConnectionState}`);
                                    };
                                }
                                peersMapRef.current.set(otherId, call);
                            }
                        }
                    }, 2500); // เพิ่มเวลาหน่วงเป็น 2.5 วินาที
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

                socket.on('screen-shared', ({ userId: screenId }) => {
                    console.log("🖥️ [Socket] Screen Shared by:", screenId);
                    if (peerRef.current) {
                        const call = peerRef.current.call(screenId, stream);
                        call.on('stream', (remoteStream) => {
                            setRemoteScreenStream(remoteStream);
                        });
                    }
                });

                socket.on('screen-stopped', () => {
                    setRemoteScreenStream(null);
                });

            } catch (err) {
                console.error("Initialization failed:", err);
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

    const toggleScreenShare = async () => {
        if (isScreenSharing) {
            screenStream?.getTracks().forEach(t => t.stop());
            setScreenStream(null);
            setIsScreenSharing(false);
            if (screenPeerRef.current) {
                screenPeerRef.current.destroy();
                screenPeerRef.current = null;
            }
            socketRef.current?.emit('screen-stop', roomId);
        } else {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                setScreenStream(stream);
                setIsScreenSharing(true);

                const screenPeer = new Peer(`${userId}-screen`, {
                    config: peerRef.current?.options.config,
                    debug: 3
                });
                screenPeerRef.current = screenPeer;

                screenPeer.on('open', (id) => {
                    socketRef.current?.emit('screen-start', { roomId, userId: id });
                });

                screenPeer.on('call', (call) => {
                    call.answer(stream);
                });

                stream.getVideoTracks()[0].onended = () => {
                    toggleScreenShare();
                };
            } catch (err) {
                console.error("Screen share failed:", err);
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
                    <button 
                        onClick={() => setIsPNGtuber(!isPNGtuber)} 
                        className={`${isPNGtuber ? 'bg-discord-success' : 'bg-discord-darker'} hover:bg-opacity-80 text-white px-4 py-2 rounded text-sm font-medium transition border border-discord-darkest`}
                    >
                        PNGtuber: {isPNGtuber ? 'ON' : 'OFF'}
                    </button>
                    <button 
                        onClick={toggleNoiseSuppression} 
                        className={`${noiseSuppression ? 'bg-discord-primary' : 'bg-discord-darker'} hover:bg-opacity-80 text-white px-4 py-2 rounded text-sm font-medium transition border border-discord-darkest`}
                    >
                        Noise: {noiseSuppression ? 'ON' : 'OFF'}
                    </button>
                    <button onClick={leaveRoom} className="bg-discord-danger hover:bg-red-600 text-white px-4 py-2 rounded text-sm font-medium transition">
                        Disconnect
                    </button>
                </div>
            </header>

            <main className="flex-1 p-6 overflow-y-auto">
                {(isScreenSharing && screenStream) || remoteScreenStream ? (
                    <div className="mb-6 bg-black rounded-lg overflow-hidden border-2 border-discord-primary aspect-video max-w-4xl mx-auto relative group">
                        <video 
                            autoPlay 
                            playsInline 
                            muted={isScreenSharing} 
                            ref={(video) => { 
                                if (video) {
                                    video.srcObject = isScreenSharing ? screenStream : remoteScreenStream;
                                    video.muted = isScreenSharing;
                                }
                            }} 
                            className="w-full h-full object-contain"
                        />
                        <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 rounded-full text-white text-xs font-bold flex items-center">
                            <span className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></span>
                            {isScreenSharing ? 'YOU ARE SHARING' : 'LIVE SCREEN'}
                        </div>
                    </div>
                ) : null}

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {/* My Card */}
                    <div className={`bg-discord-darker rounded-lg p-4 flex flex-col items-center justify-center relative border transition-all duration-300 aspect-video ${activeSpeakers.has(userId) ? 'border-discord-success ring-2 ring-discord-success ring-opacity-50' : 'border-discord-darkest'}`}>
                        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 ${isMuted ? 'bg-discord-danger' : 'bg-discord-success'} relative overflow-hidden ring-4 ring-discord-darkest transition-transform duration-100 ${isPNGtuber && activeSpeakers.has(userId) ? 'scale-110 -translate-y-2' : ''}`}>
                            {myStream && (
                                <div className="absolute inset-0 opacity-50">
                                    <AudioVisualizer 
                                        stream={myStream} 
                                        isMuted={isMuted} 
                                        height={96} 
                                        onSpeaking={(isSpeaking) => handleSpeaking(userId, isSpeaking)}
                                    />
                                </div>
                            )}
                            <img 
                                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${userId || 'me'}`} 
                                alt="Me" 
                                className={`w-20 h-20 rounded-full border-4 border-discord-darker z-10 bg-discord-dark ${isPNGtuber && !activeSpeakers.has(userId) ? 'grayscale' : ''}`} 
                            />
                        </div>
                        <div className="font-semibold text-white mb-1 flex items-center">
                            {myName} (You)
                            {activeSpeakers.has(userId) && !isMuted && <span className="ml-2 w-2 h-2 bg-discord-success rounded-full animate-ping"></span>}
                        </div>
                        <div className="absolute bottom-4 right-4 flex space-x-2">
                            <button onClick={toggleMute} className={`w-10 h-10 rounded-full flex items-center justify-center transition shadow-lg ${isMuted ? 'bg-white text-discord-danger' : 'bg-discord-dark text-white'}`}>
                                <i className={`fas ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`}></i>
                            </button>
                        </div>
                    </div>

                    {/* Remote Peers */}
                    {peers.map((peer) => (
                        <div key={peer.userId} className={`bg-discord-darker rounded-lg p-4 flex flex-col items-center justify-center border transition-all duration-300 aspect-video ${activeSpeakers.has(peer.userId) ? 'border-discord-success ring-2 ring-discord-success ring-opacity-50' : 'border-discord-darkest'}`}>
                            <div className={`w-24 h-24 rounded-full bg-discord-primary flex items-center justify-center mb-4 relative overflow-hidden ring-4 ring-discord-darkest transition-transform duration-100 ${isPNGtuber && activeSpeakers.has(peer.userId) ? 'scale-110 -translate-y-2' : ''}`}>
                                <div className="absolute inset-0 opacity-50">
                                    <AudioVisualizer 
                                        stream={peer.stream} 
                                        isMuted={false} 
                                        height={96} 
                                        onSpeaking={(isSpeaking) => handleSpeaking(peer.userId, isSpeaking)}
                                    />
                                </div>
                                <img 
                                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${peer.userId}`} 
                                    alt="Peer" 
                                    className={`w-20 h-20 rounded-full border-4 border-discord-darker z-10 bg-discord-dark ${isPNGtuber && !activeSpeakers.has(peer.userId) ? 'grayscale' : ''}`} 
                                />
                                <audio 
                                    autoPlay 
                                    playsInline
                                    ref={(audio) => { 
                                        if (audio && audio.srcObject !== peer.stream) {
                                            audio.srcObject = peer.stream; 
                                            audio.muted = false;
                                        } 
                                    }} 
                                />
                            </div>
                            <div className="font-semibold text-white mb-1 flex items-center">
                                {peerNames[peer.userId] || 'Guest'}
                                {activeSpeakers.has(peer.userId) && <span className="ml-2 w-2 h-2 bg-discord-success rounded-full animate-ping"></span>}
                            </div>
                        </div>
                    ))}
                </div>
            </main>
            
            {/* Control Bar */}
            <footer className="bg-discord-darkest p-4 flex justify-center space-x-4">
                <button 
                    onClick={toggleMute} 
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-discord-danger text-white' : 'bg-discord-dark hover:bg-discord-muted text-white'}`}
                    title={isMuted ? 'Unmute' : 'Mute'}
                >
                    <i className={`fas ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'} text-xl`}></i>
                </button>
                <button 
                    onClick={toggleScreenShare} 
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isScreenSharing ? 'bg-discord-success text-white' : 'bg-discord-dark hover:bg-discord-muted text-white'}`}
                    title="Share Screen"
                >
                    <i className="fas fa-desktop text-xl"></i>
                </button>
            </footer>
        </div>
    );
};

export default Room;