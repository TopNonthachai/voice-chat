export interface YouTubeApi {
 playVideo():void; pauseVideo():void; unMute():void; mute():void; isMuted():boolean;
 setVolume(value:number):void; getVolume():number; getCurrentTime():number; getDuration():number;
 getPlayerState():number; seekTo(seconds:number,allowSeekAhead:boolean):void;
 loadVideoById(data:{videoId:string;startSeconds?:number}):void;
 cueVideoById(data:{videoId:string;startSeconds?:number}):void; destroy():void;
}
export interface YouTubeHandle {
 startFromGesture(shouldPlay?:boolean):boolean; pause():void; readonly paused:boolean; readonly ended:boolean;
 readonly duration:number; readonly muted:boolean; currentTime:number;
}
interface SDK {Player:new(element:HTMLElement,options:unknown)=>YouTubeApi}
let loading:Promise<SDK>|null=null;
export function loadYouTube():Promise<SDK>{
 const target=window as unknown as {YT?:SDK;onYouTubeIframeAPIReady?:()=>void};
 if(target.YT?.Player)return Promise.resolve(target.YT);
 if(loading)return loading;
 loading=new Promise<SDK>((resolve,reject)=>{
  const before=target.onYouTubeIframeAPIReady;
  const timeout=setTimeout(()=>{loading=null;reject(new Error('YouTube load timeout'));},15000);
  target.onYouTubeIframeAPIReady=()=>{before?.();clearTimeout(timeout);if(target.YT)resolve(target.YT);};
  const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.async=true;
  script.onerror=()=>{clearTimeout(timeout);loading=null;script.remove();reject(new Error('YouTube unavailable'));};document.head.appendChild(script);
 });return loading;
}
