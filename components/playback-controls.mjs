// Keep these calls synchronous: Safari's user activation must reach the prepared player.
export function startGesturePlayback(api,volume,shouldPlay=true){
 if(!api)return false;
 try{
  api.unMute();
  api.setVolume(Math.round(Math.max(0,Math.min(1,volume))*100));
  if(shouldPlay)api.playVideo();
  return true;
 }catch{return false;}
}
