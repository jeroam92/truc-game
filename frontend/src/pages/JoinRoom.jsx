import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { roomApi } from '../services/api';

export default function JoinRoom() {
  const { inviteToken } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('joining');
  const [error, setError] = useState('');

  useEffect(() => {
    roomApi.join(inviteToken)
      .then(({ data }) => {
        navigate(`/game/${data.roomId}`);
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'Error unint-se a la sala');
        setStatus('error');
      });
  }, [inviteToken, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <h1 style={{ color: 'var(--gold)', marginBottom: '1rem' }}>Truc Valencià</h1>
        {status === 'joining' && <p style={{ color: 'var(--text-muted)' }}>Unint-se a la sala...</p>}
        {status === 'error' && <div className="error-msg">{error}</div>}
      </div>
    </div>
  );
}
