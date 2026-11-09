const {randomUUID}=require('node:crypto');
const COLORS=['#334b3c','#b65343','#41678d','#8b619e'];
const PAPERS=['yellow','green','pink','blue'];
function registerBoard(io) {
 const rooms=new Map();
 const get=id=>{if(!rooms.has(id))rooms.set(id,{revision:0,strokes:[],notes:[],requests:new Map()});return rooms.get(id);};
 const snapshot=state=>({revision:state.revision,strokes:state.strokes,notes:state.notes});
 const unit=n=>Number.isFinite(n)&&n>=0&&n<=1;
 io.on('connection',socket=>{
  const member=roomId=>socket.data.roomId===roomId&&socket.rooms.has(roomId);
  socket.on('board-sync',({roomId}={})=>{if(member(roomId))socket.emit('board-state',snapshot(get(roomId)));});
  socket.on('board-command',(data={},ack=()=>{})=>{
   if(typeof ack!=='function')ack=()=>{};
   const {roomId,action,requestId}=data||{};
   const fail=error=>ack({error});
   if(!member(roomId))return fail('กรุณาเข้าห้องก่อนใช้กระดาน');
   if(typeof requestId!=='string'||!/^[-\w]{8,80}$/.test(requestId))return fail('รหัสคำสั่งไม่ถูกต้อง');
   const state=get(roomId),identity=socket.data.memberId||socket.data.userId,key=`${identity}:${requestId}`;
   if(state.requests.has(key))return ack({ok:true});
   const now=Date.now();if(!socket.data.boardRate||socket.data.boardRate.until<=now)socket.data.boardRate={until:now+10000,count:0};
   if(++socket.data.boardRate.count>60)return fail('แก้กระดานถี่ไปนิด รอสักครู่แล้วลองใหม่');
   if(action==='stroke'){
    const {points,color,width}=data;
    if(!Array.isArray(points)||!points.length||points.length>300||!COLORS.includes(color)||![3,6,10].includes(width)||points.some(point=>!Array.isArray(point)||point.length!==2||!unit(point[0])||!unit(point[1])))return fail('เส้นวาดไม่ถูกต้อง');
    if(state.strokes.length>=200)return fail('กระดานเต็ม 200 เส้นแล้ว ลองย้อนเส้นของคุณบางส่วน');
    state.strokes.push({id:randomUUID(),memberId:identity,name:socket.data.userName||'เพื่อน',points,color,width});
   }else if(action==='undo'){
    const index=state.strokes.findLastIndex(stroke=>stroke.memberId===identity);
    if(index<0)return fail('ยังไม่มีเส้นของคุณให้ย้อน');state.strokes.splice(index,1);
   }else if(action==='add-note'){
    if(state.notes.length>=40)return fail('กระดานมีโน้ตครบ 40 แผ่นแล้ว');
    if(!unit(data.x)||!unit(data.y)||!PAPERS.includes(data.color))return fail('โน้ตไม่ถูกต้อง');
    state.notes.push({id:randomUUID(),text:'',color:data.color,x:data.x,y:data.y,revision:0,textRevision:0,positionRevision:0,name:socket.data.userName||'เพื่อน'});
   }else if(['edit-note','move-note','delete-note'].includes(action)){
    const note=state.notes.find(note=>note.id===data.id);if(!note)return fail('โน้ตนี้ถูกลบไปแล้ว');
    const field=action==='edit-note'?'textRevision':action==='move-note'?'positionRevision':'revision';
    const key=action==='edit-note'?'expectedTextRevision':action==='move-note'?'expectedPositionRevision':'expectedRevision';
    const fieldCheck=Object.hasOwn(data,key),expected=fieldCheck?data[key]:data.expectedRevision,current=fieldCheck?note[field]:note.revision;
    if(!Number.isInteger(expected)||expected!==current)return fail('มีคนแก้โน้ตนี้แล้ว กรุณาดูข้อมูลล่าสุดก่อนบันทึกอีกครั้ง');
    if(action==='edit-note'){
     if(typeof data.text!=='string'||data.text.length>500)return fail('โน้ตใส่ข้อความได้ไม่เกิน 500 ตัวอักษร');
     note.text=data.text;note.textRevision++;
    }else if(action==='move-note'){
     if(!unit(data.x)||!unit(data.y))return fail('ตำแหน่งโน้ตไม่ถูกต้อง');note.x=data.x;note.y=data.y;note.positionRevision++;
    }else state.notes=state.notes.filter(item=>item.id!==note.id);
    note.revision++;
   }else return fail('คำสั่งกระดานไม่ถูกต้อง');
   state.revision++;state.requests.set(key,true);if(state.requests.size>500)state.requests.delete(state.requests.keys().next().value);
   io.to(roomId).emit('board-state',snapshot(state));ack({ok:true});
  });
 });
 return {rooms,snapshot};
}
module.exports={registerBoard};
