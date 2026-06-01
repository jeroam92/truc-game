import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../services/api';
import LangToggle from '../components/LangToggle';

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z]).{8,}$/;

export default function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!PASSWORD_RE.test(form.password)) {
      return setError(t('auth.passwordHint'));
    }
    if (form.password !== form.confirm) {
      return setError(t('auth.passwordMismatch'));
    }
    setLoading(true);
    try {
      await authApi.register({ username: form.username, email: form.email, password: form.password });
      setSuccess(t('auth.verifyEmailSent'));
      setTimeout(() => navigate('/login'), 3000);
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
        {success && <div className="success-msg">{success}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t('auth.username')}</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              required minLength={3} maxLength={50}
            />
          </div>
          <div className="form-group">
            <label>{t('auth.email')}</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>{t('auth.password')}</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <span className="hint">{t('auth.passwordHint')}</span>
          </div>
          <div className="form-group">
            <label>{t('auth.confirmPassword')}</label>
            <input
              type="password"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              required
            />
          </div>
          <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? '...' : t('auth.register')}
          </button>
        </form>
        <div className="auth-links">
          {t('auth.hasAccount')} <Link to="/login">{t('auth.login')}</Link>
        </div>
      </div>
    </div>
  );
}
