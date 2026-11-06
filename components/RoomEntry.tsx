import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ProfileForm, { Profile } from './Profile';
import Room from './Room';
export default function RoomEntry() {
    const location = useLocation();
    const navigate = useNavigate();
    const [profile, setProfile] = useState<Profile | null>(location.state?.profile || null);
    if (profile) return <Room initialProfile={profile} />;
    return <main className="entry-shell"><a className="wordmark" href="#/">mellow<span>●</span></a><section className="entry-card"><span className="eyebrow">YOU'RE INVITED</span><h1>ก่อนเข้าห้อง<br />แนะนำตัวกันหน่อย</h1><p className="intro">ตั้งชื่อ เลือกตัวแทน แล้วไปฟังเพลงด้วยกัน</p><ProfileForm onSave={setProfile} /><button className="text-link" onClick={() => navigate('/')}>← กลับหน้าหลัก</button></section></main>;
}
