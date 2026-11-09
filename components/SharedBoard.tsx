import React,{useEffect,useRef,useState} from 'react';
import {Socket} from 'socket.io-client';
import './shared-board.css';
type Point=[number,number];
type Stroke={id:string;memberId:string;points:Point[];color:string;width:number;name:string};
type Note={id:string;text:string;color:string;x:number;y:number;revision:number;textRevision:number;positionRevision:number;name:string};
type Board={revision:number;strokes:Stroke[];notes:Note[]};
type Command=(action:string,extra:Record<string,unknown>,done?:(error?:string)=>void)=>void;
const clamp=(n:number)=>Math.min(1,Math.max(0,n));
const colors=[{value:'#334b3c',label:'สีเขียวเข้ม'},{value:'#b65343',label:'สีส้ม'},{value:'#41678d',label:'สีน้ำเงิน'},{value:'#8b619e',label:'สีม่วง'}];
function StickyNote({note,command}:{note:Note;command:Command}) {
 const [draft,setDraft]=useState(note.text),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const [position,setPosition]=useState<Point|null>(null),root=useRef<HTMLDivElement>(null);
 const editRevision=useRef(note.textRevision),drag=useRef<{pointer:number;x:number;y:number;origin:Point;revision:number;width:number;height:number}|null>(null);
 useEffect(()=>{if(!dirty){setDraft(note.text);editRevision.current=note.textRevision;}},[note.text,note.textRevision,dirty]);
 const save=(latest=false)=>{
  if(!dirty||saving)return;setSaving(true);setError('');
  command('edit-note',{id:note.id,text:draft,expectedTextRevision:latest?note.textRevision:editRevision.current},error=>{setSaving(false);if(error)setError(error);else setDirty(false);});
 };
 const move=(e:React.PointerEvent)=>{
  if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
  const area=root.current!.parentElement!.getBoundingClientRect(),card=root.current!.getBoundingClientRect();
  drag.current={pointer:e.pointerId,x:e.clientX,y:e.clientY,origin:[note.x,note.y],revision:note.positionRevision,width:Math.max(1,area.width-card.width),height:Math.max(1,area.height-card.height)};
 };
 const dragMove=(e:React.PointerEvent)=>{const d=drag.current;if(!d||d.pointer!==e.pointerId)return;setPosition([clamp(d.origin[0]+(e.clientX-d.x)/d.width),clamp(d.origin[1]+(e.clientY-d.y)/d.height)]);};
 const endMove=(e:React.PointerEvent)=>{
  const d=drag.current;if(!d||d.pointer!==e.pointerId)return;drag.current=null;
  const x=clamp(d.origin[0]+(e.clientX-d.x)/d.width),y=clamp(d.origin[1]+(e.clientY-d.y)/d.height);
  if(Math.abs(x-d.origin[0])+Math.abs(y-d.origin[1])<.002){setPosition(null);return;}
  command('move-note',{id:note.id,x,y,expectedPositionRevision:d.revision},error=>{setPosition(null);if(error)setError(error);});
 };
 const keyboardMove=(e:React.KeyboardEvent)=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
  command('move-note',{id:note.id,x:clamp(note.x+(e.key==='ArrowLeft'?-.03:e.key==='ArrowRight'?.03:0)),y:clamp(note.y+(e.key==='ArrowUp'?-.03:e.key==='ArrowDown'?.03:0)),expectedPositionRevision:note.positionRevision});
 };
 return <div className={`board-note paper-${note.color}`} ref={root} style={{left:`calc((100% - var(--note-width)) * ${position?.[0]??note.x})`,top:`calc((100% - 184px) * ${position?.[1]??note.y})`}}>
  <header><button className="note-handle" aria-label={`ย้ายโน้ตของ ${note.name}`} onKeyDown={keyboardMove} onPointerDown={move} onPointerMove={dragMove} onPointerUp={endMove} onPointerCancel={()=>{drag.current=null;setPosition(null);}}>⠿ {note.name}</button><button className="note-delete" aria-label="ลบโน้ต" onClick={()=>{if(window.confirm('ลบโน้ตแผ่นนี้?'))command('delete-note',{id:note.id,expectedRevision:note.revision});}}>×</button></header>
  <textarea aria-label={`ข้อความโน้ตของ ${note.name}`} maxLength={500} value={draft} placeholder="เขียนอะไรไว้ให้เพื่อน…" onFocus={()=>{if(!dirty)editRevision.current=note.textRevision;}} onChange={e=>{setDraft(e.target.value);setDirty(true);}} onBlur={()=>save()}/>
  <div className="note-footer">{saving?'กำลังบันทึก…':dirty?<button onClick={()=>save(Boolean(error))}>บันทึก{error?'ข้อความของฉัน':''}</button>:<small>บันทึกแล้ว</small>}</div>
  {error&&<div className="note-conflict" role="status"><p>{error}</p><p>ข้อความล่าสุด: {note.text||'(ว่าง)'}</p></div>}
 </div>;
}
export default function SharedBoard({socket,roomId,memberId}:{socket:Socket|null;roomId:string;memberId:string}) {
 const [board,setBoard]=useState<Board>({revision:0,strokes:[],notes:[]}),[error,setError]=useState('');
 const [tool,setTool]=useState<'pen'|'move'>('pen'),[color,setColor]=useState(colors[0].value),[width,setWidth]=useState(6),[paper,setPaper]=useState('yellow');
 const [pendingStroke,setPendingStroke]=useState<Stroke|null>(null),[ready,setReady]=useState(false);
 const drawing=useRef<{pointer:number;points:Point[];id:string;color:string;width:number}|null>(null),svg=useRef<SVGSVGElement>(null);
 useEffect(()=>{
  if(!socket)return;
  const state=(next:Board)=>{setBoard(previous=>next.revision>=previous.revision?next:previous);setReady(true);};
  const sync=()=>{setReady(false);socket.emit('board-sync',{roomId});};
  const joined=()=>sync();
  const disconnect=()=>{setReady(false);drawing.current=null;setPendingStroke(null);};
  socket.on('board-state',state);socket.on('room-joined',joined);socket.on('connect',sync);socket.on('disconnect',disconnect);sync();
  return()=>{socket.off('board-state',state);socket.off('room-joined',joined);socket.off('connect',sync);socket.off('disconnect',disconnect);};
 },[socket,roomId]);
 const command:Command=(action,extra,done)=>{
  if(!socket?.connected||!ready){const error='กำลังเชื่อมต่อกระดาน รอสักครู่';setError(error);done?.(error);return;}
  setError('');socket.timeout(8000).emit('board-command',{roomId,action,requestId:crypto.randomUUID(),...extra},(timeout:Error|null,result:{error?:string})=>{
   const error=timeout?'ยังไม่ได้รับคำตอบ กำลังโหลดกระดานล่าสุด':result?.error;
   if(error){setError(error);socket.emit('board-sync',{roomId});}done?.(error);
  });
 };
 const point=(e:React.PointerEvent):Point=>{const rect=svg.current!.getBoundingClientRect();return [clamp((e.clientX-rect.left)/rect.width),clamp((e.clientY-rect.top)/rect.height)];};
 const start=(e:React.PointerEvent<SVGSVGElement>)=>{
  if(tool!=='pen'||!ready||e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
  const points=[point(e)];const id=crypto.randomUUID();drawing.current={pointer:e.pointerId,points,id,color,width};setPendingStroke({id,memberId,points,color,width,name:''});
 };
 const move=(e:React.PointerEvent)=>{
  const active=drawing.current;if(!active||active.pointer!==e.pointerId)return;
  const next=point(e),last=active.points.at(-1)!;
  if(Math.abs(last[0]-next[0])+Math.abs(last[1]-next[1])<.002)return;
  if(active.points.length>=299)active.points=active.points.filter((_,i)=>i%2===0);
  active.points.push(next);setPendingStroke({id:active.id,memberId,points:[...active.points],color:active.color,width:active.width,name:''});
 };
 const end=(e:React.PointerEvent)=>{
  const active=drawing.current;if(!active||active.pointer!==e.pointerId)return;drawing.current=null;
  const points=[...active.points,point(e)].slice(0,300);
  command('stroke',{points,color:active.color,width:active.width},()=>setPendingStroke(previous=>previous?.id===active.id?null:previous));
 };
 const stroke=(item:Stroke)=><polyline key={item.id} points={item.points.map(([x,y])=>`${x*1000},${y*650}`).join(' ')+(item.points.length===1?` ${item.points[0][0]*1000+.01},${item.points[0][1]*650}`:'')} fill="none" stroke={item.color} strokeWidth={item.width} strokeLinecap="round" strokeLinejoin="round"/>;
 return <section className="shared-board" aria-label="กระดานร่วมกัน">
  <div className="board-toolbar"><div className="board-tools"><button className="btn secondary" aria-pressed={tool==='pen'} onClick={()=>setTool('pen')}>✎ ปากกา</button><button className="btn secondary" aria-pressed={tool==='move'} onClick={()=>setTool('move')}>เลือก / เลื่อน</button><button className="btn ghost" disabled={!ready||!board.strokes.some(stroke=>stroke.memberId===memberId)} onClick={()=>command('undo',{})}>↶ ย้อนเส้นของฉัน</button></div>
  <div className="board-tools"><div className="board-colors" role="group" aria-label="สีปากกา">{colors.map(item=><button key={item.value} style={{background:item.value}} aria-label={item.label} aria-pressed={color===item.value} onClick={()=>setColor(item.value)}/>)}</div><label>ขนาด<select aria-label="ขนาดปากกา" value={width} onChange={e=>setWidth(Number(e.target.value))}><option value={3}>เล็ก</option><option value={6}>กลาง</option><option value={10}>ใหญ่</option></select></label></div>
  <div className="board-tools"><label>สีโน้ต<select value={paper} aria-label="สีโน้ต" onChange={e=>setPaper(e.target.value)}><option value="yellow">เหลือง</option><option value="green">เขียว</option><option value="pink">ชมพู</option><option value="blue">ฟ้า</option></select></label><button className="btn primary" disabled={!ready} onClick={()=>command('add-note',{color:paper,x:board.notes.length%2===0?0:1,y:Math.floor(board.notes.length/2)%2===0?0:1})}>＋ แปะโน้ต</button></div></div>
  <div className={`board-canvas ${tool==='pen'?'drawing-mode':''}`}>
   <svg ref={svg} viewBox="0 0 1000 650" preserveAspectRatio="none" role="img" aria-label="พื้นที่วาดรูปที่แชร์กับทุกคนในห้อง" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{drawing.current=null;setPendingStroke(null);}}>{board.strokes.map(stroke)}{pendingStroke&&stroke(pendingStroke)}</svg>
   {!board.strokes.length&&!board.notes.length&&!pendingStroke&&<div className="board-empty" aria-hidden="true">วาดรูป หรือแปะโน้ตให้เพื่อนกัน</div>}
   {board.notes.map(note=><StickyNote key={note.id} note={note} command={command}/>)}
  </div>
  <div className="board-footer"><small role="status">{ready?'● กระดานพร้อมใช้':'กำลังเชื่อมต่อกระดาน…'} · {board.strokes.length}/200 เส้น · {board.notes.length}/40 โน้ต</small><small>ลากหัวโน้ตเพื่อย้าย · ข้อความบันทึกเมื่อออกจากช่อง · กระดานชั่วคราว ไม่บันทึกถาวร</small></div>
  {error&&<p className="notice" role="status">{error}</p>}
 </section>;
}
