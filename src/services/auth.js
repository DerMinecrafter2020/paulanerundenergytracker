const AUTH_KEY = 'et-session';

// Credentials from env or fallback defaults
const ADMIN_EMAIL    = import.meta.env.VITE_ADMIN_EMAIL    || 'admin@energytracker.de';
const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'Admin@2024!';
const USER_EMAIL     = import.meta.env.VITE_USER_EMAIL     || 'user@energytracker.de';
const USER_PASSWORD  = import.meta.env.VITE_USER_PASSWORD  || 'User@2024!';

const USERS = [
  { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: 'admin', name: 'Administrator' },
  { email: USER_EMAIL,  password: USER_PASSWORD,  role: 'user',  name: 'Benutzer'       },
];

/**
 * Attempt login. Returns session object on success, throws on failure.
 */
export const login = (email, password) => {
  const trimmed = email.trim().toLowerCase();
  const user = USERS.find(
    (u) => u.email.toLowerCase() === trimmed && u.password === password
  );
  if (!user) {
    throw new Error('Ungültige E-Mail-Adresse oder falsches Passwort.');
  }
  const session = {
    email:   user.email,
    role:    user.role,
    name:    user.name,
    loginAt: Date.now(),
  };
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
