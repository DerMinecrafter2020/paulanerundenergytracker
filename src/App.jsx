import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Header from './components/Header';
import ProgressBar from './components/ProgressBar';
import PresetDrinks from './components/PresetDrinks';
import OnlineSearch from './components/OnlineSearch';
import ManualCalculator from './components/ManualCalculator';
import DrinkHistory from './components/DrinkHistory';
import { fetchLogs, createLog, deleteLog } from './services/api';

const getTodayKey = () => new Date().toISOString().split('T')[0];

function App() {
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [manualPrefill, setManualPrefill] = useState(null);

  // Logs für heute laden (lokal)
  useEffect(() => {
    const loadToday = async () => {
      try {
        const today = getTodayKey();
        const todayLogs = await fetchLogs(today);
        setLogs(todayLogs);
      } catch (err) {
        setError('Fehler beim Laden der Daten. Starte den API-Server?');
        console.error(err);
      }
    };

    loadToday();
  }, []);

  // Gesamtes Koffein für heute berechnen
  const totalCaffeineToday = useMemo(() => {
    return logs.reduce((sum, log) => sum + (log.caffeine || 0), 0);
  }, [logs]);

  // Getränk hinzufügen
  const handleAddDrink = useCallback(async (drinkData) => {
    setIsOperationLoading(true);
    setError(null);

    try {
      const payload = {
        ...drinkData,
        date: getTodayKey(),
      };
      const created = await createLog(payload);
      setLogs((prev) => [created, ...prev]);
    } catch (err) {
      setError('Fehler beim Hinzufügen. Bitte versuche es erneut.');
      console.error(err);
    } finally {
      setIsOperationLoading(false);
    }
  }, []);

  // Eintrag löschen
  const handleDeleteLog = useCallback(async (logId) => {
    setIsOperationLoading(true);
    setError(null);

    try {
      await deleteLog(logId);
      setLogs((prev) => prev.filter((log) => log.id !== logId));
    } catch (err) {
      setError('Fehler beim Löschen. Bitte versuche es erneut.');
      console.error(err);
    } finally {
      setIsOperationLoading(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header 
        isAuthenticated={true} 
        isLoading={isOperationLoading} 
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
          isLoading={isOperationLoading}
        />

        {/* Online-Suche */}
        <OnlineSearch
          onSelect={(item) =>
            setManualPrefill({
              name: item.name,
              caffeinePer100ml: item.caffeinePer100ml,
              sizeMl: item.sizeMl,
            })
          }
        />

        {/* Manueller Rechner */}
        <ManualCalculator 
          onAddDrink={handleAddDrink} 
          isLoading={isOperationLoading}
          prefill={manualPrefill}
          onPrefillApplied={() => setManualPrefill(null)}
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
