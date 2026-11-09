const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {randomUUID}=require('node:crypto');
const {createServer}=require('node:http');
const express=require('express');
const {Server}=require('socket.io');
const {io:client}=require('socket.io-client');
const {createRoomService}=require('../room-server.cjs');
const {registerRandomBox}=require('../random-box-server.cjs');

test('random box shares one result, locks concurrent draws, cycles without repeats and isolates rooms',{timeout:10000},async t=>{
 const app=express(),http=createServer(app),io=new Server(http),clients=[];
 const service=createRoomService(io,app,(p,n)=>({name:n})),boxes=registerRandomBox(io,{drawMs:120,pick:()=>0});
 await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{clients.forEach(s=>s.disconnect());await new Promise(resolve=>io.close(resolve));});
 const open=async()=>{const s=client(`http://127.0.0.1:${http.address().port}`,{autoConnect:false,reconnection:false});clients.push(s);const ready=once(s,'connect');s.connect();await ready;return s;};
 const room=service.createRoom(),other=service.createRoom(),a=await open(),b=await open(),outside=await open();
 const join=(s,r,n)=>new Promise((resolve,reject)=>s.timeout(1000).emit('join-room',r.roomId,n,n,{}, {},(e,v)=>e?reject(e):resolve(v)));
 await join(a,room,'A');await join(b,room,'B');await join(outside,other,'Outside');
 const cmd=(s,action,extra={},roomId=room.roomId)=>new Promise((resolve,reject)=>s.timeout(1000).emit('random-box-command',{roomId,action,requestId:randomUUID(),...extra},(e,v)=>e?reject(e):resolve(v)));
 const sync=async(s,r=room.roomId)=>{const event=once(s,'random-box-state');s.emit('random-box-sync',{roomId:r});return(await event)[0];};
 const finished=s=>new Promise(resolve=>{const update=state=>{if(!state.draw&&state.result){s.off('random-box-state',update);resolve(state);}};s.on('random-box-state',update);});
 const requestId=randomUUID();assert.ok((await cmd(a,'add',{items:['เล่นเกม','ดูหนัง','หาอะไรกิน'],requestId})).ok);
 await cmd(a,'add',{items:['เล่นเกม'],requestId});assert.equal((await sync(b)).options.length,3);
 assert.ok((await cmd(a,'add',{items:['ดูหนัง']})).error);
 assert.ok((await cmd(a,'add',{items:['x'.repeat(81)]})).error);
 assert.ok((await cmd(outside,'draw')).error);
 assert.equal((await sync(outside,other.roomId)).options.length,0);
 const first=finished(a),same=finished(b);assert.ok((await cmd(a,'draw')).ok);
 let state=await sync(b);assert.ok(state.draw);assert.equal(state.result,null);assert.equal(Object.hasOwn(state.draw,'winner'),false);
 assert.ok((await cmd(b,'draw')).error);assert.ok((await cmd(b,'clear')).error);
 const result=await first;assert.equal((await same).result.id,result.result.id);assert.equal(result.result.label,'เล่นเกม');
 // A duplicate request cannot start another round after the first one finished.
 const drawId=randomUUID();let next=finished(a);await cmd(a,'draw',{requestId:drawId});state=await next;assert.equal(state.result.label,'ดูหนัง');
 await cmd(a,'draw',{requestId:drawId});assert.equal((await sync(b)).draw,null);assert.equal(boxes.rooms.get(room.roomId).history.length,2);
 next=finished(a);await cmd(a,'draw');state=await next;assert.equal(state.result.label,'หาอะไรกิน');assert.equal(state.used.length,3);
 next=finished(a);await cmd(a,'draw');state=await next;assert.equal(state.round,2);assert.equal(state.used.length,1);
 // Late joiners get the same result and history rather than starting a local draw.
 const late=await open();await join(late,room,'Late');const lateState=await sync(late);assert.deepEqual(lateState.result,state.result);assert.equal(lateState.history.length,4);
 await cmd(a,'mode',{noRepeat:false});next=finished(a);await cmd(a,'draw');state=await next;assert.equal(state.result.label,'เล่นเกม');
 await cmd(a,'reset-round');assert.equal((await sync(b)).used.length,0);
 await cmd(a,'clear');state=await sync(b);assert.equal(state.options.length,0);assert.ok(state.history.length);assert.ok((await cmd(a,'draw')).error);
});
