import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import Peer from 'peerjs';
import AudioVisualizer from './AudioVisualizer';
import YoutubeBot from './YoutubeBot';
import ProfileForm, { Avatar, Profile } from './Profile';
import { getMemberToken, saveMemberToken } from './room-access';
import RoomSettings from './RoomSettings';
import {createScreenReceiver} from './screen-receiver.mjs';
import {notifyRoom,setNotificationSound,unlockNotifications} from './room-notifications';
type Member = Profile & {forcedMuted?:boolean;isOwner?:boolean;online?:boolean;voiceReady?:boolean;offlineUntil?:number;memberId?:string};

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
    const [members, setMembers] = useState<Record<string, Member>>({});
    const [copied, setCopied] = useState(false);
    const [memberId,setMemberId]=useState('');
    const [clock,setClock]=useState(Date.now());
    const [notifications,setNotifications]=useState(()=>{try{return localStorage.getItem('mellow-notifications')!=='off';}catch{return true;}});
    useEffect(()=>{setNotificationSound(notifications);try{localStorage.setItem('mellow-notifications',notifications?'on':'off');}catch{}},[notifications]);
    useEffect(()=>{document.addEventListener('pointerdown',unlockNotifications);document.addEventListener('keydown',unlockNotifications);const timer=setInterval(()=>setClock(Date.now()),1000);return()=>{clearInterval(timer);document.removeEventListener('pointerdown',unlockNotifications);document.removeEventListener('keydown',unlockNotifications);};},[]);
    const [sidebarRequest,setSidebarRequest]=useState<{tab:'queue'|'chat';id:number}>();
    const [settings,setSettings]=useState<{invite:string;locked:boolean;inviteOnly:boolean;isOwner:boolean}|null>(null);
    const [joined,setJoined]=useState(false),[blocked,setBlocked]=useState('');
    const [forcedMuted,setForcedMuted]=useState(false);
    const forcedRef=useRef(false),blockedRef=useRef(false);
    const membersRef=useRef<Record<string,Member>>({});
    const [volumes,setVolumes]=useState<Record<string,number>>({});

    const socketUrl = getSocketUrl();

    const [peerNames, setPeerNames] = useState<{[key: string]: string}>({});
    const [myStream, setMyStream] = useState<MediaStream | null>(null);
    const [peers, setPeers] = useState<PeerUser[]>([]);
    const [isMuted, setIsMuted] = useState(true);
    const [isDeafened, setIsDeafened] = useState(false);
    const [noiseSuppression, setNoiseSuppression] = useState(true);
    const [isScreenSharing, setIsScreenSharing] = useState(false);
    const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
    const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
    const [activeSpeakers, setActiveSpeakers] = useState<Set<string>>(new Set());
    const [userId, setUserId] = useState<string>('');
    const [socketConnected, setSocketConnected] = useState(false);
    const [voiceError, setVoiceError] = useState('');
    const [micBusy, setMicBusy] = useState(false);
    const micBusyRef = useRef(false);
    const aliveRef = useRef(true);
    const silentRef = useRef<MediaStream | null>(null);
    const silentContextRef = useRef<AudioContext | null>(null);

    const socketRef = useRef<Socket | null>(null);
    const peerRef = useRef<Peer | null>(null);
    const screenPeerRef = useRef<Peer | null>(null);
    const screenReceiverRef=useRef<ReturnType<typeof createScreenReceiver>|null>(null);
    const [remoteScreens,setRemoteScreens]=useState<{id:string;name:string}[]>([]);
    const [screenStatus,setScreenStatus]=useState('idle');
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

    const releaseMicrophone = () => {
        const current = myStreamRef.current;
        // Keep a silent sender negotiated, without holding the physical microphone.
        if (current && current !== silentRef.current) current.getTracks().forEach(track => track.stop());
        const silent = silentRef.current;
        myStreamRef.current = silent;
        setMyStream(silent);
        setIsMuted(true);
        const track = silent?.getAudioTracks()[0];
        if (track) peersMapRef.current.forEach(call => {
            const sender = call.peerConnection?.getSenders().find((sender: RTCRtpSender) => sender.track?.kind === 'audio');
            sender?.replaceTrack(track).catch(() => {});
        });
    };

    const acquireMicrophone = async (suppression: boolean) => {
        if (micBusyRef.current || forcedRef.current || blockedRef.current) return false;
        micBusyRef.current = true; setMicBusy(true); setVoiceError('');
        let stream: MediaStream | null = null;
        try {
            stream = await navigator.mediaDevices.getUserMedia({video: false, audio: {
                echoCancellation: true, noiseSuppression: suppression, autoGainControl: true
            }});
            if (!aliveRef.current || forcedRef.current || blockedRef.current) {
                stream.getTracks().forEach(track => track.stop()); return false;
            }
            const track = stream.getAudioTracks()[0];
            await Promise.all(Array.from(peersMapRef.current.values()).map(call => {
                const sender = call.peerConnection?.getSenders().find((sender: RTCRtpSender) => sender.track?.kind === 'audio');
                return sender?.replaceTrack(track);
            }));
            if (!aliveRef.current || forcedRef.current || blockedRef.current) {
                stream.getTracks().forEach(track => track.stop()); return false;
            }
            const previous = myStreamRef.current;
            myStreamRef.current = stream; setMyStream(stream); setIsMuted(false);
            if (previous && previous !== silentRef.current) previous.getTracks().forEach(track => track.stop());
            return true;
        } catch {
            stream?.getTracks().forEach(track => track.stop());
            if (aliveRef.current) { releaseMicrophone(); setVoiceError('เปิดไมค์ไม่ได้ กรุณาตรวจสอบสิทธิ์ไมโครโฟนแล้วลองอีกครั้ง คุณยังฟังเพลงและเสียงเพื่อนได้'); }
            return false;
        } finally {
            micBusyRef.current = false;
            if (aliveRef.current) setMicBusy(false);
        }
    };

    const toggleNoiseSuppression = async () => {
        const next = !noiseSuppression;
        // Changing this setting while muted must never request microphone access.
        if (isMuted || await acquireMicrophone(next)) setNoiseSuppression(next);
    };

    useEffect(() => {
        let mounted = true;
        aliveRef.current = true;

        const socket = io(socketUrl, { transports: ['websocket', 'polling'], reconnection: true });
        socketRef.current = socket;
        const receiver=createScreenReceiver({getPeer:()=>peerRef.current,getStream:()=>silentRef.current,onStream:stream=>{if(mounted)setRemoteScreenStream(stream);},onStatus:status=>{if(mounted)setScreenStatus(status);}});
        screenReceiverRef.current=receiver;
        let advertisedScreens:{id:string;name:string}[]=[];
        let hasScreenSnapshot=false;
        const updateScreens=(screens:{id:string;name:string}[])=>{
            const remote=screens.filter(screen=>screen.id!==`${peerRef.current?.id}-screen`);
            if(hasScreenSnapshot&&remote.some(screen=>!advertisedScreens.some(old=>old.id===screen.id)))notifyRoom('screen');
            hasScreenSnapshot=true;
            advertisedScreens=remote;setRemoteScreens(remote);receiver.update(remote);
        };
        socket.on('screen-state',updateScreens);
        socket.on('screen-stopped',({userId}:{userId?:string}={})=>{if(userId)updateScreens(advertisedScreens.filter(screen=>screen.id!==userId));});
        socket.on('connect', () => {
            setSocketConnected(true);
            socket.emit('join-room', roomId, peerRef.current?.id || socket.id, profileRef.current.name, profileRef.current,{invite,memberToken:getMemberToken(roomId)});
            socket.emit('music-sync', { roomId });
        });
        const applyMuted=(value:boolean)=>{
            forcedRef.current=value;setForcedMuted(value);
            if(value)releaseMicrophone();
        };
        const deny=({error}:{error:string})=>{
            blockedRef.current=true;setBlocked(error);setJoined(false);
            myStreamRef.current?.getTracks().forEach(track=>track.stop());
            silentRef.current?.getTracks().forEach(track=>track.stop());
            void silentContextRef.current?.close().catch(() => {});
            peersMapRef.current.forEach(call=>call.close());peersMapRef.current.clear();
            peerRef.current?.destroy();receiver.dispose();screenPeerRef.current?.destroy();screenStreamRef.current?.getTracks().forEach(track=>track.stop());setPeers([]);socket.disconnect();
        };
        socket.on('room-denied',deny);socket.on('room-kicked',deny);
        socket.on('room-moderation',({forcedMuted}:{forcedMuted:boolean})=>applyMuted(forcedMuted));
        socket.on('room-settings',setSettings);
        socket.on('room-notice',({type}:{type:'join'|'leave'})=>notifyRoom(type));
        socket.on('room-joined',(result)=>{setMemberId(result.memberId);saveMemberToken(roomId,result.memberToken);setSettings(result.settings);applyMuted(result.forcedMuted);setJoined(true);receiver.ready();socket.emit('screen-sync');if(screenPeerRef.current?.id)socket.emit('screen-start',{roomId,userId:screenPeerRef.current.id});socket.emit('music-sync',{roomId});socket.emit('chat-sync',{roomId});});
        socket.on('room-members',next=>{
            membersRef.current=next;setMembers(next);
            peersMapRef.current.forEach((call,id)=>{if(!next[id]?.online){call.close();peersMapRef.current.delete(id);}});
            setPeers(previous=>previous.filter(peer=>Boolean(next[peer.userId]?.online)));
        });
        socket.on('disconnect', () => {setSocketConnected(false);peersMapRef.current.forEach(call=>call.close());peersMapRef.current.clear();setPeers([]);screenReceiverRef.current?.disconnected();setRemoteScreenStream(null);});
        socket.on('connect_error', () => setSocketConnected(false));

        const init = async () => {
            try {
                // A silent Web Audio track reserves an audio sender for replaceTrack.
                // Unlike getUserMedia, this never opens iOS microphone/voice processing.
                const context = new AudioContext();
                silentContextRef.current = context;
                const stream = context.createMediaStreamDestination().stream;
                silentRef.current = stream;
                if (!mounted || blockedRef.current) { stream.getTracks().forEach(track => track.stop()); await context.close(); return; }
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
                    setUserId(id);receiver.ready();
                    if(socket.connected)socket.emit('join-room',roomId,id,profileRef.current.name,profileRef.current,{invite,memberToken:getMemberToken(roomId)});
                });

                peer.on('call', (call) => {
                    console.log("📞 [Incoming Call] from:", call.peer);
                    if(blockedRef.current || !membersRef.current[call.peer]?.online){call.close();return;}
                    peersMapRef.current.get(call.peer)?.close();
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

                const connectTo=(otherId:string)=>{
                    if(!peer.id||peer.id>=otherId||blockedRef.current||!membersRef.current[otherId]?.online||membersRef.current[otherId]?.voiceReady===false||peersMapRef.current.has(otherId))return;
                    const call=peer.call(otherId,myStreamRef.current||stream);
                    if(!call)return;
                    peersMapRef.current.set(otherId,call);
                    call.on('stream',remote=>{if(mounted)addPeerStream(otherId,remote);});
                    call.on('close',()=>{if(peersMapRef.current.get(otherId)===call){peersMapRef.current.delete(otherId);removePeerStream(otherId);}});
                    call.on('error',()=>{if(peersMapRef.current.get(otherId)===call)peersMapRef.current.delete(otherId);});
                };
                socket.on('user-connected',({userId:otherId})=>{setTimeout(()=>{if(mounted)connectTo(otherId);},300);});
                socket.on('existing-users',(users:Record<string,string>)=>{
                    setPeerNames(users);Object.keys(users).forEach(connectTo);
                });
                peer.on('disconnected',()=>{if(mounted&&!peer.destroyed)peer.reconnect();});
                socket.on('user-disconnected', (id: string) => {
                    removePeerStream(id);
                    if (peersMapRef.current.has(id)) {
                        peersMapRef.current.get(id).close();
                        peersMapRef.current.delete(id);
                    }
                });


            } catch (err) {
                console.error("Initialization failed:", err);
                if (mounted) setVoiceError('เชื่อมต่อเสียงพูดไม่สำเร็จ คุณยังฟังเพลงด้วยกันได้ ลองโหลดหน้าใหม่เพื่อเชื่อมต่อเสียงพูดอีกครั้ง');
            }
        };

        init();

        return () => {
            mounted = false;
            aliveRef.current = false;
            if (socketRef.current) socketRef.current.disconnect();
            if (peerRef.current) peerRef.current.destroy();
            screenPeerRef.current?.destroy();
            screenReceiverRef.current?.dispose();screenReceiverRef.current=null;
            screenStreamRef.current?.getTracks().forEach(track=>track.stop());
            if (myStreamRef.current) myStreamRef.current.getTracks().forEach(t => t.stop());
            silentRef.current?.getTracks().forEach(track => track.stop());
            void silentContextRef.current?.close().catch(() => {});
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
            if (prev.find(p => p.userId === id)) return prev.map(p=>p.userId===id?{userId:id,stream}:p);
            return [...prev, { userId: id, stream }];
        });
    };

    const removePeerStream = (id: string) => {
        setPeers(prev => prev.filter(p => p.userId !== id));
    };

    const toggleMute = () => {
        if (forcedRef.current || micBusyRef.current) return;
        if (isMuted) void acquireMicrophone(noiseSuppression);
        else releaseMicrophone();
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
                    if(!membersRef.current[call.peer]?.online){call.close();return;}
                    call.answer(stream);
                });
                screenPeer.on('disconnected',()=>{if(!screenPeer.destroyed&&screenStreamRef.current)screenPeer.reconnect();});
                screenPeer.on('error',()=>{setVoiceError('เชื่อมต่อแชร์จอไม่ได้ ลองหยุดแล้วแชร์ใหม่');stopScreenShare();});

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
        if(!socketRef.current?.connected){navigate('/');return;}
        socketRef.current.timeout(1000).emit('leave-room',()=>navigate('/'));
    };

    const manage=(action:string,extra:Record<string,unknown>={})=>{
        socketRef.current?.timeout(8000).emit('room-manage',{action,...extra},(timeout:Error|null,result:{error?:string})=>{if(timeout||result?.error)setVoiceError(result?.error||'ไม่ได้รับคำตอบจากห้อง');else{setVoiceError('');setCopied(false);}});
    };
    if(blocked)return <main className="entry-shell"><section className="entry-card"><h1>เข้าห้องไม่ได้</h1><p className="notice">{blocked}</p><button className="btn primary" onClick={()=>navigate('/')}>กลับหน้าหลัก</button></section></main>;
    const ownId = userId || socketRef.current?.id || '';
    const peoplePanel=(
        <section className="people-panel" id="room-people"><div className="people-heading"><div><span className="eyebrow">เพื่อนในห้อง</span><h2>เพื่อนในห้อง <span className="count">{Object.keys(members).length || 1}</span></h2></div><div className="voice-controls"><button className="btn ghost" disabled={!myStream || micBusy} onClick={toggleNoiseSuppression}>ลดเสียงรบกวน: {noiseSuppression?'เปิด':'ปิด'}</button><button className="btn ghost" disabled={!userId} onClick={toggleScreenShare}>{isScreenSharing?'หยุดแชร์จอ':'แชร์หน้าจอ'}</button></div></div>
        <div className="people-list"><div className={`person-card own ${profile.status?.trim() ? '' : 'no-status'}`}><button className="own-profile" aria-label="แก้ไขโปรไฟล์และ status" onClick={()=>setEditing(true)}><Avatar avatar={profile.avatar} speaking={activeSpeakers.has(ownId) && !isMuted} motion={true} /><strong className="person-name">{profile.name}{settings?.isOwner&&<span className="owner-crown" role="img" aria-label="เจ้าของห้อง" title="เจ้าของห้อง"><i className="fas fa-crown" aria-hidden="true"/></span>}</strong>{profile.status?.trim()&&<span className="person-status">{profile.status}</span>}</button><div className="own-card-actions"><button className={`mic-button ${isMuted ? 'muted-mic' : ''}`} disabled={!myStream || forcedMuted || micBusy} onClick={toggleMute} aria-pressed={isMuted} aria-label={forcedMuted?'เจ้าของปิดไมค์':!myStream ? 'ไมค์ไม่พร้อม' : isMuted ? 'เปิดไมค์' : 'ปิดไมค์'} title={forcedMuted?'เจ้าของปิดไมค์':!myStream ? 'ไมค์ไม่พร้อม' : isMuted ? 'เปิดไมค์' : 'ปิดไมค์'}><i className={`fas ${isMuted ? 'fa-microphone-slash' : 'fa-microphone'}`} aria-hidden="true" />{forcedMuted ? 'เจ้าของปิดไมค์' : !myStream ? 'ไมค์ไม่พร้อม' : isMuted ? 'เปิดไมค์' : 'ปิดไมค์'}</button><button className={`mic-button ${isDeafened ? 'muted-mic' : ''}`} onClick={()=>setIsDeafened(previous=>!previous)} aria-pressed={isDeafened} aria-label={isDeafened ? 'เปิดเสียงเพื่อน' : 'ปิดเสียงเพื่อน'} title={isDeafened ? 'เปิดเสียงไมค์เพื่อนทุกคน' : 'ปิดเสียงไมค์เพื่อนทุกคน (ยังฟังเพลงได้)'}><i className={`fas ${isDeafened ? 'fa-volume-xmark' : 'fa-headphones'}`} aria-hidden="true" />{isDeafened ? 'เปิดเสียงเพื่อน' : 'ปิดเสียงเพื่อน'}</button></div></div>
        {Object.entries(members).filter(([id])=>id!==ownId && id!==socketRef.current?.id).map(([id,member])=>{const peer=peers.find(p=>p.userId===id);return <div className={`person-card ${member.status?.trim() ? '' : 'no-status'}`} key={id}>{settings?.isOwner&&!member.isOwner&&<details className="member-menu"><summary aria-label={`จัดการ ${member.name}`}>···</summary><div><button disabled={member.online===false} onClick={e=>{e.currentTarget.closest('details')?.removeAttribute('open');if(window.confirm(`โอนเจ้าของห้องให้ ${member.name}?`))manage('transfer',{userId:id});}}>โอนเจ้าของห้อง</button><button onClick={()=>{if(window.confirm(`นำ ${member.name} ออกจากห้อง?`))manage('kick',{userId:id});}}>เตะออกจากห้อง</button></div></details>}<Avatar avatar={member.avatar} speaking={activeSpeakers.has(id)} motion={true} /><strong className="person-name">{member.name}{member.isOwner&&<span className="owner-crown" role="img" aria-label="เจ้าของห้อง" title="เจ้าของห้อง"><i className="fas fa-crown" aria-hidden="true"/></span>}</strong><span className="person-status">{member.online===false?`ออฟไลน์ · รอกลับ ${Math.max(0,Math.ceil(((member.offlineUntil||clock)-clock)/1000))} วินาที`:member.status || ''}</span>{settings?.isOwner&&!member.isOwner&&<button className="mic-button peer-mute" disabled={member.online===false} onClick={()=>manage('mute',{userId:id,enabled:!member.forcedMuted})}>{member.forcedMuted?'อนุญาตเปิดไมค์':'ปิดไมค์'}</button>}<label className="peer-volume">เสียงที่คุณได้ยิน <span>{Math.round((volumes[id]??1)*100)}%</span><input aria-label={`ระดับเสียง ${member.name}`} type="range" min="0" max="1" step="0.05" value={volumes[id]??1} disabled={!peer} onChange={e=>setVolumes(previous=>({...previous,[id]:Number(e.target.value)}))}/></label>{member.forcedMuted&&<small className="moderated-label">เจ้าของปิดไมค์</small>}{peer && <><audio autoPlay playsInline muted={isDeafened || Boolean(member.forcedMuted)} ref={audio=>{if(audio){if(audio.srcObject!==peer.stream)audio.srcObject=peer.stream;audio.volume=volumes[id]??1;audio.muted=isDeafened || Boolean(member.forcedMuted);}}} /><div className="visualizer-hidden"><AudioVisualizer stream={peer.stream} isMuted={Boolean(member.forcedMuted)} onSpeaking={speaking=>handleSpeaking(id,speaking)} /></div></>}</div>;})}</div>
        {myStream && <div className="visualizer-hidden"><AudioVisualizer stream={myStream} isMuted={isMuted} onSpeaking={speaking=>handleSpeaking(ownId,speaking)} /></div>}
        </section>);
    return <div className="room-shell">
        <header className="room-header"><a className="wordmark" href="#/" onClick={e=>{e.preventDefault();leaveRoom();}}>mellow<span>●</span></a><div className="room-heading"><strong>ห้องของพวกเรา</strong><small>รหัส {roomId}</small></div><span className="connection"><i className={`status-dot ${socketConnected?'on':''}`}/>{socketConnected?'เชื่อมต่อแล้ว':'กำลังเชื่อมต่อ…'}</span>
        <div className="header-actions"><button className="btn secondary" disabled={!settings?.invite} onClick={copyRoomId}>{copied?'✓ คัดลอกแล้ว':'เชิญเพื่อน'}</button><RoomSettings settings={settings} roomId={roomId} manage={manage} notifications={notifications} setNotifications={setNotifications}/><button className="btn ghost" onClick={leaveRoom}>ออกห้อง</button></div></header>
        <main className="room-main">
        {voiceError&&<p role="status" className="notice">{voiceError}</p>}
        {roomId&&joined&&socketRef.current?<YoutubeBot socket={socketRef.current} roomId={roomId} memberId={memberId} sidebarRequest={sidebarRequest} peoplePanel={peoplePanel} screenStream={isScreenSharing?screenStream:remoteScreenStream} ownSharing={isScreenSharing} onShare={toggleScreenShare} remoteScreens={remoteScreens} screenStatus={screenStatus} onScreenRetry={()=>screenReceiverRef.current?.retry()}/>:<div className="waiting-panel">กำลังเชื่อมต่อห้อง…</div>}
        </main>
        <nav className="mobile-room-nav" aria-label="ทางลัดในห้อง"><button onClick={()=>document.getElementById('room-player')?.scrollIntoView({behavior:'smooth',block:'start'})}>♫ เพลง</button><button onClick={()=>{setSidebarRequest({tab:'queue',id:Date.now()});document.getElementById('room-sidebar')?.scrollIntoView({behavior:'smooth',block:'start'});}}>≋ คิว</button><button onClick={()=>{setSidebarRequest({tab:'chat',id:Date.now()});document.getElementById('room-sidebar')?.scrollIntoView({behavior:'smooth',block:'start'});}}>☏ แชต</button><button onClick={()=>document.getElementById('room-people')?.scrollIntoView({behavior:'smooth',block:'start'})}>◉ เพื่อน</button></nav>
        {editing && <div className="modal-backdrop" onClick={()=>setEditing(false)}><section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title" onClick={e=>e.stopPropagation()}><span className="eyebrow">MAKE IT YOURS</span><h2 id="profile-title">ตัวคุณในห้องนี้</h2><ProfileForm initial={profile} label="บันทึกตัวแทน" onCancel={()=>setEditing(false)} onSave={next=>{setProfile(next); socketRef.current?.emit('profile-update',next); setEditing(false);}} /></section></div>}
    </div>;
};
export default Room;
