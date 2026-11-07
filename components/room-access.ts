const access=new Map<string,string>();
export function saveMemberToken(roomId:string,token:string){access.set(roomId,token);try{localStorage.setItem(`mellow-room:${roomId}`,token);}catch{}}
export function getMemberToken(roomId:string){try{return access.get(roomId)||localStorage.getItem(`mellow-room:${roomId}`)||'';}catch{return access.get(roomId)||'';}}
