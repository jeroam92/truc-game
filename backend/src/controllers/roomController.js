const crypto = require('crypto');
const pool = require('../config/db');
const { sendMail } = require('../config/email');

function generateCode() {
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

async function createRoom(req, res) {
  const userId = req.user.id;
  try {
    const code = generateCode();
    const inviteToken = crypto.randomBytes(24).toString('hex');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO rooms (code, host_id, invite_token) VALUES ($1, $2, $3) RETURNING id, code, invite_token`,
        [code, userId, inviteToken]
      );
      const room = rows[0];

      await client.query(
        `INSERT INTO room_players (room_id, user_id, team, position) VALUES ($1, $2, 1, 0)`,
        [room.id, userId]
      );

      await client.query('COMMIT');

      res.status(201).json({
        room: {
          id: room.id,
          code: room.code,
          inviteUrl: `${process.env.FRONTEND_URL}/join/${room.invite_token}`,
          inviteToken: room.invite_token,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creant la sala' });
  }
}

async function sendInvite(req, res) {
  const { roomId, emails } = req.body;
  const userId = req.user.id;

  if (!roomId || !Array.isArray(emails) || emails.length === 0) {
    return res.status(400).json({ error: 'roomId i emails son requerits' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, code, invite_token, host_id FROM rooms WHERE id=$1',
      [roomId]
    );
    const room = rows[0];
    if (!room) return res.status(404).json({ error: 'Sala no trobada' });
    if (room.host_id !== userId) return res.status(403).json({ error: 'Només el host pot enviar invitacions' });

    const inviteUrl = `${process.env.FRONTEND_URL}/join/${room.invite_token}`;

    await Promise.all(
      emails.map((email) =>
        sendMail({
          to: email,
          subject: `${req.user.username} t'invita a jugar al Truc Valencià`,
          html: `
            <h2>Invitació al Truc Valencià!</h2>
            <p><strong>${req.user.username}</strong> t'ha convidat a una partida de Truc Valencià.</p>
            <p>Codi de sala: <strong>${room.code}</strong></p>
            <a href="${inviteUrl}" style="background:#c41e3a;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0;">
              Unir-se a la partida
            </a>
            <p>L'accés és únic per a aquesta sala. Si no tens compte, hauràs de registrar-te primer.</p>
          `,
        })
      )
    );

    res.json({ message: `Invitacions enviades a ${emails.length} destinatari(s)` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error enviant les invitacions' });
  }
}

async function joinRoom(req, res) {
  const { inviteToken } = req.params;
  const userId = req.user.id;

  try {
    const { rows: roomRows } = await pool.query(
      `SELECT r.id, r.code, r.status, r.host_id,
              (SELECT COUNT(*) FROM room_players WHERE room_id=r.id) as player_count
       FROM rooms r WHERE r.invite_token=$1`,
      [inviteToken]
    );
    const room = roomRows[0];

    if (!room) return res.status(404).json({ error: 'Sala no trobada' });
    if (room.status !== 'waiting') return res.status(400).json({ error: 'La partida ja ha començat' });
    if (parseInt(room.player_count) >= 4) return res.status(400).json({ error: 'La sala és plena' });

    const { rows: existingRows } = await pool.query(
      'SELECT id FROM room_players WHERE room_id=$1 AND user_id=$2',
      [room.id, userId]
    );
    if (existingRows.length > 0) {
      return res.json({ message: 'Ja ets a la sala', roomId: room.id });
    }

    const takenPositions = await pool.query(
      'SELECT position FROM room_players WHERE room_id=$1 ORDER BY position',
      [room.id]
    );
    const taken = takenPositions.rows.map((r) => r.position);
    const allPositions = [0, 1, 2, 3];
    const freePositions = allPositions.filter((p) => !taken.includes(p));
    const position = freePositions[0];
    // Teams: positions 0,2 = team 1; positions 1,3 = team 2
    const team = position % 2 === 0 ? 1 : 2;

    await pool.query(
      `INSERT INTO room_players (room_id, user_id, team, position) VALUES ($1, $2, $3, $4)`,
      [room.id, userId, team, position]
    );

    res.json({ message: 'Sala unida correctament', roomId: room.id, team, position });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error unint-se a la sala' });
  }
}

async function getRoomInfo(req, res) {
  const { roomId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.code, r.status, r.host_id, r.invite_token,
              json_agg(json_build_object(
                'userId', u.id, 'username', u.username,
                'team', rp.team, 'position', rp.position
              ) ORDER BY rp.position) as players
       FROM rooms r
       JOIN room_players rp ON rp.room_id = r.id
       JOIN users u ON u.id = rp.user_id
       WHERE r.id=$1
       GROUP BY r.id`,
      [roomId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Sala no trobada' });
    const room = rows[0];
    res.json({
      id: room.id,
      code: room.code,
      status: room.status,
      hostId: room.host_id,
      inviteUrl: `${process.env.FRONTEND_URL}/join/${room.invite_token}`,
      players: room.players,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obtenint la sala' });
  }
}

module.exports = { createRoom, sendInvite, joinRoom, getRoomInfo };
