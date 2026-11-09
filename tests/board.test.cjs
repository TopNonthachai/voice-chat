const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {createServer}=require('node:http');
const {randomUUID}=require('node:crypto');
const express=require('express');
const {Server}=require('socket.io');
const {io:client}=require('socket.io-client');
const {createRoomService}=require('../room-server.cjs');
const {registerBoard}=require('../board-server.cjs');

test('shared board syncs late users, protects concurrent notes and undoes only own strokes',{timeout:10000},async t=>{
 const app=express(),http=createServer(app),io=new Server(http),clients=[];
 const service=createRoomService(io,app,(p,n)=>({name:n})),board=registerBoard(io);
 await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{clients.forEach(s=>s.disconnect());await new Promise(resolve=>io.close(resolve));});
 const open=async()=>{const s=client(`http://127.0.0.1:${http.address().port}`,{autoConnect:false,reconnection:false});clients.push(s);const ready=once(s,'connect');s.connect();await ready;return s;};
 const room=service.createRoom(),other=service.createRoom();
 const join=(s,room,peer,memberToken)=>new Promise((resolve,reject)=>s.timeout(1000).emit('join-room',room.roomId,peer,peer,{}, {memberToken},(e,r)=>e?reject(e):resolve(r)));
 const cmd=(s,action,extra={},roomId=room.roomId)=>new Promise((resolve,reject)=>s.timeout(1000).emit('board-command',{roomId,action,requestId:randomUUID(),...extra},(e,r)=>e?reject(e):resolve(r)));
 const sync=async(s,roomId=room.roomId)=>{const state=once(s,'board-state');s.emit('board-sync',{roomId});return(await state)[0];};
 const a=await open(),b=await open(),outside=await open();const aJoin=await join(a,room,'A');await join(b,room,'B');await join(outside,other,'outside');
 const stroke={points:[[.1,.1],[.4,.7]],color:'#334b3c',width:6};
 const requestId=randomUUID();await cmd(a,'stroke',{...stroke,requestId});await cmd(a,'stroke',{...stroke,requestId});
 assert.equal(board.rooms.get(room.roomId).strokes.length,1);
 await cmd(b,'stroke',stroke);await cmd(a,'undo');let state=await sync(b);assert.equal(state.strokes.length,1);assert.equal(state.strokes[0].name,'B');
 assert.ok((await cmd(a,'undo')).error);assert.ok((await cmd(outside,'stroke',stroke)).error);
 assert.ok((await cmd(a,'stroke',{...stroke,points:[[NaN,2]]})).error);
 assert.ok((await cmd(a,'stroke',{...stroke,points:Array.from({length:301},()=>[0,0])})).error);
 await cmd(a,'add-note',{x:.2,y:.3,color:'yellow'});state=await sync(b);const note=state.notes[0];
 assert.ok((await cmd(b,'edit-note',{id:note.id,text:'ไปเที่ยวกัน',expectedRevision:0})).ok);
 assert.ok((await cmd(a,'edit-note',{id:note.id,text:'ข้อความเก่าทับ',expectedRevision:0})).error);
 state=await sync(a);assert.equal(state.notes[0].text,'ไปเที่ยวกัน');
 await cmd(a,'move-note',{id:note.id,x:.6,y:.5,expectedRevision:1});state=await sync(b);assert.equal(state.notes[0].x,.6);assert.equal(state.notes[0].revision,2);
 const late=await open();await join(late,room,'Late');const lateState=await sync(late);assert.deepEqual(lateState,state);
 assert.deepEqual((await sync(outside,other.roomId)).notes,[]);
 assert.ok((await cmd(a,'edit-note',{id:note.id,text:'x'.repeat(501),expectedRevision:2})).error);
 // Reconnect retains the stable identity used for stroke undo.
 await cmd(a,'stroke',stroke);a.disconnect();const ready=once(a,'connect');a.connect();await ready;await join(a,room,'A-new',aJoin.memberToken);
 await cmd(a,'undo');assert.equal((await sync(b)).strokes.length,1);
 // Text and position have separate revisions: moving a note cannot overwrite its text.
 await cmd(a,'edit-note',{id:note.id,text:'ข้อความใหม่',expectedTextRevision:1});
 assert.ok((await cmd(b,'move-note',{id:note.id,x:.4,y:.4,expectedPositionRevision:1})).ok);
 assert.equal((await sync(a)).notes[0].text,'ข้อความใหม่');
 await cmd(b,'delete-note',{id:note.id,expectedRevision:4});assert.equal((await sync(late)).notes.length,0);
});
