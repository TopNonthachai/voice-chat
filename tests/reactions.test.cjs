const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {createServer}=require('node:http');
const express=require('express');
const {Server}=require('socket.io');
const {io:client}=require('socket.io-client');
const {createRoomService}=require('../room-server.cjs');
const {registerChat}=require('../chat-server.cjs');
const {registerReactions}=require('../reaction-server.cjs');

test('room and message reactions isolate rooms, deduplicate users and survive reconnect',{timeout:10000},async t=>{
 const app=express(),http=createServer(app),io=new Server(http),clients=[];
 const service=createRoomService(io,app,(p,n)=>({name:n,avatar:'🐈'}));
 registerReactions(io);registerChat(io,app,service.getProfile);
 await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{clients.forEach(s=>s.disconnect());await new Promise(resolve=>io.close(resolve));});
 const open=async()=>{const s=client(`http://127.0.0.1:${http.address().port}`,{autoConnect:false,reconnection:false});clients.push(s);const ready=once(s,'connect');s.connect();await ready;return s;};
 const cmd=(s,event,data)=>new Promise((resolve,reject)=>s.timeout(1000).emit(event,data,(e,r)=>e?reject(e):resolve(r)));
 const join=(s,room,peer,memberToken)=>new Promise((resolve,reject)=>s.timeout(1000).emit('join-room',room.roomId,peer,peer,{}, {memberToken},(e,r)=>e?reject(e):resolve(r)));
 const room=service.createRoom(),other=service.createRoom(),a=await open(),b=await open(),outside=await open();
 const identity=await join(a,room,'A');await join(b,room,'B');await join(outside,other,'C');
 let leaked=0;outside.on('room-reaction',()=>leaked++);outside.on('chat-reactions',()=>leaked++);
 let event=once(b,'room-reaction');assert.ok((await cmd(a,'room-react',{roomId:room.roomId,emoji:'🔥'})).ok);
 const live=(await event)[0];assert.equal(live.name,'A');assert.equal(live.emoji,'🔥');assert.equal(live.memberId,identity.memberId);
 assert.ok((await cmd(outside,'room-react',{roomId:room.roomId,emoji:'🔥'})).error);
 assert.ok((await cmd(a,'room-react',{roomId:room.roomId,emoji:'invalid'})).error);
 const sent=await cmd(a,'chat-send',{roomId:room.roomId,clientId:'reaction-message-1',text:'ลองกดรีแอ็กชัน'});
 const data={roomId:room.roomId,messageId:sent.message.id,emoji:'❤️',enabled:true};
 event=once(b,'chat-reactions');let result=await cmd(a,'chat-react',data);assert.equal((await event)[0].reactions[0].users.length,1);
 result=await cmd(a,'chat-react',data);assert.equal(result.reactions[0].users.length,1);assert.equal(result.revision,1);
 result=await cmd(b,'chat-react',data);assert.equal(result.reactions[0].users.length,2);
 assert.ok((await cmd(outside,'chat-react',data)).error);
 assert.ok((await cmd(a,'chat-react',{...data,messageId:'missing'})).error);
 // Saved member identity, not the transient peer/socket ID, owns the reaction.
 a.disconnect();const ready=once(a,'connect');a.connect();await ready;await join(a,room,'A-new',identity.memberToken);
 const historyEvent=once(a,'chat-history');a.emit('chat-sync',{roomId:room.roomId});const history=(await historyEvent)[0];
 assert.equal(history[0].reactions[0].users.length,2);
 result=await cmd(a,'chat-react',{...data,enabled:false});assert.equal(result.reactions[0].users.length,1);assert.equal(result.reactions[0].users[0].name,'B');
 result=await cmd(b,'chat-react',{...data,enabled:false});assert.deepEqual(result.reactions,[]);
 assert.equal(leaked,0);
 // A room burst is capped server-side, even if a custom client bypasses UI throttling.
 let accepted=0;for(let i=0;i<10;i++)if((await cmd(a,'room-react',{roomId:room.roomId,emoji:'👏'})).ok)accepted++;
 assert.ok(accepted<=8);assert.ok(accepted>0);
});
