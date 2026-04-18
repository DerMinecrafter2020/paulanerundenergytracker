import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import Redis from 'ioredis';

dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const DB_TYPE = 'redis';

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

// ── Redis DB ──────────────────────────────────────────────────────────────────
const isDockerRuntime = fs.existsSync('/.dockerenv');
const rawRedisUrl = String(process.env.REDIS_URL || '').trim();
const envRedisUrl = rawRedisUrl.replace(/^['\"]|['\"]$/g, '');

const shouldMapToLocalhost = (urlStr) => {
  if (!urlStr) return true;
  try {
    const parsed = new URL(urlStr);
    return ['redis', 'koffein-redis'].includes(parsed.hostname);
  } catch {
    return /^redis(?::|$)/i.test(urlStr);
  }
};

const shouldUseLocalhostRedis = !isDockerRuntime && shouldMapToLocalhost(envRedisUrl);
const redisUrl = shouldUseLocalhostRedis
  ? 'redis://127.0.0.1:6379'
  : (envRedisUrl || 'redis://redis:6379');
const REDIS_LOG_THROTTLE_MS = Number(process.env.REDIS_LOG_THROTTLE_MS || 15000);
let lastRedisErrorLogAt = 0;
let localRedisHintShown = false;

const redis = new Redis(redisUrl, {
  retryStrategy: (times) => Math.min(times * 100, 3000),
  enableReadyCheck: true,
});
redis.on('error', (err) => {
  const now = Date.now();
  if (now - lastRedisErrorLogAt >= REDIS_LOG_THROTTLE_MS) {
    console.error('[Redis] Verbindungsfehler:', err.message);
    lastRedisErrorLogAt = now;
  }

  const isLocalConnRefused = shouldUseLocalhostRedis
    && (err?.code === 'ECONNREFUSED' || /ECONNREFUSED/i.test(String(err?.message || '')));

  if (isLocalConnRefused && !localRedisHintShown) {
    console.error('[Redis] Hinweis: Lokaler Start erkannt. Starte Redis lokal (z.B. Docker: "docker run --name dev-redis -p 6379:6379 -d redis:7-alpine") oder setze REDIS_URL auf einen erreichbaren Host.');
    localRedisHintShown = true;
  }
});
redis.on('connect', () => console.log('[Redis] ✓ Verbunden'));

const REDIS_KEYS = {
  caffeine_logs: 'koffein:caffeine_logs',
  users:         'koffein:users',
  smtp_settings: 'koffein:smtp_settings',
  reminders:     'koffein:reminders',
  ai_config:     'koffein:ai_config',
};

let dbState = {
  caffeine_logs: [],
  users: [],
  smtp_settings: null,
  reminders: [],
  ai_config: { apiKey: '', model: 'deepseek/deepseek-v3' },
};

const safeParse = (s, fallback) => {
  if (!s) return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
};

const loadDbState = async () => {
  try {
    // Avoid command retry noise when Redis is currently unreachable.
    const pingResult = await redis.ping().catch(() => null);
    if (pingResult !== 'PONG') {
      console.warn('[DB] Redis aktuell nicht erreichbar. Starte mit leerem In-Memory-Stand und versuche spaeter erneut.');
      return;
    }

    const [logs, users, smtp, reminders, ai] = await redis.mget(
      REDIS_KEYS.caffeine_logs,
      REDIS_KEYS.users,
      REDIS_KEYS.smtp_settings,
      REDIS_KEYS.reminders,
      REDIS_KEYS.ai_config,
    );
    const parsedAi = safeParse(ai, {});
    dbState = {
      caffeine_logs: safeParse(logs, []),
      users:         safeParse(users, []),
      smtp_settings: safeParse(smtp, null),
      reminders:     safeParse(reminders, []),
      ai_config: {
        apiKey: parsedAi.apiKey || '',
        model:  parsedAi.model  || 'deepseek/deepseek-v3',
      },
    };
  } catch (err) {
    console.error('[DB] Redis Ladefehler:', err.message);
  }
};

const persistDbState = () => {
  redis.mset(
    REDIS_KEYS.caffeine_logs,  JSON.stringify(dbState.caffeine_logs),
    REDIS_KEYS.users,          JSON.stringify(dbState.users),
    REDIS_KEYS.smtp_settings,  JSON.stringify(dbState.smtp_settings),
    REDIS_KEYS.reminders,      JSON.stringify(dbState.reminders),
    REDIS_KEYS.ai_config,      JSON.stringify(dbState.ai_config),
  ).catch((err) => console.error('[DB] Redis Speicherfehler:', err.message));
};

const makeResult = (affectedRows = 0, insertId = undefined) => {
  const result = { affectedRows };
  if (insertId !== undefined) result.insertId = insertId;
  return result;
};

class FileDbAdapter {
  async execute(sql, params = []) {
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
  console.log('[DB] 🗄️  Starte Redis-Datenbank...');
  getPool();
  await loadDbState();
  console.log(`[DB] ✓ Redis bereit: ${redisUrl}`);
};

// ── AI / OpenRouter helpers ───────────────────────────────────────────────────
const loadAiConfig = () => {
  return dbState.ai_config || { apiKey: '', model: 'deepseek/deepseek-v3' };
};

const saveAiConfig = (cfg) => {
  dbState.ai_config = {
    apiKey: String(cfg.apiKey || '').trim(),
    model: String(cfg.model || 'deepseek/deepseek-v3').trim(),
  };
  persistDbState();
};

const callOpenRouter = async (messages, { model, apiKey } = {}) => {
  const cfg = loadAiConfig();
  const key = apiKey || cfg.apiKey;
  const mdl = model || cfg.model || 'deepseek/deepseek-v3';

  if (!key) throw new Error('Kein OpenRouter API-Key konfiguriert. Bitte im Admin-Panel eintragen.');

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/DerMinecrafter2020/energytracker',
      'X-Title': 'Koffein-Tracker',
    },
    body: JSON.stringify({ model: mdl, messages }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `OpenRouter Fehler: HTTP ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
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

app.post('/api/admin/discord/test', requireAdmin, async (req, res) => {
  const { webhookUrl } = req.body || {};
  const safeWebhook = String(webhookUrl || '').trim();

  if (!safeWebhook) {
    return res.status(400).json({ error: 'Discord Webhook URL fehlt.' });
  }
  if (!/^https:\/\/discord\.com\/api\/webhooks\/.+/i.test(safeWebhook)) {
    return res.status(400).json({ error: 'Ungültige Discord Webhook URL.' });
  }

  try {
    await sendDiscordReminder({
      webhookUrl: safeWebhook,
      email: 'Admin-Test',
    });
    res.json({ success: true, message: 'Discord Testnachricht wurde gesendet.' });
  } catch (err) {
    res.status(500).json({ error: `Discord-Fehler: ${err.message}` });
  }
});

// ── Redis Health Check ────────────────────────────────────────────────────────
app.get('/api/admin/redis/health', requireAdmin, async (req, res) => {
  try {
    // Ping Redis
    const pong = await redis.ping();

    // Check persistence config (CONFIG GET save)
    let persistConfig = null;
    try {
      const cfg = await redis.config('GET', 'save');
      persistConfig = cfg[1] || '';
    } catch { /* Redis may not allow CONFIG in all setups */ }

    // Check last RDB save time
    let lastSaveTs = null;
    try {
      lastSaveTs = await redis.lastsave();
    } catch { /* ignore */ }

    // Count entries per key from in-memory state (mirrors what's in Redis)
    const keys = await redis.keys('koffein:*');
    const keyDetails = {};
    for (const key of keys) {
      const raw = await redis.get(key);
      const parsed = safeParse(raw, null);
      const shortKey = key.replace('koffein:', '');
      if (Array.isArray(parsed)) {
        keyDetails[shortKey] = { count: parsed.length, type: 'array' };
      } else if (parsed && typeof parsed === 'object') {
        keyDetails[shortKey] = { count: 1, type: 'object' };
      } else {
        keyDetails[shortKey] = { count: parsed ? 1 : 0, type: 'null' };
      }
    }

    res.json({
      connected:    pong === 'PONG',
      persistMode:  persistConfig !== null ? (persistConfig === '' ? 'disabled' : `rdb: ${persistConfig}`) : 'unknown',
      lastSave:     lastSaveTs ? new Date(lastSaveTs * 1000).toISOString() : null,
      keys:         keyDetails,
      totalKeys:    keys.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  const { name, email, password, role = 'user', verified = false } = req.body || {};

  if (!name || !email || !password)
    return res.status(400).json({ error: 'Name, E-Mail und Passwort sind erforderlich.' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen lang sein.' });
  if (!['admin', 'user'].includes(role))
    return res.status(400).json({ error: 'Rolle muss "admin" oder "user" sein.' });

  const lowerEmail = email.toLowerCase();
  const existing = dbState.users.find((u) => u.email === lowerEmail);
  if (existing)
    return res.status(409).json({ error: 'Diese E-Mail-Adresse ist bereits registriert.' });

  const newId = crypto.randomUUID();
  const newUser = {
    id: newId,
    name,
    email: lowerEmail,
    password_hash: hashPassword(password),
    role,
    verified: !!verified,
    verify_token: null,
    verify_token_expiry: null,
    created_at: new Date().toISOString(),
    last_login: null,
  };

  dbState.users.push(newUser);
  persistDbState();

  res.status(201).json({
    id: newId,
    name,
    email: lowerEmail,
    role,
    verified: !!verified,
    createdAt: newUser.created_at,
    lastLogin: null,
  });
});

app.post('/api/admin/users/:id/impersonate', requireAdmin, (req, res) => {
  const user = dbState.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
  res.json({
    id:    user.id,
    name:  user.name,
    email: user.email,
    role:  user.role,
  });
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

// ── Admin AI Config ──────────────────────────────────────────────────────────
app.get('/api/admin/ai', requireAdmin, (req, res) => {
  const cfg = loadAiConfig();
  // Never expose the full key — mask it
  const maskedKey = cfg.apiKey
    ? cfg.apiKey.slice(0, 8) + '••••••••' + cfg.apiKey.slice(-4)
    : '';
  res.json({ apiKeySet: !!cfg.apiKey, apiKeyMasked: maskedKey, model: cfg.model });
});

app.post('/api/admin/ai', requireAdmin, (req, res) => {
  const { apiKey, model } = req.body || {};
  if (apiKey !== undefined && typeof apiKey !== 'string')
    return res.status(400).json({ error: 'apiKey muss ein String sein.' });
  const current = loadAiConfig();
  saveAiConfig({
    apiKey: typeof apiKey === 'string' ? apiKey.trim() : current.apiKey,
    model: typeof model === 'string' && model.trim() ? model.trim() : current.model,
  });
  res.json({ success: true });
});

// ── AI Chat ──────────────────────────────────────────────────────────────────
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { messages, totalCaffeineToday, dailyLimit } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0)
      return res.status(400).json({ error: 'messages ist erforderlich.' });
    if (messages.length > 40)
      return res.status(400).json({ error: 'Zu viele Nachrichten (max. 40).' });

    // Validate message structure
    for (const m of messages) {
      if (!['user', 'assistant', 'system'].includes(m?.role) || typeof m?.content !== 'string')
        return res.status(400).json({ error: 'Ungültiges Nachrichtenformat.' });
      if (m.content.length > 2000)
        return res.status(400).json({ error: 'Nachricht zu lang (max. 2000 Zeichen).' });
    }

    const caffeineInfo = typeof totalCaffeineToday === 'number'
      ? `Aktuelle Koffein-Einnahme heute: ${totalCaffeineToday}mg von ${dailyLimit || 400}mg Tageslimit.`
      : '';

    const systemPrompt = `Du bist ein hilfreicher Assistent für den Koffein-Tracker. Du beantwortest Fragen zu Koffein, Schlaf, Energie und Getränken auf Deutsch. Sei präzise, freundlich und praxisnah. ${caffeineInfo}`.trim();

    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    const reply = await callOpenRouter(fullMessages);
    res.json({ reply });
  } catch (err) {
    console.error('[AI Chat] Fehler:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── AI Drink Recognition ─────────────────────────────────────────────────────
app.post('/api/ai/recognize-drink', async (req, res) => {
  try {
    const { description } = req.body || {};
    if (!description || typeof description !== 'string' || description.trim().length < 2)
      return res.status(400).json({ error: 'Beschreibung ist erforderlich.' });
    if (description.length > 500)
      return res.status(400).json({ error: 'Beschreibung zu lang (max. 500 Zeichen).' });

    const messages = [
      {
        role: 'system',
        content: `Du bist ein Experte für Getränke und Koffeingehalt. Analysiere die Beschreibung eines Getränks und antworte AUSSCHLIESSLICH mit einem JSON-Objekt ohne Markdown-Formatierung. Format:
{"name":"Getränkename","caffeinePer100ml":Zahl,"sizeMl":Zahl,"confidence":"hoch|mittel|niedrig","hint":"optionaler Hinweis auf Deutsch"}
Wichtig: caffeinePer100ml und sizeMl müssen Ganzzahlen sein. Typische Werte: Espresso=212mg/100ml, Red Bull=32mg/100ml, Kaffee=40mg/100ml, Cola=10mg/100ml, Monster=32mg/100ml.`,
      },
      { role: 'user', content: description.trim() },
    ];

    const raw = await callOpenRouter(messages);

    // Extract JSON from response (strip markdown if present)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Keine gültige Antwort vom AI-Modell.');

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.name || typeof parsed.caffeinePer100ml !== 'number')
      throw new Error('Unvollständige AI-Antwort.');

    res.json({
      name: String(parsed.name),
      caffeinePer100ml: Math.max(0, Math.round(Number(parsed.caffeinePer100ml))),
      sizeMl: Math.max(1, Math.round(Number(parsed.sizeMl || 250))),
      confidence: parsed.confidence || 'mittel',
      hint: parsed.hint || '',
    });
  } catch (err) {
    console.error('[AI Recognize] Fehler:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── AI Daily Summary ─────────────────────────────────────────────────────────
app.post('/api/ai/daily-summary', async (req, res) => {
  try {
    const { logs, totalCaffeine, dailyLimit } = req.body || {};
    if (!Array.isArray(logs))
      return res.status(400).json({ error: 'logs ist erforderlich.' });

    const limit = Number(dailyLimit) || 400;
    const total = Number(totalCaffeine) || 0;
    const remaining = Math.max(0, limit - total);
    const percent = Math.round((total / limit) * 100);

    const logList = logs.slice(0, 30).map((l) =>
      `- ${l.name} (${l.caffeine}mg, ${l.sizeMl || l.size || '?'}ml)`
    ).join('\n') || 'Keine Einträge heute.';

    const messages = [
      {
        role: 'system',
        content: `Du bist ein Gesundheitsassistent für einen Koffein-Tracker. Antworte auf Deutsch, freundlich und präzise. Maximal 200 Wörter.`,
      },
      {
        role: 'user',
        content: `Analysiere meine heutige Koffein-Aufnahme und gib mir eine persönliche Auswertung und Empfehlung.

Heutiger Verbrauch: ${total}mg von ${limit}mg Tageslimit (${percent}%)
Noch verfügbar: ${remaining}mg

Einträge heute:
${logList}

Bitte: 1) kurze Bewertung, 2) ob ich noch Koffein trinken sollte, 3) ein praktischer Tipp.`,
      },
    ];

    const summary = await callOpenRouter(messages);
    res.json({ summary, total, limit, remaining, percent });
  } catch (err) {
    console.error('[AI Summary] Fehler:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Graceful shutdown — flush state to Redis before container stops
process.on('SIGTERM', async () => {
  console.log('[DB] SIGTERM empfangen, schreibe letzten Stand nach Redis...');
  try {
    await redis.mset(
      REDIS_KEYS.caffeine_logs,  JSON.stringify(dbState.caffeine_logs),
      REDIS_KEYS.users,          JSON.stringify(dbState.users),
      REDIS_KEYS.smtp_settings,  JSON.stringify(dbState.smtp_settings),
      REDIS_KEYS.reminders,      JSON.stringify(dbState.reminders),
      REDIS_KEYS.ai_config,      JSON.stringify(dbState.ai_config),
    );
    console.log('[DB] ✓ Letzter Stand gespeichert.');
  } catch (err) {
    console.error('[DB] Fehler beim Flush:', err.message);
  }
  await redis.quit();
  process.exit(0);
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
