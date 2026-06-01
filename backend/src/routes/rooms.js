const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { createRoom, sendInvite, joinRoom, getRoomInfo } = require('../controllers/roomController');

router.post('/', auth, createRoom);
router.post('/invite', auth, sendInvite);
router.post('/join/:inviteToken', auth, joinRoom);
router.get('/:roomId', auth, getRoomInfo);

module.exports = router;
