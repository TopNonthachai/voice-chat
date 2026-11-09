import React, {useEffect, useRef, useState} from 'react';
export default function RoomSettings({settings,roomId,manage,notifications,setNotifications}: {
    settings:{invite:string;locked:boolean;inviteOnly:boolean;isOwner:boolean}|null;roomId:string;
    manage:(action:string,extra?:Record<string,unknown>)=>void;notifications:boolean;setNotifications:(value:boolean)=>void;
}) {
    const [open,setOpen]=useState(false);
    const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
    useEffect(()=>{
        if(!open)return;
        const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};
        const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}};
        document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
        return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
    },[open]);
    return <div className="room-settings" ref={root}>
        <button ref={trigger} className="btn secondary" aria-expanded={open} aria-controls="room-settings-popover" onClick={()=>setOpen(value=>!value)}>ตั้งค่าห้อง ⌄</button>
        {open&&<section id="room-settings-popover" className="settings-popover" aria-label="ตั้งค่าห้อง">
            <div className="settings-title"><strong>ตั้งค่าห้อง</strong><small>รหัส {roomId}</small></div>
            {settings?.isOwner&&<>
                <label className="check-row"><input type="checkbox" checked={settings.inviteOnly} onChange={e=>manage('invite-only',{enabled:e.target.checked})}/>เข้าผ่านลิงก์เชิญเท่านั้น</label>
                <label className="check-row"><input type="checkbox" checked={settings.locked} onChange={e=>manage('lock',{enabled:e.target.checked})}/>ล็อกไม่รับคนเพิ่ม</label>
                <label className="invite-link-label">ลิงก์เชิญปัจจุบัน<input readOnly value={`${window.location.origin}${window.location.pathname}#/r/${settings.invite}`} onFocus={e=>e.target.select()}/></label>
                <button className="btn secondary" onClick={()=>manage('rotate-invite')}>เปลี่ยนลิงก์เชิญ</button>
                <p className="micro">เปลี่ยนเฉพาะลิงก์เชิญ รหัสห้องยังเดิม หากเปิดให้เข้าด้วยรหัสห้อง คนยังใช้รหัสเดิมเข้าได้</p>
            </>}
            <label className="check-row"><input type="checkbox" checked={notifications} onChange={e=>setNotifications(e.target.checked)}/>เสียงแจ้งเตือน</label>
            <p className="micro">เข้าห้อง ออกห้อง แชท และแชร์จอ · เริ่มหลังแตะหรือกดบนหน้าเว็บ</p>
        </section>}
    </div>;
}
