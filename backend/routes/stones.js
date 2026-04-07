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
      [number, name, message || null, location_name || null,
       latitude ? parseFloat(latitude) : null,
       longitude ? parseFloat(longitude) : null]
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
