import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import nodemailer from 'nodemailer';
import crypto from 'crypto';
import Redis from 'ioredis';
import { authenticator } from 'otplib';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

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

const createTransporter = (cfg) => {
  const transport = {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    tls: { rejectUnauthorized: false },
  };

  const authUser = String(cfg?.auth?.user || '').trim();
  const authPass = String(cfg?.auth?.pass || '');
  if (authUser) {
    transport.auth = { user: authUser, pass: authPass };
  }

  return nodemailer.createTransport(transport);
};

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
const WEBAUTHN_ORIGIN = process.env.WEBAUTHN_ORIGIN || ALLOWED_ORIGIN;
const WEBAUTHN_RP_ID = process.env.WEBAUTHN_RP_ID || new URL(WEBAUTHN_ORIGIN).hostname;
const WEBAUTHN_RP_NAME = process.env.WEBAUTHN_RP_NAME || 'Koffein-Tracker';

const AUTH_MODE = String(process.env.AUTH_MODE || 'authentik').toLowerCase();
const AUTHENTIK_ENV_DEFAULTS = {
  baseUrl: String(process.env.AUTHENTIK_BASE_URL || '').replace(/\/$/, ''),
  clientId: String(process.env.AUTHENTIK_CLIENT_ID || '').trim(),
  clientSecret: String(process.env.AUTHENTIK_CLIENT_SECRET || '').trim(),
  redirectUri: String(process.env.AUTHENTIK_REDIRECT_URI || `${ALLOWED_ORIGIN}/api/auth/authentik/callback`).trim(),
  scopes: String(process.env.AUTHENTIK_SCOPES || 'openid profile email').trim(),
  authorizeUrl: String(process.env.AUTHENTIK_AUTHORIZE_URL || '').trim(),
  tokenUrl: String(process.env.AUTHENTIK_TOKEN_URL || '').trim(),
  userInfoUrl: String(process.env.AUTHENTIK_USERINFO_URL || '').trim(),
  adminEmails: String(process.env.AUTHENTIK_ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
};

const normalizeAuthConfig = (cfg = {}) => {
  const baseUrl = String(cfg.baseUrl || AUTHENTIK_ENV_DEFAULTS.baseUrl || '').replace(/\/$/, '');
  const redirectUri = String(cfg.redirectUri || AUTHENTIK_ENV_DEFAULTS.redirectUri || `${ALLOWED_ORIGIN}/api/auth/authentik/callback`).trim();
  const scopes = String(cfg.scopes || AUTHENTIK_ENV_DEFAULTS.scopes || 'openid profile email').trim();
  const authorizeUrl = String(cfg.authorizeUrl || AUTHENTIK_ENV_DEFAULTS.authorizeUrl || `${baseUrl}/application/o/authorize/`).trim();
  const tokenUrl = String(cfg.tokenUrl || AUTHENTIK_ENV_DEFAULTS.tokenUrl || `${baseUrl}/application/o/token/`).trim();
  const userInfoUrl = String(cfg.userInfoUrl || AUTHENTIK_ENV_DEFAULTS.userInfoUrl || `${baseUrl}/application/o/userinfo/`).trim();
  const adminEmailsRaw = Array.isArray(cfg.adminEmails)
    ? cfg.adminEmails
    : String(cfg.adminEmails || AUTHENTIK_ENV_DEFAULTS.adminEmails.join(',')).split(',');

  return {
    baseUrl,
    clientId: String(cfg.clientId || AUTHENTIK_ENV_DEFAULTS.clientId || '').trim(),
    clientSecret: String(cfg.clientSecret || AUTHENTIK_ENV_DEFAULTS.clientSecret || '').trim(),
    redirectUri,
    scopes,
    authorizeUrl,
    tokenUrl,
    userInfoUrl,
    adminEmails: adminEmailsRaw
      .map((s) => String(s || '').trim().toLowerCase())
      .filter(Boolean),
  };
};

const getAuthConfig = () => normalizeAuthConfig(dbState.auth_config || {});

const isAuthentikConfigured = (cfg = getAuthConfig()) => {
  return !!(cfg.baseUrl && cfg.clientId && cfg.clientSecret);
};

const saveAuthConfig = (cfg = {}) => {
  dbState.auth_config = normalizeAuthConfig(cfg);
  persistDbState();
  return dbState.auth_config;
};

authenticator.options = {
  step: 30,
  window: [1, 1],
};

const pendingSecondFactor = new Map();
const pendingWebAuthn = new Map();
const pendingOidcStates = new Map();
const pendingOidcSessions = new Map();
const AUTH_CHALLENGE_TTL_MS = 5 * 60 * 1000;

const toBase64Url = (buffer) => Buffer.from(buffer).toString('base64url');
const fromBase64Url = (input) => Buffer.from(String(input || ''), 'base64url');

const cleanupAuthChallenges = () => {
  const now = Date.now();
  for (const [token, data] of pendingSecondFactor.entries()) {
    if (now > Number(data?.expiresAt || 0)) pendingSecondFactor.delete(token);
  }
  for (const [token, data] of pendingWebAuthn.entries()) {
    if (now > Number(data?.expiresAt || 0)) pendingWebAuthn.delete(token);
  }
  for (const [token, data] of pendingOidcStates.entries()) {
    if (now > Number(data?.expiresAt || 0)) pendingOidcStates.delete(token);
  }
  for (const [token, data] of pendingOidcSessions.entries()) {
    if (now > Number(data?.expiresAt || 0)) pendingOidcSessions.delete(token);
  }
};

app.use(cors({ origin: ALLOWED_ORIGIN }));
app.use(express.json());

// Static Frontend
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));

// ── Redis DB ──────────────────────────────────────────────────────────────────
const isDockerRuntime = fs.existsSync('/.dockerenv');
const cleanEnvValue = (value) => String(value || '').trim().replace(/^['\"]|['\"]$/g, '');

const resolveRedisUrl = () => {
  const envRedisUrl = cleanEnvValue(process.env.REDIS_URL);
  if (envRedisUrl) return envRedisUrl;

  const envRedisHost = cleanEnvValue(process.env.REDIS_HOST);
  const envRedisPort = cleanEnvValue(process.env.REDIS_PORT) || '6379';

  if (envRedisHost) return `redis://${envRedisHost}:${envRedisPort}`;
  if (isDockerRuntime) return 'redis://redis:6379';
  return 'redis://127.0.0.1:6379';
};

const redisUrl = resolveRedisUrl();
let redisHost = '';
try {
  redisHost = new URL(redisUrl).hostname;
} catch {
  redisHost = '';
}

const isLocalRedisTarget = !isDockerRuntime && ['redis', 'koffein-redis'].includes(redisHost.toLowerCase());
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

  const isLocalConnRefused = !isDockerRuntime
    && (err?.code === 'ECONNREFUSED' || /ECONNREFUSED/i.test(String(err?.message || '')));

  const isLocalNameResolution = isLocalRedisTarget
    && (err?.code === 'ENOTFOUND' || /ENOTFOUND/i.test(String(err?.message || '')));

  if ((isLocalConnRefused || isLocalNameResolution) && !localRedisHintShown) {
    console.error('[Redis] Hinweis: Lokaler Start erkannt. Nutze REDIS_HOST=127.0.0.1 und REDIS_PORT=6379 (oder REDIS_URL=redis://127.0.0.1:6379).');
    localRedisHintShown = true;
  }
});
redis.on('connect', () => console.log('[Redis] ✓ Verbunden'));

const REDIS_KEYS = {
  caffeine_logs: 'koffein:caffeine_logs',
  users:         'koffein:users',
  smtp_settings: 'koffein:smtp_settings',
  auth_config:   'koffein:auth_config',
  reminders:     'koffein:reminders',
  favorites:     'koffein:favorites',
  ai_config:     'koffein:ai_config',
  user_settings: 'koffein:user_settings',
  custom_drinks: 'koffein:custom_drinks',
};

let dbState = {
  caffeine_logs: [],
  users: [],
  smtp_settings: null,
  auth_config: null,
  reminders: [],
  favorites: [],
  ai_config: { apiKey: '', model: 'deepseek/deepseek-v3', braveSearchKey: '' },
  user_settings: [], // [{userId/email, dailyLimit, notifyAtLimit, notifyLate, notifyRapid}]
  custom_drinks: [], // [{id, ownerKey, name, size, caffeine, icon}]
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

    const [logs, users, smtp, authCfg, reminders, favorites, ai, settings, drinks] = await redis.mget(
      REDIS_KEYS.caffeine_logs,
      REDIS_KEYS.users,
      REDIS_KEYS.smtp_settings,
      REDIS_KEYS.auth_config,
      REDIS_KEYS.reminders,
      REDIS_KEYS.favorites,
      REDIS_KEYS.ai_config,
      REDIS_KEYS.user_settings,
      REDIS_KEYS.custom_drinks,
    );
    const parsedAi = safeParse(ai, {});
    dbState = {
      caffeine_logs: safeParse(logs, []),
      users:         safeParse(users, []),
      smtp_settings: safeParse(smtp, null),
      auth_config:   safeParse(authCfg, null),
      reminders:     safeParse(reminders, []),
      favorites:     safeParse(favorites, []),
      ai_config: {
        apiKey:         parsedAi.apiKey         || '',
        model:          parsedAi.model          || 'deepseek/deepseek-v3',
        braveSearchKey: parsedAi.braveSearchKey || '',
      },
      user_settings: safeParse(settings, []),
      custom_drinks: safeParse(drinks, []),
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
    REDIS_KEYS.auth_config,    JSON.stringify(dbState.auth_config),
    REDIS_KEYS.reminders,      JSON.stringify(dbState.reminders),
    REDIS_KEYS.favorites,      JSON.stringify(dbState.favorites),
    REDIS_KEYS.ai_config,      JSON.stringify(dbState.ai_config),
    REDIS_KEYS.user_settings,  JSON.stringify(dbState.user_settings),
    REDIS_KEYS.custom_drinks,  JSON.stringify(dbState.custom_drinks),
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
        totp_enabled: false,
        totp_secret: null,
        totp_temp_secret: null,
        webauthn_user_id: toBase64Url(crypto.randomBytes(32)),
        passkeys: [],
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
  // Default config wenn keine Row existiert
  const defaults = {
    host: '',
    port: 587,
    secure: false,
    auth: { user: '', pass: '' },
    fromName: 'Koffein-Tracker',
    fromEmail: '',
    baseUrl: '',
    registrationEnabled: true, // ✓ Default: Registrierung ENABLED
    demoEnabled: true,
  };
  
  if (!row) return defaults;
  
  return {
    host: row.host || defaults.host,
    port: Number(row.port || defaults.port),
    secure: !!row.secure,
    auth: {
      user: row.auth_user || defaults.auth.user,
      pass: row.auth_pass || defaults.auth.pass,
    },
    fromName: row.from_name || defaults.fromName,
    fromEmail: row.from_email || row.auth_user || defaults.fromEmail,
    baseUrl: row.base_url || defaults.baseUrl,
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
  return dbState.ai_config || { apiKey: '', model: 'deepseek/deepseek-v3', braveSearchKey: '' };
};

const saveAiConfig = (cfg) => {
  dbState.ai_config = {
    apiKey: String(cfg.apiKey || '').trim(),
    model: String(cfg.model || 'deepseek/deepseek-v3').trim(),
    braveSearchKey: String(cfg.braveSearchKey || '').trim(),
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

const OFF_SEARCH_URL     = 'https://world.openfoodfacts.org/cgi/search.pl';
const BRAVE_SEARCH_URL   = 'https://api.search.brave.com/res/v1/web/search';

const fetchDrinkWebContextBrave = async (description, apiKey) => {
  const query = `${String(description || '').trim()} Koffeingehalt mg Getränk Nährwerte`;
  try {
    const url = new URL(BRAVE_SEARCH_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('count', '5');
    url.searchParams.set('search_lang', 'de');

    const resp = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': apiKey,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    const results = Array.isArray(data?.web?.results) ? data.web.results : [];
    if (results.length === 0) return null;

    return results.slice(0, 5).map((r, idx) => {
      const snippet = (r.description || r.extra_snippets?.[0] || '').slice(0, 300);
      return `${idx + 1}. ${r.title || ''}\n   ${snippet}`;
    }).join('\n\n');
  } catch {
    return null;
  }
};

const parseMlFromText = (value) => {
  if (!value) return null;
  const match = String(value).toLowerCase().match(/(\d+(?:[\.,]\d+)?)\s*ml/);
  if (!match) return null;
  return Math.round(parseFloat(match[1].replace(',', '.')));
};

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const getOffCaffeinePer100ml = (product) => {
  const nutriments = product?.nutriments || {};

  const direct100 = toNumber(nutriments.caffeine_100g);
  if (direct100 !== null) return Math.round(direct100);

  const direct = toNumber(nutriments.caffeine);
  if (direct !== null) return Math.round(direct);

  const serving = toNumber(nutriments.caffeine_serving);
  if (serving !== null) {
    const servingMl = parseMlFromText(product?.serving_size || product?.quantity);
    if (servingMl) return Math.round((serving / servingMl) * 100);
  }

  return null;
};

const fetchDrinkWebContext = async (description) => {
  const query = String(description || '').trim();
  if (!query) return [];

  try {
    const url = new URL(OFF_SEARCH_URL);
    url.searchParams.set('search_terms', query);
    url.searchParams.set('search_simple', '1');
    url.searchParams.set('action', 'process');
    url.searchParams.set('json', '1');
    url.searchParams.set('page_size', '5');
    url.searchParams.set('fields', 'product_name,brands,quantity,serving_size,nutriments');

    const resp = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) return [];

    const data = await resp.json();
    const products = Array.isArray(data?.products) ? data.products : [];

    return products
      .map((p) => {
        const name = p?.product_name || '';
        const brand = p?.brands || '';
        const sizeMl = parseMlFromText(p?.quantity || p?.serving_size);
        const caffeinePer100ml = getOffCaffeinePer100ml(p);
        return { name, brand, sizeMl, caffeinePer100ml };
      })
      .filter((p) => p.name)
      .slice(0, 5);
  } catch {
    return [];
  }
};

const formatDrinkWebContext = (hits) => {
  if (!Array.isArray(hits) || hits.length === 0) {
    return 'Keine verifizierten Online-Treffer gefunden. Nutze konservative Standardschaetzungen.';
  }

  return hits.map((hit, idx) => {
    const brand = hit.brand ? `, Marke: ${hit.brand}` : '';
    const size = hit.sizeMl ? `, Groesse: ${hit.sizeMl}ml` : '';
    const caffeine = hit.caffeinePer100ml !== null && hit.caffeinePer100ml !== undefined
      ? `, Koffein/100ml: ${hit.caffeinePer100ml}mg`
      : ', Koffein/100ml: unbekannt';
    return `${idx + 1}. ${hit.name}${brand}${size}${caffeine}`;
  }).join('\n');
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

const getFavoritesOwnerKey = ({ userId, email }) => {
  if (userId) return `user:${userId}`;
  return `email:${String(email || '').toLowerCase().trim()}`;
};

const favoriteDrinkKey = (drink) => {
  const name = String(drink?.name || '').toLowerCase().trim();
  const size = Number(drink?.size || 0);
  const caffeine = Number(drink?.caffeine || 0);
  const icon = String(drink?.icon || '').trim();
  return `${name}|${size}|${caffeine}|${icon}`;
};

const getFavoritesForUser = ({ userId, email }) => {
  const ownerKey = getFavoritesOwnerKey({ userId, email });
  const found = dbState.favorites.find((f) => f.ownerKey === ownerKey);
  if (!found) {
    return {
      ownerKey,
      userId: userId || null,
      email: String(email || '').toLowerCase().trim(),
      items: [],
    };
  }
  return {
    ...found,
    items: Array.isArray(found.items) ? found.items : [],
  };
};

const upsertFavoriteForUser = ({ userId, email, drink }) => {
  const ownerKey = getFavoritesOwnerKey({ userId, email });
  const idx = dbState.favorites.findIndex((f) => f.ownerKey === ownerKey);
  const base = idx >= 0 ? dbState.favorites[idx] : {
    ownerKey,
    userId: userId || null,
    email: String(email || '').toLowerCase().trim(),
    items: [],
  };

  const items = Array.isArray(base.items) ? [...base.items] : [];
  const key = favoriteDrinkKey(drink);
  const existingIdx = items.findIndex((item) => favoriteDrinkKey(item) === key);

  const item = {
    id: existingIdx >= 0 ? items[existingIdx].id : crypto.randomUUID(),
    name: String(drink.name || '').trim(),
    size: Number(drink.size || 0),
    caffeine: Number(drink.caffeine || 0),
    caffeinePerMl: drink.caffeinePerMl !== undefined && drink.caffeinePerMl !== null
      ? Number(drink.caffeinePerMl)
      : null,
    icon: String(drink.icon || '🥤'),
    updatedAt: new Date().toISOString(),
    createdAt: existingIdx >= 0 ? items[existingIdx].createdAt : new Date().toISOString(),
  };

  if (existingIdx >= 0) items[existingIdx] = item;
  else items.unshift(item);

  const updated = {
    ...base,
    userId: userId || null,
    email: String(email || '').toLowerCase().trim(),
    items,
    updatedAt: new Date().toISOString(),
  };

  if (idx >= 0) dbState.favorites[idx] = updated;
  else dbState.favorites.push(updated);

  persistDbState();
  return item;
};

const removeFavoriteForUser = ({ userId, email, favoriteId }) => {
  const ownerKey = getFavoritesOwnerKey({ userId, email });
  const idx = dbState.favorites.findIndex((f) => f.ownerKey === ownerKey);
  if (idx < 0) return false;

  const before = dbState.favorites[idx].items.length;
  dbState.favorites[idx].items = dbState.favorites[idx].items.filter((item) => item.id !== favoriteId);
  const removed = before !== dbState.favorites[idx].items.length;
  if (removed) {
    dbState.favorites[idx].updatedAt = new Date().toISOString();
    persistDbState();
  }
  return removed;
};

// ── USER SETTINGS HELPERS ────────────────────────────────────────────────────
const getSettingsOwnerKey = ({ userId, email }) => {
  if (userId) return `user:${userId}`;
  if (email) return `email:${email}`;
  throw new Error('userId oder email erforderlich');
};

const getUserSettings = ({ userId, email }) => {
  const ownerKey = getSettingsOwnerKey({ userId, email });
  const settings = dbState.user_settings.find((s) => s.ownerKey === ownerKey);
  return settings || {
    ownerKey,
    dailyLimit: 400,
    notifyAtLimit: true,
    notifyLate: true,
    notifyRapid: true,
    createdAt: new Date().toISOString(),
  };
};

const updateUserSettings = ({ userId, email, dailyLimit, notifyAtLimit, notifyLate, notifyRapid }) => {
  const ownerKey = getSettingsOwnerKey({ userId, email });
  let settings = dbState.user_settings.find((s) => s.ownerKey === ownerKey);
  if (!settings) {
    settings = { ownerKey, createdAt: new Date().toISOString() };
    dbState.user_settings.push(settings);
  }
  if (dailyLimit !== undefined) settings.dailyLimit = dailyLimit;
  if (notifyAtLimit !== undefined) settings.notifyAtLimit = notifyAtLimit;
  if (notifyLate !== undefined) settings.notifyLate = notifyLate;
  if (notifyRapid !== undefined) settings.notifyRapid = notifyRapid;
  settings.updatedAt = new Date().toISOString();
  persistDbState();
  return settings;
};

// ── CUSTOM DRINKS HELPERS ────────────────────────────────────────────────────
const getCustomDrinksForUser = ({ userId, email }) => {
  const ownerKey = getSettingsOwnerKey({ userId, email });
  return dbState.custom_drinks.filter((d) => d.ownerKey === ownerKey);
};

const addCustomDrink = ({ userId, email, name, size, caffeine, icon }) => {
  const ownerKey = getSettingsOwnerKey({ userId, email });
  const id = crypto.randomBytes(8).toString('hex');
  const drink = { id, ownerKey, name, size, caffeine: Number(caffeine) || 0, icon: icon || '🥤', createdAt: new Date().toISOString() };
  dbState.custom_drinks.push(drink);
  persistDbState();
  return drink;
};

const removeCustomDrink = ({ userId, email, drinkId }) => {
  const ownerKey = getSettingsOwnerKey({ userId, email });
  const idx = dbState.custom_drinks.findIndex((d) => d.ownerKey === ownerKey && d.id === drinkId);
  if (idx < 0) return false;
  dbState.custom_drinks.splice(idx, 1);
  persistDbState();
  return true;
};

const getUserByIdentity = ({ userId, email }) => {
  const safeUserId = String(userId || '').trim();
  const safeEmail = String(email || '').toLowerCase().trim();
  return dbState.users.find((u) =>
    (safeUserId && String(u.id) === safeUserId)
    || (safeEmail && String(u.email || '').toLowerCase() === safeEmail)
  ) || null;
};

const ensureUserSecurityFields = (user) => {
  if (!user) return;
  if (!Array.isArray(user.passkeys)) user.passkeys = [];
  if (typeof user.totp_enabled !== 'boolean') user.totp_enabled = false;
  if (!user.totp_secret) user.totp_secret = null;
  if (!user.totp_temp_secret) user.totp_temp_secret = null;
  if (!user.webauthn_user_id) user.webauthn_user_id = null;
};

const createSecondFactorToken = (user) => {
  const token = crypto.randomBytes(24).toString('hex');
  pendingSecondFactor.set(token, {
    userId: user.id,
    email: user.email,
    expiresAt: Date.now() + AUTH_CHALLENGE_TTL_MS,
  });
  return token;
};

const consumeSecondFactorToken = (token) => {
  cleanupAuthChallenges();
  const key = String(token || '').trim();
  const payload = pendingSecondFactor.get(key);
  if (!payload) return null;
  pendingSecondFactor.delete(key);
  return payload;
};

const peekSecondFactorToken = (token) => {
  cleanupAuthChallenges();
  const key = String(token || '').trim();
  return pendingSecondFactor.get(key) || null;
};

const sanitizeSecurityOverview = (user) => {
  ensureUserSecurityFields(user);
  return {
    totpEnabled: !!user.totp_enabled,
    passkeys: user.passkeys.map((k) => ({
      id: k.id,
      name: k.name || 'Sicherheitsschluessel',
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt || null,
      transports: Array.isArray(k.transports) ? k.transports : [],
    })),
  };
};

const completeLoginForUser = async (user) => {
  const dbPool = getPool();
  await dbPool.execute('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);
  return { id: user.id, name: user.name, email: user.email, role: user.role };
};

const upsertUserFromAuthentik = async ({ email, name, sub }) => {
  const safeEmail = String(email || '').toLowerCase().trim();
  const safeName = String(name || '').trim() || safeEmail || 'Authentik Nutzer';
  if (!safeEmail) throw new Error('Authentik liefert keine E-Mail-Adresse.');

  let user = getUserByIdentity({ email: safeEmail });
  if (!user) {
    const authCfg = getAuthConfig();
    const hasAdmin = dbState.users.some((u) => String(u.role || '').toLowerCase() === 'admin');
    const role = (!hasAdmin || authCfg.adminEmails.includes(safeEmail)) ? 'admin' : 'user';
    user = {
      id: crypto.randomUUID(),
      name: safeName,
      email: safeEmail,
      password_hash: hashPassword(crypto.randomBytes(24).toString('hex')),
      role,
      verified: true,
      verify_token: null,
      verify_token_expiry: null,
      authentik_sub: String(sub || '').trim() || null,
      totp_enabled: false,
      totp_secret: null,
      totp_temp_secret: null,
      webauthn_user_id: toBase64Url(crypto.randomBytes(32)),
      passkeys: [],
      created_at: new Date().toISOString(),
      last_login: null,
    };
    dbState.users.push(user);
  } else {
    user.verified = true;
    if (safeName && safeName !== user.name) user.name = safeName;
    const incomingSub = String(sub || '').trim();
    if (incomingSub) user.authentik_sub = incomingSub;
  }

  persistDbState();
  return user;
};

const createOidcSessionToken = (user) => {
  const token = crypto.randomBytes(24).toString('hex');
  pendingOidcSessions.set(token, {
    user,
    expiresAt: Date.now() + AUTH_CHALLENGE_TTL_MS,
  });
  return token;
};

const consumeOidcSessionToken = (token) => {
  cleanupAuthChallenges();
  const key = String(token || '').trim();
  const payload = pendingOidcSessions.get(key);
  if (!payload) return null;
  pendingOidcSessions.delete(key);
  return payload;
};

// ── STATISTICS HELPERS ───────────────────────────────────────────────────────
const getWeeklyStats = ({ userId, email }) => {
  const ownerKey = getSettingsOwnerKey({ userId, email });
  const today = new Date();
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    week.push(d.toISOString().split('T')[0]);
  }

  const stats = week.map((dateStr) => {
    const logsForDay = dbState.caffeine_logs.filter(
      (log) => (log.userId === userId || log.email === email) && log.date === dateStr
    );
    const totalCaffeine = logsForDay.reduce((sum, log) => sum + (Number(log.caffeine) || 0), 0);
    const count = logsForDay.length;
    return { date: dateStr, totalCaffeine, count, logs: logsForDay };
  });
  return stats;
};

const getDailyStats = (date) => {
  // Aggregiert statistiken für einen Tag (für Admin-Übersicht)
  const logsForDay = dbState.caffeine_logs.filter((log) => log.date === date);
  const users = new Set();
  let totalCaffeine = 0;
  const byUser = {};

  logsForDay.forEach((log) => {
    const user = log.email || log.userId || 'unknown';
    users.add(user);
    totalCaffeine += Number(log.caffeine) || 0;
    byUser[user] = (byUser[user] || 0) + (Number(log.caffeine) || 0);
  });

  return { date, totalUsers: users.size, totalCaffeine, byUser, logCount: logsForDay.length };
};

const getTodayStats = ({ userId, email }) => {
  const today = new Date().toISOString().split('T')[0];
  const logsForToday = dbState.caffeine_logs.filter(
    (log) => (log.userId === userId || log.email === email) && log.date === today
  );
  const totalCaffeine = logsForToday.reduce((sum, log) => sum + (Number(log.caffeine) || 0), 0);
  const settings = getUserSettings({ userId, email });
  const limit = settings.dailyLimit || 400;
  const remainingCaffeine = Math.max(0, limit - totalCaffeine);
  const isOverLimit = totalCaffeine > limit;

  return {
    date: today,
    totalCaffeine,
    dailyLimit: limit,
    remainingCaffeine,
    isOverLimit,
    logCount: logsForToday.length,
    logs: logsForToday,
  };
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
  if (!host || !port)
    return res.status(400).json({ error: 'Host und Port sind erforderlich.' });

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
    totp_enabled: false,
    totp_secret: null,
    totp_temp_secret: null,
    webauthn_user_id: toBase64Url(crypto.randomBytes(32)),
    passkeys: [],
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
    const authCfg = getAuthConfig();
    const authentikReady = AUTH_MODE === 'authentik' && isAuthentikConfigured(authCfg);
    res.json({
      demoEnabled: cfg?.demoEnabled !== false,
      registrationEnabled: cfg?.registrationEnabled !== false,
      authMode: AUTH_MODE,
      authentikEnabled: authentikReady,
      setupRequired: AUTH_MODE === 'authentik' && !authentikReady,
    });
  } catch (err) {
    console.error('GET /api/settings/public error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/setup/authentik/status', (req, res) => {
  try {
    const authCfg = getAuthConfig();
    res.json({
      authMode: AUTH_MODE,
      configured: AUTH_MODE === 'authentik' && isAuthentikConfigured(authCfg),
      setupRequired: AUTH_MODE === 'authentik' && !isAuthentikConfigured(authCfg),
      config: {
        baseUrl: authCfg.baseUrl,
        clientId: authCfg.clientId,
        redirectUri: authCfg.redirectUri,
        scopes: authCfg.scopes,
        authorizeUrl: authCfg.authorizeUrl,
        tokenUrl: authCfg.tokenUrl,
        userInfoUrl: authCfg.userInfoUrl,
        adminEmails: authCfg.adminEmails,
      },
    });
  } catch (err) {
    console.error('GET /api/setup/authentik/status error:', err);
    res.status(500).json({ error: 'Setup-Status konnte nicht geladen werden.' });
  }
});

app.post('/api/setup/authentik', (req, res) => {
  try {
    if (AUTH_MODE !== 'authentik') {
      return res.status(400).json({ error: 'Authentik-Setup ist im aktuellen Modus nicht verfügbar.' });
    }

    const current = getAuthConfig();
    const alreadyConfigured = isAuthentikConfigured(current);
    const hasAnyUser = Array.isArray(dbState.users) && dbState.users.length > 0;
    const hasAdminSecret = req.headers['x-admin-secret'] === ADMIN_SECRET;
    if (alreadyConfigured && hasAnyUser && !hasAdminSecret) {
      return res.status(403).json({ error: 'Authentik ist bereits eingerichtet.' });
    }

    const payload = req.body || {};
    const next = normalizeAuthConfig({
      ...payload,
      redirectUri: payload.redirectUri || `${ALLOWED_ORIGIN}/api/auth/authentik/callback`,
      scopes: payload.scopes || 'openid profile email',
    });

    if (!next.baseUrl || !next.clientId || !next.clientSecret) {
      return res.status(400).json({ error: 'baseUrl, clientId und clientSecret sind erforderlich.' });
    }

    saveAuthConfig(next);
    res.json({ success: true, configured: true });
  } catch (err) {
    console.error('POST /api/setup/authentik error:', err);
    res.status(500).json({ error: 'Authentik-Setup konnte nicht gespeichert werden.' });
  }
});

app.get('/api/admin/authentik/export', requireAdmin, (req, res) => {
  try {
    if (AUTH_MODE !== 'authentik') {
      return res.status(400).json({ error: 'Authentik-Export ist im aktuellen Modus nicht verfügbar.' });
    }

    const authCfg = getAuthConfig();
    return res.json({ success: true, config: authCfg });
  } catch (err) {
    console.error('GET /api/admin/authentik/export error:', err);
    return res.status(500).json({ error: 'Authentik-Konfiguration konnte nicht exportiert werden.' });
  }
});

app.post('/api/admin/authentik/reset', requireAdmin, (req, res) => {
  try {
    if (AUTH_MODE !== 'authentik') {
      return res.status(400).json({ error: 'Authentik-Reset ist im aktuellen Modus nicht verfügbar.' });
    }

    dbState.auth_config = null;
    persistDbState();

    return res.json({ success: true, setupRequired: true });
  } catch (err) {
    console.error('POST /api/admin/authentik/reset error:', err);
    return res.status(500).json({ error: 'Authentik-Konfiguration konnte nicht zurückgesetzt werden.' });
  }
});

app.get('/api/auth/authentik/start', async (req, res) => {
  try {
    if (AUTH_MODE !== 'authentik') {
      return res.status(400).json({ error: 'Authentik-Login ist deaktiviert.' });
    }
    const authCfg = getAuthConfig();
    if (!isAuthentikConfigured(authCfg)) {
      return res.status(500).json({ error: 'Authentik ist nicht vollständig konfiguriert.' });
    }

    const state = crypto.randomBytes(24).toString('hex');
    pendingOidcStates.set(state, {
      state,
      expiresAt: Date.now() + AUTH_CHALLENGE_TTL_MS,
    });

    const url = new URL(authCfg.authorizeUrl);
    url.searchParams.set('client_id', authCfg.clientId);
    url.searchParams.set('redirect_uri', authCfg.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', authCfg.scopes);
    url.searchParams.set('state', state);

    res.redirect(url.toString());
  } catch (err) {
    console.error('GET /api/auth/authentik/start error:', err);
    res.status(500).json({ error: 'Authentik-Login konnte nicht gestartet werden.' });
  }
});

app.get('/api/auth/authentik/callback', async (req, res) => {
  try {
    if (AUTH_MODE !== 'authentik') {
      return res.redirect(`${ALLOWED_ORIGIN}/?auth_error=${encodeURIComponent('Authentik-Login ist deaktiviert.')}`);
    }

    const authCfg = getAuthConfig();
    if (!isAuthentikConfigured(authCfg)) {
      return res.redirect(`${ALLOWED_ORIGIN}/?auth_error=${encodeURIComponent('Authentik ist nicht konfiguriert.')}`);
    }

    const code = String(req.query.code || '').trim();
    const state = String(req.query.state || '').trim();
    if (!code || !state) {
      return res.redirect(`${ALLOWED_ORIGIN}/?auth_error=${encodeURIComponent('Ungültiger Authentik-Callback.')}`);
    }

    cleanupAuthChallenges();
    const pending = pendingOidcStates.get(state);
    if (!pending) {
      return res.redirect(`${ALLOWED_ORIGIN}/?auth_error=${encodeURIComponent('Anmeldung abgelaufen. Bitte erneut versuchen.')}`);
    }
    pendingOidcStates.delete(state);

    const tokenResp = await fetch(authCfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: authCfg.clientId,
        client_secret: authCfg.clientSecret,
        redirect_uri: authCfg.redirectUri,
      }).toString(),
    });

    const tokenData = await tokenResp.json().catch(() => ({}));
    if (!tokenResp.ok || !tokenData.access_token) {
      throw new Error(tokenData.error_description || tokenData.error || 'Token-Austausch fehlgeschlagen.');
    }

    const userInfoResp = await fetch(authCfg.userInfoUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo = await userInfoResp.json().catch(() => ({}));
    if (!userInfoResp.ok) {
      throw new Error(userInfo.error_description || userInfo.error || 'userinfo konnte nicht geladen werden.');
    }

    const userEmail = String(userInfo.email || '').toLowerCase().trim();
    const userName = String(userInfo.name || userInfo.preferred_username || userEmail || '').trim();
    const userSub = String(userInfo.sub || '').trim();
    const user = await upsertUserFromAuthentik({ email: userEmail, name: userName, sub: userSub });
    const safeUser = await completeLoginForUser(user);

    const authToken = createOidcSessionToken(safeUser);
    return res.redirect(`${ALLOWED_ORIGIN}/?auth_token=${encodeURIComponent(authToken)}`);
  } catch (err) {
    console.error('GET /api/auth/authentik/callback error:', err);
    return res.redirect(`${ALLOWED_ORIGIN}/?auth_error=${encodeURIComponent('Authentik-Anmeldung fehlgeschlagen.')}`);
  }
});

app.post('/api/auth/authentik/exchange', async (req, res) => {
  try {
    const authToken = String(req.body?.authToken || '').trim();
    if (!authToken) return res.status(400).json({ error: 'authToken ist erforderlich.' });

    const payload = consumeOidcSessionToken(authToken);
    if (!payload?.user) {
      return res.status(401).json({ error: 'Authentik-Sitzung ist abgelaufen. Bitte erneut anmelden.' });
    }

    return res.json({ success: true, user: payload.user });
  } catch (err) {
    console.error('POST /api/auth/authentik/exchange error:', err);
    return res.status(500).json({ error: 'Authentik-Anmeldung konnte nicht abgeschlossen werden.' });
  }
});

// ── Public Registration & Login ───────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  if (AUTH_MODE === 'authentik') {
    return res.status(403).json({ error: 'Lokale Registrierung ist deaktiviert. Bitte über Authentik anmelden.' });
  }

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
  if (AUTH_MODE === 'authentik') {
    return res.status(403).json({ error: 'Lokale Anmeldung ist deaktiviert. Bitte über Authentik anmelden.' });
  }

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

    const fullUser = getUserByIdentity({ userId: user.id, email: user.email });
    ensureUserSecurityFields(fullUser);

    const hasTotp = !!fullUser?.totp_enabled && !!fullUser?.totp_secret;
    const hasPasskey = Array.isArray(fullUser?.passkeys) && fullUser.passkeys.length > 0;

    if (hasTotp || hasPasskey) {
      const loginToken = createSecondFactorToken(fullUser);
      return res.json({
        success: true,
        requiresSecondFactor: true,
        loginToken,
        methods: {
          totp: hasTotp,
          passkey: hasPasskey,
        },
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    }

    const safeUser = await completeLoginForUser(fullUser || user);
    res.json({ success: true, user: safeUser });
  } catch (err) {
    console.error('POST /api/login error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/login/2fa/totp', async (req, res) => {
  try {
    const { loginToken, code } = req.body || {};
    if (!loginToken || !code) return res.status(400).json({ error: 'loginToken und Code sind erforderlich.' });

    const pending = peekSecondFactorToken(loginToken);
    if (!pending) return res.status(401).json({ error: '2FA-Sitzung ist abgelaufen. Bitte neu anmelden.' });

    const user = getUserByIdentity({ userId: pending.userId, email: pending.email });
    ensureUserSecurityFields(user);
    if (!user || !user.totp_enabled || !user.totp_secret) {
      return res.status(400).json({ error: 'TOTP ist für dieses Konto nicht aktiv.' });
    }

    const ok = authenticator.verify({ token: String(code).replace(/\s+/g, ''), secret: user.totp_secret });
    if (!ok) return res.status(401).json({ error: 'Ungültiger 2FA-Code.' });

    consumeSecondFactorToken(loginToken);
    const safeUser = await completeLoginForUser(user);
    res.json({ success: true, user: safeUser });
  } catch (err) {
    console.error('POST /api/login/2fa/totp error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/login/2fa/passkey/options', async (req, res) => {
  try {
    const { loginToken } = req.body || {};
    if (!loginToken) return res.status(400).json({ error: 'loginToken ist erforderlich.' });

    const pending = peekSecondFactorToken(loginToken);
    if (!pending) return res.status(401).json({ error: '2FA-Sitzung ist abgelaufen. Bitte neu anmelden.' });

    const user = getUserByIdentity({ userId: pending.userId, email: pending.email });
    ensureUserSecurityFields(user);
    if (!user || user.passkeys.length === 0) {
      return res.status(400).json({ error: 'Kein Sicherheitsschlüssel hinterlegt.' });
    }

    const options = await generateAuthenticationOptions({
      rpID: WEBAUTHN_RP_ID,
      userVerification: 'preferred',
      allowCredentials: user.passkeys.map((k) => ({
        id: k.id,
        transports: Array.isArray(k.transports) ? k.transports : [],
      })),
      timeout: 60000,
    });

    pendingWebAuthn.set(`login:${loginToken}`, {
      type: 'login',
      userId: user.id,
      challenge: options.challenge,
      expiresAt: Date.now() + AUTH_CHALLENGE_TTL_MS,
    });

    res.json({ success: true, options });
  } catch (err) {
    console.error('POST /api/login/2fa/passkey/options error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/login/2fa/passkey/verify', async (req, res) => {
  try {
    const { loginToken, response } = req.body || {};
    if (!loginToken || !response) return res.status(400).json({ error: 'loginToken und response sind erforderlich.' });

    const pending = peekSecondFactorToken(loginToken);
    if (!pending) return res.status(401).json({ error: '2FA-Sitzung ist abgelaufen. Bitte neu anmelden.' });

    const challengeState = pendingWebAuthn.get(`login:${loginToken}`);
    if (!challengeState || challengeState.type !== 'login') {
      return res.status(401).json({ error: 'Passkey-Challenge fehlt oder ist abgelaufen.' });
    }

    const user = getUserByIdentity({ userId: pending.userId, email: pending.email });
    ensureUserSecurityFields(user);
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });

    const passkey = user.passkeys.find((k) => k.id === response.id);
    if (!passkey) return res.status(401).json({ error: 'Unbekannter Sicherheitsschlüssel.' });

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeState.challenge,
      expectedOrigin: WEBAUTHN_ORIGIN,
      expectedRPID: WEBAUTHN_RP_ID,
      credential: {
        id: passkey.id,
        publicKey: fromBase64Url(passkey.publicKey),
        counter: Number(passkey.counter || 0),
        transports: Array.isArray(passkey.transports) ? passkey.transports : [],
      },
      requireUserVerification: false,
    });

    if (!verification.verified) return res.status(401).json({ error: 'Passkey-Überprüfung fehlgeschlagen.' });

    if (verification.authenticationInfo) {
      passkey.counter = verification.authenticationInfo.newCounter;
      passkey.lastUsedAt = new Date().toISOString();
      persistDbState();
    }

    pendingWebAuthn.delete(`login:${loginToken}`);
    consumeSecondFactorToken(loginToken);

    const safeUser = await completeLoginForUser(user);
    res.json({ success: true, user: safeUser });
  } catch (err) {
    console.error('POST /api/login/2fa/passkey/verify error:', err);
    res.status(500).json({ error: 'Passkey-Verifikation fehlgeschlagen.' });
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

// ── User Favorites ───────────────────────────────────────────────────────────
app.get('/api/favorites/me', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim() || null;
    const email = String(req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'email ist erforderlich.' });

    const favorites = getFavoritesForUser({ userId, email });
    res.json({ items: favorites.items });
  } catch (err) {
    console.error('GET /api/favorites/me error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/favorites/me', async (req, res) => {
  try {
    const { userId, email, drink } = req.body || {};
    const safeEmail = String(email || '').toLowerCase().trim();
    const safeUserId = String(userId || '').trim() || null;

    if (!safeEmail) return res.status(400).json({ error: 'email ist erforderlich.' });
    if (!drink || typeof drink !== 'object') return res.status(400).json({ error: 'drink ist erforderlich.' });

    const name = String(drink.name || '').trim();
    const size = Number(drink.size);
    const caffeine = Number(drink.caffeine);

    if (!name) return res.status(400).json({ error: 'drink.name ist erforderlich.' });
    if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ error: 'drink.size ist ungültig.' });
    if (!Number.isFinite(caffeine) || caffeine < 0) return res.status(400).json({ error: 'drink.caffeine ist ungültig.' });

    const item = upsertFavoriteForUser({
      userId: safeUserId,
      email: safeEmail,
      drink: {
        name,
        size: Math.round(size),
        caffeine: Math.round(caffeine),
        caffeinePerMl: drink.caffeinePerMl,
        icon: drink.icon || '🥤',
      },
    });

    res.json({ success: true, item });
  } catch (err) {
    console.error('POST /api/favorites/me error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/favorites/me', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim() || null;
    const email = String(req.query.email || '').toLowerCase().trim();
    const favoriteId = String(req.query.favoriteId || '').trim();

    if (!email) return res.status(400).json({ error: 'email ist erforderlich.' });
    if (!favoriteId) return res.status(400).json({ error: 'favoriteId ist erforderlich.' });

    const removed = removeFavoriteForUser({ userId, email, favoriteId });
    if (!removed) return res.status(404).json({ error: 'Favorit nicht gefunden.' });

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/favorites/me error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── USER SETTINGS ────────────────────────────────────────────────────────────
app.get('/api/settings/me', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim() || null;
    const email = String(req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'email ist erforderlich.' });

    const settings = getUserSettings({ userId, email });
    res.json(settings);
  } catch (err) {
    console.error('GET /api/settings/me error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/settings/me', async (req, res) => {
  try {
    const { userId, email, dailyLimit, notifyAtLimit, notifyLate, notifyRapid } = req.body || {};
    const safeEmail = String(email || '').toLowerCase().trim();
    const safeUserId = String(userId || '').trim() || null;

    if (!safeEmail) return res.status(400).json({ error: 'email ist erforderlich.' });
    if (dailyLimit !== undefined && (!Number.isFinite(dailyLimit) || dailyLimit < 0))
      return res.status(400).json({ error: 'dailyLimit muss eine positive Zahl sein.' });

    const settings = updateUserSettings({
      userId: safeUserId,
      email: safeEmail,
      dailyLimit,
      notifyAtLimit,
      notifyLate,
      notifyRapid,
    });

    res.json(settings);
  } catch (err) {
    console.error('POST /api/settings/me error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── USER SECURITY (2FA + PASSKEYS) ─────────────────────────────────────────
app.get('/api/security/me', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim() || null;
    const email = String(req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'email ist erforderlich.' });

    const user = getUserByIdentity({ userId, email });
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    res.json(sanitizeSecurityOverview(user));
  } catch (err) {
    console.error('GET /api/security/me error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/security/totp/setup', async (req, res) => {
  try {
    const { userId, email, password } = req.body || {};
    const safeEmail = String(email || '').toLowerCase().trim();
    const safeUserId = String(userId || '').trim() || null;
    if (!safeEmail || !password) return res.status(400).json({ error: 'email und password sind erforderlich.' });

    const user = getUserByIdentity({ userId: safeUserId, email: safeEmail });
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    if (user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ error: 'Passwort ist falsch.' });
    }

    ensureUserSecurityFields(user);
    const secret = authenticator.generateSecret();
    user.totp_temp_secret = secret;
    persistDbState();

    const otpauthUrl = authenticator.keyuri(user.email, WEBAUTHN_RP_NAME, secret);
    res.json({ success: true, secret, otpauthUrl, issuer: WEBAUTHN_RP_NAME });
  } catch (err) {
    console.error('POST /api/security/totp/setup error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/security/totp/enable', async (req, res) => {
  try {
    const { userId, email, code } = req.body || {};
    const safeEmail = String(email || '').toLowerCase().trim();
    const safeUserId = String(userId || '').trim() || null;
    if (!safeEmail || !code) return res.status(400).json({ error: 'email und code sind erforderlich.' });

    const user = getUserByIdentity({ userId: safeUserId, email: safeEmail });
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    ensureUserSecurityFields(user);
    if (!user.totp_temp_secret) return res.status(400).json({ error: 'Bitte zuerst TOTP-Setup starten.' });

    const ok = authenticator.verify({ token: String(code).replace(/\s+/g, ''), secret: user.totp_temp_secret });
    if (!ok) return res.status(401).json({ error: 'Ungültiger Verifizierungscode.' });

    user.totp_secret = user.totp_temp_secret;
    user.totp_temp_secret = null;
    user.totp_enabled = true;
    persistDbState();

    res.json({ success: true, security: sanitizeSecurityOverview(user) });
  } catch (err) {
    console.error('POST /api/security/totp/enable error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/security/totp/disable', async (req, res) => {
  try {
    const { userId, email, password } = req.body || {};
    const safeEmail = String(email || '').toLowerCase().trim();
    const safeUserId = String(userId || '').trim() || null;
    if (!safeEmail || !password) return res.status(400).json({ error: 'email und password sind erforderlich.' });

    const user = getUserByIdentity({ userId: safeUserId, email: safeEmail });
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    if (user.password_hash !== hashPassword(password)) {
      return res.status(401).json({ error: 'Passwort ist falsch.' });
    }

    ensureUserSecurityFields(user);
    user.totp_enabled = false;
    user.totp_secret = null;
    user.totp_temp_secret = null;
    persistDbState();

    res.json({ success: true, security: sanitizeSecurityOverview(user) });
  } catch (err) {
    console.error('POST /api/security/totp/disable error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/security/passkeys/register/options', async (req, res) => {
  try {
    const { userId, email } = req.body || {};
    const safeEmail = String(email || '').toLowerCase().trim();
    const safeUserId = String(userId || '').trim() || null;
    if (!safeEmail) return res.status(400).json({ error: 'email ist erforderlich.' });

    const user = getUserByIdentity({ userId: safeUserId, email: safeEmail });
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    ensureUserSecurityFields(user);

    if (!user.webauthn_user_id) {
      user.webauthn_user_id = toBase64Url(crypto.randomBytes(32));
      persistDbState();
    }

    const options = await generateRegistrationOptions({
      rpID: WEBAUTHN_RP_ID,
      rpName: WEBAUTHN_RP_NAME,
      userID: fromBase64Url(user.webauthn_user_id),
      userName: user.email,
      userDisplayName: user.name || user.email,
      timeout: 60000,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      excludeCredentials: user.passkeys.map((k) => ({ id: k.id, transports: k.transports || [] })),
    });

    const challengeToken = crypto.randomBytes(24).toString('hex');
    pendingWebAuthn.set(`register:${challengeToken}`, {
      type: 'register',
      userId: user.id,
      challenge: options.challenge,
      expiresAt: Date.now() + AUTH_CHALLENGE_TTL_MS,
    });

    res.json({ success: true, challengeToken, options });
  } catch (err) {
    console.error('POST /api/security/passkeys/register/options error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/security/passkeys/register/verify', async (req, res) => {
  try {
    const { userId, email, challengeToken, response, name } = req.body || {};
    const safeEmail = String(email || '').toLowerCase().trim();
    const safeUserId = String(userId || '').trim() || null;
    if (!safeEmail || !challengeToken || !response) {
      return res.status(400).json({ error: 'email, challengeToken und response sind erforderlich.' });
    }

    const user = getUserByIdentity({ userId: safeUserId, email: safeEmail });
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    ensureUserSecurityFields(user);

    const challengeState = pendingWebAuthn.get(`register:${challengeToken}`);
    if (!challengeState || challengeState.type !== 'register' || challengeState.userId !== user.id) {
      return res.status(401).json({ error: 'Registrierungs-Challenge fehlt oder ist abgelaufen.' });
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeState.challenge,
      expectedOrigin: WEBAUTHN_ORIGIN,
      expectedRPID: WEBAUTHN_RP_ID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(401).json({ error: 'Sicherheitsschlüssel konnte nicht verifiziert werden.' });
    }

    const credential = verification.registrationInfo.credential;
    const credentialId = credential.id;
    if (user.passkeys.some((k) => k.id === credentialId)) {
      pendingWebAuthn.delete(`register:${challengeToken}`);
      return res.status(409).json({ error: 'Dieser Schlüssel ist bereits registriert.' });
    }

    user.passkeys.push({
      id: credentialId,
      publicKey: toBase64Url(credential.publicKey),
      counter: Number(credential.counter || 0),
      transports: Array.isArray(response.response?.transports) ? response.response.transports : [],
      name: String(name || 'Sicherheitsschlüssel').trim() || 'Sicherheitsschlüssel',
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
    });

    pendingWebAuthn.delete(`register:${challengeToken}`);
    persistDbState();
    res.json({ success: true, security: sanitizeSecurityOverview(user) });
  } catch (err) {
    console.error('POST /api/security/passkeys/register/verify error:', err);
    res.status(500).json({ error: 'Passkey-Registrierung fehlgeschlagen.' });
  }
});

app.delete('/api/security/passkeys/:credentialId', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim() || null;
    const email = String(req.query.email || '').toLowerCase().trim();
    const credentialId = String(req.params.credentialId || '').trim();
    if (!email || !credentialId) return res.status(400).json({ error: 'email und credentialId sind erforderlich.' });

    const user = getUserByIdentity({ userId, email });
    if (!user) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
    ensureUserSecurityFields(user);

    const before = user.passkeys.length;
    user.passkeys = user.passkeys.filter((k) => k.id !== credentialId);
    if (user.passkeys.length === before) {
      return res.status(404).json({ error: 'Sicherheitsschlüssel nicht gefunden.' });
    }

    persistDbState();
    res.json({ success: true, security: sanitizeSecurityOverview(user) });
  } catch (err) {
    console.error('DELETE /api/security/passkeys/:credentialId error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── CUSTOM DRINKS ───────────────────────────────────────────────────────────
app.get('/api/custom-drinks/me', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim() || null;
    const email = String(req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'email ist erforderlich.' });

    const drinks = getCustomDrinksForUser({ userId, email });
    res.json({ items: drinks });
  } catch (err) {
    console.error('GET /api/custom-drinks/me error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/custom-drinks/me', async (req, res) => {
  try {
    const { userId, email, name, size, caffeine, icon } = req.body || {};
    const safeEmail = String(email || '').toLowerCase().trim();
    const safeUserId = String(userId || '').trim() || null;

    if (!safeEmail) return res.status(400).json({ error: 'email ist erforderlich.' });
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name ist erforderlich.' });
    if (!Number.isFinite(size) || size <= 0) return res.status(400).json({ error: 'size muss positiv sein.' });
    if (!Number.isFinite(caffeine) || caffeine < 0) return res.status(400).json({ error: 'caffeine muss >= 0 sein.' });

    const drink = addCustomDrink({
      userId: safeUserId,
      email: safeEmail,
      name: String(name).trim(),
      size: Math.round(size),
      caffeine: Math.round(caffeine),
      icon: icon || '🥤',
    });

    res.json({ success: true, item: drink });
  } catch (err) {
    console.error('POST /api/custom-drinks/me error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/custom-drinks/me', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim() || null;
    const email = String(req.query.email || '').toLowerCase().trim();
    const drinkId = String(req.query.drinkId || '').trim();

    if (!email) return res.status(400).json({ error: 'email ist erforderlich.' });
    if (!drinkId) return res.status(400).json({ error: 'drinkId ist erforderlich.' });

    const removed = removeCustomDrink({ userId, email, drinkId });
    if (!removed) return res.status(404).json({ error: 'Getränk nicht gefunden.' });

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/custom-drinks/me error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── STATISTICS ───────────────────────────────────────────────────────────────
app.get('/api/stats/today', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim() || null;
    const email = String(req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'email ist erforderlich.' });

    const stats = getTodayStats({ userId, email });
    res.json(stats);
  } catch (err) {
    console.error('GET /api/stats/today error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/stats/weekly', async (req, res) => {
  try {
    const userId = String(req.query.userId || '').trim() || null;
    const email = String(req.query.email || '').toLowerCase().trim();
    if (!email) return res.status(400).json({ error: 'email ist erforderlich.' });

    const stats = getWeeklyStats({ userId, email });
    res.json({ items: stats });
  } catch (err) {
    console.error('GET /api/stats/weekly error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ── Admin AI Config ──────────────────────────────────────────────────────────
app.get('/api/admin/ai', requireAdmin, (req, res) => {
  const cfg = loadAiConfig();
  const maskedKey = cfg.apiKey
    ? cfg.apiKey.slice(0, 8) + '••••••••' + cfg.apiKey.slice(-4)
    : '';
  const maskedBraveKey = cfg.braveSearchKey
    ? cfg.braveSearchKey.slice(0, 4) + '••••••••' + cfg.braveSearchKey.slice(-4)
    : '';
  res.json({
    apiKeySet: !!cfg.apiKey,
    apiKeyMasked: maskedKey,
    model: cfg.model,
    braveSearchKeySet: !!cfg.braveSearchKey,
    braveSearchKeyMasked: maskedBraveKey,
  });
});

app.post('/api/admin/ai', requireAdmin, (req, res) => {
  const { apiKey, model, braveSearchKey } = req.body || {};
  if (apiKey !== undefined && typeof apiKey !== 'string')
    return res.status(400).json({ error: 'apiKey muss ein String sein.' });
  if (braveSearchKey !== undefined && typeof braveSearchKey !== 'string')
    return res.status(400).json({ error: 'braveSearchKey muss ein String sein.' });
  const current = loadAiConfig();
  saveAiConfig({
    apiKey:         typeof apiKey         === 'string' ? apiKey.trim()         : current.apiKey,
    model:          typeof model          === 'string' && model.trim() ? model.trim() : current.model,
    braveSearchKey: typeof braveSearchKey === 'string' ? braveSearchKey.trim() : current.braveSearchKey,
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

    const cleanedDescription = description.trim();
    const aiCfg = loadAiConfig();

    // Try Brave Search first if key is configured, fall back to OpenFoodFacts
    let webContext;
    let searchSource = 'none';
    if (aiCfg.braveSearchKey) {
      const braveContext = await fetchDrinkWebContextBrave(cleanedDescription, aiCfg.braveSearchKey);
      if (braveContext) {
        webContext = braveContext;
        searchSource = 'brave';
      }
    }
    if (searchSource === 'none') {
      const webHits = await fetchDrinkWebContext(cleanedDescription);
      webContext = formatDrinkWebContext(webHits);
      searchSource = webHits.length > 0 ? 'openfoodfacts' : 'none';
    }

    const messages = [
      {
        role: 'system',
        content: `Du bist ein Experte für Getränke und Koffeingehalt. Nutze die bereitgestellten Online-Treffer als primäre Datenquelle und antworte AUSSCHLIESSLICH mit einem JSON-Objekt ohne Markdown-Formatierung. Format:
{"name":"Getränkename","caffeinePer100ml":Zahl,"sizeMl":Zahl,"confidence":"hoch|mittel|niedrig","hint":"optionaler Hinweis auf Deutsch"}
Wichtig: caffeinePer100ml und sizeMl müssen Ganzzahlen sein. Bei widersprüchlichen Quellen nimm den konservativeren Wert und setze confidence auf "mittel" oder "niedrig".`,
      },
      {
        role: 'user',
        content: `Getränkeangabe des Nutzers:\n${cleanedDescription}\n\nOnline-Treffer:\n${webContext}`,
      },
    ];

    const raw = await callOpenRouter(messages);

    // Extract JSON from response (strip markdown if present)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Keine gültige Antwort vom AI-Modell.');

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.name || typeof parsed.caffeinePer100ml !== 'number')
      throw new Error('Unvollständige AI-Antwort.');

    const defaultHint = searchSource === 'brave'
      ? 'Mit Brave Search abgeglichen.'
      : searchSource === 'openfoodfacts'
        ? 'Mit Online-Treffern abgeglichen (OpenFoodFacts).'
        : 'Keine passenden Online-Treffer gefunden, Schätzung basiert auf Standards.';

    res.json({
      name: String(parsed.name),
      caffeinePer100ml: Math.max(0, Math.round(Number(parsed.caffeinePer100ml))),
      sizeMl: Math.max(1, Math.round(Number(parsed.sizeMl || 250))),
      confidence: parsed.confidence || 'mittel',
      hint: parsed.hint || defaultHint,
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
      REDIS_KEYS.auth_config,    JSON.stringify(dbState.auth_config),
      REDIS_KEYS.reminders,      JSON.stringify(dbState.reminders),
      REDIS_KEYS.favorites,      JSON.stringify(dbState.favorites),
      REDIS_KEYS.ai_config,      JSON.stringify(dbState.ai_config),
      REDIS_KEYS.user_settings,  JSON.stringify(dbState.user_settings),
      REDIS_KEYS.custom_drinks,  JSON.stringify(dbState.custom_drinks),
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

    setInterval(() => {
      cleanupAuthChallenges();
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
