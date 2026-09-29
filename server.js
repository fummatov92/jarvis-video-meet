const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || process.env.MEET_PORT || 15805;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    service: 'JarvisOS WebRTC Video Meet',
    uptime: process.uptime(),
    active_rooms: io.sockets.adapter.rooms.size
  });
});

// Fallback for SPA room route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.io Signaling
io.on('connection', (socket) => {
  let currentRoom = null;
  let currentUserId = null;
  let currentUserName = null;

  socket.on('join-room', ({ roomId, userId, userName }) => {
    currentRoom = roomId;
    currentUserId = userId;
    currentUserName = userName || 'Foydalanuvchi';

    socket.join(roomId);
    socket.to(roomId).emit('user-connected', {
      userId: currentUserId,
      userName: currentUserName,
      socketId: socket.id
    });

    socket.on('signal', ({ to, signal, data }) => {
      io.to(to).emit('signal', {
        from: socket.id,
        userId: currentUserId,
        userName: currentUserName,
        signal,
        data
      });
    });

    socket.on('chat-message', ({ message }) => {
      if (!currentRoom) return;
      const payload = {
        userName: currentUserName,
        message,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      io.to(currentRoom).emit('chat-message', payload);
    });

    socket.on('disconnect', () => {
      if (currentRoom && currentUserId) {
        socket.to(currentRoom).emit('user-disconnected', {
          userId: currentUserId,
          socketId: socket.id,
          userName: currentUserName
        });
      }
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 [WebRTC Video Meet] server running on http://0.0.0.0:${PORT}`);
});
