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
const roomVideoStates = {}; 
const roomAudioStates = {}; // เก็บสถานะ Audio Bot
const roomUsers = {}; // [ใหม่] ตัวแปรเก็บชื่อคนในห้อง { roomId: { userId: "Name" } }

// --- ส่วน Socket.io ---
io.on('connection', socket => {
    console.log('New socket connection:', socket.id);

    // เมื่อ User เข้าห้อง
    socket.on('join-room', (roomId, userId, userName) => {
        socket.join(roomId);

        // 1. บันทึกชื่อคนใหม่ลงในห้อง
        if (!roomUsers[roomId]) roomUsers[roomId] = {};
        roomUsers[roomId][userId] = userName;

        // 2. บอกคนอื่นในห้องว่า "มีคนใหม่มา ชื่อ..." (ส่งไปทั้งก้อน object)
        socket.to(roomId).emit('user-connected', { userId, userName });

        // 3. [สำคัญ] บอกคนใหม่ว่า "ในห้องมีใครอยู่บ้างและชื่ออะไร"
        socket.emit('existing-users', roomUsers[roomId]);

        // ... (ส่วน Youtube/Audio Sync เดิม ปล่อยไว้) ...
        if (roomVideoStates[roomId]) socket.emit('youtube-sync-state', roomVideoStates[roomId]);
        if (roomAudioStates[roomId]) socket.emit('audio-sync-state', roomAudioStates[roomId]);

        socket.on('disconnect', () => {
            // ลบชื่อออกเมื่อหลุด
            if (roomUsers[roomId]) delete roomUsers[roomId][userId];
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });

    // --- ส่วนจัดการ Youtube Bot ---
    // (ย้ายออกมาไว้นอก join-room เพื่อป้องกัน Event ซ้ำซ้อน)
    socket.on('youtube-change', (data) => {
        const { roomId, videoState } = data;
        // อัปเดตสถานะล่าสุดเก็บไว้
        roomVideoStates[roomId] = videoState;
        // บอกคนอื่นให้ปรับตาม
        socket.to(roomId).emit('youtube-update', videoState);
    });

    // --- ส่วนจัดการ Audio Bot ---
    socket.on('audio-change', (data) => {
        const { roomId, audioState } = data;
        // อัปเดตสถานะล่าสุดเก็บไว้
        roomAudioStates[roomId] = audioState;
        // บอกคนอื่นให้ปรับตาม
        socket.to(roomId).emit('audio-update', audioState);
    });
});

// --- ส่วนเสิร์ฟหน้าเว็บ React ---
app.use(express.static(path.join(__dirname, 'dist')));

// ดักทุก Request ที่เหลือส่งไปหน้า React (แก้ PathError แล้ว)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ใช้ Port จากระบบ (Render) หรือ 3001
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});