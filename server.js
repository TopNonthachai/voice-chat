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
const path = require('path'); // เพิ่มบรรทัดนี้

// --- ส่วน Socket.io (เหมือนเดิม) ---
io.on('connection', socket => {
  // ... (โค้ดเดิมข้างในไม่ต้องแก้) ...
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
// บอกให้ Express ไปอ่านไฟล์จากโฟลเดอร์ dist (ที่ได้จากการ npm run build)
app.use(express.static(path.join(__dirname, 'dist')));

// ถ้า User เข้ามาที่ URL ไหนก็ตาม ให้ส่งไฟล์ index.html ไปให้ (เพื่อให้ React Router ทำงาน)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ใช้ Port จากระบบ (สำหรับ Cloud) หรือ 3001 (สำหรับ Local)
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});