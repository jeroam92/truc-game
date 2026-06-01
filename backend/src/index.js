require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const registerSockets = require('./sockets/gameSocket');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json());

app.get('/health', (_, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

registerSockets(io);

const PORT = process.env.PORT || 3001;
server.listen(PORT, async () => {
  console.log(`Truc backend running on port ${PORT}`);
  // Reset rooms stuck in 'playing' from a previous process (in-memory state is lost on restart)
  try {
    const pool = require('./config/db');
    await pool.query("UPDATE rooms SET status='waiting' WHERE status='playing'");
    console.log('Reset playing rooms to waiting');
  } catch (e) {
    console.error('Could not reset room statuses:', e.message);
  }
});
