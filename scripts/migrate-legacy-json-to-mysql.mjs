import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const usersJsonPath = process.env.LEGACY_USERS_FILE || path.join(rootDir, 'data', 'users.json');
const smtpJsonPath = process.env.LEGACY_SMTP_FILE || path.join(rootDir, 'data', 'smtp-config.json');

const readJsonIfExists = (filePath, fallbackValue) => {
  try {
    if (!fs.existsSync(filePath)) return fallbackValue;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse ${filePath}: ${err.message}`);
  }
};

const toBoolean = (value, fallback = false) => {
  if (value === null || value === undefined) return fallback;
  return !!value;
};

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toIsoDateOrNull = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
};

const getPool = async () => {
  return mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'caffeine_tracker',
    port: Number(process.env.MYSQL_PORT || 3306),
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });
};

const ensureTables = async (pool) => {
  await pool.execute(`
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
  `);

  await pool.execute(`
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
  `);
};

const migrateUsers = async (pool, users) => {
  if (!Array.isArray(users) || users.length === 0) {
    console.log('No legacy users found.');
    return 0;
  }

  let migrated = 0;

  for (const user of users) {
    if (!user?.email || !user?.passwordHash) continue;

    const id = user.id || cryptoRandomUuidFallback();
    const email = String(user.email).toLowerCase();
    const role = user.role === 'admin' ? 'admin' : 'user';

    await pool.execute(
      `INSERT INTO users
        (id, name, email, password_hash, role, verified, verify_token, verify_token_expiry, created_at, last_login)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?)
       ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        password_hash = VALUES(password_hash),
        role = VALUES(role),
        verified = VALUES(verified),
        verify_token = VALUES(verify_token),
        verify_token_expiry = VALUES(verify_token_expiry),
        last_login = VALUES(last_login)`,
      [
        id,
        user.name || 'Benutzer',
        email,
        user.passwordHash,
        role,
        toBoolean(user.verified, false),
        user.verifyToken || null,
        user.verifyTokenExpiry || null,
        toIsoDateOrNull(user.createdAt),
        toIsoDateOrNull(user.lastLogin),
      ]
    );

    migrated += 1;
  }

  console.log(`Migrated users: ${migrated}`);
  return migrated;
};

const migrateSmtp = async (pool, smtp) => {
  if (!smtp || typeof smtp !== 'object') {
    console.log('No legacy SMTP settings found.');
    return false;
  }

  await pool.execute(
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
      demo_enabled = VALUES(demo_enabled)`,
    [
      smtp.host || null,
      toNumber(smtp.port, 587),
      toBoolean(smtp.secure, false),
      smtp.auth?.user || null,
      smtp.auth?.pass || null,
      smtp.fromName || 'Koffein-Tracker',
      smtp.fromEmail || smtp.auth?.user || null,
      smtp.baseUrl || '',
      smtp.registrationEnabled !== false,
      smtp.demoEnabled !== false,
    ]
  );

  console.log('Migrated SMTP settings: 1');
  return true;
};

const cryptoRandomUuidFallback = () => {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, (ch) => {
    const rand = Math.floor(Math.random() * 16);
    const val = ch === 'x' ? rand : (rand & 0x3) | 0x8;
    return val.toString(16);
  });
};

const main = async () => {
  const pool = await getPool();

  try {
    await ensureTables(pool);

    const users = readJsonIfExists(usersJsonPath, []);
    const smtp = readJsonIfExists(smtpJsonPath, null);

    console.log(`Legacy users file: ${usersJsonPath}`);
    console.log(`Legacy SMTP file: ${smtpJsonPath}`);

    await migrateUsers(pool, users);
    await migrateSmtp(pool, smtp);

    console.log('Legacy migration finished successfully.');
  } finally {
    await pool.end();
  }
};

main().catch((err) => {
  console.error('Legacy migration failed:', err.message);
  process.exit(1);
});
