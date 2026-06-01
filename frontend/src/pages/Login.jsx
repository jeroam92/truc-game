import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../services/api';
import LangToggle from '../components/LangToggle';

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await authApi.login(form);
      login(data.user, data.token);
      navigate('/lobby');
    } catch (err) {
      setError(err.response?.data?.error || 'Error de connexió');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div style={{ position: 'absolute', top: '1rem', right: '1rem' }}>
          <LangToggle />
        </div>
        <div className="auth-logo">
          <h1>{t('app.title')}</h1>
          <p>{t('app.subtitle')}</p>
        </div>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t('auth.email')}</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label>{t('auth.password')}</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              autoComplete="current-password"
            />
          </div>
          <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? '...' : t('auth.login')}
          </button>
        </form>
        <div className="auth-links">
          <Link to="/forgot-password" style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.75rem', fontSize: '0.85rem' }}>
            {t('auth.forgotPassword')}
          </Link>
          <span style={{ marginTop: '0.75rem', display: 'block' }}>
            {t('auth.noAccount')}
            <Link to="/register">{t('auth.register')}</Link>
          </span>
        </div>
      </div>
    </div>
  );
}
