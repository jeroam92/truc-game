import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../services/api';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await authApi.forgotPassword(email);
      setMsg(data.message);
    } catch {
      setMsg('Error enviant el correu');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <h1>{t('app.title')}</h1>
        </div>
        <h2 style={{ color: 'var(--gold)', marginBottom: '1rem', fontSize: '1.1rem' }}>{t('auth.resetPassword')}</h2>
        {msg && <div className="success-msg">{msg}</div>}
        {!msg && (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>{t('auth.email')}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
              {loading ? '...' : t('auth.sendReset')}
            </button>
          </form>
        )}
        <div className="auth-links">
          <Link to="/login">{t('auth.login')}</Link>
        </div>
      </div>
    </div>
  );
}
