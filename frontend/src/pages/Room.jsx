import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { roomApi } from '../services/api';
import LangToggle from '../components/LangToggle';

export default function Room() {
  const { roomId } = useParams();
  const { t } = useTranslation();
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const chatEndRef = useRef(null);

  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [onlineIds, setOnlineIds] = useState([]);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [inviteEmails, setInviteEmails] = useState('');
  const [inviteSent, setInviteSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    roomApi.getInfo(roomId)
      .then(({ data }) => setRoom(data))
      .catch(() => navigate('/lobby'));
  }, [roomId, navigate]);

  useEffect(() => {
    const socket = io('/', { auth: { token }, forceNew: true });
    socketRef.current = socket;

    // Re-emit room:join on every connect/reconnect
    socket.on('connect', () => {
      socket.emit('room:join', { roomId });
    });

    socket.on('room:players', ({ players: p }) => setPlayers(p));
    socket.on('room:online', ({ onlineUserIds }) => setOnlineIds(onlineUserIds));
    socket.on('room:chat', (msg) => setMessages((prev) => [...prev, msg]));
    socket.on('game:started', () => navigate(`/game/${roomId}`));
    socket.on('error', ({ message }) => {
      setError(message);
      setTimeout(() => setError(''), 6000);
    });
    socket.on('connect_error', (err) => {
      console.error('Socket connect error:', err.message);
    });
    return () => socket.disconnect();
  }, [roomId, token, navigate]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function sendChat(e) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    socketRef.current?.emit('room:chat', { roomId, message: text });
    setChatInput('');
  }

  function copyLink() {
    if (room?.inviteUrl) {
      navigator.clipboard.writeText(room.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleInvite() {
    const emails = inviteEmails.split(',').map((e) => e.trim()).filter(Boolean);
    if (!emails.length) return;
    setLoading(true);
    try {
      await roomApi.sendInvite(roomId, emails);
      setInviteSent(true);
      setInviteEmails('');
      setTimeout(() => setInviteSent(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Error enviant');
    } finally {
      setLoading(false);
    }
  }

  function handleStart() {
    socketRef.current?.emit('game:start', { roomId });
  }

  const isHost = room && user && room.hostId === user.id;
  const canStart = players.length === 4 && isHost;

  return (
    <div className="lobby-page">
      <div className="lobby-header">
        <h1>{t('app.title')}</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <LangToggle />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{user?.username}</span>
          <button className="btn btn-secondary" onClick={logout}>{t('auth.logout')}</button>
        </div>
      </div>

      {error && <div className="error-msg" style={{ maxWidth: 960, margin: '0 auto 1rem' }}>{error}</div>}

      <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>

        {/* Left: players + invite */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card-panel">
            <h2>{t('lobby.playersInRoom')}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {players.length}/4 jugadors
            </p>
            <ul className="player-list">
              {[0, 1, 2, 3].map((pos) => {
                const p = players.find((pl) => pl.position === pos);
                const isOnline = p && onlineIds.includes(p.userId);
                return (
                  <li key={pos} className="player-item">
                    <div className={isOnline ? 'online-dot' : 'offline-dot'} />
                    {p ? (
                      <>
                        <span>{p.username}</span>
                        {p.userId === user?.id && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({t('lobby.you')})</span>
                        )}
                        <span className={`team-badge team-${p.team}`}>{t(`lobby.team${p.team}`)}</span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Esperant...</span>
                    )}
                  </li>
                );
              })}
            </ul>

            {canStart ? (
              <button className="btn btn-gold btn-full" style={{ marginTop: '1.5rem' }} onClick={handleStart}>
                {t('lobby.startGame')}
              </button>
            ) : isHost ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1rem', textAlign: 'center' }}>
                Esperant que s'unisquen tots els jugadors ({players.length}/4)
              </p>
            ) : null}
          </div>

          {room && (
            <div className="card-panel">
              <h2>{t('lobby.inviteLink')}</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                {t('lobby.roomCode')}: <strong style={{ color: 'var(--gold)' }}>{room.code}</strong>
              </p>
              <div className="invite-box">
                <input readOnly value={room.inviteUrl || ''} />
                <button className="btn btn-secondary" onClick={copyLink}>
                  {copied ? t('lobby.linkCopied') : t('lobby.copyLink')}
                </button>
              </div>
              {isHost && (
                <div style={{ marginTop: '1.25rem' }}>
                  <h2 style={{ marginBottom: '0.75rem' }}>{t('lobby.inviteByEmail')}</h2>
                  {inviteSent && <div className="success-msg">Invitacions enviades!</div>}
                  <div className="form-group">
                    <textarea
                      className="form-control"
                      placeholder={t('lobby.emailPlaceholder')}
                      value={inviteEmails}
                      onChange={(e) => setInviteEmails(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleInvite}
                    disabled={loading || !inviteEmails.trim()}
                  >
                    {loading ? '...' : t('lobby.sendInvites')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: chat */}
        <div className="card-panel chat-panel">
          <h2>Xat</h2>
          <div className="chat-messages">
            {messages.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginTop: '2rem' }}>
                Diga alguna cosa mentre espereu...
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg${msg.username === user?.username ? ' mine' : ''}`}>
                <span className="chat-author">{msg.username}</span>
                <span className="chat-text">{msg.message}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <form className="chat-form" onSubmit={sendChat}>
            <input
              className="chat-input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Escriu un missatge..."
              maxLength={200}
              autoComplete="off"
            />
            <button type="submit" className="btn btn-primary" disabled={!chatInput.trim()}>
              Enviar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
