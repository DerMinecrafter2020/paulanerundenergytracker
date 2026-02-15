const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

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
