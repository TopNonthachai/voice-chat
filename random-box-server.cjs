const {randomInt,randomUUID}=require('node:crypto');
function registerRandomBox(io,{drawMs=3000,pick=randomInt}={}) {
 const rooms=new Map(),timers=new Set();
 const get=id=>{if(!rooms.has(id))rooms.set(id,{revision:0,options:[],used:[],noRepeat:true,round:1,draw:null,result:null,history:[],requests:new Map()});return rooms.get(id);};
 const snapshot=state=>({revision:state.revision,options:state.options,used:state.used,noRepeat:state.noRepeat,round:state.round,draw:state.draw,result:state.result,history:state.history,serverNow:Date.now()});
 const broadcast=(roomId,state)=>io.to(roomId).emit('random-box-state',snapshot(state));
 io.httpServer?.once('close',()=>{for(const timer of timers)clearTimeout(timer);});
 io.on('connection',socket=>{
  const member=roomId=>socket.data.roomId===roomId&&socket.rooms.has(roomId);
  socket.on('random-box-sync',({roomId}={})=>{if(member(roomId))socket.emit('random-box-state',snapshot(get(roomId)));});
  socket.on('random-box-command',(data={},ack=()=>{})=>{
   if(typeof ack!=='function')ack=()=>{};
   const {roomId,action,requestId}=data||{},fail=error=>ack({error});
   if(!member(roomId))return fail('กรุณาเข้าห้องก่อนใช้กล่องสุ่ม');
   if(typeof requestId!=='string'||!/^[-\w]{8,80}$/.test(requestId))return fail('รหัสคำสั่งไม่ถูกต้อง');
   const state=get(roomId),identity=socket.data.memberId||socket.data.userId,key=`${identity}:${requestId}`;
   if(state.requests.has(key))return ack({ok:true});
   if(state.draw)return fail('กำลังสุ่มอยู่ รอผลรอบนี้ก่อนนะ');
   const now=Date.now();if(!socket.data.boxRate||socket.data.boxRate.until<=now)socket.data.boxRate={until:now+10000,count:0};
   if(++socket.data.boxRate.count>30)return fail('แก้กล่องสุ่มถี่ไปนิด รอสักครู่แล้วลองใหม่');
   if(action==='add'){
    if(!Array.isArray(data.items)||!data.items.length||data.items.length>50||data.items.some(text=>typeof text!=='string'||!text.trim()||text.trim().length>80))return fail('เพิ่มได้ครั้งละ 1–50 ตัวเลือก ตัวเลือกละไม่เกิน 80 ตัวอักษร');
    const seen=new Set(state.options.map(item=>item.label.toLocaleLowerCase()));
    const added=[];for(const raw of data.items){const label=raw.trim(),canonical=label.toLocaleLowerCase();if(seen.has(canonical))continue;seen.add(canonical);added.push({id:randomUUID(),label,addedBy:socket.data.userName||'เพื่อน'});}
    if(!added.length)return fail('ตัวเลือกทั้งหมดอยู่ในกล่องแล้ว');
    if(state.options.length+added.length>50)return fail('กล่องใส่ได้ไม่เกิน 50 ตัวเลือก');
    state.options.push(...added);
   }else if(action==='remove'){
    if(!state.options.some(item=>item.id===data.id))return fail('ไม่พบตัวเลือกนี้แล้ว');
    state.options=state.options.filter(item=>item.id!==data.id);state.used=state.used.filter(id=>id!==data.id);
   }else if(action==='mode'){
    if(typeof data.noRepeat!=='boolean')return fail('โหมดไม่ถูกต้อง');state.noRepeat=data.noRepeat;
   }else if(action==='reset-round'){
    state.used=[];state.round++;state.result=null;
   }else if(action==='clear'){
    state.options=[];state.used=[];state.result=null;state.round++;
   }else if(action==='draw'){
    if(!state.options.length)return fail('เพิ่มตัวเลือกก่อนสุ่ม');
    let candidates=state.noRepeat?state.options.filter(item=>!state.used.includes(item.id)):state.options;
    if(!candidates.length){state.used=[];state.round++;candidates=state.options;}
    const winner=candidates[pick(candidates.length)],actor=socket.data.userName||'เพื่อน';
    const id=randomUUID();state.draw={id,actor,startedAt:now,endsAt:now+drawMs};
    const timer=setTimeout(()=>{
     timers.delete(timer);if(state.draw?.id!==id)return;
     state.result={id,label:winner.label,optionId:winner.id,actor,round:state.round,timestamp:Date.now()};
     if(!state.used.includes(winner.id))state.used.push(winner.id);
     state.history=[state.result,...state.history].slice(0,20);state.draw=null;state.revision++;broadcast(roomId,state);
    },drawMs);timer.unref();timers.add(timer);
   }else return fail('คำสั่งกล่องสุ่มไม่ถูกต้อง');
   state.revision++;state.requests.set(key,true);if(state.requests.size>300)state.requests.delete(state.requests.keys().next().value);
   broadcast(roomId,state);ack({ok:true});
  });
 });
 return {rooms,snapshot};
}
module.exports={registerRandomBox};
