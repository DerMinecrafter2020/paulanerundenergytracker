import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Header from './components/Header';
import ProgressBar from './components/ProgressBar';
import PresetDrinks from './components/PresetDrinks';
import ManualCalculator from './components/ManualCalculator';
import DrinkHistory from './components/DrinkHistory';
import { signInAnonymouslyUser, onAuthChange } from './firebase';
import { 
  addCaffeineLog, 
  deleteCaffeineLog, 
  subscribeToTodayLogs 
} from './services/caffeineService';

function App() {
  const [user, setUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);

  // Authentifizierung initialisieren
  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setIsAuthLoading(false);
      } else {
        try {
          await signInAnonymouslyUser();
        } catch (err) {
          setError('Fehler bei der Verbindung. Bitte lade die Seite neu.');
          setIsAuthLoading(false);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Logs abonnieren wenn User authentifiziert ist
  useEffect(() => {
    if (!user) return;

    const unsubscribe = subscribeToTodayLogs(user.uid, (todayLogs) => {
      setLogs(todayLogs);
    });

    return () => unsubscribe();
  }, [user]);

  // Gesamtes Koffein für heute berechnen
  const totalCaffeineToday = useMemo(() => {
    return logs.reduce((sum, log) => sum + (log.caffeine || 0), 0);
  }, [logs]);

  // Getränk hinzufügen
  const handleAddDrink = useCallback(async (drinkData) => {
    if (!user) return;

    setIsOperationLoading(true);
    setError(null);

    try {
      await addCaffeineLog(user.uid, drinkData);
    } catch (err) {
      setError('Fehler beim Hinzufügen. Bitte versuche es erneut.');
      console.error(err);
    } finally {
      setIsOperationLoading(false);
    }
  }, [user]);

  // Eintrag löschen
  const handleDeleteLog = useCallback(async (logId) => {
    if (!user) return;

    setIsOperationLoading(true);
    setError(null);

    try {
      await deleteCaffeineLog(user.uid, logId);
    } catch (err) {
      setError('Fehler beim Löschen. Bitte versuche es erneut.');
      console.error(err);
    } finally {
      setIsOperationLoading(false);
    }
  }, [user]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header 
        isAuthenticated={!!user} 
        isLoading={isAuthLoading || isOperationLoading} 
      />

      <main className="max-w-lg mx-auto px-4 pb-8">
        {/* Fehlermeldung */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 
            px-4 py-3 rounded-2xl mb-6 animate-fade-in">
            <p className="text-sm">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="text-xs underline mt-1"
            >
              Ausblenden
            </button>
          </div>
        )}

        {/* Fortschrittsbalken */}
        <ProgressBar currentCaffeine={totalCaffeineToday} />

        {/* Preset Getränke */}
        <PresetDrinks 
          onAddDrink={handleAddDrink} 
          isLoading={isOperationLoading || !user}
        />

        {/* Manueller Rechner */}
        <ManualCalculator 
          onAddDrink={handleAddDrink} 
          isLoading={isOperationLoading || !user}
        />

        {/* Verlauf */}
        <DrinkHistory 
          logs={logs} 
          onDeleteLog={handleDeleteLog}
          isLoading={isOperationLoading}
        />
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-slate-400 text-sm">
        <p>Koffein-Tracker © {new Date().getFullYear()}</p>
        <p className="text-xs mt-1">Empfohlenes Tageslimit: 400 mg</p>
      </footer>
    </div>
  );
}

export default App;
