const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const engine = require('../game/engine');

const gameStates = {};
const roomSockets = {};
const socketMeta = {};
const turnTimers = {}; // roomId -> { timeout, expiresAt }
const surrenderVotes = {}; // roomId -> { team, initiatorId, initiatorName, votes: Set<userId> }

const TURN_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

function authenticateSocket(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('No autenticat'));
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Token invàlid'));
  }
}

function broadcastGameState(io, roomId) {
  const state = gameStates[roomId];
  if (!state) return;
  for (const socketId of (roomSockets[roomId] || new Set())) {
    const meta = socketMeta[socketId];
    if (meta) io.to(socketId).emit('game:state', engine.getPublicState(state, meta.position));
  }
}

async function persistState(roomId, state) {
  try {
    await pool.query(
      `UPDATE games SET state=$1, score_team1=$2, score_team2=$3 WHERE room_id=$4 AND finished_at IS NULL`,
      [JSON.stringify(state), state.scores[1], state.scores[2], roomId]
    );
  } catch (err) {
    console.error('Persist error:', err.message);
  }
}

function clearTurnTimer(roomId) {
  if (turnTimers[roomId]) {
    clearTimeout(turnTimers[roomId].timeout);
    delete turnTimers[roomId];
  }
}

function startTurnTimer(io, roomId) {
  clearTurnTimer(roomId);
  const state = gameStates[roomId];
  if (!state || state.phase !== 'playing' || !state.hand || state.hand.handWinner !== null) return;

  const expiresAt = Date.now() + TURN_TIMEOUT_MS;
  io.to(roomId).emit('game:timer', { expiresAt });

  const timeout = setTimeout(() => {
    delete turnTimers[roomId];
    const currentState = gameStates[roomId];
    if (!currentState || currentState.phase !== 'playing' || currentState.hand?.handWinner !== null) return;

    const newState = engine.penalizeTimeout(currentState);
    gameStates[roomId] = newState;
    persistState(roomId, newState);
    broadcastGameState(io, roomId);
    io.to(roomId).emit('game:timeout', {});

    if (newState.phase === 'finished') {
      pool.query("UPDATE rooms SET status='finished' WHERE id=$1", [roomId]).catch(console.error);
      io.to(roomId).emit('game:finished', { winnerTeam: newState.winnerTeam, scores: newState.scores });
    } else if (newState.hand?.handWinner) {
      io.to(roomId).emit('game:hand-end', { winnerTeam: newState.hand.handWinner, scores: newState.scores });
      setTimeout(() => startNewHand(io, roomId, newState), 3000);
    }
  }, TURN_TIMEOUT_MS);

  turnTimers[roomId] = { timeout, expiresAt };
}

function applyAction(io, roomId, newState, socket) {
  if (newState.error) { socket.emit('error', { message: newState.error }); return; }
  gameStates[roomId] = newState;
  persistState(roomId, newState);
  broadcastGameState(io, roomId);

  if (newState.phase === 'finished') {
    clearTurnTimer(roomId);
    pool.query("UPDATE rooms SET status='finished' WHERE id=$1", [roomId]).catch(console.error);
    io.to(roomId).emit('game:finished', { winnerTeam: newState.winnerTeam, scores: newState.scores });
  } else if (newState.hand?.handWinner && !newState.hand.waitingResponse) {
    clearTurnTimer(roomId);
    io.to(roomId).emit('game:hand-end', { winnerTeam: newState.hand.handWinner, scores: newState.scores });
    setTimeout(() => startNewHand(io, roomId, newState), 3000);
  } else {
    startTurnTimer(io, roomId);
  }
}

function startNewHand(io, roomId, currentState) {
  if (!gameStates[roomId] || gameStates[roomId].phase === 'finished') return;
  if (surrenderVotes[roomId]) {
    delete surrenderVotes[roomId];
    io.to(roomId).emit('game:surrender-cancelled', {});
  }
  const nextDealer = (currentState.hand.dealerPosition + 1) % 4;
  const newState = engine.newHand(currentState, nextDealer);
  gameStates[roomId] = newState;
  persistState(roomId, newState);
  broadcastGameState(io, roomId);
  io.to(roomId).emit('game:new-hand', { hand: newState.currentHand });
  startTurnTimer(io, roomId);
}

module.exports = function registerSockets(io) {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const { id: userId, username } = socket.user;

    socket.on('room:join', async ({ roomId }) => {
      try {
        const { rows } = await pool.query(
          `SELECT rp.position, rp.team FROM room_players rp
           JOIN rooms r ON r.id=rp.room_id
           WHERE rp.room_id=$1 AND rp.user_id=$2`,
          [roomId, userId]
        );
        if (!rows[0]) return socket.emit('error', { message: 'No ets a aquesta sala' });
        const { position, team } = rows[0];

        socket.join(roomId);
        if (!roomSockets[roomId]) roomSockets[roomId] = new Set();
        roomSockets[roomId].add(socket.id);
        socketMeta[socket.id] = { userId, username, roomId, position, team };

        const { rows: players } = await pool.query(
          `SELECT u.id AS "userId", u.username, rp.position, rp.team
           FROM room_players rp JOIN users u ON u.id=rp.user_id
           WHERE rp.room_id=$1 ORDER BY rp.position`,
          [roomId]
        );
        io.to(roomId).emit('room:players', { players });

        const online = [...(roomSockets[roomId] || [])].map((sid) => socketMeta[sid]?.userId).filter(Boolean);
        io.to(roomId).emit('room:online', { onlineUserIds: [...new Set(online)] });

        if (gameStates[roomId]) {
          socket.emit('game:state', engine.getPublicState(gameStates[roomId], position));
          if (turnTimers[roomId]) {
            socket.emit('game:timer', { expiresAt: turnTimers[roomId].expiresAt });
          }
        }
      } catch (err) {
        console.error(err);
        socket.emit('error', { message: 'Error unint-se a la sala' });
      }
    });

    socket.on('game:start', async ({ roomId }) => {
      try {
        const meta = socketMeta[socket.id];
        if (!meta || meta.roomId !== roomId) return socket.emit('error', { message: 'No autoritzat' });

        const { rows: roomRows } = await pool.query(
          'SELECT host_id, status FROM rooms WHERE id=$1', [roomId]
        );
        if (!roomRows[0] || roomRows[0].host_id !== userId)
          return socket.emit('error', { message: 'Sols el host pot iniciar' });

        const status = roomRows[0].status;

        // If game already running in memory, just resend game:started so clients can navigate
        if (status === 'playing' && gameStates[roomId]) {
          broadcastGameState(io, roomId);
          io.to(roomId).emit('game:started', { message: 'La partida ha començat!' });
          return;
        }

        const { rows: players } = await pool.query(
          `SELECT u.id as "userId", rp.position, rp.team
           FROM room_players rp JOIN users u ON u.id=rp.user_id
           WHERE rp.room_id=$1 ORDER BY rp.position`,
          [roomId]
        );
        if (players.length < 4) return socket.emit('error', { message: `Falten jugadors (${players.length}/4)` });

        // Reset status if backend restarted (status=playing but no in-memory state)
        await pool.query("UPDATE rooms SET status='playing' WHERE id=$1", [roomId]);
        const state = engine.createInitialState(players);
        const handState = engine.newHand(state, 3);
        gameStates[roomId] = handState;
        await pool.query(`INSERT INTO games (room_id, state) VALUES ($1, $2)`, [roomId, JSON.stringify(handState)]);
        broadcastGameState(io, roomId);
        io.to(roomId).emit('game:started', { message: 'La partida ha començat!' });
        startTurnTimer(io, roomId);
      } catch (err) {
        console.error('game:start error:', err);
        socket.emit('error', { message: `Error iniciant la partida: ${err.message}` });
      }
    });

    socket.on('game:play-card', ({ roomId, cardIndex, faceDown }) => {
      const meta = socketMeta[socket.id];
      if (!meta || meta.roomId !== roomId) return socket.emit('error', { message: 'No autoritzat' });
      const state = gameStates[roomId];
      if (!state) return socket.emit('error', { message: 'Partida no trobada' });
      applyAction(io, roomId, engine.playCard(state, meta.position, cardIndex, !!faceDown), socket);
    });

    socket.on('game:challenge-truc', ({ roomId }) => {
      const meta = socketMeta[socket.id];
      if (!meta || meta.roomId !== roomId) return socket.emit('error', { message: 'No autoritzat' });
      const state = gameStates[roomId];
      if (!state) return socket.emit('error', { message: 'Partida no trobada' });
      const newState = engine.challengeTruc(state, meta.position);
      if (newState.error) return socket.emit('error', { message: newState.error });
      gameStates[roomId] = newState;
      persistState(roomId, newState);
      broadcastGameState(io, roomId);
      const wr = newState.hand.waitingResponse;
      io.to(roomId).emit('game:challenge', { type: 'truc', from: username, label: wr.label, toTeam: wr.toTeam });
      startTurnTimer(io, roomId);
    });

    socket.on('game:respond-truc', ({ roomId, accept }) => {
      const meta = socketMeta[socket.id];
      if (!meta || meta.roomId !== roomId) return socket.emit('error', { message: 'No autoritzat' });
      const state = gameStates[roomId];
      if (!state) return socket.emit('error', { message: 'Partida no trobada' });
      if (!accept) io.to(roomId).emit('game:fold', { type: 'truc', who: username });
      applyAction(io, roomId, engine.respondTruc(state, meta.position, accept), socket);
    });

    socket.on('game:challenge-envit', ({ roomId }) => {
      const meta = socketMeta[socket.id];
      if (!meta || meta.roomId !== roomId) return socket.emit('error', { message: 'No autoritzat' });
      const state = gameStates[roomId];
      if (!state) return socket.emit('error', { message: 'Partida no trobada' });
      const newState = engine.challengeEnvit(state, meta.position);
      if (newState.error) return socket.emit('error', { message: newState.error });
      gameStates[roomId] = newState;
      persistState(roomId, newState);
      broadcastGameState(io, roomId);
      const wr = newState.hand.waitingResponse;
      io.to(roomId).emit('game:challenge', { type: 'envit', from: username, label: wr.label, toTeam: wr.toTeam });
      startTurnTimer(io, roomId);
    });

    socket.on('game:respond-envit', ({ roomId, accept }) => {
      const meta = socketMeta[socket.id];
      if (!meta || meta.roomId !== roomId) return socket.emit('error', { message: 'No autoritzat' });
      const state = gameStates[roomId];
      if (!state) return socket.emit('error', { message: 'Partida no trobada' });
      if (!accept) io.to(roomId).emit('game:fold', { type: 'envit', who: username });
      applyAction(io, roomId, engine.respondEnvit(state, meta.position, accept), socket);
    });

    socket.on('game:surrender-request', ({ roomId }) => {
      const meta = socketMeta[socket.id];
      if (!meta || meta.roomId !== roomId) return;
      const state = gameStates[roomId];
      if (!state || state.phase !== 'playing') return;

      const { team, userId } = meta;
      const existing = surrenderVotes[roomId];

      if (!existing) {
        surrenderVotes[roomId] = { team, initiatorId: userId, initiatorName: username, votes: new Set([userId]) };
        io.to(roomId).emit('game:surrender-vote', { team, initiatorName: username });
      } else if (existing.team === team && !existing.votes.has(userId)) {
        delete surrenderVotes[roomId];
        clearTurnTimer(roomId);
        const winnerTeam = team === 1 ? 2 : 1;
        const newState = { ...state, phase: 'finished', winnerTeam };
        gameStates[roomId] = newState;
        persistState(roomId, newState);
        pool.query("UPDATE rooms SET status='finished' WHERE id=$1", [roomId]).catch(console.error);
        io.to(roomId).emit('game:finished', { winnerTeam, scores: newState.scores, surrendered: true });
      } else if (existing.team !== team) {
        socket.emit('error', { message: "L'equip contrari té una votació en curs" });
      }
    });

    socket.on('game:surrender-cancel', ({ roomId }) => {
      const meta = socketMeta[socket.id];
      if (!meta || meta.roomId !== roomId) return;
      if (surrenderVotes[roomId]?.team === meta.team) {
        delete surrenderVotes[roomId];
        io.to(roomId).emit('game:surrender-cancelled', {});
      }
    });

    socket.on('room:chat', ({ roomId, message }) => {
      const meta = socketMeta[socket.id];
      if (!meta || meta.roomId !== roomId) return;
      const text = String(message || '').trim().slice(0, 200);
      if (!text) return;
      io.to(roomId).emit('room:chat', { username: meta.username, message: text, ts: Date.now() });
    });

    socket.on('disconnect', () => {
      const meta = socketMeta[socket.id];
      if (meta?.roomId) {
        roomSockets[meta.roomId]?.delete(socket.id);
        const online = [...(roomSockets[meta.roomId] || [])].map((sid) => socketMeta[sid]?.userId).filter(Boolean);
        io.to(meta.roomId).emit('room:online', { onlineUserIds: [...new Set(online)] });
      }
      delete socketMeta[socket.id];
    });
  });
};
