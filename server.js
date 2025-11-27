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

// --- ส่วน Socket.io ---
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

// --- ส่วนเสิร์ฟหน้าเว็บ React ---
// ให้ Express อ่านไฟล์ Static ในโฟลเดอร์ dist
app.use(express.static(path.join(__dirname, 'dist')));

// *** จุดสำคัญที่แก้ไข ***
// ใช้ app.use แบบไม่ระบุ Path เพื่อดักทุก Request ที่เหลือส่งไปหน้า React
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ใช้ Port จากระบบ (Render) หรือ 3001
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});