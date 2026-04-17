import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const DB_TYPE = 'mysql';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Admin secret – set ADMIN_SECRET in your .env
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'et-admin-2024';

// ── Helpers ──────────────────────────────────────────────────────────────────
const hashPassword = (pw) => {
  const salt = process.env.PASSWORD_SALT || 'et-caffeine-salt-2024';
  return crypto.pbkdf2Sync(pw, salt, 100000, 64, 'sha512').toString('hex');
};

const createTransporter = (cfg) =>
  nodemailer.createTransport({
    host:   cfg.host,
    port:   cfg.port,
    secure: cfg.secure,
    auth:   { user: cfg.auth.user, pass: cfg.auth.pass },
    tls:    { rejectUnauthorized: false },
  });

// ── Admin middleware ──────────────────────────────────────────────────────────
const requireAdmin = (req, res, next) => {
  if (req.headers['x-admin-secret'] !== ADMIN_SECRET)
    return res.status(401).json({ error: 'Nicht autorisiert.' });
  next();
};

const CONTAINER_START = new Date(Date.now() - process.uptime() * 1000);

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

// MySQL Pool (single storage backend)
let pool = null;

const validateDbConfig = () => {
  const host = process.env.MYSQL_HOST || 'localhost';
  const user = process.env.MYSQL_USER || 'root';
  const password = process.env.MYSQL_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || 'caffeine_tracker';
  const port = Number(process.env.MYSQL_PORT || 3306);

  console.log(`[DB] 📋 Konfiguration:`);
  console.log(`     Host:     ${host}`);
  console.log(`     Port:     ${port}`);
  console.log(`     User:     ${user}`);
  console.log(`     Database: ${database}`);
  console.log(`     Password: ${password ? '(gesetzt)' : '(LEER!)'}`);

  // Warning if using localhost in Docker
  if (host === 'localhost' || host === '127.0.0.1') {
    console.warn(`[⚠️  WARNING] Host ist "${host}" - in Docker funktioniert das NICHT!`);
    console.warn(`     In Docker: setze MYSQL_HOST auf den Service-Namen (z.B. "mysql")`);
    console.warn(`     Lokal: MYSQL_HOST=localhost ist ok`);
  }

  if (!password) {
    throw new Error(
      '[DB] MYSQL_PASSWORD fehlt oder ist leer. Setze MYSQL_PASSWORD in deiner .env/.env.local oder in docker-compose.yml.'
    );
  }
};

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
      dateStrings: true,
    });
  }
  return pool;
};

const mapSmtpRowToConfig = (row) => {
  if (!row) return null;
  return {
    host: row.host || '',
    port: Number(row.port || 587),
    secure: !!row.secure,
    auth: {
      user: row.auth_user || '',
      pass: row.auth_pass || '',
    },
    fromName: row.from_name || 'Koffein-Tracker',
    fromEmail: row.from_email || row.auth_user || '',
    baseUrl: row.base_url || '',
    registrationEnabled: row.registration_enabled !== 0,
    demoEnabled: row.demo_enabled !== 0,
  };
};

const loadSmtpConfig = async () => {
  const dbPool = getPool();
  const [rows] = await dbPool.execute(
    'SELECT * FROM smtp_settings WHERE id = 1 LIMIT 1'
  );
  return mapSmtpRowToConfig(rows[0] || null);
};

const saveSmtpConfig = async (cfg) => {
  const dbPool = getPool();
  await dbPool.execute(
    `INSERT INTO smtp_settings
      (id, host, port, secure, auth_user, auth_pass, from_name, from_email, base_url, registration_enabled, demo_enabled)
     VALUES
      (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      host = VALUES(host),
      port = VALUES(port),
      secure = VALUES(secure),
      auth_user = VALUES(auth_user),
      auth_pass = VALUES(auth_pass),
      from_name = VALUES(from_name),
      from_email = VALUES(from_email),
      base_url = VALUES(base_url),
      registration_enabled = VALUES(registration_enabled),
      demo_enabled = VALUES(demo_enabled)`
    , [
      cfg.host,
      Number(cfg.port),
      !!cfg.secure,
      cfg.auth?.user || '',
      cfg.auth?.pass || '',
      cfg.fromName || 'Koffein-Tracker',
      cfg.fromEmail || cfg.auth?.user || '',
      cfg.baseUrl || '',
      cfg.registrationEnabled !== false,
      cfg.demoEnabled !== false,
    ]
  );
};

const initDb = async () => {
  const MAX_RETRIES = 10;
  const RETRY_DELAY_MS = 5000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[DB] 🗄️  Verbinde zu MySQL... (Versuch ${attempt}/${MAX_RETRIES})`);
    const dbPool = getPool();

    try {
      const createLogsTableQuery = `
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

      const createUsersTableQuery = `
        CREATE TABLE IF NOT EXISTS users (
          id CHAR(36) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(32) NOT NULL DEFAULT 'user',
          verified BOOLEAN NOT NULL DEFAULT false,
          verify_token VARCHAR(255) NULL,
          verify_token_expiry BIGINT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_login TIMESTAMP NULL DEFAULT NULL,
          INDEX idx_users_email (email),
          INDEX idx_users_verify_token (verify_token)
        )
      `;

      const createSmtpTableQuery = `
        CREATE TABLE IF NOT EXISTS smtp_settings (
          id TINYINT PRIMARY KEY,
          host VARCHAR(255) NULL,
          port INT NOT NULL DEFAULT 587,
          secure BOOLEAN NOT NULL DEFAULT false,
          auth_user VARCHAR(255) NULL,
          auth_pass VARCHAR(512) NULL,
          from_name VARCHAR(255) NOT NULL DEFAULT 'Koffein-Tracker',
          from_email VARCHAR(255) NULL,
          base_url VARCHAR(512) NOT NULL DEFAULT '',
          registration_enabled BOOLEAN NOT NULL DEFAULT true,
          demo_enabled BOOLEAN NOT NULL DEFAULT true,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `;

      await dbPool.execute(createLogsTableQuery);
      await dbPool.execute(createUsersTableQuery);
      await dbPool.execute(createSmtpTableQuery);
      console.log('[DB] ✓ Verbindung erfolgreich');
      return; // success — exit the retry loop
    } catch (error) {
      const isLastAttempt = attempt === MAX_RETRIES;
      console.error(
        `[DB] ✗ Verbindung fehlgeschlagen (Versuch ${attempt}/${MAX_RETRIES}): ${error.message}`
      );
      if (isLastAttempt) throw error;
      console.log(`[DB] ⏳ Nächster Versuch in ${RETRY_DELAY_MS / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      // Reset pool so next attempt opens a fresh connection
      pool = null;
    }
  }
};

app.get('/api/health', async (req, res) => {
  res.json({ status: 'ok', db_type: DB_TYPE });
});

app.get('/api/version', async (req, res) => {
  res.json({ version: appVersion });
});

// ── Docker Hub update check ───────────────────────────────────────────────
const DOCKER_IMAGE = 'derminecrafter2020/koffein-tracker';

app.get('/api/update/check', requireAdmin, async (req, res) => {
  try {
    const r = await fetch(
      `https://hub.docker.com/v2/repositories/${DOCKER_IMAGE}/tags/latest`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
    );
    if (!r.ok) return res.status(502).json({ error: 'Docker Hub nicht erreichbar.' });
    const data = await r.json();
    const hubUpdated      = new Date(data.last_updated);
    const updateAvailable = hubUpdated > CONTAINER_START;
    res.json({
      currentVersion:       appVersion,
      containerStartedAt:   CONTAINER_START.toISOString(),
      dockerHubLastUpdated: data.last_updated,
      updateAvailable,
      // Watchtower checks every hour automatically
      watcherInterval:      3600,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/logs', async (req, res) => {
  try {
    const date = req.query.date;
    if (!date) {
      return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    }

    const dbPool = getPool();
    const [rows] = await dbPool.execute(
      'SELECT * FROM caffeine_logs WHERE date = ? ORDER BY createdAt DESC',
      [date]
    );
    res.json(rows);
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
  } catch (err) {
    console.error('POST /api/logs error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/logs/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const dbPool = getPool();
    await dbPool.execute('DELETE FROM caffeine_logs WHERE id = ?', [id]);

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/logs error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── SMTP Admin Routes ─────────────────────────────────────────────────────────
app.get('/api/admin/smtp', requireAdmin, async (req, res) => {
  try {
    const cfg = await loadSmtpConfig();
    if (!cfg) return res.json(null);
    // Mask password before sending to client
    res.json({ ...cfg, auth: { ...cfg.auth, pass: cfg.auth.pass ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : '' } });
  } catch (err) {
    console.error('GET /api/admin/smtp error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/admin/smtp', requireAdmin, async (req, res) => {
  const { host, port, secure, auth, fromName, fromEmail, baseUrl, registrationEnabled, demoEnabled } = req.body || {};
  if (!host || !port || !auth?.user)
    return res.status(400).json({ error: 'Host, Port und Benutzername sind erforderlich.' });

  try {
    const prev = await loadSmtpConfig();
    await saveSmtpConfig({
      host,
      port: Number(port),
      secure: !!secure,
      auth: {
        user: auth.user,
        // Keep existing password when client sends the masked placeholder
        pass: auth.pass === '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' ? (prev?.auth?.pass || '') : auth.pass,
      },
      fromName: fromName || 'Koffein-Tracker',
      fromEmail: fromEmail || auth.user,
      baseUrl: baseUrl || '',
      registrationEnabled: registrationEnabled !== false,
      demoEnabled: demoEnabled !== false,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/smtp error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/admin/smtp/test', requireAdmin, async (req, res) => {
  const { testEmail } = req.body || {};
  const cfg = await loadSmtpConfig();
  if (!cfg)       return res.status(400).json({ error: 'Kein SMTP konfiguriert.' });
  if (!testEmail) return res.status(400).json({ error: 'Ziel-E-Mail fehlt.' });
  try {
    const t = createTransporter(cfg);
    await t.verify();
    await t.sendMail({
      from:    `"${cfg.fromName}" <${cfg.fromEmail}>`,
      to:      testEmail,
      subject: 'Koffein-Tracker \u2013 SMTP Test \u2713',
      html:    '<p>SMTP-Server ist korrekt konfiguriert. Diese E-Mail best\u00e4tigt die Verbindung.</p>',
    });
    res.json({ success: true, message: `Test-E-Mail an ${testEmail} gesendet.` });
  } catch (err) {
    res.status(500).json({ error: `SMTP-Fehler: ${err.message}` });
  }
});

// ── User Management Routes ────────────────────────────────────────────────────
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const dbPool = getPool();
    const [rows] = await dbPool.execute(
      `SELECT
        id,
        name,
        email,
        role,
        verified,
        created_at AS createdAt,
        last_login AS lastLogin
       FROM users
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /api/admin/users error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/admin/users/:id/verify', requireAdmin, async (req, res) => {
  try {
    const dbPool = getPool();
    const [result] = await dbPool.execute(
      'UPDATE users SET verified = true, verify_token = NULL, verify_token_expiry = NULL WHERE id = ?',
      [req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/users/:id/verify error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const dbPool = getPool();
    const [result] = await dbPool.execute(
      'DELETE FROM users WHERE id = ?',
      [req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/admin/users/:id error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
  const { role } = req.body || {};
  if (!role || !['admin', 'user'].includes(role))
    return res.status(400).json({ error: 'Rolle muss "admin" oder "user" sein.' });
  try {
    const dbPool = getPool();
    const [result] = await dbPool.execute(
      'UPDATE users SET role = ? WHERE id = ?',
      [role, req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/admin/users/:id/role error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Public settings (no auth required) ────────────────────────────────────────
app.get('/api/settings/public', async (req, res) => {
  try {
    const cfg = await loadSmtpConfig();
    res.json({
      demoEnabled: cfg?.demoEnabled !== false,
      registrationEnabled: cfg?.registrationEnabled !== false,
    });
  } catch (err) {
    console.error('GET /api/settings/public error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Public Registration & Login ───────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  const cfg = await loadSmtpConfig();
  if (!cfg?.registrationEnabled)
    return res.status(403).json({ error: 'Registrierung ist aktuell deaktiviert. Bitte wende dich an den Administrator.' });

  const { name, email, password } = req.body || {};
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, E-Mail und Passwort sind erforderlich.' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen lang sein.' });

  const dbPool = getPool();
  const lowerEmail = email.toLowerCase();

  const [existing] = await dbPool.execute(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [lowerEmail]
  );
  if (existing.length > 0)
    return res.status(409).json({ error: 'Diese E-Mail-Adresse ist bereits registriert.' });

  const verifyToken  = crypto.randomBytes(32).toString('hex');
  const newUserId = crypto.randomUUID();
  await dbPool.execute(
    `INSERT INTO users
      (id, name, email, password_hash, role, verified, verify_token, verify_token_expiry)
     VALUES (?, ?, ?, ?, 'user', false, ?, ?)`
    , [
      newUserId,
      name,
      lowerEmail,
      hashPassword(password),
      verifyToken,
      Date.now() + 24 * 60 * 60 * 1000,
    ]
  );

  try {
    const t        = createTransporter(cfg);
    const base     = (cfg.baseUrl || `http://localhost:${PORT}`).replace(/\/$/, '');
    const link     = `${base}/api/verify/${verifyToken}`;
    await t.sendMail({
      from:    `"${cfg.fromName}" <${cfg.fromEmail}>`,
      to:      email,
      subject: 'Koffein-Tracker \u2013 E-Mail-Adresse best\u00e4tigen',
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#3B82F6">Willkommen, ${name}!</h2>
          <p>Bitte best\u00e4tige deine E-Mail-Adresse um dein Konto zu aktivieren:</p>
          <a href="${link}" style="display:inline-block;padding:12px 24px;background:#3B82F6;
            color:#fff;text-decoration:none;border-radius:8px;margin:16px 0;font-weight:bold">
            E-Mail best\u00e4tigen
          </a>
          <p style="color:#94a3b8;font-size:12px">Dieser Link ist 24 Stunden g\u00fcltig.<br>
          Falls du dich nicht registriert hast, ignoriere diese E-Mail.</p>
        </div>`,
    });
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('[Register] E-Mail konnte nicht gesendet werden:', err.message);
    res.status(201).json({ success: true, emailWarning: `Konto erstellt, Verifizierungs-E-Mail fehlgeschlagen: ${err.message}` });
  }
});

app.get('/api/verify/:token', async (req, res) => {
  try {
    const dbPool = getPool();
    const [rows] = await dbPool.execute(
      `SELECT id, verify_token_expiry AS verifyTokenExpiry
       FROM users
       WHERE verify_token = ?
       LIMIT 1`,
      [req.params.token]
    );
    const user = rows[0];
    if (!user) return res.redirect('/?verified=invalid');
    if (Date.now() > Number(user.verifyTokenExpiry || 0))
      return res.redirect('/?verified=expired');

    await dbPool.execute(
      'UPDATE users SET verified = true, verify_token = NULL, verify_token_expiry = NULL WHERE id = ?',
      [user.id]
    );
    res.redirect('/?verified=1');
  } catch (err) {
    console.error('GET /api/verify/:token error:', err);
    res.redirect('/?verified=invalid');
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: 'E-Mail und Passwort erforderlich.' });

  try {
    const dbPool = getPool();
    const [rows] = await dbPool.execute(
      `SELECT
        id,
        name,
        email,
        role,
        verified,
        password_hash AS passwordHash
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email.toLowerCase()]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Ung\u00fcltige Zugangsdaten.' });
    if (!user.verified)
      return res.status(403).json({ error: 'E-Mail-Adresse noch nicht best\u00e4tigt. Bitte pr\u00fcfe dein Postfach.' });
    if (user.passwordHash !== hashPassword(password))
      return res.status(401).json({ error: 'Ung\u00fcltige Zugangsdaten.' });

    await dbPool.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('POST /api/login error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ── Startup Validation ────────────────────────────────────────────────────
validateDbConfig();

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
