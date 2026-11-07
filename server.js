const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
});
const path = require('path');

// 1. ประกาศตัวแปรเก็บสถานะ (ต้องอยู่นอก io.on)
require('./music-server.cjs').registerMusic(io);
const avatarChoices = ['🌻', '🐈', '🦊', '🐻', '🐸', '🐼', '🐰', '👾', '🤖', '🪐', '🍄', '👻'];
const cleanProfile = (profile, name) => {
    const avatar = profile?.avatar;
    return {
        name: (typeof name === 'string' ? name.trim().slice(0, 40) : '') || 'Guest',
        avatar: avatarChoices.includes(avatar) || (typeof avatar === 'string' && avatar.length <= 50000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(avatar)) ? avatar : '🌻',
        motion: profile?.motion !== false,
        status: typeof profile?.status === 'string' ? profile.status.trim().slice(0, 80) : ''
    };
};
const roomService=require('./room-server.cjs').createRoomService(io,app,cleanProfile);
io.on('connection',socket=>{
 socket.on('screen-start',(data={})=>{if(!data||typeof data!=='object')return;if(socket.data.roomId!==data.roomId||!socket.rooms.has(data.roomId))return;if(data.userId!==`${socket.data.userId}-screen`)return;socket.data.screenId=data.userId;socket.to(data.roomId).emit('screen-shared',{userId:data.userId});});
 socket.on('screen-stop',roomId=>{if(socket.data.roomId!==roomId)return;socket.data.screenId=null;socket.to(roomId).emit('screen-stopped');});
 socket.on('audio-change',(data={})=>{if(!data||typeof data!=='object')return;if(socket.data.roomId===data.roomId)socket.to(data.roomId).emit('audio-update',data.audioState);});
});

require('./chat-server.cjs').registerChat(io, app, (roomId, userId) => roomService.getProfile(roomId,userId));

// --- ส่วนเสิร์ฟหน้าเว็บ React ---
app.use(express.static(path.join(__dirname, 'dist')));

// ดักทุก Request ที่เหลือส่งไปหน้า React (แก้ PathError แล้ว)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ใช้ Port จากระบบ (Render) หรือ 3001
const PORT = process.env.PORT || 3001;
if (require.main === module) server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
module.exports = { server, io, roomService };
