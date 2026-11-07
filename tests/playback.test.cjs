const {test}=require('node:test');
const assert=require('node:assert/strict');
test('audio start reaches unmute, volume and play synchronously inside the user gesture',async()=>{
 const {startGesturePlayback}=await import('../components/playback-controls.mjs');
 const calls=[];const api={unMute:()=>calls.push('unmute'),setVolume:value=>calls.push(value),playVideo:()=>calls.push('play')};
 const result=startGesturePlayback(api,0.7,true);
 assert.equal(result,true);assert.deepEqual(calls,['unmute',70,'play']);
 calls.length=0;assert.equal(startGesturePlayback(api,2,false),true);assert.deepEqual(calls,['unmute',100]);
 calls.length=0;assert.equal(startGesturePlayback(null,1,true),false);assert.deepEqual(calls,[]);
 assert.equal(startGesturePlayback({unMute(){throw new Error('blocked');}},1),false);
});
