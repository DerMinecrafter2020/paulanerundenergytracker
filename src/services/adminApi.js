const API_BASE     = import.meta.env.VITE_API_BASE_URL || window.location.origin;
const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET || 'et-admin-2024';

const adminHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Admin-Secret': ADMIN_SECRET,
});

const handle = async (resp) => {
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);
  return data;
};

// ── SMTP ─────────────────────────────────────────────────────────────────
export const fetchSmtpConfig = () =>
  fetch(`${API_BASE}/api/admin/smtp`, { headers: adminHeaders() }).then(handle);

export const saveSmtpConfig = (config) =>
  fetch(`${API_BASE}/api/admin/smtp`, {
    method:  'POST',
    headers: adminHeaders(),
    body:    JSON.stringify(config),
  }).then(handle);

export const testSmtpConfig = (testEmail) =>
  fetch(`${API_BASE}/api/admin/smtp/test`, {
    method:  'POST',
    headers: adminHeaders(),
    body:    JSON.stringify({ testEmail }),
  }).then(handle);

export const testDiscordWebhook = (webhookUrl) =>
  fetch(`${API_BASE}/api/admin/discord/test`, {
    method:  'POST',
    headers: adminHeaders(),
    body:    JSON.stringify({ webhookUrl }),
  }).then(handle);

// ── AI Config ──────────────────────────────────────────────────────────────
export const fetchAiConfig = () =>
  fetch(`${API_BASE}/api/admin/ai`, { headers: adminHeaders() }).then(handle);

export const saveAiConfig = ({ apiKey, model }) =>
  fetch(`${API_BASE}/api/admin/ai`, {
    method:  'POST',
    headers: adminHeaders(),
    body:    JSON.stringify({ apiKey, model }),
  }).then(handle);

// ── Users ─────────────────────────────────────────────────────────────────
export const fetchAdminUsers = () =>
  fetch(`${API_BASE}/api/admin/users`, { headers: adminHeaders() }).then(handle);

export const verifyAdminUser = (id) =>
  fetch(`${API_BASE}/api/admin/users/${id}/verify`, {
    method:  'POST',
    headers: adminHeaders(),
  }).then(handle);

export const deleteAdminUser = (id) =>
  fetch(`${API_BASE}/api/admin/users/${id}`, {
    method:  'DELETE',
    headers: adminHeaders(),
  }).then(handle);

export const setUserRole = (id, role) =>
  fetch(`${API_BASE}/api/admin/users/${id}/role`, {
    method:  'POST',
    headers: adminHeaders(),
    body:    JSON.stringify({ role }),
  }).then(handle);

export const createAdminUser = ({ name, email, password, role, verified }) =>
  fetch(`${API_BASE}/api/admin/users`, {
    method:  'POST',
    headers: adminHeaders(),
    body:    JSON.stringify({ name, email, password, role, verified }),
  }).then(handle);

export const fetchPublicSettings = () =>
  fetch(`${API_BASE}/api/settings/public`).then(handle);

export const checkDockerUpdate = () =>
  fetch(`${API_BASE}/api/update/check`, { headers: adminHeaders() }).then(handle);
