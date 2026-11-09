const {randomBytes}=require('node:crypto');
const token=(bytes=24)=>randomBytes(bytes).toString('base64url');
function createRoomService(io,app,cleanProfile,{graceMs=180000}={}){
 const timers=new Map();
 io.httpServer?.once('close',()=>{for(const timer of timers.values())clearTimeout(timer);});
 const rooms=new Map(),invites=new Map();
 const createRoom=()=>{
  const id=token(6),invite=token(9),memberToken=token();
  const owner={id:token(9),profile:cleanProfile({},'Guest'),forcedMuted:false,revoked:false};
  const room={id,invite,locked:false,inviteOnly:false,ownerId:owner.id,members:new Map([[memberToken,owner]])};
  rooms.set(id,room);invites.set(invite,id);return {roomId:id,invite,memberToken};
 };
 const publicState=(room,socket)=>({roomId:room.id,invite:room.invite,locked:room.locked,inviteOnly:room.inviteOnly,isOwner:socket.data.memberId===room.ownerId,ownerId:room.ownerId});
 const broadcast=room=>{
  const profiles=Object.create(null),names=Object.create(null);
  for(const member of room.members.values())if((member.socketId||member.offlineUntil)&&!member.revoked){profiles[member.peerId]={...member.profile,memberId:member.id,online:!!member.socketId,voiceReady:member.peerId!==member.socketId,offlineUntil:member.offlineUntil||null,forcedMuted:member.forcedMuted,isOwner:member.id===room.ownerId};if(member.socketId&&member.peerId!==member.socketId)names[member.peerId]=member.profile.name;}
  io.to(room.id).emit('room-members',profiles);
  for(const client of io.sockets.sockets.values())if(client.data.roomId===room.id)client.emit('room-settings',publicState(room,client));
  return names;
 };
 const transferIfNeeded=room=>{
  const owner=[...room.members.values()].find(m=>m.id===room.ownerId);
  if(owner&&!owner.revoked&&(owner.socketId||owner.offlineUntil))return;
  const next=[...room.members.values()].find(m=>m.socketId&&!m.revoked);
  room.ownerId=next?.id||null;
 };
 const expire=(room,member)=>{
  clearTimeout(timers.get(member.id));timers.delete(member.id);
  member.offlineUntil=null;member.departed=true;
  io.to(room.id).emit('room-notice',{type:'leave',name:member.profile.name});
  transferIfNeeded(room);broadcast(room);
 };
 const leave=(socket,intentional=false)=>{
  const room=rooms.get(socket.data.roomId);if(!room)return;
  const member=room.members.get(socket.data.memberToken);
  if(member?.socketId===socket.id){
   member.socketId=null;socket.to(room.id).emit('user-disconnected',member.peerId);
   if(intentional||member.revoked)expire(room,member);
   else {
    member.offlineUntil=Date.now()+graceMs;
    clearTimeout(timers.get(member.id));const timer=setTimeout(()=>expire(room,member),graceMs);timer.unref();timers.set(member.id,timer);
   }
  }
  socket.leave(room.id);
  if(socket.data.screenId)io.to(room.id).emit('screen-stopped',{userId:socket.data.screenId});
  socket.data.screenId=null;socket.data.roomId=null;socket.data.memberId=null;broadcast(room);
 };
 app.post('/api/rooms',(req,res)=>res.status(201).json(createRoom()));
 app.get('/api/invites/:invite',(req,res)=>{const room=rooms.get(invites.get(req.params.invite));if(!room)return res.status(404).json({error:'ลิงก์หมดอายุหรือห้องไม่มีอยู่แล้ว กรุณาขอลิงก์ใหม่'});res.set('Cache-Control','no-store').json({roomId:room.id,locked:room.locked});});
 io.on('connection',socket=>{
  socket.on('disconnect',()=>leave(socket));
  socket.on('leave-room',(ack=()=>{})=>{leave(socket,true);if(typeof ack==='function')ack({ok:true});});
  socket.on('join-room',(roomId,peerId,name,profile,access={},ack=()=>{})=>{
   if(typeof ack!=='function')ack=()=>{};
   const fail=error=>{socket.emit('room-denied',{error});ack({error});};
   const room=rooms.get(roomId);
   if(!room)return fail('ไม่พบห้องนี้ ห้องอาจเริ่มใหม่หลังเซิร์ฟเวอร์รีสตาร์ต');
   if(typeof peerId!=='string'||!peerId.length||peerId.length>128)return fail('รหัสผู้ใช้ไม่ถูกต้อง');
   if(!access||typeof access!=='object')return fail('ลิงก์เชิญไม่ถูกต้อง');
   let member=room.members.get(access.memberToken),memberToken=access.memberToken;
   if(member?.revoked)return fail('คุณถูกนำออกจากห้องนี้แล้ว');
   if(!member){
    if(room.locked)return fail('เจ้าของล็อกห้องไว้ ยังไม่รับสมาชิกเพิ่ม');
    if(room.inviteOnly&&access.invite!==room.invite)return fail('ห้องนี้เข้าผ่านลิงก์เชิญเท่านั้น');
    memberToken=token();member={id:token(9),profile:cleanProfile(profile,name),forcedMuted:false,revoked:false};room.members.set(memberToken,member);
   }
   if([...room.members.values()].some(m=>m!==member&&m.socketId&&m.peerId===peerId))return fail('รหัสการเชื่อมต่อซ้ำ กรุณาโหลดหน้าใหม่');
   const wasPresent=!!(member.socketId||member.offlineUntil);
   if(member.socketId&&member.socketId!==socket.id){const old=io.sockets.sockets.get(member.socketId);if(old){old.emit('room-denied',{error:'เปิดห้องนี้จากอีกแท็บแล้ว'});leave(old);old.disconnect(true);}}
   const previous=socket.data.roomId,previousPeer=socket.data.userId;
   if(previous&&previous!==roomId)leave(socket,true);
   else if(previousPeer&&previousPeer!==peerId)socket.to(roomId).emit('user-disconnected',previousPeer);
   clearTimeout(timers.get(member.id));timers.delete(member.id);member.offlineUntil=null;member.departed=false;
   member.peerId=peerId;member.socketId=socket.id;member.profile=cleanProfile(profile,name);
   transferIfNeeded(room);
   Object.assign(socket.data,{roomId,userId:peerId,userName:member.profile.name,profile:member.profile,memberToken,memberId:member.id});socket.join(roomId);
   if((previous!==roomId||previousPeer!==peerId)&&peerId!==socket.id)socket.to(roomId).emit('user-connected',{userId:peerId,userName:member.profile.name});
   if(!wasPresent)socket.to(roomId).emit('room-notice',{type:'join',name:member.profile.name});
   const names=broadcast(room);socket.emit('existing-users',names);
   const result={ok:true,memberToken,memberId:member.id,settings:publicState(room,socket),forcedMuted:member.forcedMuted};socket.emit('room-joined',result);ack(result);
  });
  socket.on('profile-update',profile=>{const room=rooms.get(socket.data.roomId),member=room?.members.get(socket.data.memberToken);if(!member||member.revoked||member.socketId!==socket.id)return;member.profile=cleanProfile(profile,profile?.name);socket.data.userName=member.profile.name;socket.data.profile=member.profile;broadcast(room);});
  socket.on('room-manage',(data={},ack=()=>{})=>{
   if(typeof ack!=='function')ack=()=>{};
   const room=rooms.get(socket.data.roomId);
   if(!room||socket.data.memberId!==room.ownerId)return ack({error:'เฉพาะเจ้าของห้องเท่านั้น'});
   const {action}=data||{};
   if(action==='lock'||action==='invite-only'){
    if(typeof data.enabled!=='boolean')return ack({error:'ค่าไม่ถูกต้อง'});
    room[action==='lock'?'locked':'inviteOnly']=data.enabled;
   }else if(action==='rotate-invite'){
    invites.delete(room.invite);room.invite=token(9);invites.set(room.invite,room.id);
   }else if(action==='mute'||action==='kick'||action==='transfer'){
    const member=[...room.members.values()].find(m=>m.peerId===data.userId&&(m.socketId||m.offlineUntil)&&!m.revoked);
    if(!member||member.id===room.ownerId)return ack({error:'ไม่พบสมาชิกที่จัดการได้'});
    const target=io.sockets.sockets.get(member.socketId);
    if(action==='transfer'){
     if(!member.socketId)return ack({error:'โอนสิทธิ์ให้คนที่ออนไลน์เท่านั้น'});
     room.ownerId=member.id;
    }else if(action==='mute'){
     if(typeof data.enabled!=='boolean')return ack({error:'ค่าไม่ถูกต้อง'});
     member.forcedMuted=data.enabled;target?.emit('room-moderation',{forcedMuted:member.forcedMuted});
    }else{member.revoked=true;target?.emit('room-kicked',{error:'เจ้าของนำคุณออกจากห้อง'});if(target){leave(target,true);target.disconnect(true);}else expire(room,member);}
   }else return ack({error:'คำสั่งไม่ถูกต้อง'});
   broadcast(room);ack({ok:true});
  });
 });
 return {createRoom,rooms,getProfile:(roomId,peerId)=>{const room=rooms.get(roomId);return [...(room?.members.values()||[])].find(m=>m.peerId===peerId&&m.socketId&&!m.revoked)?.profile;}};
}
module.exports={createRoomService};
