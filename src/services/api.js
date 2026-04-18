const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || window.location.origin;

export const fetchLogs = async (date) => {
  const url = new URL('/api/logs', API_BASE_URL);
  url.searchParams.set('date', date);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('Fehler beim Laden der Logs');
  }
  return response.json();
};

export const createLog = async (logData) => {
  const response = await fetch(`${API_BASE_URL}/api/logs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(logData),
  });

  if (!response.ok) {
    throw new Error('Fehler beim Speichern des Logs');
  }

  return response.json();
};

export const deleteLog = async (id) => {
  const response = await fetch(`${API_BASE_URL}/api/logs/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error('Fehler beim Löschen des Logs');
  }

  return response.json();
};

export const fetchReminderSettings = async ({ userId, email }) => {
  const url = new URL('/api/reminders/me', API_BASE_URL);
  if (userId) url.searchParams.set('userId', userId);
  if (email) url.searchParams.set('email', email);

  const response = await fetch(url.toString());
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Fehler beim Laden der Erinnerungen');
  }
  return data;
};

export const saveReminderSettings = async (payload) => {
  const response = await fetch(`${API_BASE_URL}/api/reminders/me`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Fehler beim Speichern der Erinnerungen');
  }

  return data;
};

export const fetchFavorites = async ({ userId, email }) => {
  const url = new URL('/api/favorites/me', API_BASE_URL);
  if (userId) url.searchParams.set('userId', userId);
  if (email) url.searchParams.set('email', email);

  const response = await fetch(url.toString());
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Fehler beim Laden der Favoriten');
  }
  return data;
};

export const addFavorite = async (payload) => {
  const response = await fetch(`${API_BASE_URL}/api/favorites/me`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Fehler beim Speichern des Favoriten');
  }

  return data;
};

export const removeFavorite = async ({ userId, email, favoriteId }) => {
  const url = new URL('/api/favorites/me', API_BASE_URL);
  if (userId) url.searchParams.set('userId', userId);
  if (email) url.searchParams.set('email', email);
  if (favoriteId) url.searchParams.set('favoriteId', favoriteId);

  const response = await fetch(url.toString(), {
    method: 'DELETE',
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Fehler beim Entfernen des Favoriten');
  }

  return data;
};
