import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import Peer from 'peerjs';
import AudioVisualizer from './AudioVisualizer';
import YoutubeBot from './YoutubeBot';
import ProfileForm, { Avatar, Profile } from './Profile';
import { getMemberToken, saveMemberToken } from './room-access';

const getSocketUrl = () => {
    if (['localhost', '127.0.0.1'].includes(window.location.hostname) && ['3000', '5173'].includes(window.location.port)) return `${window.location.protocol}//${window.location.hostname}:3001`;
    return window.location.origin;
};

interface PeerUser {
  userId: string;
  stream: MediaStream;
}

const Room: React.FC<{ initialProfile: Profile; roomId: string; invite?: string }> = ({ initialProfile, roomId, invite }) => {
    const navigate = useNavigate();
    const [profile, setProfile] = useState(initialProfile);
    const profileRef = useRef(profile);
    profileRef.current = profile;
    const myName = profile.name;
    const [editing, setEditing] = useState(false);
    const [members, setMembers] = useState<Record<string, Profile & {forcedMuted?:boolean;isOwner?:boolean}>>({});
    const [copied, setCopied] = useState(false);
    const [settings,setSettings]=useState<{invite:string;locked:boolean;inviteOnly:boolean;isOwner:boolean}|null>(null);
    const [joined,setJoined]=useState(false),[blocked,setBlocked]=useState('');
    const [forcedMuted,setForcedMuted]=useState(false);
    const forcedRef=useRef(false),blockedRef=useRef(false);
    const membersRef=useRef<Record<string,Profile & {forcedMuted?:boolean;isOwner?:boolean}>>({});
    const [volumes,setVolumes]=useState<Record<string,number>>({});

    const socketUrl = getSocketUrl();

    const [peerNames, setPeerNames] = useState<{[key: string]: string}>({});
    const [myStream, setMyStream] = useState<MediaStream | null>(null);
    const [peers, setPeers] = useState<PeerUser[]>([]);
    const [isMuted, setIsMuted] = useState(false);
    const [noiseSuppression, setNoiseSuppression] = useState(true);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
    const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
    const [userId, setUserId] = useState<string>('');
    const [socketConnected, setSocketConnected] = useState(false);
    const [voiceError, setVoiceError] = useState('');

    const socketRef = useRef<Socket | null>(null);
    const peerRef = useRef<Peer | null>(null);
    const screenPeerRef = useRef<Peer | null>(null);
    const peersMapRef = useRef<Map<string, any>>(new Map());
    const myStreamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream|null>(null);

    useEffect(() => {
        if (!editing) return;
        const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setEditing(false); };
        document.addEventListener('keydown', close);
        return () => document.removeEventListener('keydown', close);
    }, [editing]);

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
            audioTrack.enabled = !isMuted && !forcedRef.current;
            if (myStreamRef.current) {
                myStreamRef.current.getAudioTracks().forEach(t => t.stop());
                myStreamRef.current.addTrack(audioTrack);

                // Update PeerJS calls
                peersMapRef.current.forEach((call) => {
                    const sender = call.peerConnection.getSenders().find((s: any) => s.track?.kind === 'audio');
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

        const socket = io(socketUrl, { transports: ['websocket', 'polling'], reconnection: true });
        socketRef.current = socket;
        socket.on('connect', () => {
            setSocketConnected(true);
            socket.emit('join-room', roomId, peerRef.current?.id || socket.id, profileRef.current.name, profileRef.current,{invite,memberToken:getMemberToken(roomId)});
            socket.emit('music-sync', { roomId });
        });
        const applyMuted=(value:boolean)=>{
            forcedRef.current=value;setForcedMuted(value);
            if(value){myStreamRef.current?.getAudioTracks().forEach(track=>track.enabled=false);setIsMuted(true);}
        };
        const deny=({error}:{error:string})=>{
            blockedRef.current=true;setBlocked(error);setJoined(false);
            myStreamRef.current?.getTracks().forEach(track=>track.stop());
            peersMapRef.current.forEach(call=>call.close());peersMapRef.current.clear();
            peerRef.current?.destroy();screenPeerRef.current?.destroy();screenStreamRef.current?.getTracks().forEach(track=>track.stop());setPeers([]);socket.disconnect();
        };
        socket.on('room-denied',deny);socket.on('room-kicked',deny);
        socket.on('room-moderation',({forcedMuted}:{forcedMuted:boolean})=>applyMuted(forcedMuted));
        socket.on('room-settings',setSettings);
        socket.on('room-joined',(result)=>{saveMemberToken(roomId,result.memberToken);setSettings(result.settings);applyMuted(result.forcedMuted);setJoined(true);socket.emit('music-sync',{roomId});socket.emit('chat-sync',{roomId});});
        socket.on('room-members',next=>{
            membersRef.current=next;setMembers(next);
            peersMapRef.current.forEach((call,id)=>{if(!next[id]){call.close();peersMapRef.current.delete(id);}});
            setPeers(previous=>previous.filter(peer=>Boolean(next[peer.userId])));
        });
        socket.on('disconnect', () => setSocketConnected(false));
        socket.on('connect_error', () => setSocketConnected(false));

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
                if (!mounted || blockedRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
                if(forcedRef.current)stream.getAudioTracks().forEach(track=>track.enabled=false);
                setMyStream(stream);
                myStreamRef.current = stream;

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
                    if(blockedRef.current || !membersRef.current[call.peer]){call.close();return;}
                    call.answer(myStreamRef.current || stream);
                    peersMapRef.current.set(call.peer, call);

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
                        if (peerRef.current && mounted && !blockedRef.current && membersRef.current[otherId]) {
                            console.log("📡 [Outgoing Call] Calling:", otherId);
                            const call = peerRef.current.call(otherId, myStreamRef.current || stream);

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
                if (mounted) setVoiceError('ไมโครโฟนยังไม่พร้อม คุณยังฟังเพลงด้วยกันได้ หากต้องการพูดคุย กรุณาอนุญาตไมค์แล้วโหลดหน้าใหม่');
            }
        };

        init();

        return () => {
            mounted = false;
            if (socketRef.current) socketRef.current.disconnect();
            if (peerRef.current) peerRef.current.destroy();
            screenPeerRef.current?.destroy();
            screenStreamRef.current?.getTracks().forEach(track=>track.stop());
            if (myStreamRef.current) myStreamRef.current.getTracks().forEach(t => t.stop());
        };
    }, []);

    useEffect(() => {
        if (socketConnected && userId && roomId) {
            socketRef.current?.emit('join-room', roomId, userId, myName, profileRef.current,{invite,memberToken:getMemberToken(roomId)});
            socketRef.current?.emit('music-sync', { roomId });
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
        if(forcedRef.current)return;
        if (myStreamRef.current) {
            const audioTrack = myStreamRef.current.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                setIsMuted(!audioTrack.enabled);
            }
        }
    };

    const stopScreenShare=()=>{
        screenStreamRef.current?.getTracks().forEach(track=>track.stop());screenStreamRef.current=null;
        screenPeerRef.current?.destroy();screenPeerRef.current=null;
        setScreenStream(null);setIsScreenSharing(false);socketRef.current?.emit('screen-stop',roomId);
    };
    const toggleScreenShare = async () => {
        if (isScreenSharing) {
            stopScreenShare();
        } else {
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                screenStreamRef.current=stream;
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

                stream.getVideoTracks()[0].onended = stopScreenShare;
            } catch (err) {
                console.error("Screen share failed:", err);
            }
        }
    };

    const copyRoomId = async () => {
        try { await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#/r/${settings?.invite || ''}`); setCopied(true); }
        catch { setVoiceError('คัดลอกลิงก์ไม่ได้ กรุณาคัดลอกจากแถบที่อยู่ของเบราว์เซอร์'); }
    };

    const leaveRoom = () => {
        navigate('/');
    };

    const manage=(action:string,extra:Record<string,unknown>={})=>{
        socketRef.current?.timeout(8000).emit('room-manage',{action,...extra},(timeout:Error|null,result:{error?:string})=>{if(timeout||result?.error)setVoiceError(result?.error||'ไม่ได้รับคำตอบจากห้อง');else{setVoiceError('');setCopied(false);}});
    };
    if(blocked)return <main className="entry-shell"><section className="entry-card"><h1>เข้าห้องไม่ได้</h1><p className="notice">{blocked}</p><button className="btn primary" onClick={()=>navigate('/')}>กลับหน้าหลัก</button></section></main>;
    const ownId = userId || socketRef.current?.id || '';
    return <div className="room-shell">
        <header className="room-header"><a className="wordmark" href="#/">mellow<span>●</span></a><div className="room-heading"><span className="eyebrow">YOUR SHARED CORNER</span><strong>ห้องของพวกเรา</strong></div><span className="connection"><i className={`status-dot ${socketConnected ? 'on' : ''}`} />{socketConnected ? 'เชื่อมต่อแล้ว' : 'กำลังเชื่อมต่อ…'}</span>
        <div className="header-actions"><button className="btn secondary" disabled={!settings?.invite} onClick={copyRoomId}>{copied ? '✓ คัดลอกแล้ว' : '↗ ชวนเพื่อน'}</button><button className="profile-chip" onClick={()=>setEditing(true)}><Avatar avatar={profile.avatar} /><span>{profile.name}</span><span>⌄</span></button><button className="btn ghost" onClick={leaveRoom}>ออกจากห้อง</button></div></header>
        <main className="room-main"><div className="room-intro"><div><span className="eyebrow">SETTLE IN. STAY A WHILE.</span><h1>เปิดเพลง แล้วมาอยู่ด้วยกัน<span className="accent">.</span></h1></div><p>ส่งเพลงให้กัน เหมือนนั่งอยู่ข้าง ๆ</p></div>
        {settings?.isOwner&&<section className="owner-panel"><div><span className="eyebrow">ROOM OWNER</span><strong>จัดการห้อง</strong><small>รหัสห้อง {roomId}</small></div><label className="check-row"><input type="checkbox" checked={settings.inviteOnly} onChange={e=>manage('invite-only',{enabled:e.target.checked})}/>เข้าผ่านลิงก์เชิญเท่านั้น</label><label className="check-row"><input type="checkbox" checked={settings.locked} onChange={e=>manage('lock',{enabled:e.target.checked})}/>ล็อกไม่รับคนเพิ่ม</label><button className="btn secondary" onClick={()=>manage('rotate-invite')}>เปลี่ยนลิงก์เชิญ</button><p className="micro">คนเดิมกลับเข้าด้วยเบราว์เซอร์เดิมได้ · สิทธิ์และลิงก์เริ่มใหม่เมื่อเซิร์ฟเวอร์รีสตาร์ต</p></section>}
        {!settings?.isOwner&&settings?.locked&&<p className="micro">ห้องนี้ล็อกไม่รับสมาชิกเพิ่ม</p>}
        {voiceError && <p role="status" className="notice">{voiceError}</p>}
        {roomId && joined && socketRef.current ? <YoutubeBot socket={socketRef.current} roomId={roomId} /> : <div className="waiting-panel">กำลังเชื่อมต่อห้องฟังเพลง…</div>}
        {((isScreenSharing && screenStream) || remoteScreenStream) && <section className="screen-panel"><span className="eyebrow">{isScreenSharing ? 'YOUR SCREEN' : 'LIVE SCREEN'}</span><video autoPlay playsInline muted={isScreenSharing} ref={video=>{if(video) video.srcObject=isScreenSharing?screenStream:remoteScreenStream;}} /></section>}
        <section className="people-panel"><div className="people-heading"><div><span className="eyebrow">THE GOOD COMPANY</span><h2>เพื่อนในห้อง <span className="count">{Object.keys(members).length || 1}</span></h2></div><div className="voice-controls"><button className="btn ghost" disabled={!myStream} onClick={toggleNoiseSuppression}>ลดเสียงรบกวน: {noiseSuppression?'เปิด':'ปิด'}</button><button className="btn ghost" disabled={!userId} onClick={toggleScreenShare}>{isScreenSharing?'หยุดแชร์จอ':'แชร์หน้าจอ'}</button></div></div>
        <div className="people-list"><div className={`person-card own ${profile.status?.trim() ? '' : 'no-status'}`}><button className="own-profile" aria-label="แก้ไขโปรไฟล์และ status" onClick={()=>setEditing(true)}><Avatar avatar={profile.avatar} speaking={activeSpeakers.has(ownId) && !isMuted} motion={profile.motion} /><strong>{profile.name}</strong>{settings?.isOwner&&<small className="owner-badge">เจ้าของห้อง</small>}<span className="person-status">{profile.status || ''}</span></button><div className="own-card-actions"><button className={`mic-button ${isMuted ? 'muted-mic' : ''}`} disabled={!myStream || forcedMuted} onClick={toggleMute} aria-pressed={isMuted} aria-label={forcedMuted?'เจ้าของปิดไมค์':!myStream ? 'ไมค์ไม่พร้อม' : isMuted ? 'เปิดไมค์' : 'ปิดไมค์'} title={forcedMuted?'เจ้าของปิดไมค์':!myStream ? 'ไมค์ไม่พร้อม' : isMuted ? 'เปิดไมค์' : 'ปิดไมค์'}><i className={`fas ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`} aria-hidden="true" />{forcedMuted ? 'เจ้าของปิดไมค์' : !myStream ? 'ไมค์ไม่พร้อม' : isMuted ? 'เปิดไมค์' : 'ปิดไมค์'}</button><button className="text-link" onClick={()=>setEditing(true)}>แก้ไขโปรไฟล์</button></div></div>
        {Object.entries(members).filter(([id])=>id!==ownId && id!==socketRef.current?.id).map(([id,member])=>{const peer=peers.find(p=>p.userId===id);return <div className={`person-card ${member.status?.trim() ? '' : 'no-status'}`} key={id}><Avatar avatar={member.avatar} speaking={activeSpeakers.has(id)} motion={member.motion} /><strong>{member.name}</strong>{member.isOwner&&<small className="owner-badge">เจ้าของห้อง</small>}<span className="person-status">{member.status || ''}</span><label className="peer-volume">เสียงที่คุณได้ยิน <span>{Math.round((volumes[id]??1)*100)}%</span><input aria-label={`ระดับเสียง ${member.name}`} type="range" min="0" max="1" step="0.05" value={volumes[id]??1} disabled={!peer} onChange={e=>setVolumes(previous=>({...previous,[id]:Number(e.target.value)}))}/></label>{member.forcedMuted&&<small className="moderated-label">เจ้าของปิดไมค์</small>}{settings?.isOwner&&!member.isOwner&&<div className="member-tools"><button className="btn secondary" onClick={()=>manage('mute',{userId:id,enabled:!member.forcedMuted})}>{member.forcedMuted?'อนุญาตเปิดไมค์':'ปิดไมค์'}</button><button className="btn ghost" onClick={()=>{if(window.confirm(`นำ ${member.name} ออกจากห้อง?`))manage('kick',{userId:id});}}>นำออก</button></div>}{peer && <><audio autoPlay playsInline muted={member.forcedMuted} ref={audio=>{if(audio){if(audio.srcObject!==peer.stream)audio.srcObject=peer.stream;audio.volume=volumes[id]??1;audio.muted=Boolean(member.forcedMuted);}}} /><div className="visualizer-hidden"><AudioVisualizer stream={peer.stream} isMuted={Boolean(member.forcedMuted)} onSpeaking={speaking=>handleSpeaking(id,speaking)} /></div></>}</div>;})}</div>
        {myStream && <div className="visualizer-hidden"><AudioVisualizer stream={myStream} isMuted={isMuted} onSpeaking={speaking=>handleSpeaking(ownId,speaking)} /></div>}
        </section><footer className="room-footer">mellow / A LITTLE CLOSER, ONE SONG AT A TIME <span>ฟังด้วยกัน ใกล้กันอีกนิด</span></footer></main>
        {editing && <div className="modal-backdrop" onClick={()=>setEditing(false)}><section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title" onClick={e=>e.stopPropagation()}><span className="eyebrow">MAKE IT YOURS</span><h2 id="profile-title">ตัวคุณในห้องนี้</h2><ProfileForm initial={profile} label="บันทึกตัวแทน" onCancel={()=>setEditing(false)} onSave={next=>{setProfile(next); socketRef.current?.emit('profile-update',next); setEditing(false);}} /></section></div>}
    </div>;
};
export default Room;
