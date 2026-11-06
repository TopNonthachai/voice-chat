import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import ProfileForm from './Profile';
export default function Landing() {
    const navigate = useNavigate();
    const [joining, setJoining] = useState(false);
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    return <main className="landing"><header className="landing-header"><a className="wordmark" href="#/">mellow<span>●</span></a><span className="header-note">GOOD MUSIC. BETTER COMPANY.</span></header>
        <div className="landing-grid"><section className="hero"><span className="eyebrow">A LITTLE SPACE TOGETHER</span><h1>คนละที่<br />เพลงเดียวกัน<span className="accent">.</span></h1><p>เปิดเพลงโปรด ชวนเพื่อนเข้าห้อง<br />ปล่อยให้ค่ำคืนนี้เล่นไปด้วยกัน</p><div className="record-art" aria-hidden="true"><div className="record"><div className="record-label">m<br /><small>SIDE A · TOGETHER</small></div></div><span className="orbit one">✦</span><span className="orbit two">♫</span><div className="record-caption">33⅓ RPM / NO DISTANCE BETWEEN US</div></div><div className="hero-tags"><span>↗ แชร์ลิงก์เข้าห้อง</span><span>♫ คิวเพลงของทุกคน</span><span>◉ คุยไป ฟังไป</span></div></section>
        <section className="entry-card"><div className="segmented"><button aria-pressed={!joining} onClick={() => {setJoining(false);setError('');}}>สร้างห้องใหม่</button><button aria-pressed={joining} onClick={() => {setJoining(true);setError('');}}>เข้าห้องเพื่อน</button></div><h2>{joining ? 'มีที่ให้คุณเสมอ' : 'เริ่มห้องของคุณ'}</h2><p className="intro">{joining ? 'วางลิงก์หรือรหัสห้อง แล้วแนะนำตัวได้เลย' : 'ไม่ต้องสมัครสมาชิก แค่ตั้งชื่อแล้วชวนเพื่อน'}</p>
        {joining && <label className="room-code">ลิงก์หรือรหัสห้อง<input value={code} onChange={e => setCode(e.target.value)} placeholder="วางลิงก์เชิญหรือรหัสห้อง" /></label>}
        <ProfileForm label={joining ? 'เข้าห้องเพื่อน' : 'สร้างห้อง'} onSave={profile => {
            let room = joining ? code.trim() : uuidv4();
            if (joining && room.includes('/room/')) room = room.split('/room/')[1]?.split(/[?&#/]/)[0] || '';
            if (!/^[a-zA-Z0-9_-]{1,128}$/.test(room)) {setError('กรุณาใส่ลิงก์หรือรหัสห้องที่ถูกต้อง');return;}
            navigate(`/room/${room}`, {state:{profile}});
        }} />{error && <p role="alert" className="notice">{error}</p>}</section></div><footer className="landing-footer">MADE FOR YOUR INNER CIRCLE <span>ฟังด้วยกัน ใกล้กันอีกนิด</span></footer>
    </main>;
}
