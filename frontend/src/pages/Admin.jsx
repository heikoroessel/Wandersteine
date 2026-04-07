import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import api from '../api';
import { t } from '../i18n';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function Admin({ user, onLogout }) {
  const [stones, setStones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stoneDetails, setStoneDetails] = useState({});
  const navigate = useNavigate();

  useEffect(() => {
    loadStones();
  }, []);

  const loadStones = async () => {
    try {
      const res = await api.get('/stones');
      setStones(res.data);
    } catch (err) {
      if (err.response?.status === 401) {
        onLogout();
        navigate('/login');
      }
    } finally {
      setLoading(false);
    }
  };

  // Load paths for active stones (for map)
  useEffect(() => {
    const activeStones = stones.filter(s => s.status === 'active');
    activeStones.forEach(async (stone) => {
      if (!stoneDetails[stone.number]) {
        try {
          const res = await api.get(`/stones/${stone.number}`);
          setStoneDetails(prev => ({ ...prev, [stone.number]: res.data.entries }));
        } catch {}
      }
    });
  }, [stones]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    onLogout();
    navigate('/');
  };

  const activeCount = stones.filter(s => s.status === 'active').length;
  const totalEntries = stones.reduce((sum, s) => sum + parseInt(s.entry_count || 0), 0);

  // Build map paths
  const allPaths = Object.entries(stoneDetails).map(([num, entries]) => ({
    number: num,
    coords: entries
      .filter(e => e.latitude && e.longitude)
      .map(e => [parseFloat(e.latitude), parseFloat(e.longitude)])
  })).filter(p => p.coords.length > 0);

  const colors = ['#6B7F5E', '#8A9E7B', '#4A5940', '#9B9086', '#C4BDB5'];

  if (loading) return <div className="loading">...</div>;

  return (
    <div className="admin-page">
      <div className="admin-header">
        <h1>🪨 {t('adminTitle')}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{user?.username}</span>
          <button className="btn-secondary" onClick={handleLogout} style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}>
            {t('logout')}
          </button>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-number">80</div>
            <div className="stat-label">{t('allStones')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{activeCount}</div>
            <div className="stat-label">{t('activeStones')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{totalEntries}</div>
            <div className="stat-label">{t('totalEntries')}</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{80 - activeCount}</div>
            <div className="stat-label">{t('inactive')}</div>
          </div>
        </div>

        {/* World map */}
        {allPaths.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, marginBottom: 16 }}>
              {t('mapTitle')}
            </h2>
            <MapContainer center={[48, 10]} zoom={4} style={{ height: 400, borderRadius: 2 }} scrollWheelZoom={true}>
              <TileLayer
                attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {allPaths.map((path, i) => (
                <div key={path.number}>
                  {path.coords.length > 1 && (
                    <Polyline
                      positions={path.coords}
                      color={colors[i % colors.length]}
                      weight={2}
                      opacity={0.7}
                      dashArray="5,5"
                    />
                  )}
                  {path.coords.map((coord, j) => (
                    <Marker key={j} position={coord}>
                      <Popup>Stein #{path.number}</Popup>
                    </Marker>
                  ))}
                </div>
              ))}
            </MapContainer>
          </div>
        )}

        {/* Stones table */}
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 28, marginBottom: 16 }}>
          {t('allStones')}
        </h2>
        <div style={{ overflowX: 'auto' }}>
          <table className="stones-table">
            <thead>
              <tr>
                <th>{t('stoneNr')}</th>
                <th>{t('status')}</th>
                <th>{t('entriesCount')}</th>
                <th>{t('lastLocation')}</th>
                <th>{t('lastEntry')}</th>
              </tr>
            </thead>
            <tbody>
              {stones.map(stone => (
                <tr key={stone.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/stein/${stone.number}`)}>
                  <td>
                    <strong style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>
                      #{stone.number}
                    </strong>
                  </td>
                  <td>
                    <span className={`status-badge status-${stone.status}`}>
                      {stone.status === 'active' ? t('active') : t('inactive')}
                    </span>
                  </td>
                  <td>{stone.entry_count || 0}</td>
                  <td>{stone.last_location || '—'}</td>
                  <td>{formatDate(stone.last_entry_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
