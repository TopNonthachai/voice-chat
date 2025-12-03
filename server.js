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

// --- ส่วน Socket.io ---
io.on('connection', socket => {
    console.log('New socket connection:', socket.id);

    // เมื่อ User เข้าห้อง
    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);
        socket.to(roomId).emit('user-connected', userId);

        // ส่งสถานะ Youtube ล่าสุดให้คนที่เพิ่งเข้า
        if (roomVideoStates[roomId]) {
            socket.emit('youtube-sync-state', roomVideoStates[roomId]);
        }

        // ส่งสถานะ Audio ล่าสุดให้คนที่เพิ่งเข้า
        if (roomAudioStates[roomId]) {
            socket.emit('audio-sync-state', roomAudioStates[roomId]);
        }

        // เมื่อ User ตัดสาย/ปิดเว็บ
        socket.on('disconnect', () => {
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