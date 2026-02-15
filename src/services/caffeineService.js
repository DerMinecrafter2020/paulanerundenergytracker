import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from './firebase';

// App-ID für die Firestore-Struktur
const APP_ID = 'caffeine-tracker';

// Pfad zum Logs-Collection für einen Benutzer
const getLogsPath = (userId) => {
  return `artifacts/${APP_ID}/users/${userId}/logs`;
};

// Neuen Koffein-Eintrag hinzufügen
export const addCaffeineLog = async (userId, logData) => {
  try {
    const logsRef = collection(db, getLogsPath(userId));
    const docRef = await addDoc(logsRef, {
      ...logData,
      createdAt: serverTimestamp(),
      date: new Date().toISOString().split('T')[0] // YYYY-MM-DD Format
    });
    return docRef.id;
  } catch (error) {
    console.error('Fehler beim Hinzufügen des Logs:', error);
    throw error;
  }
};

// Koffein-Eintrag löschen
export const deleteCaffeineLog = async (userId, logId) => {
  try {
    const logRef = doc(db, getLogsPath(userId), logId);
    await deleteDoc(logRef);
  } catch (error) {
    console.error('Fehler beim Löschen des Logs:', error);
    throw error;
  }
};

// Echtzeit-Listener für Logs eines Tages
export const subscribeToTodayLogs = (userId, callback) => {
  const today = new Date().toISOString().split('T')[0];
  const logsRef = collection(db, getLogsPath(userId));
  const q = query(
    logsRef,
    where('date', '==', today),
    orderBy('createdAt', 'desc')
  );
  
  return onSnapshot(q, (snapshot) => {
    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date()
    }));
    callback(logs);
  }, (error) => {
    console.error('Fehler beim Laden der Logs:', error);
    callback([]);
  });
};
