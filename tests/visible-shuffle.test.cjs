const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const {createServer}=require('node:http');
const {Server}=require('socket.io');
const {io:client}=require('socket.io-client');
const {registerMusic}=require('../music-server.cjs');
test('visible shuffle keeps the played prefix and follows the displayed queue across repeat',{timeout:10000},async t=>{
 const http=createServer(),io=new Server(http),music=registerMusic(io,{resolveTitle:async()=>({title:'สวัสดี',author:'Test'})});
 io.on('connection',s=>{s.join('room');s.data.userName='A';s.data.profile={avatar:'🐈'};});
 await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
 const s=client(`http://127.0.0.1:${http.address().port}`,{autoConnect:false});
 t.after(async()=>{s.disconnect();await new Promise(resolve=>io.close(resolve));});
 const connected=once(s,'connect');s.connect();await connected;
 const cmd=(action,extra={})=>new Promise((resolve,reject)=>s.timeout(1000).emit('music-command',{roomId:'room',action,...extra},(e,r)=>e?reject(e):resolve(r)));
 const get=()=>music.rooms.get('room');
 const tracks=Array.from({length:10},(_,i)=>({videoId:`track${String(i).padStart(6,'0')}`,title:`เพลง ${i+1}`}));
 await cmd('import',{playlist:{format:'mellow-playlist',version:1,tracks},mode:'replace'});
 const original=get().queue.map(t=>t.id);await cmd('select',{id:original[0]});await cmd('next');await cmd('next');await cmd('shuffle',{enabled:true});
 assert.deepEqual(get().queue.slice(0,3).map(t=>t.id),original.slice(0,3));
 assert.deepEqual(new Set(get().queue.slice(3).map(t=>t.id)),new Set(original.slice(3)));
 const visible=get().queue.map(t=>t.id);
 for(let i=3;i<10;i++){await cmd('next');assert.equal(get().currentId,visible[i]);}
 await cmd('repeat',{enabled:true});const last=get().currentId;await cmd('next');
 const newRound=get().queue.map(t=>t.id);assert.equal(get().currentId,newRound[0]);assert.notEqual(get().currentId,last);assert.deepEqual(new Set(newRound),new Set(original));
 for(let i=1;i<10;i++){await cmd('next');assert.equal(get().currentId,newRound[i]);}
 // Automatic completion advances without generating a user action in history.
 await cmd('seek',{currentId:get().currentId,position:99});const before=get().activity.length;
 await cmd('ended',{currentId:get().currentId,generation:get().generation,duration:100});assert.equal(get().activity.length,before);
 assert.ok(get().activity.every(e=>e.action!=='ended'));assert.equal(get().activity[0].avatar,'🐈');
 // A jump is not evidence that intervening tracks were heard.
 await cmd('shuffle',{enabled:false});
 await cmd('repeat',{enabled:false});
 await cmd('import',{playlist:{format:'mellow-playlist',version:1,tracks:tracks.slice(0,9)},mode:'replace'});
 const jumped=get().queue.map(t=>t.id);
 await cmd('play',{currentId:jumped[0]});await cmd('next');await cmd('select',{id:jumped[6]});
 assert.deepEqual(get().played,[jumped[0],jumped[1],jumped[6]]);
 await cmd('shuffle',{enabled:true});
 assert.deepEqual(get().queue.slice(0,3).map(t=>t.id),[jumped[0],jumped[1],jumped[6]]);
 const expected=new Set([jumped[2],jumped[3],jumped[4],jumped[5],jumped[7],jumped[8]]);
 assert.deepEqual(new Set(get().remaining),expected);
 const heard=new Set(get().played);
 for(let i=0;i<expected.size;i++){await cmd('next');assert.ok(expected.has(get().currentId));assert.ok(!heard.has(get().currentId));heard.add(get().currentId);}
 assert.equal(heard.size,9);await cmd('next');assert.equal(get().finished,true);
 // Jump again while shuffle is already enabled: pending tracks must stay available.
 await cmd('import',{playlist:{format:'mellow-playlist',version:1,tracks:tracks.slice(0,9)},mode:'replace'});
 const roundIds=get().queue.map(t=>t.id),firstId=get().currentId;
 await cmd('play',{currentId:firstId});await cmd('select',{id:roundIds[6]});
 assert.equal(get().remaining.length,7);
 assert.ok(get().remaining.includes(roundIds[2]));
 await cmd('shuffle',{enabled:false});await cmd('shuffle',{enabled:true});
 assert.equal(get().remaining.length,7);
});
