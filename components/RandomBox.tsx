import React,{useEffect,useRef,useState} from 'react';
import {Socket} from 'socket.io-client';
import './random-box.css';
type Option={id:string;label:string;addedBy:string};
type Result={id:string;label:string;optionId:string;actor:string;round:number;timestamp:number};
type Box={revision:number;options:Option[];used:string[];noRepeat:boolean;round:number;draw:{id:string;actor:string;startedAt:number;endsAt:number}|null;result:Result|null;history:Result[];serverNow:number};
export default function RandomBox({socket,roomId}:{socket:Socket|null;roomId:string}) {
 const [box,setBox]=useState<Box|null>(null),[input,setInput]=useState(''),[error,setError]=useState(''),[pending,setPending]=useState(false),[ready,setReady]=useState(false),[clock,setClock]=useState(Date.now());
 const [reduceMotion,setReduceMotion]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),update=()=>setReduceMotion(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 const busy=useRef(false),clockBase=useRef({server:Date.now(),local:performance.now()});
 useEffect(()=>{
  if(!socket)return;
  const state=(next:Box)=>{
   clockBase.current={server:next.serverNow,local:performance.now()};setClock(next.serverNow);
   setBox(previous=>!previous||next.revision>=previous.revision?next:previous);setReady(true);
  };
  const sync=()=>{setReady(false);socket.emit('random-box-sync',{roomId});};
  const disconnected=()=>setReady(false);
  socket.on('random-box-state',state);socket.on('room-joined',sync);socket.on('connect',sync);socket.on('disconnect',disconnected);sync();
  return()=>{socket.off('random-box-state',state);socket.off('room-joined',sync);socket.off('connect',sync);socket.off('disconnect',disconnected);};
 },[socket,roomId]);
 useEffect(()=>{
  if(!box?.draw)return;
  const tick=()=>setClock(clockBase.current.server+performance.now()-clockBase.current.local);
  tick();const timer=setInterval(tick,100);return()=>clearInterval(timer);
 },[box?.draw?.id]);
 const command=(action:string,extra:Record<string,unknown>={},success?:()=>void)=>{
  if(!socket?.connected||!ready){setError('กำลังเชื่อมต่อกล่องสุ่ม…');return;}
  if(busy.current)return;busy.current=true;setPending(true);setError('');
  socket.timeout(8000).emit('random-box-command',{roomId,action,requestId:crypto.randomUUID(),...extra},(timeout:Error|null,result:{error?:string})=>{
   busy.current=false;setPending(false);
   if(timeout||result?.error){setError(result?.error||'ยังไม่ได้รับคำตอบ กำลังตรวจผลล่าสุด');socket.emit('random-box-sync',{roomId});}
   else success?.();
  });
 };
 const locked=!ready||pending||Boolean(box?.draw),used=box?.used||[];
 const remaining=box?.options.filter(option=>!used.includes(option.id))||[];
 const candidates=box?.noRepeat&&remaining.length?remaining:box?.options||[];
 const rolling=box?.draw?candidates[Math.floor(Math.max(0,clock-box.draw.startedAt)/110)%Math.max(1,candidates.length)]?.label:'';
 const seconds=box?.draw?Math.max(0,Math.ceil((box.draw.endsAt-clock)/1000)):0;
 return <section className="random-box" aria-label="กล่องสุ่มของห้อง">
  <div className="random-box-heading"><div><h3>ให้กล่องช่วยเลือก</h3><p>ใส่เกม ร้านอาหาร หรืออะไรก็ได้ แล้วลุ้นพร้อมกัน</p></div><span className="box-round">รอบ {box?.round||1}</span></div>
  <div className={`box-result ${box?.draw?'is-drawing':''}`}>
   <span className="box-symbol" aria-hidden="true">{box?.draw?'✦':'⚄'}</span>
   <span className="box-result-label">{box?.draw?'กำลังสุ่มพร้อมกันทั้งห้อง':box?.result?'ผลที่ได้':'กล่องนี้จะเลือกอะไรให้เรา?'}</span>
   <strong aria-hidden={Boolean(box?.draw)}>{box?.draw?(reduceMotion?'กำลังเลือก…':rolling):box?.result?.label||'รอตัวเลือกจากทุกคน'}</strong>
   <div className="sr-only" role="status" aria-live="polite">{box?.draw?`${box.draw.actor} เริ่มสุ่มแล้ว`:box?.result?`ผลสุ่มคือ ${box.result.label}`:''}</div>
   <small>{box?.draw?`${box.draw.actor} กำลังสุ่ม · ${seconds>0?`${seconds} วินาที`:'กำลังรอผล…'}`:box?.result?`สุ่มโดย ${box.result.actor}`:'ทุกคนช่วยกันเพิ่มตัวเลือกได้'}</small>
   <button className="btn primary draw-button" disabled={locked||!box?.options.length} onClick={()=>command('draw')}>{box?.draw?'กำลังลุ้น…':box?.result?'สุ่มอีกครั้ง':'สุ่มเลย'}</button>
  </div>
  <div className="box-mode-row"><label className="check-row"><input type="checkbox" checked={box?.noRepeat??true} disabled={locked} onChange={e=>command('mode',{noRepeat:e.target.checked})}/>สุ่มไม่ซ้ำจนกว่าจะครบ</label><button className="btn ghost" disabled={locked||!used.length} onClick={()=>{if(window.confirm('เริ่มรอบใหม่และให้ทุกตัวเลือกมีสิทธิ์ถูกสุ่มอีกครั้ง?'))command('reset-round');}}>เริ่มรอบใหม่</button></div>
  <small className="box-round-note">{box?.noRepeat?(remaining.length?`เหลือ ${remaining.length} จาก ${box.options.length} ตัวเลือกในรอบนี้`:box?.options.length?'ครบรอบแล้ว สุ่มครั้งถัดไปจะเริ่มรอบใหม่':'เพิ่มตัวเลือกเพื่อเริ่มสุ่ม'):'ทุกครั้งมีโอกาสได้ตัวเลือกเดิม'}</small>
  <form className="box-add" onSubmit={e=>{e.preventDefault();const items=input.split(/\r?\n/).map(text=>text.trim()).filter(Boolean);if(items.length)command('add',{items},()=>setInput(''));}}><label htmlFor="box-options">เพิ่มตัวเลือก <small>พิมพ์บรรทัดละหนึ่งรายการ</small></label><textarea id="box-options" rows={2} value={input} maxLength={4050} placeholder={'เช่น เล่นเกม\nดูหนัง\nหาอะไรกิน'} onChange={e=>setInput(e.target.value)} disabled={locked}/><div><small>สูงสุด 50 ตัวเลือก · ตัวเลือกละ 80 ตัวอักษร</small><button className="btn secondary" disabled={locked||!input.trim()}>＋ เพิ่มเข้ากล่อง</button></div></form>
  <div className="box-options-heading"><h4>ตัวเลือกของพวกเรา <span>{box?.options.length||0}</span></h4><button className="btn ghost" disabled={locked||!box?.options.length} onClick={()=>{if(window.confirm('ลบตัวเลือกทั้งหมดในกล่อง? ประวัติผลสุ่มยังอยู่'))command('clear');}}>ล้างตัวเลือก</button></div>
  <ul className="box-options">{box?.options.map(option=><li key={option.id} className={box.noRepeat&&used.includes(option.id)?'was-drawn':''}><span><strong>{option.label}</strong><small>{box.noRepeat&&used.includes(option.id)?'สุ่มแล้วในรอบนี้':`เพิ่มโดย ${option.addedBy}`}</small></span><button aria-label={`ลบตัวเลือก ${option.label}`} disabled={locked} onClick={()=>command('remove',{id:option.id})}>×</button></li>)}</ul>
  <details className="box-history"><summary>ประวัติผลสุ่ม</summary>{box?.history.length?<ol>{box.history.map(result=><li key={result.id}><strong>{result.label}</strong><small>{result.actor} · รอบ {result.round} · {new Date(result.timestamp).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}</small></li>)}</ol>:<p>ยังไม่มีผลสุ่ม</p>}</details>
  {error&&<p className="notice" role="status">{error}</p>}
  <p className="micro">ผลเดียวกันทั้งห้อง · กล่องและประวัติเป็นข้อมูลชั่วคราว</p>
 </section>;
}
