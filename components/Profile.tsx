import React, { useRef, useState } from 'react';
export interface Profile { name: string; avatar: string; motion: boolean; status?: string }
export const characters = ['🌻', '🐈', '🦊', '🐻', '🐸', '🐼', '🐰', '👾', '🤖', '🪐', '🍄', '👻'];
export const readProfile = (): Profile => {
    try { const p = JSON.parse(localStorage.getItem('mellow-profile') || 'null'); if (p?.name) return { ...p, status: typeof p.status === 'string' ? p.status : '' }; } catch {}
    return { name: '', avatar: '🌻', motion: true, status: '' };
};
export function Avatar({ avatar, speaking = false, motion = true }: { avatar: string; speaking?: boolean; motion?: boolean }) {
    return <span className={`avatar ${speaking ? 'speaking' : ''} ${speaking && motion ? 'bouncing' : ''}`}>
        {avatar.startsWith('data:image/') ? <img src={avatar} alt="รูปตัวแทน" /> : <span aria-hidden="true">{characters.includes(avatar) ? avatar : '🌻'}</span>}
    </span>;
}
export default function ProfileForm({ initial = readProfile(), onSave, label = 'เข้าห้อง', onCancel }: {
    initial?: Profile; onSave: (profile: Profile) => void; label?: string; onCancel?: () => void;
}) {
    const [profile, setProfile] = useState(initial);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const upload = async (file?: File) => {
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
            setError('เลือกรูป JPG, PNG หรือ WebP ขนาดไม่เกิน 3 MB'); return;
        }
        setLoading(true); setError('');
        try {
            const bitmap = await createImageBitmap(file);
            const canvas = document.createElement('canvas'); canvas.width = canvas.height = 144;
            const ctx = canvas.getContext('2d')!;
            const side = Math.min(bitmap.width, bitmap.height);
            ctx.fillStyle = '#eee9da'; ctx.fillRect(0, 0, 144, 144);
            ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 144, 144);
            bitmap.close();
            const avatar = canvas.toDataURL('image/jpeg', 0.8);
            if (avatar.length > 50000) throw new Error();
            setProfile(p => ({ ...p, avatar }));
        } catch { setError('อ่านรูปนี้ไม่ได้ ลองใช้รูปอื่นอีกครั้ง'); }
        finally { setLoading(false); if (input.current) input.current.value = ''; }
    };
    return <form className="profile-form" onSubmit={e => {
        e.preventDefault(); if (!profile.name.trim() || loading) return;
        const clean = { ...profile, name: profile.name.trim().slice(0, 40), status: (profile.status || '').trim().slice(0, 80) };
        try { localStorage.setItem('mellow-profile', JSON.stringify(clean)); } catch {}
        onSave(clean);
    }}>
        <div className="profile-preview"><Avatar avatar={profile.avatar} /><div><strong>เลือกตัวแทนของคุณ</strong><p>เป็นตัวเอง หรือเป็นตัวละครที่ชอบ</p></div></div>
        <label htmlFor="display-name">ชื่อที่เพื่อนจะเห็น</label>
        <input id="display-name" autoFocus autoComplete="nickname" required maxLength={40} value={profile.name} placeholder="อยากให้เพื่อนเรียกว่าอะไร?" onChange={e => setProfile({ ...profile, name: e.target.value })} />
        <label htmlFor="profile-status">Status <span className="muted">· ไม่ใส่ก็ได้</span></label>
        <input id="profile-status" maxLength={80} value={profile.status || ''} placeholder="วันนี้อยากบอกอะไรเพื่อน?" onChange={e => setProfile({ ...profile, status: e.target.value })} />
        <div className="character-grid" role="group" aria-label="เลือกตัวละคร">
            {characters.map(avatar => <button type="button" key={avatar} aria-label={`ตัวละคร ${avatar}`} aria-pressed={avatar === profile.avatar} onClick={() => setProfile({ ...profile, avatar })}>{avatar}</button>)}
        </div>
        <div className="profile-actions"><button type="button" className="btn secondary" disabled={loading} onClick={() => input.current?.click()}>{loading ? 'กำลังเตรียมรูป…' : '↥ ใช้รูปของฉัน'}</button>
            <button type="button" className="btn ghost" onClick={() => setProfile({ ...profile, avatar: characters[Math.floor(Math.random() * characters.length)] })}>✦ สุ่มตัวละคร</button></div>
        <input ref={input} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" aria-label="อัปโหลดรูปตัวแทน" onChange={e => upload(e.target.files?.[0])} />
        <label className="check-row"><input type="checkbox" checked={profile.motion} onChange={e => setProfile({ ...profile, motion: e.target.checked })} /> ขยับตัวละครเมื่อพูด <span className="muted">(PNGtuber)</span></label>
        <p className="micro">รูปที่เลือกจะแสดงให้เพื่อนในห้องเห็น</p>
        {error && <p role="alert" className="notice">{error}</p>}
        <div className="profile-actions">{onCancel && <button className="btn secondary" type="button" onClick={onCancel}>ยกเลิก</button>}<button className="btn primary grow" disabled={loading || !profile.name.trim()}>{label} ↗</button></div>
    </form>;
}
