import React,{useEffect,useRef,useState} from 'react';
import {Socket} from 'socket.io-client';
import options from '../reaction-options.json';
type Reaction={id:string;emoji:string;name:string;timestamp:number;lane:number;expiresAt:number};
export default function LiveReactions({socket,roomId}:{socket:Socket|null;roomId:string}) {
    const [items,setItems]=useState<Reaction[]>([]),[error,setError]=useState('');
    const [show,setShow]=useState(()=>{try{return localStorage.getItem('mellow-live-reactions')!=='off';}catch{return true;}});
    const enabled=useRef(show),seen=useRef(new Set<string>()),lane=useRef(0),lastSent=useRef(0);
    enabled.current=show;
    useEffect(()=>{
        if(!socket)return;
        const receive=(event:Reaction)=>{
            if(!enabled.current||document.visibilityState==='hidden'||seen.current.has(event.id))return;
            seen.current.add(event.id);if(seen.current.size>200)seen.current.delete(seen.current.values().next().value!);
            setItems(previous=>[...previous.slice(-15),{...event,lane:lane.current++%6,expiresAt:Date.now()+3200}]);
        };
        const disconnected=()=>setItems([]);
        socket.on('room-reaction',receive);socket.on('disconnect',disconnected);
        const timer=setInterval(()=>setItems(previous=>previous.some(item=>item.expiresAt<=Date.now())?previous.filter(item=>item.expiresAt>Date.now()):previous),500);
        return()=>{clearInterval(timer);socket.off('room-reaction',receive);socket.off('disconnect',disconnected);};
    },[socket,roomId]);
    const send=(emoji:string)=>{
        if(!socket?.connected){setError('กำลังเชื่อมต่อห้อง…');return;}
        if(Date.now()-lastSent.current<400)return;lastSent.current=Date.now();setError('');
        socket.timeout(5000).emit('room-react',{roomId,emoji},(timeout:Error|null,result:{error?:string})=>{if(timeout||result?.error)setError(result?.error||'ยังไม่ได้รับคำตอบ ลองใหม่อีกครั้ง');});
    };
    return <div className="live-reactions">
        <div className="reaction-toolbar"><div className="reaction-buttons" role="group" aria-label="ส่งรีแอ็กชันสด">{options.map(option=><button type="button" key={option.emoji} aria-label={option.label} title={option.label} disabled={!socket?.connected} onClick={()=>send(option.emoji)}>{option.emoji}</button>)}</div>
        <button className="reaction-visibility" aria-pressed={!show} onClick={()=>setShow(value=>{const next=!value;if(!next)setItems([]);try{localStorage.setItem('mellow-live-reactions',next?'on':'off');}catch{}return next;})}>{show?'ซ่อนเอฟเฟกต์':'แสดงเอฟเฟกต์'}</button></div>
        <div className="reaction-stage" aria-hidden="true">{items.map(item=><div className="floating-reaction" key={item.id} style={{left:`${14+item.lane*14}%`}}><span>{item.emoji}</span><small>{item.name}</small></div>)}</div>
        {error&&<p role="status" className="reaction-error">{error}</p>}
    </div>;
}
