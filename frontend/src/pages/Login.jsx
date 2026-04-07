import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { t } from '../i18n';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { username, password });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('role', res.data.role);
      localStorage.setItem('username', res.data.username);
      onLogin(res.data);
      navigate('/admin');
    } catch {
      setError(t('loginError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="monogram-large">R&L</div>
        <h1>{t('loginTitle')}</h1>
        <p>{t('loginSubtitle')}</p>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">{t('username')}</label>
            <input
              className="input-field"
              style={{ width: '100%' }}
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">{t('password')}</label>
            <input
              className="input-field"
              style={{ width: '100%' }}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? '...' : t('loginButton')}
          </button>
        </form>
      </div>
    </div>
  );
}
