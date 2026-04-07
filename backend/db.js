const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const initDB = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS stones (
        id SERIAL PRIMARY KEY,
        number INTEGER UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'inactive',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS entries (
        id SERIAL PRIMARY KEY,
        stone_number INTEGER NOT NULL REFERENCES stones(number),
        name VARCHAR(255) NOT NULL,
        message TEXT,
        location_name VARCHAR(255),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS entry_photos (
        id SERIAL PRIMARY KEY,
        entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'viewer',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Steine 1-100 anlegen falls nicht vorhanden
    for (let i = 1; i <= 100; i++) {
      await client.query(
        `INSERT INTO stones (number, status) VALUES ($1, 'inactive') ON CONFLICT (number) DO NOTHING`,
        [i]
      );
    }

    console.log('✅ Datenbank initialisiert mit 100 Steinen');
  } finally {
    client.release();
  }
};

module.exports = { pool, initDB };
