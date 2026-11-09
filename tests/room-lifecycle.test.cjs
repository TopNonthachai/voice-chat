const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const express=require('express');
const {createServer}=require('node:http');
const {Server}=require('socket.io');
const {io:client}=require('socket.io-client');
const {createRoomService}=require('../room-server.cjs');

test('open admission, ownership transfer, reconnect grace and intentional departure',{timeout:10000},async t=>{
 const app=express(),http=createServer(app),io=new Server(http),clients=[];
 const service=createRoomService(io,app,(p,n)=>({name:n,avatar:'🐈'}),{graceMs:180});
 await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{clients.forEach(s=>s.disconnect());await new Promise(resolve=>io.close(resolve));});
 const open=async()=>{const s=client(`http://127.0.0.1:${http.address().port}`,{autoConnect:false,reconnection:false});clients.push(s);const ready=once(s,'connect');s.connect();await ready;return s;};
 const room=service.createRoom(),a=await open(),b=await open(),c=await open();
 const join=(s,peer,memberToken)=>new Promise((resolve,reject)=>s.timeout(1000).emit('join-room',room.roomId,peer,peer,{}, {memberToken},(e,r)=>e?reject(e):resolve(r)));
 const manage=(s,action,extra={})=>new Promise((resolve,reject)=>s.timeout(1000).emit('room-manage',{action,...extra},(e,r)=>e?reject(e):resolve(r)));
 const owner=await join(a,'a',room.memberToken),guest=await join(b,'b'),third=await join(c,'c');
 assert.equal(guest.ok,true);assert.equal(owner.settings.inviteOnly,false);
 assert.ok((await manage(b,'transfer',{userId:'c'})).error);
 await manage(a,'transfer',{userId:'b'});
 assert.equal(service.rooms.get(room.roomId).ownerId,guest.memberId);
 assert.ok((await manage(a,'lock',{enabled:true})).error);
 let rosterEvent=once(a,'room-members');b.disconnect();
 let roster=(await rosterEvent)[0];assert.equal(roster.b.online,false);assert.equal(roster.b.isOwner,true);assert.ok(roster.b.offlineUntil>Date.now());
 const ready=once(b,'connect');b.connect();await ready;const returning=await join(b,'b-new',guest.memberToken);
 assert.equal(returning.settings.isOwner,true);assert.equal(returning.memberId,guest.memberId);
 // A stale disconnect timer must not transfer a reconnected owner's rights.
 await new Promise(resolve=>setTimeout(resolve,230));assert.equal(service.rooms.get(room.roomId).ownerId,guest.memberId);
 await new Promise(resolve=>b.emit('leave-room',resolve));
 assert.equal(service.rooms.get(room.roomId).ownerId,owner.memberId);
 assert.ok((await manage(a,'lock',{enabled:true})).ok);
 // Unexpected disconnection holds the owner's badge until the grace period expires.
 rosterEvent=once(c,'room-members');a.disconnect();roster=(await rosterEvent)[0];assert.equal(roster.a.isOwner,true);
 const transferred=new Promise(resolve=>c.on('room-settings',value=>{if(value.isOwner)resolve(value);}));
 await transferred;assert.equal(service.rooms.get(room.roomId).ownerId,third.memberId);
 // Returning after expiry does not steal ownership back.
 const readyAgain=once(a,'connect');a.connect();await readyAgain;
 const late=await join(a,'a-return',owner.memberToken);assert.equal(late.settings.isOwner,false);
});
