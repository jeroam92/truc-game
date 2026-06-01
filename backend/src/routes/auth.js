const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const { register, verifyEmail, login, forgotPassword, resetPassword } = require('../controllers/authController');

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Massa intents. Torna-ho a provar en 15 minuts.' } });

router.post('/register', authLimiter, register);
router.get('/verify-email', verifyEmail);
router.post('/login', authLimiter, login);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);

module.exports = router;
