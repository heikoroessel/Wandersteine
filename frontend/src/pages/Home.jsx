import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n';

export default function Home() {
  const [number, setNumber] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    const n = parseInt(number);
    if (n >= 1 && n <= 100) {
      navigate(`/stein/${n}`);
    }
  };

  return (
    <div>
      <div className="hero">
        <div className="hero-script">Rieke & Leo</div>
        <h1>Wandersteine</h1>
        <p className="hero-sub">{t('tagline')}</p>
      </div>

      <div className="stone-input-section">
        <p className="section-label">{t('homeLabel')}</p>
        <h2 className="section-title">{t('homeTitle')}</h2>
        <form onSubmit={handleSubmit} className="stone-number-form">
          <input
            className="input-field"
            type="number"
            min="1"
            max="100"
            value={number}
            onChange={e => setNumber(e.target.value)}
            placeholder={t('homePlaceholder')}
            autoFocus
          />
          <button type="submit" className="btn-primary">
            {t('homeButton')}
          </button>
        </form>
      </div>
    </div>
  );
}
