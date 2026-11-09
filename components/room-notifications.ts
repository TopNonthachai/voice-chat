let context:AudioContext|null=null;
let enabled=true,lastSound=0;
export const setNotificationSound=(value:boolean)=>{enabled=value;};
export function unlockNotifications(){
    if(!enabled)return;
    try{context??=new AudioContext();if(context.state==='suspended')void context.resume().catch(()=>{});}catch{}
}
export function notifyRoom(kind:'join'|'leave'|'chat'|'screen'){
    if(!enabled||!context||context.state!=='running'||Date.now()-lastSound<500)return;
    lastSound=Date.now();
    const pitches={join:[520,660],leave:[440,330],chat:[660,660],screen:[440,740]};
    pitches[kind].forEach((frequency,index)=>{
        const oscillator=context!.createOscillator(),gain=context!.createGain(),start=context!.currentTime+index*.11;
        oscillator.type='sine';oscillator.frequency.value=frequency;
        gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.035,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+.13);
        oscillator.connect(gain);gain.connect(context!.destination);oscillator.start(start);oscillator.stop(start+.15);
        oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
    });
}
