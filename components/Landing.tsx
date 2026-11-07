import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { saveMemberToken } from './room-access';
import ProfileForm from './Profile';
export default function Landing() {
    const navigate = useNavigate();
    const [joining, setJoining] = useState(false);
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [busy,setBusy]=useState(false);
    return <main className="landing"><header className="landing-header"><a className="wordmark" href="#/">mellow<span>●</span></a><span className="header-note">GOOD MUSIC. BETTER COMPANY.</span></header>
        <div className="landing-grid"><section className="hero"><span className="eyebrow">A LITTLE SPACE TOGETHER</span><h1>คนละที่<br />เพลงเดียวกัน<span className="accent">.</span></h1><p>เปิดเพลงโปรด ชวนเพื่อนเข้าห้อง<br />ปล่อยให้ค่ำคืนนี้เล่นไปด้วยกัน</p><div className="record-art" aria-hidden="true"><div className="record"><div className="record-label">m<br /><small>SIDE A · TOGETHER</small></div></div><span className="orbit one">✦</span><span className="orbit two">♫</span><div className="record-caption">33⅓ RPM / NO DISTANCE BETWEEN US</div></div><div className="hero-tags"><span>↗ แชร์ลิงก์เข้าห้อง</span><span>♫ คิวเพลงของทุกคน</span><span>◉ คุยไป ฟังไป</span></div></section>
        <section className="entry-card"><div className="segmented"><button aria-pressed={!joining} onClick={() => {setJoining(false);setError('');}}>สร้างห้องใหม่</button><button aria-pressed={joining} onClick={() => {setJoining(true);setError('');}}>เข้าห้องเพื่อน</button></div><h2>{joining ? 'มีที่ให้คุณเสมอ' : 'เริ่มห้องของคุณ'}</h2><p className="intro">{joining ? 'วางลิงก์หรือรหัสห้อง แล้วแนะนำตัวได้เลย' : 'ไม่ต้องสมัครสมาชิก แค่ตั้งชื่อแล้วชวนเพื่อน'}</p>
        {joining && <label className="room-code">ลิงก์หรือรหัสห้อง<input value={code} onChange={e => setCode(e.target.value)} placeholder="วางลิงก์เชิญหรือรหัสห้อง" /></label>}
        <ProfileForm label={busy?'กำลังสร้างห้อง…':joining ? 'เข้าห้องเพื่อน' : 'สร้างห้อง'} onSave={async profile => {
            if(busy)return;setError('');
            if(joining){
                const raw=code.trim();const route=raw.includes('#')?raw.split('#')[1]:raw;
                const match=route.match(/(?:^|\/)(r|room)\/([a-zA-Z0-9_-]{1,128})(?:\/|$)/);
                if(match){navigate(`/${match[1]}/${match[2]}`,{state:{profile}});return;}
                if(/^[a-zA-Z0-9_-]{12}$/.test(raw)){navigate(`/r/${raw}`,{state:{profile}});return;}
                if(/^[a-zA-Z0-9_-]{8}$/.test(raw)){navigate(`/room/${raw}`,{state:{profile}});return;}
                setError('กรุณาใส่ลิงก์เชิญหรือรหัสห้องที่ถูกต้อง');return;
            }
            setBusy(true);
            try{const response=await fetch('/api/rooms',{method:'POST'});const result=await response.json();if(!response.ok)throw new Error(result.error||'สร้างห้องไม่ได้');saveMemberToken(result.roomId,result.memberToken);navigate(`/room/${result.roomId}`,{state:{profile}});}
            catch{setError('สร้างห้องไม่ได้ ลองใหม่อีกครั้งครับ');}finally{setBusy(false);}
        }} />{error && <p role="alert" className="notice">{error}</p>}</section></div><footer className="landing-footer">MADE FOR YOUR INNER CIRCLE <span>ฟังด้วยกัน ใกล้กันอีกนิด</span></footer>
    </main>;
}
