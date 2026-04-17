import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const DB_TYPE = 'file-json';

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

// File DB (simple embedded storage)
const dataDir = path.join(__dirname, 'data');
const dbFile = process.env.DB_FILE || path.join(dataDir, 'database.json');

let dbState = {
  caffeine_logs: [],
  users: [],
  smtp_settings: null,
  reminders: [],
};

const ensureDbFile = () => {
  const dbDir = path.dirname(dbFile);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  if (!fs.existsSync(dbFile)) {
    fs.writeFileSync(dbFile, JSON.stringify(dbState, null, 2), 'utf8');
  }
};

const loadDbState = () => {
  ensureDbFile();
  const raw = fs.readFileSync(dbFile, 'utf8');
  let parsed = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch (err) {
    const backupPath = `${dbFile}.corrupt-${Date.now()}.bak`;
    fs.copyFileSync(dbFile, backupPath);
    console.error('[DB] JSON-Datei war defekt, Backup erstellt:', backupPath);
    parsed = {};
  }

  // Backward-compatible migration from older key names
  const legacyLogs = Array.isArray(parsed.logs) ? parsed.logs : [];
  const legacyUsers = Array.isArray(parsed.registered_users) ? parsed.registered_users : [];
  const legacySmtp = parsed.smtpConfig || null;

  dbState = {
    caffeine_logs: Array.isArray(parsed.caffeine_logs) ? parsed.caffeine_logs : legacyLogs,
    users: Array.isArray(parsed.users) ? parsed.users : legacyUsers,
    smtp_settings: parsed.smtp_settings || legacySmtp,
    reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
  };
};

const persistDbState = () => {
  ensureDbFile();
  const tmpPath = `${dbFile}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(dbState, null, 2), 'utf8');
  fs.renameSync(tmpPath, dbFile);
};

const makeResult = (affectedRows = 0, insertId = undefined) => {
  const result = { affectedRows };
  if (insertId !== undefined) result.insertId = insertId;
  return result;
};

class FileDbAdapter {
  async execute(sql, params = []) {
    // Reload each query so data remains consistent across restarts or multiple processes.
    loadDbState();

    const q = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();

    if (q.startsWith('create table if not exists')) {
      return [makeResult(0)];
    }

    if (q.startsWith('select * from smtp_settings where id = 1')) {
      return [dbState.smtp_settings ? [dbState.smtp_settings] : []];
    }

    if (q.startsWith('insert into smtp_settings')) {
      dbState.smtp_settings = {
        id: 1,
        host: params[0],
        port: Number(params[1]) || 587,
        secure: params[2] ? 1 : 0,
        auth_user: params[3] || '',
        auth_pass: params[4] || '',
        from_name: params[5] || 'Koffein-Tracker',
        from_email: params[6] || params[3] || '',
        base_url: params[7] || '',
        registration_enabled: params[8] ? 1 : 0,
        demo_enabled: params[9] ? 1 : 0,
        updated_at: new Date().toISOString(),
      };
      persistDbState();
      return [makeResult(1, 1)];
    }

    if (q.startsWith('select * from caffeine_logs where date = ?')) {
      const date = params[0];
      const rows = dbState.caffeine_logs
        .filter((r) => r.date === date)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return [rows];
    }

    if (q.startsWith('insert into caffeine_logs')) {
      const nextId = (dbState.caffeine_logs.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) || 0) + 1;
      const row = {
        id: nextId,
        name: params[0],
        size: Number(params[1]),
        caffeine: Number(params[2]),
        caffeinePerMl: params[3] ?? null,
        icon: params[4] ?? null,
        isPreset: !!params[5],
        date: params[6],
        createdAt: new Date().toISOString(),
      };
      dbState.caffeine_logs.push(row);
      persistDbState();
      return [makeResult(1, nextId)];
    }

    if (q.startsWith('select * from caffeine_logs where id = ?')) {
      const id = Number(params[0]);
      const rows = dbState.caffeine_logs.filter((r) => Number(r.id) === id);
      return [rows];
    }

    if (q.startsWith('delete from caffeine_logs where id = ?')) {
      const id = Number(params[0]);
      const before = dbState.caffeine_logs.length;
      dbState.caffeine_logs = dbState.caffeine_logs.filter((r) => Number(r.id) !== id);
      const affectedRows = before - dbState.caffeine_logs.length;
      if (affectedRows > 0) persistDbState();
      return [makeResult(affectedRows)];
    }

    if (q.includes('from users') && q.includes('order by created_at desc')) {
      const rows = [...dbState.users]
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        .map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          verified: !!u.verified,
          createdAt: u.created_at,
          lastLogin: u.last_login || null,
        }));
      return [rows];
    }

    if (q.startsWith('update users set verified = true')) {
      const id = params[0];
      const user = dbState.users.find((u) => u.id === id);
      if (!user) return [makeResult(0)];
      user.verified = true;
      user.verify_token = null;
      user.verify_token_expiry = null;
      persistDbState();
      return [makeResult(1)];
    }

    if (q.startsWith('delete from users where id = ?')) {
      const id = params[0];
      const before = dbState.users.length;
      dbState.users = dbState.users.filter((u) => u.id !== id);
      const affectedRows = before - dbState.users.length;
      if (affectedRows > 0) persistDbState();
      return [makeResult(affectedRows)];
    }

    if (q.startsWith('update users set role = ? where id = ?')) {
      const role = params[0];
      const id = params[1];
      const user = dbState.users.find((u) => u.id === id);
      if (!user) return [makeResult(0)];
      user.role = role;
      persistDbState();
      return [makeResult(1)];
    }

    if (q.startsWith('select id from users where email = ? limit 1')) {
      const email = String(params[0] || '').toLowerCase();
      const user = dbState.users.find((u) => u.email === email);
      return [user ? [{ id: user.id }] : []];
    }

    if (q.startsWith('insert into users')) {
      const row = {
        id: params[0],
        name: params[1],
        email: String(params[2] || '').toLowerCase(),
        password_hash: params[3],
        role: 'user',
        verified: false,
        verify_token: params[4],
        verify_token_expiry: params[5],
        created_at: new Date().toISOString(),
        last_login: null,
      };
      dbState.users.push(row);
      persistDbState();
      return [makeResult(1)];
    }

    if (q.includes('from users') && q.includes('where verify_token = ?')) {
      const token = params[0];
      const user = dbState.users.find((u) => u.verify_token === token);
      if (!user) return [[]];
      return [[{ id: user.id, verifyTokenExpiry: user.verify_token_expiry }]];
    }

    if (q.includes('from users') && q.includes('password_hash as passwordhash') && q.includes('where email = ?')) {
      const email = String(params[0] || '').toLowerCase();
      const user = dbState.users.find((u) => u.email === email);
      if (!user) return [[]];
      return [[{
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        verified: !!user.verified,
        passwordHash: user.password_hash,
      }]];
    }

    if (q.startsWith('update users set last_login = now() where id = ?')) {
      const id = params[0];
      const user = dbState.users.find((u) => u.id === id);
      if (!user) return [makeResult(0)];
      user.last_login = new Date().toISOString();
      persistDbState();
      return [makeResult(1)];
    }

    throw new Error(`Unsupported query in file DB adapter: ${sql}`);
  }
}

let pool = null;

const getPool = () => {
  if (!pool) {
    loadDbState();
    pool = new FileDbAdapter();
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
  console.log('[DB] 🗄️  Starte lokale Datei-Datenbank...');
  getPool();
  console.log(`[DB] ✓ Datei-Datenbank bereit: ${dbFile}`);
};

const getReminderOwnerKey = ({ userId, email }) => {
  if (userId) return `user:${userId}`;
  return `email:${String(email || '').toLowerCase().trim()}`;
};

const isValidReminderTime = (time) => /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(time || ''));

const sanitizeReminder = (reminder) => ({
  enabled: reminder.enabled !== false,
  time: isValidReminderTime(reminder.time) ? reminder.time : '18:00',
  mailEnabled: reminder.mailEnabled !== false,
  discordEnabled: !!reminder.discordEnabled,
  discordWebhook: reminder.discordWebhook || '',
  lastTriggeredDate: reminder.lastTriggeredDate || null,
});

const getReminderForUser = ({ userId, email }) => {
  const ownerKey = getReminderOwnerKey({ userId, email });
  const found = dbState.reminders.find((r) => r.ownerKey === ownerKey);
  if (!found) {
    return {
      ownerKey,
      userId: userId || null,
      email: String(email || '').toLowerCase().trim(),
      ...sanitizeReminder({}),
    };
  }
  return {
    ...found,
    ...sanitizeReminder(found),
  };
};

const upsertReminderForUser = ({ userId, email, settings }) => {
  const ownerKey = getReminderOwnerKey({ userId, email });
  const idx = dbState.reminders.findIndex((r) => r.ownerKey === ownerKey);
  const base = idx >= 0 ? dbState.reminders[idx] : { ownerKey, userId: userId || null, email: String(email || '').toLowerCase().trim() };
  const updated = {
    ...base,
    userId: userId || null,
    email: String(email || '').toLowerCase().trim(),
    ...sanitizeReminder({ ...base, ...settings }),
    updatedAt: new Date().toISOString(),
  };

  if (idx >= 0) dbState.reminders[idx] = updated;
  else dbState.reminders.push(updated);

  persistDbState();
  return updated;
};

const sendReminderEmail = async ({ to }) => {
  const cfg = await loadSmtpConfig();
  if (!cfg?.host || !cfg?.auth?.user) {
    throw new Error('SMTP ist nicht vollständig konfiguriert.');
  }

  const transporter = createTransporter(cfg);
  await transporter.sendMail({
    from: `"${cfg.fromName}" <${cfg.fromEmail || cfg.auth.user}>`,
    to,
    subject: 'Koffein-Tracker Erinnerung',
    html: '<p>Vergiss nicht, deinen Energy-/Koffein-Bedarf heute im Tracker zu erfassen.</p>',
  });
};

const sendDiscordReminder = async ({ webhookUrl, email }) => {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: `🔔 Erinnerung für ${email}: Bitte heute deinen Energy-/Koffein-Bedarf im Tracker eintragen.`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Discord Webhook Fehler (${response.status})`);
  }
};

const processRemindersTick = async () => {
  if (!Array.isArray(dbState.reminders) || dbState.reminders.length === 0) return;

  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = now.toISOString().slice(0, 10);

  for (const reminder of dbState.reminders) {
    const normalized = sanitizeReminder(reminder);
    if (!normalized.enabled) continue;
    if (normalized.time !== hhmm) continue;
    if (normalized.lastTriggeredDate === today) continue;

    try {
      if (normalized.mailEnabled) {
        await sendReminderEmail({ to: reminder.email });
      }
      if (normalized.discordEnabled && normalized.discordWebhook) {
        await sendDiscordReminder({ webhookUrl: normalized.discordWebhook, email: reminder.email });
      }

      reminder.lastTriggeredDate = today;
      reminder.updatedAt = new Date().toISOString();
      persistDbState();
      console.log(`[Reminder] Gesendet an ${reminder.email} (${normalized.time})`);
    } catch (err) {
      console.error(`[Reminder] Fehler für ${reminder.email}:`, err.message);
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

// ── User Reminder Settings ───────────────────────────────────────────────────
app.get('/api/reminders/me', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim() || null;
    const email = String(req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'email ist erforderlich.' });

    const reminder = getReminderForUser({ userId, email });
    res.json(reminder);
  } catch (err) {
    console.error('GET /api/reminders/me error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/reminders/me', async (req, res) => {
  try {
    const { userId, email, enabled, time, mailEnabled, discordEnabled, discordWebhook } = req.body || {};
    const safeEmail = String(email || '').toLowerCase().trim();
    const safeUserId = String(userId || '').trim() || null;

    if (!safeEmail) return res.status(400).json({ error: 'email ist erforderlich.' });
    if (!isValidReminderTime(time)) return res.status(400).json({ error: 'Uhrzeit muss im Format HH:MM sein.' });
    if (discordEnabled && !discordWebhook) {
      return res.status(400).json({ error: 'Discord Webhook URL fehlt.' });
    }
    if (discordWebhook && !/^https:\/\/discord\.com\/api\/webhooks\/.+/i.test(discordWebhook)) {
      return res.status(400).json({ error: 'Ungültige Discord Webhook URL.' });
    }

    const reminder = upsertReminderForUser({
      userId: safeUserId,
      email: safeEmail,
      settings: {
        enabled: enabled !== false,
        time,
        mailEnabled: mailEnabled !== false,
        discordEnabled: !!discordEnabled,
        discordWebhook: discordWebhook || '',
      },
    });

    res.json({ success: true, reminder });
  } catch (err) {
    console.error('POST /api/reminders/me error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

initDb()
  .then(() => {
    // Check every minute whether a reminder is due.
    setInterval(() => {
      processRemindersTick().catch((err) => console.error('[Reminder] Tick-Fehler:', err.message));
    }, 60 * 1000);

    app.listen(PORT, () => {
      console.log(`🚀 API server running on http://localhost:${PORT}`);
      console.log(`📦 DB Type: ${DB_TYPE}`);
    });
  })
  .catch((err) => {
    console.error('Failed to initialize server:', err);
    process.exit(1);
  });
