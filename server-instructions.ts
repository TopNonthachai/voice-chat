export const SERVER_CODE = `
const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server, {
  cors: {
    origin: "*", // Allow all origins for this demo
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'] // Explicitly allow both
});

// Serve a default message
app.get('/', (req, res) => {
  res.send('VoiceCord Signaling Server is running on port 3001');
});

io.on('connection', socket => {
  console.log('New socket connection:', socket.id);

  socket.on('join-room', (roomId, userId) => {
    console.log(\`User \${userId} joining room \${roomId}\`);
    socket.join(roomId);
    
    // Broadcast to others in the room that a user connected
    socket.to(roomId).emit('user-connected', userId);

    socket.on('disconnect', () => {
      console.log(\`User \${userId} disconnected\`);
      socket.to(roomId).emit('user-disconnected', userId);
    });
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(\`Server is running on port \${PORT}\`);
});
`;

export const PACKAGE_JSON = `
{
  "name": "voicecord-server",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.2"
  }
}
`;