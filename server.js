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

// --- ส่วน Socket.io (เหมือนเดิม) ---
io.on('connection', socket => {
  console.log('New socket connection:', socket.id);
  socket.on('join-room', (roomId, userId) => {
      socket.join(roomId);
      socket.to(roomId).emit('user-connected', userId);
      socket.on('disconnect', () => {
          socket.to(roomId).emit('user-disconnected', userId);
      });
  });
});

// --- ส่วนใหม่: เสิร์ฟหน้าเว็บ React ---
app.use(express.static(path.join(__dirname, 'dist')));

// *** จุดที่แก้ไข: เปลี่ยน * เป็น /(.*) เพื่อแก้ PathError ***
app.get('/(.*)', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ใช้ Port จากระบบ (Render) หรือ 3001
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});