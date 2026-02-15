import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Header from './components/Header';
import ProgressBar from './components/ProgressBar';
import PresetDrinks from './components/PresetDrinks';
import OnlineSearch from './components/OnlineSearch';
import ManualCalculator from './components/ManualCalculator';
import DrinkHistory from './components/DrinkHistory';
import {
  DATA_SOURCES,
  getSavedDataSource,
  setSavedDataSource,
  fetchTodayLogs,
  addLog,
  removeLog,
} from './services/storage';

const getTodayKey = () => new Date().toISOString().split('T')[0];

function App() {
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);
  const [manualPrefill, setManualPrefill] = useState(null);
  const [dataSource, setDataSource] = useState(getSavedDataSource());
  const [currentVersion, setCurrentVersion] = useState('local');
  const [latestVersion, setLatestVersion] = useState(null);

  // Logs für heute laden (je nach Datenquelle)
  useEffect(() => {
    const loadToday = async () => {
      try {
        const today = getTodayKey();
        const todayLogs = await fetchTodayLogs(dataSource, today);
        setLogs(todayLogs);
      } catch (err) {
        setError('Fehler beim Laden der Daten. Prüfe die Datenquelle.');
        console.error(err);
      }
    };

    loadToday();
  }, [dataSource]);

  // Update-Check
  useEffect(() => {
    let isMounted = true;

    const checkVersion = async () => {
      try {
        const response = await fetch('/api/version');
        if (!response.ok) return;
        const data = await response.json();
        if (!isMounted) return;
        setLatestVersion(data.version || null);
      } catch (err) {
        // Ignorieren, falls API nicht erreichbar
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, 5 * 60 * 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
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
      const created = await addLog(dataSource, payload);
      setLogs((prev) => [created, ...prev]);
    } catch (err) {
      setError('Fehler beim Hinzufügen. Bitte versuche es erneut.');
      console.error(err);
    } finally {
      setIsOperationLoading(false);
    }
  }, [dataSource]);

  // Eintrag löschen
  const handleDeleteLog = useCallback(async (logId) => {
    setIsOperationLoading(true);
    setError(null);

    try {
      await removeLog(dataSource, logId);
      setLogs((prev) => prev.filter((log) => log.id !== logId));
    } catch (err) {
      setError('Fehler beim Löschen. Bitte versuche es erneut.');
      console.error(err);
    } finally {
      setIsOperationLoading(false);
    }
  }, [dataSource]);

  return (
    <div className="min-h-screen bg-slate-50">
      <Header 
        isAuthenticated={true} 
        isLoading={isOperationLoading} 
      />

      <main className="max-w-lg mx-auto px-4 pb-8">
        {/* Update Hinweis */}
        {latestVersion && latestVersion !== currentVersion && (
          <div className="bg-blue-50 border border-blue-200 text-blue-700 
            px-4 py-3 rounded-2xl mb-6 animate-fade-in">
            <p className="text-sm font-medium">Update verfügbar: {latestVersion}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-xs underline mt-1"
            >
              Neu laden
            </button>
          </div>
        )}
        {/* Datenquelle */}
        <div className="bg-white rounded-3xl shadow-lg p-5 mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Datenquelle</h3>
            <span className="text-xs text-slate-400">aktuell: {dataSource === DATA_SOURCES.MYSQL ? 'MySQL API' : 'Lokal'}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setSavedDataSource(DATA_SOURCES.LOCAL);
                setDataSource(DATA_SOURCES.LOCAL);
              }}
              className={`flex-1 py-2.5 px-4 rounded-xl font-medium transition-all duration-200
                ${dataSource === DATA_SOURCES.LOCAL
                  ? 'bg-energy-blue text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
              Lokal
            </button>
            <button
              type="button"
              onClick={() => {
                setSavedDataSource(DATA_SOURCES.MYSQL);
                setDataSource(DATA_SOURCES.MYSQL);
              }}
              className={`flex-1 py-2.5 px-4 rounded-xl font-medium transition-all duration-200
                ${dataSource === DATA_SOURCES.MYSQL
                  ? 'bg-energy-blue text-white shadow-md'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
            >
              MySQL (API)
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Hinweis: MySQL benötigt den laufenden API-Server.
          </p>
        </div>
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
