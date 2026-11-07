const {randomBytes}=require('node:crypto');
const token=(bytes=24)=>randomBytes(bytes).toString('base64url');
function createRoomService(io,app,cleanProfile){
 const rooms=new Map(),invites=new Map();
 const createRoom=()=>{
  const id=token(6),invite=token(9),memberToken=token();
  const owner={id:token(9),profile:cleanProfile({},'Guest'),forcedMuted:false,revoked:false};
  const room={id,invite,locked:false,inviteOnly:true,ownerId:owner.id,members:new Map([[memberToken,owner]])};
  rooms.set(id,room);invites.set(invite,id);return {roomId:id,invite,memberToken};
 };
 const publicState=(room,socket)=>({roomId:room.id,invite:room.invite,locked:room.locked,inviteOnly:room.inviteOnly,isOwner:socket.data.memberId===room.ownerId,ownerId:room.ownerId});
 const broadcast=room=>{
  const profiles=Object.create(null),names=Object.create(null);
  for(const member of room.members.values())if(member.socketId&&!member.revoked){profiles[member.peerId]={...member.profile,forcedMuted:member.forcedMuted,isOwner:member.id===room.ownerId};names[member.peerId]=member.profile.name;}
  io.to(room.id).emit('room-members',profiles);
  for(const client of io.sockets.sockets.values())if(client.data.roomId===room.id)client.emit('room-settings',publicState(room,client));
  return names;
 };
 const leave=socket=>{
  const room=rooms.get(socket.data.roomId);if(!room)return;
  const member=room.members.get(socket.data.memberToken);
  if(member?.socketId===socket.id){member.socketId=null;socket.to(room.id).emit('user-disconnected',member.peerId);}
  socket.leave(room.id);if(socket.data.screenId)io.to(room.id).emit('screen-stopped');
  socket.data.roomId=null;socket.data.memberId=null;broadcast(room);
 };
 app.post('/api/rooms',(req,res)=>res.status(201).json(createRoom()));
 app.get('/api/invites/:invite',(req,res)=>{const room=rooms.get(invites.get(req.params.invite));if(!room)return res.status(404).json({error:'ลิงก์หมดอายุหรือห้องไม่มีอยู่แล้ว กรุณาขอลิงก์ใหม่'});res.set('Cache-Control','no-store').json({roomId:room.id,locked:room.locked});});
 io.on('connection',socket=>{
  socket.on('disconnect',()=>leave(socket));
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
   if(member.socketId&&member.socketId!==socket.id){const old=io.sockets.sockets.get(member.socketId);if(old){old.emit('room-denied',{error:'เปิดห้องนี้จากอีกแท็บแล้ว'});leave(old);old.disconnect(true);}}
   const previous=socket.data.roomId,previousPeer=socket.data.userId;
   if(previous&&(previous!==roomId||previousPeer!==peerId))leave(socket);
   member.peerId=peerId;member.socketId=socket.id;member.profile=cleanProfile(profile,name);
   Object.assign(socket.data,{roomId,userId:peerId,userName:member.profile.name,memberToken,memberId:member.id});socket.join(roomId);
   if(previous!==roomId||previousPeer!==peerId)socket.to(roomId).emit('user-connected',{userId:peerId,userName:member.profile.name});
   const names=broadcast(room);socket.emit('existing-users',names);
   const result={ok:true,memberToken,settings:publicState(room,socket),forcedMuted:member.forcedMuted};socket.emit('room-joined',result);ack(result);
  });
  socket.on('profile-update',profile=>{const room=rooms.get(socket.data.roomId),member=room?.members.get(socket.data.memberToken);if(!member||member.revoked||member.socketId!==socket.id)return;member.profile=cleanProfile(profile,profile?.name);socket.data.userName=member.profile.name;broadcast(room);});
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
   }else if(action==='mute'||action==='kick'){
    const member=[...room.members.values()].find(m=>m.peerId===data.userId&&m.socketId&&!m.revoked);
    if(!member||member.id===room.ownerId)return ack({error:'ไม่พบสมาชิกที่จัดการได้'});
    const target=io.sockets.sockets.get(member.socketId);
    if(action==='mute'){
     if(typeof data.enabled!=='boolean')return ack({error:'ค่าไม่ถูกต้อง'});
     member.forcedMuted=data.enabled;target?.emit('room-moderation',{forcedMuted:member.forcedMuted});
    }else{member.revoked=true;target?.emit('room-kicked',{error:'เจ้าของนำคุณออกจากห้อง'});if(target){leave(target);target.disconnect(true);}}
   }else return ack({error:'คำสั่งไม่ถูกต้อง'});
   broadcast(room);ack({ok:true});
  });
 });
 return {createRoom,rooms,getProfile:(roomId,peerId)=>{const room=rooms.get(roomId);return [...(room?.members.values()||[])].find(m=>m.peerId===peerId&&m.socketId&&!m.revoked)?.profile;}};
}
module.exports={createRoomService};
