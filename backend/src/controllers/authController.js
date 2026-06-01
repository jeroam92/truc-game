const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');
const { sendMail } = require('../config/email');

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z]).{8,}$/;

async function register(req, res) {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Tots els camps son obligatoris' });
  }
  if (!PASSWORD_REGEX.test(password)) {
    return res.status(400).json({
      error: 'La contrasenya ha de tindre mínim 8 caràcters, una majúscula i una minúscula',
    });
  }

  try {
    const existing = await pool.query(
      'SELECT id FROM users WHERE email=$1 OR username=$2',
      [email, username]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Usuari o email ja registrat' });
    }

    const hash = await bcrypt.hash(password, 12);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const { rows } = await pool.query(
      `INSERT INTO users (username, email, password_hash, verification_token)
       VALUES ($1, $2, $3, $4) RETURNING id, username, email`,
      [username, email, hash, verificationToken]
    );

    const user = rows[0];
    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`;

    await sendMail({
      to: email,
      subject: 'Verifica el teu compte - Truc Valencià',
      html: `
        <h2>Benvingut al Truc Valencià, ${username}!</h2>
        <p>Fes clic al següent enllaç per verificar el teu compte:</p>
        <a href="${verifyUrl}" style="background:#c41e3a;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">
          Verificar compte
        </a>
        <p>L'enllaç caduca en 24 hores.</p>
      `,
    }).catch((err) => console.error('Email send error:', err.message));

    res.status(201).json({ message: 'Usuari creat. Comprova el teu correu per verificar el compte.', userId: user.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error intern del servidor' });
  }
}

async function verifyEmail(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token invàlid' });

  try {
    const { rowCount } = await pool.query(
      `UPDATE users SET is_verified=true, verification_token=NULL
       WHERE verification_token=$1 AND is_verified=false`,
      [token]
    );
    if (rowCount === 0) return res.status(400).json({ error: 'Token invàlid o ja usat' });
    res.json({ message: 'Compte verificat correctament' });
  } catch (err) {
    res.status(500).json({ error: 'Error intern del servidor' });
  }
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email i contrasenya requerits' });
  }

  try {
    const { rows } = await pool.query(
      'SELECT id, username, email, password_hash, is_verified FROM users WHERE email=$1',
      [email]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Credencials incorrectes' });
    }
    if (!user.is_verified) {
      return res.status(403).json({ error: 'Compte no verificat. Comprova el teu correu.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error intern del servidor' });
  }
}

async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerit' });

  try {
    const { rows } = await pool.query('SELECT id, username FROM users WHERE email=$1', [email]);
    // Always respond OK to prevent email enumeration
    if (rows.length === 0) {
      return res.json({ message: 'Si el compte existeix, rebràs un correu amb instruccions.' });
    }

    const user = rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

    await pool.query(
      `INSERT INTO password_resets (user_id, token, expires_at) VALUES ($1, $2, $3)`,
      [user.id, token, expiresAt]
    );

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await sendMail({
      to: email,
      subject: 'Recuperació de contrasenya - Truc Valencià',
      html: `
        <h2>Recuperació de contrasenya</h2>
        <p>Hola ${user.username}, has sol·licitat restablir la teua contrasenya.</p>
        <a href="${resetUrl}" style="background:#c41e3a;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;">
          Restablir contrasenya
        </a>
        <p>L'enllaç caduca en 1 hora. Si no has sol·licitat res, ignora aquest correu.</p>
      `,
    });

    res.json({ message: 'Si el compte existeix, rebràs un correu amb instruccions.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error intern del servidor' });
  }
}

async function resetPassword(req, res) {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token i contrasenya requerits' });
  if (!PASSWORD_REGEX.test(password)) {
    return res.status(400).json({
      error: 'La contrasenya ha de tindre mínim 8 caràcters, una majúscula i una minúscula',
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT pr.id, pr.user_id FROM password_resets pr
       WHERE pr.token=$1 AND pr.used=false AND pr.expires_at > NOW()`,
      [token]
    );
    if (rows.length === 0) return res.status(400).json({ error: 'Token invàlid o caducat' });

    const { id: resetId, user_id } = rows[0];
    const hash = await bcrypt.hash(password, 12);

    await pool.query('BEGIN');
    await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, user_id]);
    await pool.query('UPDATE password_resets SET used=true WHERE id=$1', [resetId]);
    await pool.query('COMMIT');

    res.json({ message: 'Contrasenya restablida correctament' });
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Error intern del servidor' });
  }
}

module.exports = { register, verifyEmail, login, forgotPassword, resetPassword };
