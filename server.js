import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const DB_TYPE = process.env.DB_TYPE || 'mysql';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJsonPath = path.join(__dirname, 'package.json');
let appVersion = 'unknown';

try {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  appVersion = pkg.version || 'unknown';
} catch (err) {
  console.error('Konnte package.json nicht lesen:', err);
}

const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

// Static Frontend
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// In-Memory Datenspeicher für lokalen Betrieb
let logsData = {};

// MySQL Pool - nur wenn MySQL genutzt wird
let pool = null;

const getPool = () => {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST || 'localhost',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'caffeine_tracker',
      port: Number(process.env.MYSQL_PORT || 3306),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
};

const initDb = async () => {
  if (DB_TYPE !== 'mysql') {
    console.log(`[DB] 📝 Betrieb im Speicher-Modus (DB_TYPE: ${DB_TYPE})`);
    return;
  }

  console.log(`[DB] 🗄️  Verbinde zu MySQL...`);
  
  const dbPool = getPool();

  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS caffeine_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        size INT NOT NULL,
        caffeine INT NOT NULL,
        caffeinePerMl FLOAT NULL,
        icon VARCHAR(16) NULL,
        isPreset BOOLEAN DEFAULT false,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        date DATE NOT NULL
      )
    `;

    await dbPool.execute(createTableQuery);
    console.log('[DB] ✓ Verbindung erfolgreich');
  } catch (error) {
    console.error('[DB] ✗ Verbindung fehlgeschlagen:', error.message);
    throw error;
  }
};

app.get('/api/health', async (req, res) => {
  res.json({ status: 'ok', db_type: DB_TYPE });
});

app.get('/api/version', async (req, res) => {
  res.json({ version: appVersion });
});

app.get('/api/logs', async (req, res) => {
  try {
    const date = req.query.date;
    if (!date) {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    }

    if (DB_TYPE === 'mysql') {
      const dbPool = getPool();
      const [rows] = await dbPool.execute(
        'SELECT * FROM caffeine_logs WHERE date = ? ORDER BY createdAt DESC',
        [date]
      );
      res.json(rows);
    } else {
      // Lokales Speicher-System
      res.json(logsData[date] || []);
    }
  } catch (err) {
    console.error('GET /api/logs error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/logs', async (req, res) => {
  try {
    const { name, size, caffeine, caffeinePerMl, icon, isPreset, date } = req.body || {};
    if (!name || !size || !caffeine) {
      return res.status(400).json({ error: 'name, size, caffeine are required' });
    }

    const safeDate = date || new Date().toISOString().split('T')[0];

    if (DB_TYPE === 'mysql') {
      const dbPool = getPool();
      const [result] = await dbPool.execute(
        `INSERT INTO caffeine_logs (name, size, caffeine, caffeinePerMl, icon, isPreset, date)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
        , [name, size, caffeine, caffeinePerMl ?? null, icon ?? null, !!isPreset, safeDate]
      );

      const insertedId = result.insertId;
      const [rows] = await dbPool.execute(
        'SELECT * FROM caffeine_logs WHERE id = ?',
        [insertedId]
      );

      res.status(201).json(rows[0]);
    } else {
      // Lokales Speicher-System
      if (!logsData[safeDate]) {
        logsData[safeDate] = [];
      }

      const newEntry = {
        id: Date.now(),
        name,
        size,
        caffeine,
        caffeinePerMl: caffeinePerMl ?? null,
        icon: icon ?? null,
        isPreset: !!isPreset,
        date: safeDate,
        createdAt: new Date().toISOString()
      };

      logsData[safeDate].push(newEntry);
      res.status(201).json(newEntry);
    }
  } catch (err) {
    console.error('POST /api/logs error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/logs/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (DB_TYPE === 'mysql') {
      const dbPool = getPool();
      await dbPool.execute('DELETE FROM caffeine_logs WHERE id = ?', [id]);
    } else {
      // Lokales Speicher-System
      for (const date in logsData) {
        logsData[date] = logsData[date].filter(entry => entry.id !== Number(id));
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/logs error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 API server running on http://localhost:${PORT}`);
      console.log(`📦 DB Type: ${DB_TYPE}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize server:', err);
    process.exit(1);
  });
