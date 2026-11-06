function createTitleResolver({fetchImpl=fetch,now=Date.now}={}) {
    const cache=new Map(),pending=new Map();
    return async function resolveTitle(id) {
        if(!/^[\w-]{11}$/.test(id))return null;
        const cached=cache.get(id);if(cached&&cached.until>now())return cached.value;
        if(pending.has(id))return pending.get(id);
        const job=(async()=>{
            let value=null;
            try{
                const url=new URL('https://www.youtube.com/oembed');url.search=new URLSearchParams({url:`https://www.youtube.com/watch?v=${id}`,format:'json'}).toString();
                const response=await fetchImpl(url,{signal:AbortSignal.timeout(5000)});
                if(response.ok){const data=await response.json();if(typeof data.title==='string'&&data.title.trim())value={title:data.title.trim().slice(0,300),author:typeof data.author_name==='string'?data.author_name.slice(0,100):''};}
            }catch{}
            cache.set(id,{value,until:now()+(value?24*60*60*1000:60000)});
            if(cache.size>1000)cache.delete(cache.keys().next().value);
            return value;
        })();
        pending.set(id,job);
        try{return await job;}finally{pending.delete(id);}
    };
}
module.exports={createTitleResolver};
