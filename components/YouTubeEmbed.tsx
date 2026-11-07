import React,{forwardRef,useEffect,useImperativeHandle,useRef} from 'react';
import {loadYouTube,YouTubeApi,YouTubeHandle} from './youtube-api';
import {startGesturePlayback} from './playback-controls.mjs';
interface Props {
 videoId:string;generation:number;playing:boolean;enabled:boolean;volume:number;nativeControls:boolean;
 onReady:()=>void;onPaused:(canBroadcast:boolean)=>void;onDuration:(seconds:number)=>void;onAudible:()=>void;onBlocked:()=>void;onEnded:(duration:number)=>void;onError:()=>void;
}
const YouTubeEmbed=forwardRef<YouTubeHandle,Props>((props,ref)=>{
 const container=useRef<HTMLDivElement>(null),api=useRef<YouTubeApi|null>(null),latest=useRef(props),loaded=useRef(''),ready=useRef(false);
 latest.current=props;
 const programmatic=useRef(0),playIntent=useRef(false);
 const play=(shouldPlay=true)=>{if(!ready.current||!api.current)return false;playIntent.current=shouldPlay;return startGesturePlayback(api.current,latest.current.volume,shouldPlay);};
 useImperativeHandle(ref,()=>({
  startFromGesture:play,pause:()=>{playIntent.current=false;programmatic.current=Date.now()+700;api.current?.pauseVideo();},
  get paused(){return api.current?.getPlayerState()!==1;},get ended(){return api.current?.getPlayerState()===0;},
  get duration(){return api.current?.getDuration()||0;},get muted(){return api.current?.isMuted()??false;},
  get currentTime(){return api.current?.getCurrentTime()||0;},set currentTime(value){if(!api.current)return;api.current.seekTo(value,true);if((!latest.current.playing||!latest.current.enabled)&&!playIntent.current){programmatic.current=Date.now()+700;api.current.pauseVideo();}}
 }),[]);
 useEffect(()=>{
  let cancelled=false;
  loadYouTube().then(SDK=>{
   if(cancelled||!container.current)return;
   const element=document.createElement('div');container.current.appendChild(element);
   api.current=new SDK.Player(element,{
    width:'100%',height:'100%',videoId:latest.current.videoId,
    playerVars:{playsinline:1,controls:1,autoplay:0,rel:0,origin:window.location.origin},
    events:{
     onReady:()=>{if(cancelled)return;ready.current=true;loaded.current=`${latest.current.videoId}:${latest.current.generation}`;api.current?.setVolume(latest.current.volume*100);latest.current.onReady();if(latest.current.enabled&&latest.current.playing)play();else api.current?.cueVideoById({videoId:latest.current.videoId});},
     onStateChange:(event:{data:number})=>{
      if(cancelled||!api.current)return;
      latest.current.onDuration(api.current.getDuration()||0);
      if(event.data===1&&(!latest.current.playing||!latest.current.enabled)&&!latest.current.nativeControls&&!playIntent.current){api.current.pauseVideo();return;}
      if(event.data===1){if(latest.current.nativeControls&&!latest.current.playing)playIntent.current=true;if(!api.current.isMuted())latest.current.onAudible();else latest.current.onBlocked();}
      if(event.data===2)latest.current.onPaused(Date.now()>programmatic.current);
      if(event.data===0&&latest.current.enabled)latest.current.onEnded(api.current.getDuration());
     },
     onAutoplayBlocked:()=>latest.current.onBlocked(),onError:()=>latest.current.onError()
    }
   });
  }).catch(()=>{if(!cancelled)latest.current.onError();});
  return()=>{cancelled=true;ready.current=false;api.current?.destroy();api.current=null;container.current?.replaceChildren();};
 },[]);
 useEffect(()=>{
  if(!ready.current||!api.current)return;
  const id=`${props.videoId}:${props.generation}`;
  if(loaded.current!==id){programmatic.current=Date.now()+1000;loaded.current=id;if(props.enabled&&props.playing)api.current.loadVideoById({videoId:props.videoId});else api.current.cueVideoById({videoId:props.videoId});}
  else if(props.enabled&&props.playing){playIntent.current=false;if(api.current.getPlayerState()!==1&&api.current.getPlayerState()!==3)api.current.playVideo();}
  else if(!(props.enabled&&playIntent.current)){playIntent.current=false;programmatic.current=Date.now()+700;api.current.pauseVideo();}
 },[props.videoId,props.generation,props.playing,props.enabled]);
 useEffect(()=>{if(ready.current)api.current?.setVolume(props.volume*100);},[props.volume]);
 return <div ref={container} className="youtube-embed"/>;
});
export default YouTubeEmbed;
