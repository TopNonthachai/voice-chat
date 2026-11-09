const {randomUUID}=require('node:crypto');
const options=require('./reaction-options.json');
const validEmoji=emoji=>options.some(option=>option.emoji===emoji);
function acceptReaction(socket,now=Date.now()) {
    if(!socket.data.reactionRate||socket.data.reactionRate.until<=now)socket.data.reactionRate={until:now+5000,count:0};
    return ++socket.data.reactionRate.count<=8;
}
function registerReactions(io) {
    io.on('connection',socket=>socket.on('room-react',(data={},ack=()=>{})=>{
        if(typeof ack!=='function')ack=()=>{};
        const {roomId,emoji}=data||{};
        if(socket.data.roomId!==roomId||!socket.rooms.has(roomId))return ack({error:'กรุณาเข้าห้องก่อนส่งรีแอ็กชัน'});
        if(!validEmoji(emoji))return ack({error:'ไม่รองรับอีโมจินี้'});
        if(!acceptReaction(socket))return ack({error:'ส่งถี่ไปนิด รอสักครู่แล้วลองใหม่'});
        const reaction={id:randomUUID(),emoji,name:socket.data.userName||'เพื่อน',avatar:socket.data.profile?.avatar||'🌻',memberId:socket.data.memberId,timestamp:Date.now()};
        io.to(roomId).emit('room-reaction',reaction);ack({ok:true});
    }));
}
module.exports={registerReactions,acceptReaction,validEmoji};
