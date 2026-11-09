const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter,once}=require('node:events');
const {createServer}=require('node:http');
const express=require('express');
const {Server}=require('socket.io');
const {io:client}=require('socket.io-client');
const {createRoomService}=require('../room-server.cjs');
const {registerScreens}=require('../screen-server.cjs');

test('late viewers get active screens; stop, departure and room isolation stay authoritative',{timeout:10000},async t=>{
 const app=express(),http=createServer(app),io=new Server(http),clients=[];
 const rooms=createRoomService(io,app,(p,n)=>({name:n}));registerScreens(io);
 await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{clients.forEach(s=>s.disconnect());await new Promise(resolve=>io.close(resolve));});
 const open=async()=>{const s=client(`http://127.0.0.1:${http.address().port}`,{autoConnect:false});clients.push(s);const ready=once(s,'connect');s.connect();await ready;return s;};
 const join=(s,room,id)=>new Promise((resolve,reject)=>s.timeout(1000).emit('join-room',room.roomId,id,id,{}, {},(e,r)=>e?reject(e):resolve(r)));
 const sync=async s=>{const state=once(s,'screen-state');s.emit('screen-sync');return(await state)[0];};
 const room=rooms.createRoom(),otherRoom=rooms.createRoom(),sharer=await open();await join(sharer,room,'host');
 let state=once(sharer,'screen-state');sharer.emit('screen-start',{roomId:room.roomId,userId:'host-screen'});await state;
 const late=await open();await join(late,room,'late');
 assert.deepEqual(await sync(late),[{id:'host-screen',name:'host'}]);
 const outsider=await open();await join(outsider,otherRoom,'outsider');assert.deepEqual(await sync(outsider),[]);
 // Another member cannot impersonate the sharer's screen or stop their broadcast.
 late.emit('screen-start',{roomId:room.roomId,userId:'host-screen'});late.emit('screen-stop',otherRoom.roomId);
 assert.deepEqual(await sync(late),[{id:'host-screen',name:'host'}]);
 state=once(late,'screen-state');sharer.emit('screen-stop',room.roomId);assert.deepEqual((await state)[0],[]);
 state=once(late,'screen-state');sharer.emit('screen-start',{roomId:room.roomId,userId:'host-screen'});await state;
 state=once(late,'screen-state');sharer.disconnect();assert.deepEqual((await state)[0],[]);
});

test('screen receiver caches early snapshots, offers video and retries without resurrecting stopped screens',async()=>{
 const {createScreenReceiver}=await import('../components/screen-receiver.mjs');
 const timers=new Map(),calls=[],statuses=[],streams=[];let sequence=0;
 const silent={silent:true},peer={open:false,call:(id,stream,options)=>{
  const call=new EventEmitter();call.close=()=>call.emit('close');calls.push({id,stream,options,call});return call;
 }};
 const receiver=createScreenReceiver({getPeer:()=>peer,getStream:()=>silent,onStream:s=>streams.push(s),onStatus:s=>statuses.push(s),schedule:fn=>{timers.set(++sequence,fn);return sequence;},cancel:id=>timers.delete(id)});
 receiver.update([{id:'screen',name:'A'}]);assert.equal(calls.length,0);assert.equal(statuses.at(-1),'connecting');
 peer.open=true;receiver.ready();assert.equal(calls.length,1);assert.equal(calls[0].stream,silent);
 assert.equal(calls[0].options.constraints.offerToReceiveVideo,true);assert.equal(calls[0].options.constraints.offerToReceiveAudio,false);
 // Repeated snapshots must not create duplicate calls.
 receiver.update([{id:'screen',name:'A'}]);assert.equal(calls.length,1);
 const video={getVideoTracks:()=>[{readyState:'live'}]};calls[0].call.emit('stream',video);
 assert.equal(streams.at(-1),video);assert.equal(statuses.at(-1),'connected');assert.equal(timers.size,0);
 calls[0].call.emit('error',new Error('network'));assert.equal(statuses.at(-1),'connecting');
 const retry=[...timers.values()][0];timers.clear();retry();assert.equal(calls.length,2);
 receiver.update([]);assert.equal(timers.size,0);assert.equal(statuses.at(-1),'idle');
 calls[1].call.emit('stream',video);assert.equal(streams.at(-1),null);
 receiver.dispose();receiver.ready();assert.equal(calls.length,2);
});
