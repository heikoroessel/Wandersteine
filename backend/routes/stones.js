const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Multer config for Railway Volume
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_PATH || './uploads';
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  }
});

// --- Geocoding -------------------------------------------------------------
// Turn a typed place name (e.g. "Café am Marktplatz, Wien") into coordinates
// using OpenStreetMap's free Nominatim service. Fully defensive: any failure
// (not found, service down, timeout) simply returns null so that saving an
// entry NEVER depends on geocoding succeeding.
async function geocode(placeName) {
  if (!placeName || !placeName.trim()) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q='
      + encodeURIComponent(placeName.trim());
    const resp = await fetch(url, {
      headers: {
        // Nominatim requires an identifying User-Agent
        'User-Agent': 'Wandersteine/1.0 (Hochzeits-App Rieke & Leo)'
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (Array.isArray(data) && data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (!Number.isNaN(lat) && !Number.isNaN(lon)) return { lat, lon };
    }
    return null;
  } catch (err) {
    console.error('Geocoding failed:', err && err.message);
    return null;
  }
}

// GET /api/stones/:number - Get stone with all entries
router.get('/:number', async (req, res) => {
  try {
    const { number } = req.params;
    const stoneResult = await pool.query(
      'SELECT * FROM stones WHERE number = $1', [number]
    );
    if (stoneResult.rows.length === 0) {
      return res.status(404).json({ error: 'Stone not found' });
    }

    const stone = stoneResult.rows[0];

    const entriesResult = await pool.query(
      `SELECT e.*, array_agg(ep.filename ORDER BY ep.id) as photos
       FROM entries e
       LEFT JOIN entry_photos ep ON e.id = ep.entry_id
       WHERE e.stone_number = $1
       GROUP BY e.id
       ORDER BY e.created_at ASC`,
      [number]
    );

    res.json({
      stone,
      entries: entriesResult.rows.map(e => ({
        ...e,
        photos: e.photos.filter(Boolean)
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/stones/:number/entries - Add new entry
router.post('/:number/entries', upload.array('photos', 5), async (req, res) => {
  const client = await pool.connect();
  try {
    const { number } = req.params;
    const { name, message, location_name, latitude, longitude } = req.body;

    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'At least one photo is required' });
    }
    if (!latitude && !location_name) {
      return res.status(400).json({ error: 'Location (GPS or name) is required' });
    }

    // Check stone exists
    const stoneResult = await client.query(
      'SELECT * FROM stones WHERE number = $1', [number]
    );
    if (stoneResult.rows.length === 0) {
      return res.status(404).json({ error: 'Stone not found' });
    }

    // Determine coordinates: prefer GPS from the browser; if none was sent
    // but a location name was typed, try to derive coordinates from it.
    // This happens BEFORE the DB transaction, and a failure just leaves the
    // coordinates empty — the entry is still saved either way.
    let lat = latitude ? parseFloat(latitude) : null;
    let lng = longitude ? parseFloat(longitude) : null;
    if (lat === null || Number.isNaN(lat)) lat = null;
    if (lng === null || Number.isNaN(lng)) lng = null;
    if (lat === null && location_name) {
      const geo = await geocode(location_name);
      if (geo) { lat = geo.lat; lng = geo.lon; }
    }

    await client.query('BEGIN');

    // Activate stone on first entry
    await client.query(
      `UPDATE stones SET status = 'active' WHERE number = $1 AND status = 'inactive'`,
      [number]
    );

    // Create entry
    const entryResult = await client.query(
      `INSERT INTO entries (stone_number, name, message, location_name, latitude, longitude)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [number, name, message || null, location_name || null, lat, lng]
    );

    const entry = entryResult.rows[0];

    // Process and save photos
    const uploadDir = process.env.UPLOAD_PATH || './uploads';
    for (const file of req.files) {
      // Resize image to max 1200px wide
      const resizedName = 'resized-' + file.filename;
      await sharp(file.path)
        .rotate() // auto-rotate based on EXIF
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(path.join(uploadDir, resizedName));
      fs.unlinkSync(file.path); // delete original

      await client.query(
        'INSERT INTO entry_photos (entry_id, filename) VALUES ($1, $2)',
        [entry.id, resizedName]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({ success: true, entry });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// GET /api/stones - All stones (admin/viewer)
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*,
        COUNT(e.id) as entry_count,
        MAX(e.created_at) as last_entry_at,
        (SELECT e2.location_name FROM entries e2 WHERE e2.stone_number = s.number ORDER BY e2.created_at DESC LIMIT 1) as last_location,
        (SELECT e2.latitude FROM entries e2 WHERE e2.stone_number = s.number ORDER BY e2.created_at DESC LIMIT 1) as last_lat,
        (SELECT e2.longitude FROM entries e2 WHERE e2.stone_number = s.number ORDER BY e2.created_at DESC LIMIT 1) as last_lng
      FROM stones s
      LEFT JOIN entries e ON s.number = e.stone_number
      GROUP BY s.id, s.number
      ORDER BY s.number ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/stones/backfill-coordinates - Fill in missing coordinates for
// existing entries by geocoding their typed location name (admin only).
// Additive and safe: only touches rows that currently have NO coordinates
// but DO have a location name. Never overwrites existing coordinates,
// never deletes anything. Throttled to respect Nominatim's ~1 req/sec limit.
router.post('/backfill-coordinates', authenticate, requireAdmin, async (req, res) => {
  try {
    const missing = await pool.query(
      `SELECT id, location_name FROM entries
       WHERE (latitude IS NULL OR longitude IS NULL)
         AND location_name IS NOT NULL
         AND location_name <> ''
       ORDER BY id ASC`
    );

    let updated = 0;
    const failedNames = [];

    for (const row of missing.rows) {
      const geo = await geocode(row.location_name);
      if (geo) {
        await pool.query(
          'UPDATE entries SET latitude = $1, longitude = $2 WHERE id = $3',
          [geo.lat, geo.lon, row.id]
        );
        updated++;
      } else {
        failedNames.push(row.location_name);
      }
      // Respect Nominatim usage policy: max ~1 request per second
      await new Promise(r => setTimeout(r, 1100));
    }

    res.json({
      success: true,
      total: missing.rows.length,
      updated,
      failed: failedNames.length,
      failedNames
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE entry (admin only)
router.delete('/entries/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM entries WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
