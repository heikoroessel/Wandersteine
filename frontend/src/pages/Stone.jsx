import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { t } from '../i18n';

// Frontend und Backend auf derselben Domain → relative URL
const UPLOAD_BASE = '';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function StoneMap({ entries }) {
  const [MapComponents, setMapComponents] = useState(null);

  useEffect(() => {
    Promise.all([
      import('leaflet'),
      import('react-leaflet'),
      import('leaflet/dist/leaflet.css')
    ]).then(([L, RL]) => {
      delete L.default.Icon.Default.prototype._getIconUrl;
      L.default.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      setMapComponents(RL);
    });
  }, []);

  const coords = entries
    .filter(e => e.latitude && e.longitude)
    .map(e => [parseFloat(e.latitude), parseFloat(e.longitude)]);

  if (coords.length === 0 || !MapComponents) return null;

  const { MapContainer, TileLayer, Marker, Popup, Polyline } = MapComponents;
  const center = coords[coords.length - 1];

  return (
    <MapContainer center={center} zoom={5} className="map-container" scrollWheelZoom={false}>
      <TileLayer
        attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {coords.length > 1 && (
        <Polyline positions={coords} color="#6B7F5E" weight={2} opacity={0.7} dashArray="5, 5" />
      )}
      {entries.filter(e => e.latitude && e.longitude).map((entry) => (
        <Marker key={entry.id} position={[parseFloat(entry.latitude), parseFloat(entry.longitude)]}>
          <Popup>
            <strong>{entry.name}</strong><br />
            {entry.location_name || ''}<br />
            <small>{formatDate(entry.created_at)}</small>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

function EntryCard({ entry, isAdmin, onDelete, onUpdateCoords }) {
  const [lightbox, setLightbox] = useState(null);
  const photos = Array.isArray(entry.photos) ? entry.photos.filter(Boolean) : [];

  const [editing, setEditing] = useState(false);
  const [coordInput, setCoordInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [coordErr, setCoordErr] = useState('');

  const parseCoords = (str) => {
    const parts = str.split(',').map(s => s.trim());
    if (parts.length !== 2) return null;
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  };

  const startEdit = () => {
    setCoordInput(entry.latitude && entry.longitude ? `${entry.latitude}, ${entry.longitude}` : '');
    setCoordErr('');
    setEditing(true);
  };

  const saveCoords = async () => {
    const c = parseCoords(coordInput);
    if (!c) { setCoordErr('Bitte im Format "49.1234, 8.5678" eingeben.'); return; }
    setSaving(true); setCoordErr('');
    try {
      await onUpdateCoords(entry.id, c.lat, c.lng);
      setEditing(false);
    } catch {
      setCoordErr('Speichern fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  const removePin = async () => {
    setSaving(true); setCoordErr('');
    try {
      await onUpdateCoords(entry.id, null, null);
      setEditing(false);
    } catch {
      setCoordErr('Entfernen fehlgeschlagen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="entry-card">
      <div className="entry-header">
        <div className="entry-name">{entry.name}</div>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <div className="entry-date">{formatDate(entry.created_at)}</div>
          {isAdmin && (
            <button onClick={() => onDelete(entry.id)}
              style={{background:'none',border:'1px solid #FECACA',borderRadius:'4px',padding:'4px 8px',color:'#DC2626',cursor:'pointer',fontSize:'12px'}}
              title="Eintrag löschen">
              🗑 Löschen
            </button>
          )}
        </div>
      </div>
      {(entry.location_name || entry.latitude) && (
        <div className="entry-location">
          📍 {entry.location_name || `${parseFloat(entry.latitude).toFixed(4)}, ${parseFloat(entry.longitude).toFixed(4)}`}
        </div>
      )}

      {isAdmin && (
        <div style={{marginTop:8,fontSize:13}}>
          {!editing ? (
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',color:'var(--stone)'}}>
              <span>
                Koordinaten:{' '}
                {entry.latitude && entry.longitude
                  ? `${parseFloat(entry.latitude).toFixed(5)}, ${parseFloat(entry.longitude).toFixed(5)}`
                  : 'kein Pin'}
              </span>
              <button type="button" onClick={startEdit}
                style={{background:'none',border:'1px solid var(--sage-light)',borderRadius:4,padding:'2px 8px',color:'var(--sage-dark)',cursor:'pointer',fontSize:12}}>
                ✏️ Koordinaten bearbeiten
              </button>
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:6,maxWidth:380}}>
              <input type="text" value={coordInput} onChange={e=>setCoordInput(e.target.value)}
                placeholder="z.B. 49.1234, 8.5678 (aus Google Maps)"
                style={{padding:'8px 10px',border:'1px solid var(--sage-light)',borderRadius:4,fontSize:13,width:'100%'}} />
              {coordErr && <span style={{color:'#DC2626'}}>{coordErr}</span>}
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button type="button" disabled={saving} onClick={saveCoords}
                  style={{background:'var(--sage)',color:'var(--white)',border:'none',borderRadius:4,padding:'6px 12px',cursor:'pointer',fontSize:13}}>
                  {saving ? 'Speichern…' : 'Speichern'}
                </button>
                <button type="button" disabled={saving} onClick={removePin}
                  style={{background:'none',color:'#DC2626',border:'1px solid #FECACA',borderRadius:4,padding:'6px 12px',cursor:'pointer',fontSize:13}}>
                  Pin entfernen
                </button>
                <button type="button" disabled={saving} onClick={()=>{setEditing(false);setCoordErr('');}}
                  style={{background:'none',color:'var(--stone)',border:'1px solid var(--cream-dark)',borderRadius:4,padding:'6px 12px',cursor:'pointer',fontSize:13}}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {entry.message && <p className="entry-message">{entry.message}</p>}
      {photos.length > 0 && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,120px))',gap:'8px',marginTop:'16px'}}>
          {photos.map((photo, i) => (
            <img key={i} src={`${UPLOAD_BASE}/uploads/${photo}`} alt=""
              style={{width:'100%',aspectRatio:'1',objectFit:'cover',borderRadius:'2px',cursor:'pointer',imageOrientation:'from-image'}}
              onClick={() => setLightbox(`${UPLOAD_BASE}/uploads/${photo}`)} />
          ))}
        </div>
      )}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" />
        </div>
      )}
    </div>
  );
}

function AddEntryForm({ stoneNumber, onSuccess }) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [photos, setPhotos] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [rotations, setRotations] = useState([]);
  const [gpsStatus, setGpsStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef();

  const getGPS = () => {
    if (!navigator.geolocation) { setGpsStatus(t('gpsError')); return; }
    navigator.geolocation.getCurrentPosition(
      pos => { setLatitude(pos.coords.latitude.toString()); setLongitude(pos.coords.longitude.toString()); setGpsStatus(t('gpsSuccess')); },
      () => setGpsStatus(t('gpsError'))
    );
  };

  const handlePhotos = (e) => {
    const files = Array.from(e.target.files);
    setPhotos(prev => [...prev, ...files]);
    setRotations(prev => [...prev, ...files.map(() => 0)]);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setPreviews(prev => [...prev, ev.target.result]);
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const deletePhoto = (i) => {
    setPhotos(prev => prev.filter((_, idx) => idx !== i));
    setPreviews(prev => prev.filter((_, idx) => idx !== i));
    setRotations(prev => prev.filter((_, idx) => idx !== i));
  };

  const rotatePhoto = (i) => {
    setRotations(prev => prev.map((r, idx) => idx === i ? (r + 90) % 360 : r));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError(t('nameRequired'));
    if (photos.length === 0) return setError(t('photoRequired'));
    if (!latitude && !locationName.trim()) return setError(t('locationRequired'));
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      if (message) formData.append('message', message);
      if (locationName) formData.append('location_name', locationName);
      if (latitude) formData.append('latitude', latitude);
      if (longitude) formData.append('longitude', longitude);
      photos.forEach(p => formData.append('photos', p));
      await api.post(`/stones/${stoneNumber}/entries`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Error saving entry');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-entry-section">
      <div className="container">
        <div className="form-card">
          <h2>{t('addEntryTitle')}</h2>
          {error && <div className="error-msg">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">{t('fieldName')} <span className="required">*</span></label>
              <input className="input-field" style={{width:'100%'}} type="text" value={name} onChange={e=>setName(e.target.value)} placeholder={t('fieldNamePlaceholder')} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('fieldMessage')}</label>
              <textarea className="input-field" style={{width:'100%'}} value={message} onChange={e=>setMessage(e.target.value)} placeholder={t('fieldMessagePlaceholder')} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('fieldLocation')} <span className="required">*</span></label>
              <button type="button" className="gps-btn" onClick={getGPS}
                style={{
                  background:'var(--sage)',
                  color:'var(--white)',
                  border:'2px solid var(--sage-dark)',
                  borderRadius:'6px',
                  padding:'14px 18px',
                  fontSize:'16px',
                  fontWeight:600,
                  width:'100%',
                  cursor:'pointer',
                  boxShadow:'0 2px 8px rgba(74,89,64,0.28)'
                }}>
                {t('gpsButton')}
              </button>
              <p style={{
                fontSize:'13px',
                color:'var(--sage-dark)',
                marginTop:'8px',
                marginBottom:'0',
                lineHeight:'1.5'
              }}>
                {t('gpsHint')}
              </p>
              {gpsStatus && <p className="gps-status">{gpsStatus}</p>}
              <input className="input-field" style={{width:'100%',marginTop:'14px'}} type="text" value={locationName} onChange={e=>setLocationName(e.target.value)} placeholder={t('fieldLocationPlaceholder')} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('fieldPhotos')} <span className="required">*</span></label>
              <div className="photo-upload" onClick={() => fileRef.current.click()}>
                <input ref={fileRef} type="file" accept="image/*" multiple capture="environment" onChange={handlePhotos} />
                <div className="photo-upload-icon">📷</div>
                <p className="photo-upload-text">{previews.length > 0 ? '+ Weitere Fotos hinzufügen' : t('photoUploadText')}</p>
              </div>
              {previews.length > 0 && (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))',gap:'8px',marginTop:'12px'}}>
                  {previews.map((src, i) => (
                    <div key={i} style={{position:'relative'}}>
                      <img src={src} alt="" style={{width:'100%',aspectRatio:'1',objectFit:'cover',borderRadius:'2px',transform:`rotate(${rotations[i] || 0}deg)`,transition:'transform 0.2s'}} />
                      <div style={{position:'absolute',top:'4px',right:'4px',display:'flex',gap:'4px'}}>
                        <button type="button" onClick={() => rotatePhoto(i)}
                          style={{background:'rgba(0,0,0,0.5)',border:'none',borderRadius:'50%',width:'28px',height:'28px',color:'white',cursor:'pointer',fontSize:'14px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                          ↻
                        </button>
                        <button type="button" onClick={() => deletePhoto(i)}
                          style={{background:'rgba(200,0,0,0.6)',border:'none',borderRadius:'50%',width:'28px',height:'28px',color:'white',cursor:'pointer',fontSize:'14px',display:'flex',alignItems:'center',justifyContent:'center'}}>
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button type="submit" className="btn-primary" disabled={loading} style={{width:'100%'}}>
              {loading ? t('submitting') : t('submit')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function StonePage() {
  const { number } = useParams();
  const navigate = useNavigate();
  const [stone, setStone] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [success, setSuccess] = useState(false);

  const isAdmin = localStorage.getItem('role') === 'admin';

  const loadStone = async () => {
    try {
      const res = await api.get(`/stones/${number}`);
      setStone(res.data.stone);
      setEntries(res.data.entries || []);
    } catch (err) {
      setError('Stone not found');
    } finally {
      setLoading(false);
    }
  };

  const deleteEntry = async (entryId) => {
    if (!window.confirm('Eintrag wirklich löschen?')) return;
    try {
      await api.delete(`/stones/entries/${entryId}`);
      loadStone();
    } catch (err) {
      alert('Fehler beim Löschen');
    }
  };

  const updateCoords = async (entryId, latitude, longitude) => {
    await api.put(`/stones/entries/${entryId}/coordinates`, { latitude, longitude });
    await loadStone();
  };

  useEffect(() => { loadStone(); }, [number]);

  const handleSuccess = () => {
    setShowForm(false);
    setSuccess(true);
    loadStone();
    window.scrollTo(0, 0);
  };

  if (loading) return <div className="loading">...</div>;
  if (error || !stone) return (
    <div className="empty-state">
      <p>Stein #{number} nicht gefunden.</p>
      <button className="btn-secondary" onClick={() => navigate('/')} style={{marginTop:16}}>← Zurück</button>
    </div>
  );

  return (
    <div className="stone-page">
      <div className="stone-header">
        <div className="stone-number-badge">{number}</div>
        <h1>{t('stoneTitle')} #{number}</h1>
        <p className="stone-subtitle">
          {entries.length} {entries.length === 1 ? t('entry') : t('entries')}
          {' · '}
          <span className={`status-badge status-${stone.status || 'inactive'}`}>
            {stone.status === 'active' ? t('active') : t('inactive')}
          </span>
        </p>
      </div>

      {/* Explanation for stone finders */}
      <div style={{background:'var(--white)',borderBottom:'1px solid var(--cream-dark)',padding:'32px 24px',maxWidth:'680px',margin:'0 auto'}}>
        {t('stoneExplanation').split('\n\n').map((para, i) => (
          <p key={i} style={{fontSize:'15px',color:'var(--ink-light)',lineHeight:'1.8',marginBottom: i === 0 ? '16px' : '0'}}>
            {para}
          </p>
        ))}
      </div>

      {entries.length > 0 && <StoneMap entries={entries} />}

      {success && (
        <div style={{background:'var(--sage-muted)',padding:'20px 24px',textAlign:'center',borderBottom:'1px solid var(--sage-light)'}}>
          <p style={{color:'var(--sage-dark)',fontSize:'15px'}}>✓ {t('successMessage')}</p>
        </div>
      )}

      <div className="entries-section">
        <div className="container">
          <h2>{t('stoneHistory')}</h2>
          {entries.length === 0 ? (
            <div className="empty-state"><p>{t('stoneFirstEntry')}</p></div>
          ) : (
            entries.map(entry => <EntryCard key={entry.id} entry={entry} isAdmin={isAdmin} onDelete={deleteEntry} onUpdateCoords={updateCoords} />)
          )}
          {!showForm && (
            <div style={{textAlign:'center',marginTop:32}}>
              <button className="btn-primary" onClick={() => setShowForm(true)}>{t('addEntry')}</button>
            </div>
          )}
        </div>
      </div>

      {showForm && <AddEntryForm stoneNumber={number} onSuccess={handleSuccess} />}
    </div>
  );
}
