import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Header from './components/Header';
import ProgressBar from './components/ProgressBar';
import PresetDrinks from './components/PresetDrinks';
import OnlineSearch from './components/OnlineSearch';
import ManualCalculator from './components/ManualCalculator';
import DrinkHistory from './components/DrinkHistory';
import LoginPage from './components/LoginPage';
import AdminPanel from './components/AdminPanel';
import {
  DATA_SOURCES,
  getSavedDataSource,
  setSavedDataSource,
  fetchTodayLogs,
  addLog,
  removeLog,
} from './services/storage';
import { getSession, logout } from './services/auth';

const getTodayKey = () => new Date().toISOString().split('T')[0];

function App() {
  const [session, setSession]     = useState(() => getSession());
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [logs, setLogs]           = useState([]);
  const [error, setError]         = useState(null);
  const [manualPrefill, setManualPrefill] = useState(null);
  const [dataSource, setDataSource] = useState(getSavedDataSource());
  const [currentVersion, setCurrentVersion] = useState(null);
  const [latestVersion, setLatestVersion]   = useState(null);
  const isFirstCheck = useRef(true);

  // ── If not logged in, show Login ──────────────────────────────────────
  if (!session) {
    return <LoginPage onLogin={(s) => setSession(s)} />;
  }

  // ── If admin, show Admin Panel ────────────────────────────────────────
  if (session.role === 'admin') {
    return <AdminPanel session={session} onLogout={() => setSession(null)} />;
  }

  // ── Regular user tracker ──────────────────────────────────────────────
  return <TrackerApp
    session={session}
    onLogout={() => { logout(); setSession(null); }}
    dataSource={dataSource}
    setDataSource={setDataSource}
  />;
}

// ── Tracker (extracted so hooks are always called in the same order) ────────
function TrackerApp({ session, onLogout, dataSource, setDataSource }) {
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [logs, setLogs]           = useState([]);
  const [error, setError]         = useState(null);
  const [manualPrefill, setManualPrefill] = useState(null);
  const [currentVersion, setCurrentVersion] = useState(null);
  const [latestVersion, setLatestVersion]   = useState(null);
  const isFirstCheck = useRef(true);

  // Logs für heute laden
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
        const version = data.version || null;
        if (isFirstCheck.current) {
          setCurrentVersion(version);
          isFirstCheck.current = false;
        } else {
          setLatestVersion(version);
        }
      } catch {
        isFirstCheck.current = false;
      }
    };
    checkVersion();
    const interval = setInterval(checkVersion, 5 * 60 * 1000);
    return () => { isMounted = false; clearInterval(interval); };
  }, []);

  const totalCaffeineToday = useMemo(
    () => logs.reduce((sum, log) => sum + (log.caffeine || 0), 0),
    [logs]
  );

  const handleAddDrink = useCallback(async (drinkData) => {
    setIsOperationLoading(true);
    setError(null);
    try {
      const payload = { ...drinkData, date: getTodayKey() };
      const created = await addLog(dataSource, payload);
      setLogs((prev) => [created, ...prev]);
    } catch (err) {
      setError('Fehler beim Hinzufügen. Bitte versuche es erneut.');
      console.error(err);
    } finally {
      setIsOperationLoading(false);
    }
  }, [dataSource]);

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
    <div className="min-h-screen" style={{ background: 'radial-gradient(ellipse at top, #0f172a 0%, #070b14 70%)' }}>
      <Header
        isAuthenticated={true}
        isLoading={isOperationLoading}
        session={session}
        onLogout={onLogout}
      />

      <main className="max-w-lg mx-auto px-4 pb-8">
        {/* Update Banner */}
        {latestVersion && latestVersion !== currentVersion && (
          <div className="glass-card border border-blue-500/30 bg-blue-500/10
            px-4 py-3 rounded-2xl mb-6 animate-fade-in">
            <p className="text-sm font-medium text-blue-300">Update verfügbar: {latestVersion}</p>
            <button onClick={() => window.location.reload()}
              className="text-xs underline mt-1 text-blue-400">
              Neu laden
            </button>
          </div>
        )}

        {/* Datenquelle */}
        <div className="glass-card rounded-3xl p-5 mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-300">Datenquelle</h3>
            <span className="text-xs text-slate-500">
              {dataSource === DATA_SOURCES.MYSQL ? 'MySQL API' : 'Lokal'}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setSavedDataSource(DATA_SOURCES.LOCAL); setDataSource(DATA_SOURCES.LOCAL); }}
              className={`flex-1 py-2.5 px-4 rounded-xl font-medium transition-all duration-200 text-sm
                ${dataSource === DATA_SOURCES.LOCAL
                  ? 'bg-blue-600 text-white shadow-glow-blue'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'
                }`}
            >
              Lokal
            </button>
            <button
              type="button"
              onClick={() => { setSavedDataSource(DATA_SOURCES.MYSQL); setDataSource(DATA_SOURCES.MYSQL); }}
              className={`flex-1 py-2.5 px-4 rounded-xl font-medium transition-all duration-200 text-sm
                ${dataSource === DATA_SOURCES.MYSQL
                  ? 'bg-blue-600 text-white shadow-glow-blue'
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'
                }`}
            >
              MySQL (API)
            </button>
          </div>
          <p className="text-xs text-slate-600 mt-3">
            MySQL benötigt den laufenden API-Server.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="glass-card border border-red-500/30 bg-red-500/10
            px-4 py-3 rounded-2xl mb-6 animate-fade-in">
            <p className="text-sm text-red-300">{error}</p>
            <button onClick={() => setError(null)} className="text-xs underline mt-1 text-red-400">
              Ausblenden
            </button>
          </div>
        )}

        <ProgressBar currentCaffeine={totalCaffeineToday} />

        <PresetDrinks onAddDrink={handleAddDrink} isLoading={isOperationLoading} />

        <OnlineSearch
          onSelect={(item) =>
            setManualPrefill({
              name: item.name,
              caffeinePer100ml: item.caffeinePer100ml,
              sizeMl: item.sizeMl,
            })
          }
        />

        <ManualCalculator
          onAddDrink={handleAddDrink}
          isLoading={isOperationLoading}
          prefill={manualPrefill}
          onPrefillApplied={() => setManualPrefill(null)}
        />

        <DrinkHistory
          logs={logs}
          onDeleteLog={handleDeleteLog}
          isLoading={isOperationLoading}
        />
      </main>

      <footer className="text-center py-6 text-slate-600 text-sm">
        <p>Koffein-Tracker &copy; {new Date().getFullYear()}</p>
        <p className="text-xs mt-1">Empfohlenes Tageslimit: 400 mg</p>
      </footer>
    </div>
  );
}

export default App;

