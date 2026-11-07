import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import ProfileForm, { Profile } from './Profile';
import Room from './Room';
export default function RoomEntry() {
    const location=useLocation(),navigate=useNavigate(),params=useParams<{roomId:string;invite:string}>();
    const [profile,setProfile]=useState<Profile|null>(location.state?.profile||null);
    const [resolved,setResolved]=useState(''),[error,setError]=useState('');
    useEffect(()=>{
        setError('');setResolved('');
        if(!params.invite){setResolved(params.roomId||'');return;}
        const controller=new AbortController();
        fetch(`/api/invites/${encodeURIComponent(params.invite)}`,{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error);setResolved(data.roomId);}).catch(e=>{if(e.name!=='AbortError')setError(e.message||'เปิดลิงก์เชิญไม่ได้');});
        return ()=>controller.abort();
    },[params.invite,params.roomId]);
    if(error)return <main className="entry-shell"><section className="entry-card"><h1>เข้าห้องไม่ได้</h1><p className="notice">{error}</p><button className="btn primary" onClick={()=>navigate('/')}>กลับหน้าหลัก</button></section></main>;
    if(!resolved)return <main className="entry-shell"><p>กำลังเปิดห้อง…</p></main>;
    if(profile)return <Room key={resolved} initialProfile={profile} roomId={resolved} invite={params.invite}/>;
    return <main className="entry-shell"><a className="wordmark" href="#/">mellow<span>●</span></a><section className="entry-card"><span className="eyebrow">YOU'RE INVITED</span><h1>ก่อนเข้าห้อง<br/>แนะนำตัวกันหน่อย</h1><p className="intro">ตั้งชื่อ เลือกตัวแทน แล้วไปฟังเพลงด้วยกัน</p><ProfileForm onSave={setProfile}/><button className="text-link" onClick={()=>navigate('/')}>← กลับหน้าหลัก</button></section></main>;
}
