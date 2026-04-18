import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Header from './components/Header';
import ProgressBar from './components/ProgressBar';
import PresetDrinks from './components/PresetDrinks';
import OnlineSearch from './components/OnlineSearch';
import ManualCalculator from './components/ManualCalculator';
import DrinkHistory from './components/DrinkHistory';
import ReminderSettings from './components/ReminderSettings';
import AIAssistant from './components/AIAssistant';
import AIDrinkRecognizer from './components/AIDrinkRecognizer';
import AIDailySummary from './components/AIDailySummary';
import LoginPage from './components/LoginPage';
import AdminPanel from './components/AdminPanel';
import RegisterPage from './components/RegisterPage';
import {
  fetchTodayLogs,
  addLog,
  removeLog,
} from './services/storage';
import { getSession, logout, startImpersonation, stopImpersonation, getImpersonatorSession } from './services/auth';

const getTodayKey = () => new Date().toISOString().split('T')[0];
const VIEW_STATE_KEY = 'et:last-view-state';

const loadViewState = () => {
  try {
    const raw = localStorage.getItem(VIEW_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveViewState = (nextState) => {
  try {
    localStorage.setItem(VIEW_STATE_KEY, JSON.stringify(nextState));
  } catch {
    // Ignore storage write errors
  }
};

function App() {
  const initialViewState = loadViewState();
  const [session, setSession]     = useState(() => getSession());
  const [authView, setAuthView]   = useState(initialViewState.authView || 'login'); // 'login' | 'register'
  const [adminView, setAdminView] = useState(initialViewState.adminView || 'admin'); // 'admin' | 'user'
  const [adminTab, setAdminTab]   = useState(initialViewState.adminTab || 'overview');
  const [userScrollY, setUserScrollY] = useState(Number(initialViewState.userScrollY) || 0);

  const impersonator = getImpersonatorSession();

  useEffect(() => {
    saveViewState({ authView, adminView, adminTab, userScrollY });
  }, [authView, adminView, adminTab, userScrollY]);

  const handleImpersonate = (userData) => {
    const newSession = startImpersonation(userData);
    setSession(newSession);
    setAdminView('user');
  };

  const handleStopImpersonation = () => {
    const adminSession = stopImpersonation();
    setSession(adminSession);
    setAdminView('admin');
  };

  useEffect(() => {
    if (session?.role !== 'admin') setAdminView('admin');
  }, [session]);

  // ── If not logged in, show Login / Register ───────────────────────────
  if (!session && authView === 'register') {
    return <RegisterPage onBack={() => setAuthView('login')} />;
  }
  if (!session) {
    return <LoginPage onLogin={(s) => setSession(s)} onShowRegister={() => setAuthView('register')} />;
  }

  // ── If admin, show Admin Panel ────────────────────────────────────────
  if (session.role === 'admin' && adminView === 'admin') {
    return (
      <AdminPanel
        session={session}
        onLogout={() => setSession(null)}
        onShowUserPanel={() => setAdminView('user')}
        onImpersonate={handleImpersonate}
        initialActiveTab={adminTab}
        onActiveTabChange={setAdminTab}
      />
    );
  }

  // ── Regular user tracker ──────────────────────────────────
  return (
    <>
      {impersonator && (
        <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-between gap-3
          px-4 py-2 bg-amber-500 text-amber-950 text-sm font-medium shadow-lg">
          <span>
            👁️ Du siehst die App als <strong>{session.name}</strong> ({session.email})
          </span>
          <button
            onClick={handleStopImpersonation}
            className="px-3 py-1 rounded-lg bg-amber-950/20 hover:bg-amber-950/30
              text-amber-950 font-semibold transition-all text-xs shrink-0">
            ← Zurück zum Admin-Panel
          </button>
        </div>
      )}
      <div style={impersonator ? { paddingTop: '2.5rem' } : undefined}>
        <TrackerApp
          session={session}
          onLogout={() => { logout(); setSession(null); }}
          onShowAdminPanel={session.role === 'admin' ? () => setAdminView('admin') : null}
          initialScrollY={userScrollY}
          onScrollPositionChange={setUserScrollY}
        />
      </div>
    </>
  );
}

// ── Tracker (extracted so hooks are always called in the same order) ────────
function TrackerApp({ session, onLogout, onShowAdminPanel, initialScrollY, onScrollPositionChange }) {
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
        const todayLogs = await fetchTodayLogs(today);
        setLogs(todayLogs);
      } catch (err) {
        setError('Fehler beim Laden der Daten.');
        console.error(err);
      }
    };
    loadToday();
  }, []);

  useEffect(() => {
    if (typeof initialScrollY === 'number' && initialScrollY > 0) {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: initialScrollY, behavior: 'auto' });
      });
    }
  }, [initialScrollY]);

  useEffect(() => {
    const onScroll = () => {
      if (onScrollPositionChange) onScrollPositionChange(window.scrollY || 0);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [onScrollPositionChange]);

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
      const created = await addLog(payload);
      setLogs((prev) => [created, ...prev]);
    } catch (err) {
      setError('Fehler beim Hinzufügen. Bitte versuche es erneut.');
      console.error(err);
    } finally {
      setIsOperationLoading(false);
    }
  }, []);

  const handleDeleteLog = useCallback(async (logId) => {
    setIsOperationLoading(true);
    setError(null);
    try {
      await removeLog(logId);
      setLogs((prev) => prev.filter((log) => log.id !== logId));
    } catch (err) {
      setError('Fehler beim Löschen. Bitte versuche es erneut.');
      console.error(err);
    } finally {
      setIsOperationLoading(false);
    }
  }, []);

  return (
    <div className="min-h-screen" style={{ background: 'radial-gradient(ellipse at top, #0f172a 0%, #070b14 70%)' }}>
      <Header
        isAuthenticated={true}
        isLoading={isOperationLoading}
        session={session}
        onLogout={onLogout}
        onShowAdminPanel={onShowAdminPanel}
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

        <ReminderSettings session={session} />

        <AIDailySummary logs={logs} totalCaffeine={totalCaffeineToday} />

        <AIDrinkRecognizer
          onRecognized={(drink) =>
            setManualPrefill({
              name: drink.name,
              caffeinePer100ml: drink.caffeinePer100ml,
              sizeMl: drink.sizeMl,
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

      <AIAssistant totalCaffeineToday={totalCaffeineToday} />
    </div>
  );
}

export default App;

