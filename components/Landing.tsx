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
    return <main className="landing"><header className="landing-header"><a className="wordmark" href="#/">mellow<span>●</span></a><span className="header-note">คุย · ดู · ฟังด้วยกัน</span></header>
        <div className="landing-grid"><section className="entry-card"><div className="segmented"><button aria-pressed={!joining} onClick={() => {setJoining(false);setError('');}}>สร้างห้องใหม่</button><button aria-pressed={joining} onClick={() => {setJoining(true);setError('');}}>เข้าห้องเพื่อน</button></div><h2>{joining ? 'เข้าห้องเพื่อน' : 'เริ่มห้องของคุณ'}</h2><p className="intro">{joining ? 'วางลิงก์หรือรหัสห้อง แล้วแนะนำตัวได้เลย' : 'สุ่มชื่อกับรูปให้แล้ว กดสร้างห้องได้เลย หรือแก้ให้เป็นตัวคุณ'}</p>
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
        }} />{error && <p role="alert" className="notice">{error}</p>}</section></div><footer className="landing-footer">mellow <span>อยู่ด้วยกันได้ แม้คนละที่</span></footer>
    </main>;
}
