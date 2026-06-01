import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { roomApi } from '../services/api';
import LangToggle from '../components/LangToggle';

export default function Lobby() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setLoading(true);
    setError('');
    try {
      const { data } = await roomApi.create();
      navigate(`/room/${data.room.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Error creant la sala');
    } finally {
      setLoading(false);
    }
  }

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

      {error && <div className="error-msg" style={{ maxWidth: 400, margin: '0 auto 1rem' }}>{error}</div>}

      <div style={{ maxWidth: 400, margin: '4rem auto', textAlign: 'center' }}>
        <h2 style={{ color: 'var(--gold)', marginBottom: '0.75rem' }}>Truc Valencià</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.9rem' }}>
          Crea una sala i convida als teus amics per jugar.
        </p>
        <button className="btn btn-primary btn-full" onClick={handleCreate} disabled={loading}>
          {loading ? '...' : t('lobby.createRoom')}
        </button>
      </div>
    </div>
  );
}
