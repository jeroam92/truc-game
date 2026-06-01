import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authApi } from '../services/api';

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z]).{8,}$/;

export default function ResetPassword() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!PASSWORD_RE.test(form.password)) return setError(t('auth.passwordHint'));
    if (form.password !== form.confirm) return setError(t('auth.passwordMismatch'));
    setLoading(true);
    try {
      await authApi.resetPassword({ token, password: form.password });
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.error || 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo"><h1>{t('app.title')}</h1></div>
        <h2 style={{ color: 'var(--gold)', marginBottom: '1rem', fontSize: '1.1rem' }}>{t('auth.newPassword')}</h2>
        {error && <div className="error-msg">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t('auth.newPassword')}</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <span className="hint">{t('auth.passwordHint')}</span>
          </div>
          <div className="form-group">
            <label>{t('auth.confirmPassword')}</label>
            <input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} required />
          </div>
          <button className="btn btn-primary btn-full" type="submit" disabled={loading || !token}>
            {loading ? '...' : t('auth.resetPassword')}
          </button>
        </form>
      </div>
    </div>
  );
}
