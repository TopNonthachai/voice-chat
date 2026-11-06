import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { Avatar } from './Profile';
interface Message {
    id: string; sequence: number; clientId: string; senderId: string; senderSocketId: string;
    name: string; avatar: string; text: string; timestamp: number;
    attachment?: {id: string; name: string; size: number; image: boolean};
}
const sizeLabel = (size: number) => size < 1024*1024 ? `${Math.ceil(size/1024)} KB` : `${(size/1024/1024).toFixed(1)} MB`;
export default function RoomChat({socket,roomId,active,onUnread}: {socket:Socket|null;roomId:string;active:boolean;onUnread:React.Dispatch<React.SetStateAction<number>>}) {
    const [messages,setMessages]=useState<Message[]>([]);
    const [text,setText]=useState('');
    const [file,setFile]=useState<File|null>(null);
    const [pending,setPending]=useState(false);
    const [error,setError]=useState('');
    const input=useRef<HTMLInputElement>(null);
    const list=useRef<HTMLDivElement>(null);
    const activeRef=useRef(active);activeRef.current=active;
    const seen=useRef(new Set<string>());
    const follow=useRef(true);
    const attempt=useRef<{text:string;file:File|null;id:string}|null>(null);
    const controller=useRef<AbortController|null>(null);
    const merge=(incoming:Message[])=>setMessages(previous=>{
        const map=new Map(previous.map(message=>[message.id,message]));
        incoming.forEach(message=>map.set(message.id,message));
        return [...map.values()].sort((a,b)=>a.sequence-b.sequence).slice(-100);
    });
    useEffect(()=>{
        if(!socket)return;
        const history=(items:Message[])=>{items.forEach(item=>seen.current.add(item.id));merge(items);};
        const receive=(message:Message)=>{
            if(seen.current.has(message.id))return;
            seen.current.add(message.id);
            if(seen.current.size>300)seen.current.delete(seen.current.values().next().value!);
            merge([message]);
            if(!activeRef.current&&message.senderSocketId!==socket.id)onUnread(n=>n+1);
        };
        const sync=()=>socket.emit('chat-sync',{roomId});
        socket.on('chat-history',history);socket.on('chat-message',receive);socket.on('connect',sync);sync();
        return ()=>{socket.off('chat-history',history);socket.off('chat-message',receive);socket.off('connect',sync);controller.current?.abort();};
    },[socket,roomId,onUnread]);
    useEffect(()=>{if(active){onUnread(0);follow.current=true;if(list.current)list.current.scrollTop=list.current.scrollHeight;}},[active,onUnread]);
    useEffect(()=>{if(active&&follow.current&&list.current)list.current.scrollTop=list.current.scrollHeight;},[messages,active]);
    const attachmentUrl=(id:string,preview=false)=>`/api/chat/files/${encodeURIComponent(id)}?${new URLSearchParams({roomId,clientId:socket?.id||'',...(preview?{preview:'1'}:{})})}`;
    const submit=async(e:React.FormEvent)=>{
        e.preventDefault();if(pending||(!text.trim()&&!file))return;
        if(!socket?.connected){setError('กำลังเชื่อมต่อห้อง รอสักครู่แล้วส่งอีกครั้ง');return;}
        const raw=text,selected=file;
        if(!attempt.current||attempt.current.text!==raw||attempt.current.file!==selected)attempt.current={text:raw,file:selected,id:crypto.randomUUID()};
        const id=attempt.current.id;setPending(true);setError('');
        try {
            let result:{error?:string;message?:Message};
            if(selected){
                controller.current=new AbortController();
                const timer=setTimeout(()=>controller.current?.abort(),30000);
                try{
                    const response=await fetch(`/api/chat/files?${new URLSearchParams({roomId,clientId:socket.id!,uploadId:id})}`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(selected.name),'X-Chat-Text':encodeURIComponent(raw.trim())},body:selected,signal:controller.current.signal});
                    result=await response.json();if(!response.ok)throw new Error(result.error||'ส่งไฟล์ไม่สำเร็จ');
                }finally{clearTimeout(timer);}
            } else result=await new Promise((resolve,reject)=>socket.timeout(8000).emit('chat-send',{roomId,clientId:id,text:raw},(timeout:Error|null,result:{error?:string;message?:Message})=>timeout?reject(new Error('ยังไม่ได้รับคำตอบ ลองส่งซ้ำได้โดยข้อความจะไม่ซ้ำ')):resolve(result)));
            if(result.error)throw new Error(result.error);
            if(result.message){seen.current.add(result.message.id);merge([result.message]);}
            setText(value=>value===raw?'':value);setFile(null);attempt.current=null;follow.current=true;
        }catch(error){setError(error instanceof Error&&error.name!=='AbortError'?error.message:'การส่งไฟล์ใช้เวลานานเกินไป ลองส่งใหม่อีกครั้ง');}
        finally{setPending(false);}
    };
    return <div className="chat-panel">
        <div className="chat-messages" ref={list} role="log" aria-label="ข้อความในห้อง" aria-live={active?'polite':'off'} aria-relevant="additions" onScroll={()=>{if(list.current)follow.current=list.current.scrollHeight-list.current.scrollTop-list.current.clientHeight<80;}}>
            {!messages.length&&<div className="empty-chat"><span>☏</span><h3>ทักเพื่อนสักหน่อย</h3><p>คุยเรื่องเพลง ส่งรูป หรือแชร์ไฟล์กันได้ที่นี่</p></div>}
            {messages.map(message=><article className={`chat-message ${message.senderSocketId===socket?.id?'mine':''}`} key={message.id}>
                <Avatar avatar={message.avatar}/><div className="chat-message-body"><header><strong>{message.name}</strong><time dateTime={new Date(message.timestamp).toISOString()}>{new Date(message.timestamp).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}</time></header>
                {message.text&&<p>{message.text}</p>}
                {message.attachment&&<div className="chat-attachment">{message.attachment.image&&<img src={attachmentUrl(message.attachment.id,true)} alt={message.attachment.name} loading="lazy" onError={e=>{e.currentTarget.style.display='none';}}/>}<a href={attachmentUrl(message.attachment.id)} download={message.attachment.name}><span>↧</span><span><strong>{message.attachment.name}</strong><small>{sizeLabel(message.attachment.size)} · ดาวน์โหลด</small></span></a></div>}
                </div>
            </article>)}
        </div>
        <form className="chat-composer" onSubmit={submit}>
            {file&&<div className="pending-file"><span>⌁ {file.name} <small>{sizeLabel(file.size)}</small></span><button type="button" disabled={pending} aria-label="ยกเลิกแนบไฟล์" onClick={()=>{setFile(null);attempt.current=null;}}>×</button></div>}
            <label className="sr-only" htmlFor="chat-text">ข้อความถึงเพื่อนในห้อง</label><textarea id="chat-text" value={text} maxLength={1000} placeholder={file?'เขียนคำบรรยายไฟล์…':'พิมพ์ข้อความถึงเพื่อน…'} rows={2} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}}/>
            <div className="chat-compose-actions"><button type="button" className="btn secondary" disabled={pending} onClick={()=>input.current?.click()} aria-label="แนบไฟล์">⌁ แนบไฟล์</button><span>{text.length}/1,000</span><button className="btn primary" disabled={pending||(!text.trim()&&!file)}>{pending?'กำลังส่ง…':'ส่ง ↗'}</button></div>
            <input type="file" className="sr-only" ref={input} aria-label="เลือกไฟล์ส่งในแชต" onChange={e=>{const selected=e.target.files?.[0];e.target.value='';if(!selected)return;if(!selected.size||selected.size>5*1024*1024){setError('เลือกไฟล์ขนาดมากกว่า 0 และไม่เกิน 5 MB');return;}setFile(selected);setError('');}}/>
            {error&&<p role="alert" className="notice">{error}</p>}
        </form>
        <p className="micro chat-note">Enter เพื่อส่ง · Shift + Enter ขึ้นบรรทัดใหม่<br/>ไฟล์ไม่เกิน 5 MB · แชตและไฟล์หายเมื่อเซิร์ฟเวอร์รีสตาร์ต</p>
    </div>;
}
