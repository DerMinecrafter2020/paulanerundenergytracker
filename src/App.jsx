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
import AuthentikSetupPage from './components/AuthentikSetupPage';
import AdminPanel from './components/AdminPanel';
import RegisterPage from './components/RegisterPage';
import SettingsPanel from './components/SettingsPanel';
import CustomDrinks from './components/CustomDrinks';
import StatsPanel from './components/StatsPanel';
import WarningAlert from './components/WarningAlert';
import {
  fetchFavorites,
  addFavorite,
  removeFavorite,
  fetchTodayStats,
} from './services/api';
import { fetchTodayLogs, addLog, removeLog } from './services/storage';
import { getSession, logout, startImpersonation, stopImpersonation, getImpersonatorSession } from './services/auth';
import { fetchPublicSettings } from './services/adminApi';

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
  const [publicSettings, setPublicSettings] = useState({ authMode: 'local', setupRequired: false });
  const [authView, setAuthView]   = useState(initialViewState.authView || 'login'); // 'login' | 'register'
  const [adminView, setAdminView] = useState(initialViewState.adminView || 'admin'); // 'admin' | 'user'
  const [adminTab, setAdminTab]   = useState(initialViewState.adminTab || 'overview');

  const impersonator = getImpersonatorSession();

  const persistScrollY = useCallback((scrollY) => {
    const current = loadViewState();
    saveViewState({ ...current, userScrollY: Math.max(0, Math.round(Number(scrollY) || 0)) });
  }, []);

  useEffect(() => {
    const current = loadViewState();
    saveViewState({ ...current, authView, adminView, adminTab });
  }, [authView, adminView, adminTab]);

  useEffect(() => {
    let isMounted = true;
    fetchPublicSettings()
      .then((settings) => {
        if (isMounted) setPublicSettings(settings || { authMode: 'local', setupRequired: false });
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

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

  if (!session && publicSettings?.authMode === 'authentik' && publicSettings?.setupRequired) {
    return (
      <AuthentikSetupPage
        onConfigured={async () => {
          try {
            const settings = await fetchPublicSettings();
            setPublicSettings(settings || { authMode: 'local', setupRequired: false });
          } catch {
            // Ignore refresh errors, login page will show connection errors if needed.
          }
        }}
      />
    );
  }

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
          initialScrollY={Number(initialViewState.userScrollY) || 0}
          onPersistScrollY={persistScrollY}
        />
      </div>
    </>
  );
}

// ── Tracker (extracted so hooks are always called in the same order) ────────
function TrackerApp({ session, onLogout, onShowAdminPanel, initialScrollY, onPersistScrollY }) {
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [logs, setLogs]           = useState([]);
  const [error, setError]         = useState(null);
  const [manualPrefill, setManualPrefill] = useState(null);
  const [favorites, setFavorites] = useState([]);
  const [currentVersion, setCurrentVersion] = useState(null);
  const [latestVersion, setLatestVersion]   = useState(null);
  const [todayStats, setTodayStats] = useState(null);
  const [settings, setSettings] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const isFirstCheck = useRef(true);

  const getDrinkKey = useCallback((drink) => {
    const name = String(drink?.name || '').trim().toLowerCase();
    const size = Number(drink?.size || 0);
    const caffeine = Number(drink?.caffeine || 0);
    const icon = String(drink?.icon || '').trim();
    return `${name}|${size}|${caffeine}|${icon}`;
  }, []);

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
    const loadFavorites = async () => {
      try {
        const payload = { userId: session?.id, email: session?.email };
        const data = await fetchFavorites(payload);
        setFavorites(Array.isArray(data?.items) ? data.items : []);
      } catch (err) {
        console.error('Fehler beim Laden der Favoriten:', err);
      }
    };
    loadFavorites();
  }, [session?.id, session?.email]);

  // Load today stats for warnings
  useEffect(() => {
    if (!session?.email) return;
    
    const loadStats = async () => {
      try {
        const stats = await fetchTodayStats({
          userId: session?.id || null,
          email: session?.email,
        });
        setTodayStats(stats);
      } catch (err) {
        console.error('Fehler beim Laden der Statistiken:', err);
      }
    };

    loadStats();
    const interval = setInterval(loadStats, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [session?.id, session?.email]);

  useEffect(() => {
    if (typeof initialScrollY === 'number' && initialScrollY > 0) {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: initialScrollY, behavior: 'auto' });
      });
    }
  }, [initialScrollY]);

  useEffect(() => {
    if (!onPersistScrollY) return undefined;

    let timeoutId = null;
    const onScroll = () => {
      if (timeoutId) return;
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        onPersistScrollY(window.scrollY || 0);
      }, 150);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [onPersistScrollY]);

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

      // Refresh stats
      if (session?.email) {
        const stats = await fetchTodayStats({
          userId: session?.id || null,
          email: session?.email,
        });
        setTodayStats(stats);
      }
    } catch (err) {
      setError('Fehler beim Hinzufügen. Bitte versuche es erneut.');
      console.error(err);
    } finally {
      setIsOperationLoading(false);
    }
  }, [session?.id, session?.email]);

  const handleDeleteLog = useCallback(async (logId) => {
    setIsOperationLoading(true);
    setError(null);
    try {
      await removeLog(logId);
      setLogs((prev) => prev.filter((log) => log.id !== logId));

      // Refresh stats
      if (session?.email) {
        const stats = await fetchTodayStats({
          userId: session?.id || null,
          email: session?.email,
        });
        setTodayStats(stats);
      }
    } catch (err) {
      setError('Fehler beim Löschen. Bitte versuche es erneut.');
      console.error(err);
    } finally {
      setIsOperationLoading(false);
    }
  }, [session?.id, session?.email]);

  const isFavoriteLog = useCallback((log) => {
    const key = getDrinkKey(log);
    return favorites.some((f) => getDrinkKey(f) === key);
  }, [favorites, getDrinkKey]);

  const handleToggleFavorite = useCallback(async (log, isFavorite) => {
    try {
      const payload = { userId: session?.id, email: session?.email };
      const key = getDrinkKey(log);

      if (isFavorite) {
        const existing = favorites.find((f) => getDrinkKey(f) === key);
        if (!existing?.id) return;
        await removeFavorite({ ...payload, favoriteId: existing.id });
        setFavorites((prev) => prev.filter((f) => f.id !== existing.id));
        return;
      }

      const result = await addFavorite({
        ...payload,
        drink: {
          name: log.name,
          size: Number(log.size),
          caffeine: Number(log.caffeine),
          caffeinePerMl: log.caffeinePerMl ?? null,
          icon: log.icon || '🥤',
        },
      });

      if (result?.item) {
        setFavorites((prev) => {
          const filtered = prev.filter((f) => getDrinkKey(f) !== key);
          return [result.item, ...filtered];
        });
      }
    } catch (err) {
      setError(err.message || 'Fehler beim Aktualisieren der Favoriten.');
    }
  }, [favorites, getDrinkKey, session?.email, session?.id]);

  const handleRemoveFavorite = useCallback(async (favoriteId) => {
    try {
      await removeFavorite({ userId: session?.id, email: session?.email, favoriteId });
      setFavorites((prev) => prev.filter((f) => f.id !== favoriteId));
    } catch (err) {
      setError(err.message || 'Fehler beim Entfernen des Favoriten.');
    }
  }, [session?.email, session?.id]);

  return (
    <div className="min-h-screen" style={{ background: 'radial-gradient(ellipse at top, #0f172a 0%, #070b14 70%)' }}>
      <Header
        isAuthenticated={true}
        isLoading={isOperationLoading}
        session={session}
        onLogout={onLogout}
        onShowAdminPanel={onShowAdminPanel}
        onToggleSettings={() => setShowSettings((prev) => !prev)}
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

        {/* Settings Section */}
        <div className="mb-6">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition flex items-center justify-between"
          >
            <span>⚙️ Einstellungen</span>
            <span>{showSettings ? '▼' : '▶'}</span>
          </button>

          {showSettings && (
            <div className="mt-4 space-y-4">
              <SettingsPanel
                session={session}
                isLoading={isOperationLoading}
                onSettingsChange={(newSettings) => setSettings(newSettings)}
              />
            </div>
          )}
        </div>

        <ProgressBar currentCaffeine={totalCaffeineToday} />

        {/* Warnings */}
        {todayStats && settings && (
          <WarningAlert todayStats={todayStats} settings={settings} onClose={() => {}} />
        )}

        {/* Weekly Stats */}
        <StatsPanel session={session} isLoading={isOperationLoading} />

        <PresetDrinks
          favorites={favorites}
          onAddDrink={handleAddDrink}
          onRemoveFavorite={handleRemoveFavorite}
          isLoading={isOperationLoading}
        />

        <CustomDrinks
          session={session}
          isLoading={isOperationLoading}
          onAddDrink={handleAddDrink}
          onToggleFavorite={handleToggleFavorite}
          isFavoriteDrink={isFavoriteLog}
        />

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
          onToggleFavorite={handleToggleFavorite}
          isFavoriteLog={isFavoriteLog}
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

