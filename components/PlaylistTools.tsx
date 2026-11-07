import React, {useRef,useState} from 'react';
interface Track {videoId:string;title:string;author?:string}
export default function PlaylistTools({tracks,onImport}:{tracks:Track[];onImport:(playlist:unknown,mode:'append'|'replace',done:(error?:string)=>void)=>void}){
 const input=useRef<HTMLInputElement>(null);const [mode,setMode]=useState<'append'|'replace'>('append'),[pending,setPending]=useState(false),[message,setMessage]=useState('');
 const download=()=>{
  const data={format:'mellow-playlist',version:1,exportedAt:new Date().toISOString(),tracks:tracks.map(({videoId,title,author})=>({videoId,title,author}))};
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`mellow-playlist-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage(`ส่งออก ${tracks.length} เพลงแล้ว`);
 };
 const upload=async(file?:File)=>{
  if(!file)return;setMessage('');
  if(!file.size||file.size>128*1024){setMessage('ไฟล์ต้องมีขนาดไม่เกิน 128 KB');return;}
  let playlist:any;try{playlist=JSON.parse((await file.text()).replace(/^\uFEFF/,''));}catch{setMessage('อ่านไฟล์ JSON ไม่ได้ กรุณาใช้ไฟล์ที่ส่งออกจาก mellow');return;}
  if(playlist?.format!=='mellow-playlist'||playlist.version!==1||!Array.isArray(playlist.tracks)||!playlist.tracks.length||playlist.tracks.length>100){setMessage('ไฟล์เพลย์ลิสต์ไม่ถูกต้อง รองรับ 1–100 เพลง');return;}
  if(mode==='replace'&&tracks.length&&!window.confirm('แทนที่คิวปัจจุบันด้วยเพลย์ลิสต์นี้? เพลงจะหยุดพักจนกว่าจะกดเล่น'))return;
  setPending(true);onImport(playlist,mode,error=>{setPending(false);setMessage(error||'นำเข้าเพลย์ลิสต์แล้ว');});
 };
 return <details className="playlist-tools"><summary>↥ นำเข้า / ↧ ส่งออกเพลย์ลิสต์</summary><p className="micro">เก็บคิวเป็นไฟล์ในเครื่อง ไม่ต้องมีบัญชีหรือฐานข้อมูล</p><div><button className="btn secondary" disabled={!tracks.length||pending} onClick={download}>↧ ส่งออก JSON</button><label>วิธีนำเข้า<select aria-label="วิธีนำเข้าเพลย์ลิสต์" value={mode} onChange={e=>setMode(e.target.value as 'append'|'replace')}><option value="append">เพิ่มต่อท้ายคิว</option><option value="replace">แทนที่คิวเดิม</option></select></label><button className="btn secondary" disabled={pending} onClick={()=>input.current?.click()}>{pending?'กำลังนำเข้า…':'↥ เลือกไฟล์ JSON'}</button></div><input ref={input} type="file" className="sr-only" accept=".json,application/json" aria-label="ไฟล์เพลย์ลิสต์" onChange={e=>{upload(e.target.files?.[0]);e.target.value='';}}/>{message&&<p role="status" className="micro">{message}</p>}</details>;
}
