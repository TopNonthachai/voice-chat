// Keep the advertised screen even when PeerJS opens after the room snapshot.
export function createScreenReceiver({getPeer,getStream,onStream,onStatus,schedule=setTimeout,cancel=clearTimeout,timeoutMs=12000,retryMs=1500,maxRetries=3}) {
    let screens=[],call=null,timer=null,retries=0,disposed=false;
    const clearTimer=()=>{if(timer!==null)cancel(timer);timer=null;};
    const close=()=>{clearTimer();const previous=call;call=null;previous?.close();onStream(null);};
    const failed=()=>{
        close();if(disposed||!screens.length)return;
        if(retries++>=maxRetries){onStatus('error');return;}
        onStatus('connecting');timer=schedule(()=>{timer=null;connect();},retryMs);
    };
    const connect=()=>{
        if(disposed||call||timer!==null||!screens.length)return;
        const peer=getPeer();if(!peer?.open){onStatus('connecting');return;}
        onStatus('connecting');
        try {
            const current=peer.call(screens[0].id,getStream(),{
                constraints:{offerToReceiveVideo:true,offerToReceiveAudio:false},metadata:{kind:'screen'}
            });
            if(!current){failed();return;}
            call=current;
            timer=schedule(()=>{if(call===current)failed();},timeoutMs);
            current.on('stream',stream=>{
                if(call!==current||disposed||!stream.getVideoTracks().some(track=>track.readyState==='live'))return;
                clearTimer();onStream(stream);onStatus('connected');
            });
            current.on('error',()=>{if(call===current)failed();});
            current.on('close',()=>{if(call===current)failed();});
        }catch{failed();}
    };
    const update=next=>{
        if(disposed)return;
        const previous=screens[0]?.id;screens=next;
        if(previous!==screens[0]?.id){retries=0;close();}
        if(!screens.length){close();onStatus('idle');return;}
        connect();
    };
    return {
        update,ready:connect,
        remove:id=>update(screens.filter(screen=>screen.id!==id)),
        retry:()=>{retries=0;close();connect();},
        disconnected:()=>{retries=0;close();if(screens.length)onStatus('connecting');},
        dispose:()=>{disposed=true;screens=[];close();}
    };
}
