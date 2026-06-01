import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../services/api';

export default function VerifyEmail() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [status, setStatus] = useState('loading');
  const token = params.get('token');

  useEffect(() => {
    if (!token) { setStatus('error'); return; }
    authApi.verifyEmail(token)
      .then(() => setStatus('ok'))
      .catch(() => setStatus('error'));
  }, [token]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="auth-logo"><h1>{t('app.title')}</h1></div>
        {status === 'loading' && <p style={{ color: 'var(--text-muted)' }}>Verificant...</p>}
        {status === 'ok' && (
          <>
            <div className="success-msg">Compte verificat correctament!</div>
            <Link to="/login" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>
              {t('auth.login')}
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="error-msg">Token invàlid o caducat</div>
            <Link to="/login" className="btn btn-secondary" style={{ marginTop: '1rem', display: 'inline-block' }}>
              {t('auth.login')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
