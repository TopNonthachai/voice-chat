function registerScreens(io) {
    const snapshot=(roomId,exclude)=>[...io.sockets.sockets.values()]
        .filter(s=>s.id!==exclude&&s.data.roomId===roomId&&s.rooms.has(roomId)&&s.data.screenId)
        .map(s=>({id:s.data.screenId,name:s.data.userName||'เพื่อน'}));
    const broadcast=(roomId,exclude)=>io.to(roomId).emit('screen-state',snapshot(roomId,exclude));
    io.on('connection',socket=>{
        socket.on('screen-sync',()=>{
            const roomId=socket.data.roomId;
            if(roomId&&socket.rooms.has(roomId))socket.emit('screen-state',snapshot(roomId));
        });
        socket.on('screen-start',(data={})=>{
            if(!data||typeof data!=='object'||socket.data.roomId!==data.roomId||!socket.rooms.has(data.roomId))return;
            if(data.userId!==`${socket.data.userId}-screen`)return;
            socket.data.screenId=data.userId;
            broadcast(data.roomId);
        });
        socket.on('screen-stop',roomId=>{
            if(socket.data.roomId!==roomId||!socket.rooms.has(roomId))return;
            const userId=socket.data.screenId;socket.data.screenId=null;
            socket.to(roomId).emit('screen-stopped',{userId});broadcast(roomId);
        });
        socket.on('disconnecting',()=>{if(socket.data.roomId&&socket.data.screenId)broadcast(socket.data.roomId,socket.id);});
    });
    return {snapshot};
}
module.exports={registerScreens};
