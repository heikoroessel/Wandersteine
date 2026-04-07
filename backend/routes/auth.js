const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ token, role: user.role, username: user.username });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/setup – nur einmal ausführbar
router.post('/setup', async (req, res) => {
  try {
    const count = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(count.rows[0].count) > 0) {
      return res.status(403).json({ error: 'Setup already done' });
    }
    const { adminPassword, viewerPassword } = req.body;
    const adminHash = await bcrypt.hash(adminPassword, 10);
    const viewerHash = await bcrypt.hash(viewerPassword, 10);
    await pool.query(
      `INSERT INTO users (username, password_hash, role) VALUES ('admin', $1, 'admin'), ('rieke-leo', $2, 'viewer')`,
      [adminHash, viewerHash]
    );
    res.json({ success: true, message: 'Users created: admin and rieke-leo' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
