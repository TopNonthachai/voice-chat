const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { Server } = require('socket.io');
const { io: client } = require('socket.io-client');
const { registerMusic } = require('../music-server.cjs');

test('shuffle plays every song once per round; repeat starts fresh and skips duplicate ended reports', {timeout:15000}, async t => {
    const http = createServer(); const io = new Server(http); registerMusic(io,{resolveTitle:async()=>null});
    io.on('connection', s => s.on('join', () => {s.join('test');s.emit('joined');}));
    await new Promise(resolve => http.listen(0,'127.0.0.1',resolve));
    const socket = client(`http://127.0.0.1:${http.address().port}`,{autoConnect:false});
    t.after(async()=>{socket.disconnect();await new Promise(resolve=>io.close(resolve));});
    let waiting=once(socket,'connect');socket.connect();await waiting;
    waiting=once(socket,'joined');socket.emit('join');await waiting;
    const cmd = (action,extra={})=>new Promise((resolve,reject)=>socket.timeout(2000).emit('music-command',{roomId:'test',action,...extra},(e,r)=>e?reject(e):resolve(r)));
    const sync = async()=>{const waiting=once(socket,'music-state');socket.emit('music-sync',{roomId:'test'});return (await waiting)[0];};
    for (const url of ['LXb3EKWsInQ','M7lc1UVf-VE','dQw4w9WgXcQ','jNQXAC9IVRw']) await cmd('add',{url});
    assert.ok((await cmd('add',{url:'LXb3EKWsInQ'})).error);
    await cmd('shuffle',{enabled:true});await cmd('repeat',{enabled:true});
    let state=await sync();let seen=new Set([state.currentId]);
    for(let i=0;i<3;i++){await cmd('next');state=await sync();assert.ok(!seen.has(state.currentId));seen.add(state.currentId);}
    assert.equal(seen.size,4);
    const last=state.currentId;await cmd('next');state=await sync();assert.notEqual(state.currentId,last);
    seen=new Set([state.currentId]);for(let i=0;i<3;i++){await cmd('next');state=await sync();assert.ok(!seen.has(state.currentId));seen.add(state.currentId);}
    assert.equal(seen.size,4);
    await cmd('repeat',{enabled:false});await cmd('next');state=await sync();assert.equal(state.playing,false);assert.equal(state.finished,true);
    await cmd('play',{currentId:state.currentId});state=await sync();assert.equal(state.playing,true);assert.equal(state.position<1,true);
    await cmd('shuffle',{enabled:false});state=await sync();assert.equal(state.shuffle,false);
    const final=state.queue.at(-1).id;await cmd('select',{id:final});await cmd('repeat',{enabled:true});
    state=await sync();await cmd('seek',{currentId:final,position:99});
    const generation=state.generation;await cmd('repeat',{enabled:true});
    await cmd('ended',{currentId:final,generation,duration:100});state=await sync();assert.equal(state.currentId,state.queue[0].id);
    const newGeneration=state.generation;await cmd('ended',{currentId:final,generation,duration:100});assert.equal((await sync()).generation,newGeneration);
    await cmd('select',{id:state.currentId});await cmd('shuffle',{enabled:true});
    state=await sync();const remove=state.remaining[0];await cmd('remove',{id:remove});state=await sync();assert.ok(!state.remaining.includes(remove));
});
