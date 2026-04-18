import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';

const AUTH_KEY = 'et-session';

// Credentials from env or fallback defaults
const ADMIN_EMAIL    = import.meta.env.VITE_ADMIN_EMAIL    || 'admin@energytracker.de';
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'Admin@2024!';
const USER_EMAIL     = import.meta.env.VITE_USER_EMAIL     || 'user@energytracker.de';
const USER_PASSWORD  = import.meta.env.VITE_USER_PASSWORD  || 'User@2024!';

const BUILTIN_USERS = [
  { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin', name: 'Administrator' },
  { email: USER_EMAIL,  password: USER_PASSWORD,  role: 'user',  name: 'Benutzer'       },
];

const API_BASE = import.meta.env.VITE_API_BASE_URL || window.location.origin;

export const startAuthentikLogin = () => {
  window.location.assign(`${API_BASE}/api/auth/authentik/start`);
};

export const completeAuthentikLogin = async (authToken) => {
  const token = String(authToken || '').trim();
  if (!token) throw new Error('Authentik-Token fehlt.');

  const resp = await fetch(`${API_BASE}/api/auth/authentik/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authToken: token }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Authentik-Anmeldung fehlgeschlagen.');

  const session = { ...data.user, loginAt: Date.now() };
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return session;
};

export const isWebAuthnSupported = () => {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
};

/**
 * Attempt login. Checks built-in credentials first (if demo enabled), then server-registered users.
 * Returns session object on success, throws on failure.
 */
export const login = async (email, password) => {
  const trimmed = email.trim().toLowerCase();

  // 1. Check built-in admin/user credentials (only if demo access enabled)
  const builtin = BUILTIN_USERS.find(
    (u) => u.email.toLowerCase() === trimmed && u.password === password
  );
  if (builtin) {
    // Verify demo is still enabled server-side
    try {
      const resp = await fetch(`${API_BASE}/api/settings/public`);
      if (resp.ok) {
        const settings = await resp.json();
        if (settings.demoEnabled === false) {
          throw new Error('Demo-Zugang ist deaktiviert.');
        }
      }
    } catch (err) {
      if (err.message === 'Demo-Zugang ist deaktiviert.') throw err;
      // If server is unreachable, allow built-in login as fallback
    }
    const session = {
      email:   builtin.email,
      role:    builtin.role,
      name:    builtin.name,
      loginAt: Date.now(),
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(session));
    return session;
  }

  // 2. Check server-registered users
  const resp = await fetch(`${API_BASE}/api/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email: trimmed, password }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Anmeldung fehlgeschlagen.');

  if (data.requiresSecondFactor) {
    return {
      requiresSecondFactor: true,
      loginToken: data.loginToken,
      methods: data.methods || { totp: false, passkey: false },
      user: data.user,
    };
  }

  const session = { ...data.user, loginAt: Date.now() };
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return session;
};

export const completeLoginWithTotp = async ({ loginToken, code }) => {
  const resp = await fetch(`${API_BASE}/api/login/2fa/totp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginToken, code }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || '2FA-Code ungültig.');

  const session = { ...data.user, loginAt: Date.now() };
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return session;
};

export const completeLoginWithPasskey = async ({ loginToken }) => {
  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn wird von diesem Browser nicht unterstützt. Bitte nutze den 2FA-Code.');
  }

  const optionsResp = await fetch(`${API_BASE}/api/login/2fa/passkey/options`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginToken }),
  });
  const optionsData = await optionsResp.json();
  if (!optionsResp.ok) throw new Error(optionsData.error || 'Passkey-Optionen konnten nicht geladen werden.');

  const credential = await startAuthentication({
    optionsJSON: optionsData.options,
  });

  const verifyResp = await fetch(`${API_BASE}/api/login/2fa/passkey/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginToken, response: credential }),
  });
  const verifyData = await verifyResp.json();
  if (!verifyResp.ok) throw new Error(verifyData.error || 'Passkey-Verifikation fehlgeschlagen.');

  const session = { ...verifyData.user, loginAt: Date.now() };
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return session;
};

/** Clear the stored session. */
export const logout = () => {
  localStorage.removeItem(AUTH_KEY);
};

/** Return current session object, or null if not logged in. */
export const getSession = () => {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

/** True when the current user has the admin role. */
export const isAdmin = () => getSession()?.role === 'admin';

// ── Impersonation ─────────────────────────────────────────────────────────────
const IMPERSONATOR_KEY = 'et-impersonator';

/** Start impersonating a user. Saves the current admin session and switches to the target. */
export const startImpersonation = (targetUser) => {
  const adminSession = getSession();
  localStorage.setItem(IMPERSONATOR_KEY, JSON.stringify(adminSession));
  const session = { ...targetUser, loginAt: Date.now(), impersonated: true };
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return session;
};

/** Stop impersonating and restore the original admin session. */
export const stopImpersonation = () => {
  const adminSession = localStorage.getItem(IMPERSONATOR_KEY);
  localStorage.removeItem(IMPERSONATOR_KEY);
  if (adminSession) {
    localStorage.setItem(AUTH_KEY, adminSession);
    return JSON.parse(adminSession);
  }
  localStorage.removeItem(AUTH_KEY);
  return null;
};

/** Return the original admin session if currently impersonating, otherwise null. */
export const getImpersonatorSession = () => {
  try {
    const raw = localStorage.getItem(IMPERSONATOR_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

