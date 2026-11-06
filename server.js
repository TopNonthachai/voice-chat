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
const roomProfiles = Object.create(null);
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
const roomVideoStates = Object.create(null);
const roomAudioStates = Object.create(null); // เก็บสถานะ Audio Bot
const roomUsers = Object.create(null); // [ใหม่] ตัวแปรเก็บชื่อคนในห้อง { roomId: { userId: "Name" } }

// --- ส่วน Socket.io ---
io.on('connection', socket => {
    console.log('New socket connection:', socket.id);

    // เมื่อ User เข้าห้อง
    const leave = () => {
        const { roomId, userId } = socket.data;
        if (!roomId) return;
        if (roomUsers[roomId]) delete roomUsers[roomId][userId];
        if (roomProfiles[roomId]) delete roomProfiles[roomId][userId];
        socket.to(roomId).emit('user-disconnected', userId);
        socket.leave(roomId);
        io.to(roomId).emit('room-members', roomProfiles[roomId] || {});
    };
    socket.on('disconnect', leave);
    socket.on('join-room', (roomId, userId, userName, profile) => {
        if (typeof roomId !== 'string' || !roomId.length || roomId.length > 128 ||
            typeof userId !== 'string' || !userId.length || userId.length > 128) return;
        if (socket.data.roomId !== roomId || socket.data.userId !== userId) {
            leave();
            socket.data = { roomId, userId };
            socket.join(roomId);
            if (!roomUsers[roomId]) roomUsers[roomId] = Object.create(null);
            roomUsers[roomId][userId] = typeof userName === 'string' ? userName.slice(0, 80) : 'Guest';
            socket.to(roomId).emit('user-connected', { userId, userName: roomUsers[roomId][userId] });
        }
        if (!roomProfiles[roomId]) roomProfiles[roomId] = Object.create(null);
        roomProfiles[roomId][userId] = cleanProfile(profile, userName);
        roomUsers[roomId][userId] = roomProfiles[roomId][userId].name;
        socket.data.userName = roomProfiles[roomId][userId].name;
        io.to(roomId).emit('room-members', roomProfiles[roomId]);
        socket.emit('existing-users', roomUsers[roomId]);
        if (roomAudioStates[roomId]) socket.emit('audio-sync-state', roomAudioStates[roomId]);
    });

    socket.on('profile-update', (profile) => {
        const { roomId, userId } = socket.data;
        if (!roomId || !roomProfiles[roomId]) return;
        roomProfiles[roomId][userId] = cleanProfile(profile, profile?.name);
        roomUsers[roomId][userId] = roomProfiles[roomId][userId].name;
        socket.data.userName = roomProfiles[roomId][userId].name;
        io.to(roomId).emit('room-members', roomProfiles[roomId]);
    });

    // --- ส่วนจัดการ Youtube Bot ---
    socket.on('youtube-change', (data) => {
        const { roomId, videoState } = data || {};
        if (!socket.rooms.has(roomId) || !videoState) return;
        console.log(`📺 [Youtube] Room ${roomId} changed state to:`, videoState.url);
        roomVideoStates[roomId] = videoState;
        socket.to(roomId).emit('youtube-update', videoState);
    });

    // --- ส่วนจัดการ Audio Bot ---
    socket.on('audio-change', (data) => {
        const { roomId, audioState } = data || {};
        if (!socket.rooms.has(roomId) || !audioState) return;
        console.log(`🎵 [Audio] Room ${roomId} changed state to:`, audioState.url);
        roomAudioStates[roomId] = audioState;
        socket.to(roomId).emit('audio-update', audioState);
    });

    // --- ส่วนจัดการ Screen Sharing ---
    socket.on('screen-start', (data) => {
        const { roomId, userId } = data || {};
        if (!socket.rooms.has(roomId)) return;
        console.log(`🖥️ [Screen] User ${userId} started sharing in ${roomId}`);
        socket.to(roomId).emit('screen-shared', { userId });
    });

    socket.on('screen-stop', (roomId) => {
        if (!socket.rooms.has(roomId)) return;
        console.log(`🖥️ [Screen] Stopped sharing in ${roomId}`);
        socket.to(roomId).emit('screen-stopped');
    });
});

require('./chat-server.cjs').registerChat(io, app, (roomId, userId) => roomProfiles[roomId]?.[userId]);

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
module.exports = { server, io };
