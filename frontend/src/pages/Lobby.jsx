import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';
import { roomApi } from '../services/api';
import LangToggle from '../components/LangToggle';

export default function Lobby() {
  const { t } = useTranslation();
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [onlineIds, setOnlineIds] = useState([]);
  const [inviteEmails, setInviteEmails] = useState('');
  const [copied, setCopied] = useState(false);
  const [inviteSent, setInviteSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!room) return;
    const socket = io('/', { auth: { token } });
    socketRef.current = socket;
    socket.emit('room:join', { roomId: room.id });
    socket.on('room:players', ({ players: p }) => setPlayers(p));
    socket.on('room:online', ({ onlineUserIds }) => setOnlineIds(onlineUserIds));
    socket.on('game:started', () => navigate(`/game/${room.id}`));
    socket.on('error', ({ message }) => setError(message));
    return () => socket.disconnect();
  }, [room, token, navigate]);

  async function handleCreate() {
    setLoading(true);
    setError('');
    try {
      const { data } = await roomApi.create();
      setRoom(data.room);
    } catch (err) {
      setError(err.response?.data?.error || 'Error');
    } finally {
      setLoading(false);
    }
  }

  async function handleStart() {
    socketRef.current?.emit('game:start', { roomId: room.id });
  }

  async function handleInvite() {
    const emails = inviteEmails.split(',').map((e) => e.trim()).filter(Boolean);
    if (!emails.length) return;
    setLoading(true);
    try {
      await roomApi.sendInvite(room.id, emails);
      setInviteSent(true);
      setInviteEmails('');
      setTimeout(() => setInviteSent(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Error enviant');
    } finally {
      setLoading(false);
    }
  }

  function copyLink() {
    navigator.clipboard.writeText(room.inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isHost = room && user && players.find((p) => p.userId === user.id);
  const canStart = players.length === 4 && isHost;

  return (
    <div className="lobby-page">
      <div className="lobby-header">
        <h1>{t('app.title')}</h1>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <LangToggle />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            {t('lobby.welcome', { name: user?.username })}
          </span>
          <button className="btn btn-secondary" onClick={logout}>{t('auth.logout')}</button>
        </div>
      </div>

      {error && <div className="error-msg" style={{ maxWidth: 900, margin: '0 auto 1rem' }}>{error}</div>}

      {!room ? (
        <div style={{ maxWidth: 400, margin: '4rem auto', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--gold)', marginBottom: '2rem' }}>Truc Valencià</h2>
          <button className="btn btn-primary btn-full" onClick={handleCreate} disabled={loading}>
            {loading ? '...' : t('lobby.createRoom')}
          </button>
        </div>
      ) : (
        <div className="lobby-content">
          <div className="card-panel">
            <h2>{t('lobby.playersInRoom')}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {t('lobby.waitingPlayers', { count: players.length })}
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
                        {p.userId === user?.id && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({t('lobby.you')})</span>}
                        <span className={`team-badge team-${p.team}`}>
                          {t(`lobby.team${p.team}`)}
                        </span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Esperant...</span>
                    )}
                  </li>
                );
              })}
            </ul>

            {canStart && (
              <button className="btn btn-gold btn-full" style={{ marginTop: '1.5rem' }} onClick={handleStart}>
                {t('lobby.startGame')}
              </button>
            )}
            {players.length < 4 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '1rem', textAlign: 'center' }}>
                {t('lobby.waitingPlayers', { count: players.length })}
              </p>
            )}
          </div>

          <div className="card-panel">
            <h2>{t('lobby.inviteLink')}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              {t('lobby.roomCode')}: <strong style={{ color: 'var(--gold)' }}>{room.code}</strong>
            </p>
            <div className="invite-box">
              <input readOnly value={room.inviteUrl} />
              <button className="btn btn-secondary" onClick={copyLink}>
                {copied ? t('lobby.linkCopied') : t('lobby.copyLink')}
              </button>
            </div>

            <h2 style={{ marginTop: '1.5rem' }}>{t('lobby.inviteByEmail')}</h2>
            {inviteSent && <div className="success-msg">Invitacions enviades!</div>}
            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <textarea
                className="form-control"
                placeholder={t('lobby.emailPlaceholder')}
                value={inviteEmails}
                onChange={(e) => setInviteEmails(e.target.value)}
              />
            </div>
            <button className="btn btn-primary" onClick={handleInvite} disabled={loading || !inviteEmails.trim()}>
              {loading ? '...' : t('lobby.sendInvites')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
