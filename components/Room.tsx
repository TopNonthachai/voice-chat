import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import Peer from 'peerjs';
import AudioVisualizer from './AudioVisualizer';
import YoutubeBot from './YoutubeBot';
import AudioBot from './AudioBot';

// Initial Configuration
const DEFAULT_SOCKET_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3001' 
  : window.location.origin;

interface PeerUser {
  userId: string;
  stream: MediaStream;
}

const Room: React.FC = () => {
    const { roomId } = useParams<{ roomId: string }>();
    const navigate = useNavigate();
    
    // State
    const [myStream, setMyStream] = useState<MediaStream | null>(null);
    const [peers, setPeers] = useState<PeerUser[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [userId, setUserId] = useState<string>('');
    const [socketConnected, setSocketConnected] = useState(false);
    const [connectionError, setConnectionError] = useState(false);
    const [socketUrl, setSocketUrl] = useState(DEFAULT_SOCKET_URL);
    const [isReconnecting, setIsReconnecting] = useState(false);

    // Refs for cleanup and access inside callbacks
    const socketRef = useRef<Socket | null>(null);
    const peerRef = useRef<Peer | null>(null);
    const peersMapRef = useRef<Map<string, any>>(new Map()); // Keep track of Call objects
    const myStreamRef = useRef<MediaStream | null>(null);
    const [showYoutube, setShowYoutube] = useState(false); // เปลี่ยน default เป็น false จะได้ไม่รก
    const [showAudio, setShowAudio] = useState(false);     // State สำหรับ Audio Bot
    // Initialize Room
    useEffect(() => {
        let mounted = true;
        let newSocket: Socket | null = null;
        let newPeer: Peer | null = null;
        let localStream: MediaStream | null = null;

    const init = async () => {
      try {
        setConnectionError(false);
        
        // 1. Get User Media
        // Only request if we don't have it yet to avoid permission spam on re-renders/retries
        if (!myStreamRef.current) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: true,
                });
                localStream = stream;
                setMyStream(stream);
                myStreamRef.current = stream;
            } catch (e) {
                console.error("Media Error:", e);
                alert("Could not access microphone. Please allow permissions.");
                return;
            }
        } else {
            localStream = myStreamRef.current;
        }
        
        if (!mounted || !localStream) return;

        // 2. Initialize Socket
        console.log(`Attempting to connect to ${socketUrl}...`);
        
        newSocket = io(socketUrl, {
            // Force WebSocket to avoid CORS/Mixed Content issues with XHR polling
            transports: ['websocket'], 
            reconnectionAttempts: 3,
            timeout: 5000,
            autoConnect: true
        });
        socketRef.current = newSocket;

        newSocket.on('connect_error', (err) => {
            console.error("Socket connection error:", err);
            if (mounted) {
                setConnectionError(true);
                setSocketConnected(false);
                setIsReconnecting(false);
            }
        });

        newSocket.on('connect', () => {
            console.log("Connected to signaling server");
            if (mounted) {
                setSocketConnected(true);
                setConnectionError(false);
                setIsReconnecting(false);
            }
        });

        newSocket.on('disconnect', () => {
             if (mounted) setSocketConnected(false);
        });

        // 3. Initialize PeerJS
        // We only initialize PeerJS once we have a stream, but it's independent of Socket
        if (!peerRef.current) {
            newPeer = new Peer();
            peerRef.current = newPeer;

            newPeer.on('open', (id) => {
              if (mounted) setUserId(id);
            });

            // Handle incoming calls (When someone else calls ME)
            newPeer.on('call', (call) => {
              call.answer(localStream!); // Answer with my stream
              
              call.on('stream', (userVideoStream) => {
                if (mounted) addPeerStream(call.peer, userVideoStream);
              });
            });

            newPeer.on('error', (err) => {
                console.error("PeerJS error:", err);
            });
        } else {
            newPeer = peerRef.current;
        }

        // Socket Events - User Connections
        newSocket.on('user-connected', (newUserId: string) => {
            console.log('User connected:', newUserId);
            // Allow a small delay for the other user's Peer to be fully ready on the signaling server
            setTimeout(() => {
                if (mounted && newPeer && localStream) connectToNewUser(newUserId, localStream, newPeer);
            }, 1000);
        });

        newSocket.on('user-disconnected', (disconnectedUserId: string) => {
            console.log('User disconnected:', disconnectedUserId);
            if (mounted) {
                removePeerStream(disconnectedUserId);
                if (peersMapRef.current.has(disconnectedUserId)) {
                    peersMapRef.current.get(disconnectedUserId).close();
                    peersMapRef.current.delete(disconnectedUserId);
                }
            }
        });

      } catch (err) {
        console.error("Initialization error", err);
      }
    };

    init();

    return () => {
        mounted = false;
        // Note: We intentionally don't destroy PeerJS here to avoid ID churning on re-renders, 
        // but we do disconnect Socket to handle URL changes.
        if (newSocket) {
            newSocket.disconnect();
            newSocket.removeAllListeners();
        }
        };
    }, [roomId, socketUrl, isReconnecting]);

    // Separate effect to handle joining the room once both ID and Socket are ready
    useEffect(() => {
        if (socketConnected && userId && roomId && socketRef.current) {
            console.log(`Joining room ${roomId} as ${userId}`);
            socketRef.current.emit('join-room', roomId, userId);
        }
    }, [socketConnected, userId, roomId]);

    // Helper: Call a new user
    const connectToNewUser = (otherUserId: string, stream: MediaStream, peer: Peer) => {
    // Call the new user
    const call = peer.call(otherUserId, stream);
    
    // When they answer, we get their stream
    call.on('stream', (userVideoStream) => {
      addPeerStream(otherUserId, userVideoStream);
    });

    call.on('close', () => {
      removePeerStream(otherUserId);
    });

    call.on('error', (e) => {
        console.error("Call error:", e);
    });

    peersMapRef.current.set(otherUserId, call);
    };

    const addPeerStream = (id: string, stream: MediaStream) => {
        setPeers(prev => {
            // Avoid duplicates
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
        // Stop tracks
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

    const handleRetryConnection = (newUrl?: string) => {
        if (newUrl) setSocketUrl(newUrl);
        setIsReconnecting(prev => !prev); // Trigger effect
    };

    if (connectionError) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-discord-darker text-white p-6 text-center">
                <i className="fas fa-satellite-dish text-6xl text-discord-danger mb-6 animate-pulse"></i>
                <h2 className="text-2xl font-bold mb-2">Connection Failed</h2>
                <p className="mb-4 text-discord-muted max-w-md">
                    Could not connect to the signaling server at <code className="bg-black/30 px-1 rounded">{socketUrl}</code>.
                </p>
                
                <div className="w-full max-w-sm bg-discord-dark p-6 rounded-lg shadow-lg border border-discord-light mb-6">
                    <label className="block text-left text-xs font-bold text-discord-muted uppercase mb-2">
                        Signaling Server URL
                    </label>
                    <div className="flex space-x-2">
                        <input 
                            type="text" 
                            value={socketUrl} 
                            onChange={(e) => setSocketUrl(e.target.value)}
                            className="flex-1 bg-discord-darkest border border-discord-light rounded p-2 text-white text-sm"
                        />
                        <button 
                            onClick={() => handleRetryConnection()}
                            className="bg-discord-primary hover:bg-blue-600 text-white px-4 py-2 rounded font-medium transition"
                        >
                            Retry
                        </button>
                    </div>
                </div>

                <div className="bg-discord-dark p-4 rounded text-left text-sm text-discord-text max-w-lg border border-discord-light">
                    <p className="mb-2 font-bold text-yellow-500"><i className="fas fa-exclamation-triangle mr-1"></i> Troubleshooting:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                        <li>Ensure your Node.js server is running (<code className="bg-black/30 px-1 rounded">npm start</code>).</li>
                        <li>If using an online preview (HTTPS), you might need a tunnel (like ngrok) to expose your local server to the internet.</li>
                        <li>Paste the <strong>ngrok</strong> or public URL above if applicable.</li>
                        <li>If running locally, ensure the port matches (default 3001).</li>
                    </ul>
                </div>
            </div>
        )
    }

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
                    <button
                        onClick={copyRoomId}
                        className="bg-discord-primary hover:bg-blue-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded text-sm font-medium transition flex items-center"
                        title="Copy Room ID"
                    >
                        <i className="fas fa-copy sm:mr-2"></i>
                        <span className="hidden sm:inline">Copy ID</span>
                    </button>
                    <button
                        onClick={leaveRoom}
                        className="bg-discord-danger hover:bg-red-600 text-white px-3 py-1.5 sm:px-4 sm:py-2 rounded text-sm font-medium transition flex items-center"
                        title="Disconnect"
                    >
                        <i className="fas fa-phone-slash sm:mr-2"></i>
                        <span className="hidden sm:inline">Disconnect</span>
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-6 overflow-y-auto">

                {/* --- [ย้ายมาไว้ตรงนี้] แผงควบคุม Bot (อยู่นอก Grid) --- */}
                <div className="flex justify-center gap-3 mb-6">
                    {!showYoutube && (
                        <button
                            onClick={() => setShowYoutube(true)}
                            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center shadow transition text-sm font-bold transform hover:scale-105"
                        >
                            <i className="fab fa-youtube mr-2"></i> Open Video Player
                        </button>
                    )}
                    {!showAudio && (
                        <button
                            onClick={() => setShowAudio(true)}
                            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center shadow transition text-sm font-bold transform hover:scale-105"
                        >
                            <i className="fas fa-music mr-2"></i> Open Music Player
                        </button>
                    )}
                </div>

                {/* --- [ย้ายมาไว้ตรงนี้] พื้นที่แสดงผล Bot --- */}
                <div className="flex flex-col items-center w-full gap-6 mb-8">
                    {showYoutube && (
                        <div className="w-full max-w-4xl animate-fade-in-down">
                            <YoutubeBot
                                socket={socketRef.current}
                                roomId={roomId || ''}
                                onClose={() => setShowYoutube(false)}
                            />
                        </div>
                    )}

                    {showAudio && (
                        <div className="w-full max-w-md animate-fade-in-down">
                            <AudioBot
                                socket={socketRef.current}
                                roomId={roomId || ''}
                                onClose={() => setShowAudio(false)}
                            />
                        </div>
                    )}
                </div>

                {/* --- Grid ของ User (My Card + Peers) --- */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">

                    {/* My Card */}
                    <div className="bg-discord-darker rounded-lg p-4 flex flex-col items-center justify-center relative border border-discord-darkest shadow-sm aspect-video group">
                        <div className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 ${isMuted ? 'bg-discord-danger' : 'bg-discord-success'} relative overflow-hidden ring-4 ring-discord-darkest`}>
                            {myStream ? (
                                <div className="absolute inset-0 opacity-50">
                                    <AudioVisualizer stream={myStream} isMuted={isMuted} height={96} />
                                </div>
                            ) : null}
                            <img
                                src={`https://picsum.photos/seed/${userId || 'me'}/200`}
                                alt="Me"
                                className="w-20 h-20 rounded-full border-4 border-discord-darker z-10"
                            />
                        </div>
                        <div className="font-semibold text-white mb-1">You</div>
                        <div className="flex items-center space-x-2 text-xs text-discord-muted">
                            {isMuted ? <i className="fas fa-microphone-slash text-discord-danger"></i> : <i className="fas fa-microphone text-discord-success"></i>}
                            <span>{isMuted ? 'Muted' : 'Connected'}</span>
                        </div>

                        {/* Controls Overlay */}
                        <div className="absolute bottom-4 right-4 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={toggleMute}
                                className={`w-10 h-10 rounded-full flex items-center justify-center transition shadow-lg ${isMuted ? 'bg-white text-discord-danger' : 'bg-discord-dark text-white hover:bg-discord-light'}`}
                                title={isMuted ? "Unmute" : "Mute"}
                            >
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
                                <img
                                    src={`https://picsum.photos/seed/${peer.userId}/200`}
                                    alt="Peer"
                                    className="w-20 h-20 rounded-full border-4 border-discord-darker z-10"
                                />
                                <audio
                                    ref={(audio) => {
                                        if (audio) {
                                            audio.srcObject = peer.stream;
                                            audio.play().catch(e => console.error("Auto-play prevented", e));
                                        }
                                    }}
                                />
                            </div>
                            <div className="font-semibold text-white mb-1 truncate w-full text-center">User {peer.userId.substr(0, 5)}...</div>
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
                <div>
                    {peers.length + 1} User{peers.length + 1 !== 1 ? 's' : ''} in room
                </div>
            </footer>
        </div>
    );
};

export default Room;