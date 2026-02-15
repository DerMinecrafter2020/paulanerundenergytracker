import { fetchLogs, createLog, deleteLog as deleteApiLog } from './api';

const STORAGE_KEY = 'caffeine-logs';
const SOURCE_KEY = 'data-source';

export const DATA_SOURCES = {
  LOCAL: 'local',
  MYSQL: 'mysql',
};

export const getSavedDataSource = () => {
  return localStorage.getItem(SOURCE_KEY) || DATA_SOURCES.MYSQL;
};

export const setSavedDataSource = (value) => {
  localStorage.setItem(SOURCE_KEY, value);
};

const loadAllLogs = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Fehler beim Laden der Logs:', err);
    return [];
  }
};

const saveAllLogs = (allLogs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allLogs));
  } catch (err) {
    console.error('Fehler beim Speichern der Logs:', err);
  }
};

export const fetchTodayLogs = async (source, date) => {
  if (source === DATA_SOURCES.LOCAL) {
    const allLogs = loadAllLogs();
    return allLogs
      .filter((log) => log.date === date)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  return fetchLogs(date);
};

export const addLog = async (source, logData) => {
  if (source === DATA_SOURCES.LOCAL) {
    const allLogs = loadAllLogs();
    const newLog = {
      id: (crypto?.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      ...logData,
      createdAt: new Date().toISOString(),
    };
    const updatedAllLogs = [newLog, ...allLogs];
    saveAllLogs(updatedAllLogs);
    return newLog;
  }

  return createLog(logData);
};

export const removeLog = async (source, logId) => {
  if (source === DATA_SOURCES.LOCAL) {
    const allLogs = loadAllLogs();
    const updatedAllLogs = allLogs.filter((log) => log.id !== logId);
    saveAllLogs(updatedAllLogs);
    return { success: true };
  }

  return deleteApiLog(logId);
};
