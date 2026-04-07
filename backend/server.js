require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Fotos vom Railway Volume
const uploadPath = process.env.UPLOAD_PATH || './uploads';
app.use('/uploads', express.static(uploadPath));

// API Routen
app.use('/api/auth', require('./routes/auth'));
app.use('/api/stones', require('./routes/stones'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// React Frontend ausliefern
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

// SPA Fallback – alle anderen Routen → index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

const start = async () => {
  await initDB();
  app.listen(PORT, () => {
    console.log(`🪨 Wandersteine läuft auf Port ${PORT}`);
  });
};

start().catch(console.error);
