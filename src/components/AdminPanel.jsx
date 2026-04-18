import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck, LogOut, Trash2, RefreshCw, Database,
  TrendingUp, Users, Zap, Calendar, BarChart2, AlertTriangle,
  Download, Search, ChevronDown, ChevronUp, Coffee,
  Settings, Mail, Server, Lock, Eye, EyeOff, Send, MessageCircle,
  CheckCircle, UserCheck, UserX, Clock, Shield, Bot,
} from 'lucide-react';
import { logout } from '../services/auth';
import { fetchLogs, deleteLog as deleteApiLog } from '../services/api';
import {
  fetchSmtpConfig, saveSmtpConfig, testSmtpConfig,
  fetchAdminUsers, verifyAdminUser, deleteAdminUser, setUserRole, createAdminUser, impersonateUser,
  testDiscordWebhook, fetchAiConfig, saveAiConfig, fetchRedisHealth,
} from '../services/adminApi';

// ── helpers ────────────────────────────────────────────────────────────────
const formatDate = (isoStr) => {
  if (!isoStr) return '–';
  return new Date(isoStr).toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const getLast7Days = () =>
  Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split('T')[0];
  });

// ── Stat Card ──────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, sub, color = 'blue' }) => {
  const colors = {
    blue:   'from-blue-600/20  to-blue-500/5  border-blue-500/20  text-blue-400',
    amber:  'from-amber-600/20 to-amber-500/5 border-amber-500/20 text-amber-400',
    green:  'from-green-600/20 to-green-500/5 border-green-500/20 text-green-400',
    red:    'from-red-600/20   to-red-500/5   border-red-500/20   text-red-400',
    purple: 'from-purple-600/20 to-purple-500/5 border-purple-500/20 text-purple-400',
  };
  const cls = colors[color] || colors.blue;
  return (
    <div className={`glass-card rounded-2xl p-5 bg-gradient-to-br ${cls}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-current/10`}>
        <Icon className={`w-5 h-5 ${cls.split(' ').at(-1)}`} />
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-sm text-slate-400 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-slate-600 mt-1">{sub}</p>}
    </div>
  );
};

// ── Main ────────────────────────────────────────────────────────────────────
const AdminPanel = ({ session, onLogout, onShowUserPanel, onImpersonate, initialActiveTab = 'overview', onActiveTabChange }) => {
  const [allLogs, setAllLogs]     = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState(null);
  const [deleting, setDeleting]   = useState(null);
  const [search, setSearch]       = useState('');
  const [sortField, setSortField] = useState('createdAt');
  const [sortDir, setSortDir]     = useState('desc');
  const [activeTab, setActiveTab] = useState(initialActiveTab);

  // ── SMTP state ─────────────────────────────────────────────────────────
  const defaultSmtp = { host: '', port: 587, secure: false, auth: { user: '', pass: '' },
    fromName: 'Koffein-Tracker', fromEmail: '', baseUrl: '', registrationEnabled: true, demoEnabled: true };
  const [smtp, setSmtp]           = useState(defaultSmtp);
  const [smtpLoaded, setSmtpLoaded] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [showSmtpPw, setShowSmtpPw] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [discordTesting, setDiscordTesting] = useState(false);
  const [discordWebhook, setDiscordWebhook] = useState('');
  const [smtpMsg, setSmtpMsg]     = useState(null);

  // ── AI Config state ────────────────────────────────────────────────────
  const [aiApiKey, setAiApiKey]   = useState('');
  const [aiModel, setAiModel]     = useState('deepseek/deepseek-v3');
  const [aiKeyMasked, setAiKeyMasked] = useState('');
  const [braveSearchKey, setBraveSearchKey] = useState('');
  const [braveKeyMasked, setBraveKeyMasked] = useState('');
  const [aiSaving, setAiSaving]   = useState(false);
  const [aiMsg, setAiMsg]         = useState(null);

  // ── Users state ────────────────────────────────────────────────────────
  const [regUsers, setRegUsers]   = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersMsg, setUsersMsg]   = useState(null);

  // ── Create User modal state ───────────────────────────────────────────
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'user', verified: true });
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [showCreatePw, setShowCreatePw] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState(null);

  // ── Redis health state ─────────────────────────────────────────
  const [redisHealth, setRedisHealth]     = useState(null);
  const [redisChecking, setRedisChecking] = useState(false);
  const [redisError, setRedisError]       = useState(null);

  // Load SMTP config when settings tab is opened
  useEffect(() => {
    if (activeTab === 'settings' && !smtpLoaded) {
      fetchSmtpConfig()
        .then((cfg) => { if (cfg) setSmtp(cfg); setSmtpLoaded(true); })
        .catch(() => setSmtpLoaded(true));
      fetchAiConfig()
        .then((cfg) => { setAiModel(cfg.model || 'google/gemini-2.0-flash-001'); setAiKeyMasked(cfg.apiKeyMasked || ''); setBraveKeyMasked(cfg.braveSearchKeyMasked || ''); })
        .catch(() => {});
      handleRedisCheck();
    }
    if (activeTab === 'users') loadRegUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (onActiveTabChange) onActiveTabChange(activeTab);
  }, [activeTab, onActiveTabChange]);

  const handleRedisCheck = async () => {
    setRedisChecking(true);
    setRedisError(null);
    try {
      const data = await fetchRedisHealth();
      setRedisHealth(data);
    } catch (err) {
      setRedisError(err.message);
    } finally {
      setRedisChecking(false);
    }
  };

  const loadRegUsers = async () => {
    setUsersLoading(true);
    setUsersMsg(null);
    try {
      const data = await fetchAdminUsers();
      setRegUsers(data);
    } catch (err) {
      setUsersMsg({ type: 'error', text: 'Fehler beim Laden der Benutzer: ' + err.message });
    } finally {
      setUsersLoading(false);
    }
  };

  const handleSmtpChange = (path, value) => {
    setSmtp((prev) => {
      if (path === 'auth.user') return { ...prev, auth: { ...prev.auth, user: value } };
      if (path === 'auth.pass') return { ...prev, auth: { ...prev.auth, pass: value } };
      return { ...prev, [path]: value };
    });
  };

  const handleSmtpSave = async () => {
    setSmtpSaving(true);
    setSmtpMsg(null);
    try {
      await saveSmtpConfig(smtp);
      setSmtpMsg({ type: 'success', text: 'SMTP-Einstellungen gespeichert.' });
    } catch (err) {
      setSmtpMsg({ type: 'error', text: err.message });
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleSmtpTest = async () => {
    if (!testEmail.trim()) { setSmtpMsg({ type: 'error', text: 'Bitte Ziel-E-Mail-Adresse eingeben.' }); return; }
    setSmtpTesting(true);
    setSmtpMsg(null);
    try {
      const res = await testSmtpConfig(testEmail.trim());
      setSmtpMsg({ type: 'success', text: res.message || 'Test-E-Mail gesendet.' });
    } catch (err) {
      setSmtpMsg({ type: 'error', text: err.message });
    } finally {
      setSmtpTesting(false);
    }
  };

  const handleDiscordTest = async () => {
    if (!discordWebhook.trim()) {
      setSmtpMsg({ type: 'error', text: 'Bitte Discord Webhook URL eingeben.' });
      return;
    }

    setDiscordTesting(true);
    setSmtpMsg(null);
    try {
      const res = await testDiscordWebhook(discordWebhook.trim());
      setSmtpMsg({ type: 'success', text: res.message || 'Discord Testnachricht gesendet.' });
    } catch (err) {
      setSmtpMsg({ type: 'error', text: err.message });
    } finally {
      setDiscordTesting(false);
    }
  };

  const handleSaveAi = async () => {
    setAiSaving(true);
    setAiMsg(null);
    try {
      await saveAiConfig({ apiKey: aiApiKey.trim() || undefined, model: aiModel.trim(), braveSearchKey: braveSearchKey.trim() || undefined });
      setAiMsg({ type: 'success', text: 'AI-Einstellungen gespeichert.' });
      if (aiApiKey.trim()) {
        setAiKeyMasked(aiApiKey.slice(0, 8) + '••••••••' + aiApiKey.slice(-4));
        setAiApiKey('');
      }
      if (braveSearchKey.trim()) {
        setBraveKeyMasked(braveSearchKey.slice(0, 4) + '••••••••' + braveSearchKey.slice(-4));
        setBraveSearchKey('');
      }
    } catch (err) {
      setAiMsg({ type: 'error', text: err.message });
    } finally {
      setAiSaving(false);
    }
  };

  const handleVerifyUser = async (id) => {
    try {
      await verifyAdminUser(id);
      setRegUsers((prev) => prev.map((u) => u.id === id ? { ...u, verified: true } : u));
      setUsersMsg({ type: 'success', text: 'Benutzer manuell verifiziert.' });
    } catch (err) {
      setUsersMsg({ type: 'error', text: err.message });
    }
  };

  const handleDeleteUser = async (id) => {
    if (!window.confirm('Diesen Benutzer wirklich löschen?')) return;
    try {
      await deleteAdminUser(id);
      setRegUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      setUsersMsg({ type: 'error', text: err.message });
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setCreateUserLoading(true);
    setUsersMsg(null);
    try {
      const newUser = await createAdminUser(createForm);
      setRegUsers((prev) => [newUser, ...prev]);
      setUsersMsg({ type: 'success', text: `Benutzer "${newUser.name}" wurde erfolgreich erstellt.` });
      setShowCreateUser(false);
      setCreateForm({ name: '', email: '', password: '', role: 'user', verified: true });
    } catch (err) {
      setUsersMsg({ type: 'error', text: err.message });
    } finally {
      setCreateUserLoading(false);
    }
  };

  const handleImpersonate = async (u) => {
    if (!onImpersonate) return;
    setImpersonatingId(u.id);
    try {
      const userData = await impersonateUser(u.id);
      onImpersonate(userData);
    } catch (err) {
      setUsersMsg({ type: 'error', text: 'Fehler beim Wechseln: ' + err.message });
    } finally {
      setImpersonatingId(null);
    }
  };

  const handleToggleRole = async (id, currentRole) => {
    const isSelf = (session?.id && session.id === id) || (!session?.id && regUsers.find((u) => u.id === id)?.email === session?.email);
    if (isSelf && currentRole === 'admin') {
      setUsersMsg({ type: 'error', text: 'Du kannst deinen eigenen Admin-Account nicht herunterstufen.' });
      return;
    }
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      await setUserRole(id, newRole);
      setRegUsers((prev) => prev.map((u) => u.id === id ? { ...u, role: newRole } : u));
      setUsersMsg({ type: 'success', text: `Rolle auf "${newRole === 'admin' ? 'Admin' : 'Benutzer'}" geändert.` });
    } catch (err) {
      setUsersMsg({ type: 'error', text: err.message });
    }
  };



  const loadAllLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const days = Array.from({ length: 30 }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
      });
      const results = await Promise.allSettled(days.map((day) => fetchLogs(day)));
      const combined = results
        .filter((r) => r.status === 'fulfilled')
        .flatMap((r) => r.value);
      setAllLogs(combined);
    } catch (err) {
      setError('Fehler beim Laden der Daten: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadAllLogs(); }, []);

  // ── Stats ──────────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];

  const stats = useMemo(() => {
    const todayLogs   = allLogs.filter((l) => (l.date || '').startsWith(today));
    const totalCaff   = allLogs.reduce((s, l) => s + (l.caffeine || 0), 0);
    const todayCaff   = todayLogs.reduce((s, l) => s + (l.caffeine || 0), 0);
    const avgPerDrink = allLogs.length
      ? Math.round(allLogs.reduce((s, l) => s + (l.caffeine || 0), 0) / allLogs.length)
      : 0;
    return { totalLogs: allLogs.length, todayLogs: todayLogs.length, totalCaff, todayCaff, avgPerDrink };
  }, [allLogs, today]);

  // ── Chart data (last 7 days) ───────────────────────────────────────────
  const chartData = useMemo(() => {
    const days = getLast7Days();
    return days.map((day) => {
      const dayLogs = allLogs.filter((l) => (l.date || '').startsWith(day));
      const total   = dayLogs.reduce((s, l) => s + (l.caffeine || 0), 0);
      return { day: day.slice(5), total };
    });
  }, [allLogs]);

  const chartMax = Math.max(...chartData.map((d) => d.total), 400);

  // ── Sorted & filtered logs ─────────────────────────────────────────────
  const filteredLogs = useMemo(() => {
    const q = search.toLowerCase();
    return [...allLogs]
      .filter((l) =>
        !q ||
        (l.name || '').toLowerCase().includes(q) ||
        (l.date || '').includes(q)
      )
      .sort((a, b) => {
        const av = a[sortField] ?? '';
        const bv = b[sortField] ?? '';
        const cmp = String(av).localeCompare(String(bv));
        return sortDir === 'asc' ? cmp : -cmp;
      });
  }, [allLogs, search, sortField, sortDir]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('desc'); }
  };

  // ── Delete ─────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!window.confirm('Diesen Eintrag wirklich löschen?')) return;
    setDeleting(id);
    try {
      await deleteApiLog(id);
      setAllLogs((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      alert('Fehler beim Löschen: ' + err.message);
    } finally {
      setDeleting(null);
    }
  };

  // ── Export CSV ─────────────────────────────────────────────────────────
  const exportCSV = () => {
    const header = 'ID,Name,Koffein (mg),Größe (ml),Datum,Erstellt';
    const rows = allLogs.map((l) =>
      [l.id, `"${l.name}"`, l.caffeine, l.size, l.date, formatDate(l.createdAt)].join(',')
    );
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `koffein-logs-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLogout = () => { logout(); onLogout(); };

  // ── Sorting icon ───────────────────────────────────────────────────────
  const SortIcon = ({ field }) =>
    sortField === field
      ? sortDir === 'asc'
        ? <ChevronUp   className="w-3 h-3 inline ml-1 text-blue-400" />
        : <ChevronDown className="w-3 h-3 inline ml-1 text-blue-400" />
      : null;

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: 'radial-gradient(ellipse at top, #0f172a 0%, #070b14 70%)' }}>

      {/* ── Top nav ── */}
      <header className="glass-card border-b border-white/10 px-4 py-4 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500
              flex items-center justify-center shadow-glow-amber">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white leading-tight">Admin-Panel</h1>
              <p className="text-xs text-slate-500">Koffein-Tracker</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {onShowUserPanel && (
              <button
                onClick={onShowUserPanel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-amber-300
                  bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 transition-all text-sm"
                title="Zur Benutzeransicht wechseln"
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Benutzeransicht</span>
              </button>
            )}
            <span className="hidden sm:block text-xs text-slate-500">
              Angemeldet als <span className="text-amber-400 font-medium">{session.name}</span>
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400
                hover:text-red-400 hover:bg-red-500/10 transition-all text-sm"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Abmelden</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Tabs ── */}
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <div className="flex gap-1 glass-card rounded-2xl p-1 mb-6 w-fit flex-wrap">
          {[
            { id: 'overview',  label: 'Übersicht',  icon: BarChart2  },
            { id: 'logs',      label: 'Alle Logs',  icon: Database   },
            { id: 'users',     label: 'Benutzer',   icon: Users      },
            { id: 'settings',  label: 'Einstellungen', icon: Settings },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all
                ${activeTab === id
                  ? 'bg-blue-600 text-white shadow-glow-blue'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="glass-card rounded-2xl p-4 mb-6 border border-red-500/30
            bg-red-500/10 flex items-center gap-3 animate-slide-in">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <p className="text-red-300 text-sm">{error}</p>
            <button onClick={loadAllLogs} className="ml-auto text-xs text-red-400 hover:text-red-300 underline">
              Erneut laden
            </button>
          </div>
        )}

        {/* ══════════ OVERVIEW TAB ══════════ */}
        {activeTab === 'overview' && (
          <div className="animate-fade-in space-y-6 pb-10">

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard icon={Database}   label="Logs gesamt"     value={stats.totalLogs}   color="blue"   />
              <StatCard icon={Calendar}   label="Logs heute"      value={stats.todayLogs}   color="green"  />
              <StatCard icon={Zap}        label="Koffein heute"   value={`${stats.todayCaff} mg`} color="amber" />
              <StatCard icon={TrendingUp} label="Koffein gesamt"  value={`${stats.totalCaff} mg`} color="purple"/>
              <StatCard icon={Coffee}     label="Ø pro Getränk"   value={`${stats.avgPerDrink} mg`} color="red" />
            </div>

            {/* Chart – last 7 days */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-blue-400" />
                  Koffein letzte 7 Tage
                </h2>
              </div>
              <div className="flex items-end gap-3 h-40">
                {isLoading
                  ? Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className="flex-1 shimmer rounded-t-xl" style={{ height: '60%' }} />
                    ))
                  : chartData.map(({ day, total }) => {
                      const pct = chartMax > 0 ? (total / chartMax) * 100 : 0;
                      const isToday = day === today.slice(5);
                      return (
                        <div key={day} className="flex-1 flex flex-col items-center gap-1.5">
                          <span className="text-xs text-slate-500">{total > 0 ? total : ''}</span>
                          <div
                            className={`w-full rounded-t-xl transition-all duration-500
                              ${isToday
                                ? 'bg-gradient-to-t from-blue-600 to-blue-400 shadow-glow-blue'
                                : 'bg-gradient-to-t from-slate-700 to-slate-600'
                              }`}
                            style={{ height: `${Math.max(pct, 4)}%` }}
                          />
                          <span className={`text-xs ${isToday ? 'text-blue-400 font-semibold' : 'text-slate-600'}`}>
                            {day}
                          </span>
                        </div>
                      );
                    })
                }
              </div>
            </div>

            {/* Quick stats table – top drinks */}
            <div className="glass-card rounded-2xl p-6">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-amber-400" />
                Top-Getränke gesamt
              </h2>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <div key={i} className="h-10 shimmer rounded-xl" />)}
                </div>
              ) : (() => {
                const counts = {};
                allLogs.forEach((l) => {
                  const k = l.name || 'Unbekannt';
                  counts[k] = (counts[k] || 0) + 1;
                });
                return Object.entries(counts)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 5)
                  .map(([name, count]) => (
                    <div key={name} className="flex items-center gap-3 py-2">
                      <div className="flex-1 text-sm text-white truncate">{name}</div>
                      <div className="w-32 h-2 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
                          style={{ width: `${(count / allLogs.length) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 w-12 text-right">{count}×</span>
                    </div>
                  ));
              })()}
            </div>
          </div>
        )}

        {/* ══════════ LOGS TAB ══════════ */}
        {activeTab === 'logs' && (
          <div className="animate-fade-in pb-10 space-y-4">

            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Suche nach Name oder Datum…"
                  className="input-dark pl-10"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={loadAllLogs}
                  disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl glass-card
                    text-slate-300 hover:text-white text-sm transition-all
                    disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Aktualisieren</span>
                </button>
                <button
                  onClick={exportCSV}
                  disabled={isLoading || allLogs.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                    bg-green-600/20 border border-green-500/30 text-green-400
                    hover:bg-green-600/30 text-sm transition-all disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">CSV Export</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="glass-card rounded-2xl overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-12 shimmer rounded-xl" />
                  ))}
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <Database className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Keine Einträge gefunden.</p>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="grid grid-cols-[2fr_1fr_1fr_1fr_2fr_auto] gap-4 px-5 py-3
                    border-b border-white/10 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <button onClick={() => toggleSort('name')} className="text-left hover:text-slate-300 transition-colors">
                      Name <SortIcon field="name" />
                    </button>
                    <button onClick={() => toggleSort('caffeine')} className="text-left hover:text-slate-300 transition-colors">
                      Koffein <SortIcon field="caffeine" />
                    </button>
                    <span>Größe</span>
                    <button onClick={() => toggleSort('date')} className="text-left hover:text-slate-300 transition-colors">
                      Datum <SortIcon field="date" />
                    </button>
                    <button onClick={() => toggleSort('createdAt')} className="text-left hover:text-slate-300 transition-colors">
                      Erstellt <SortIcon field="createdAt" />
                    </button>
                    <span className="text-right">Aktion</span>
                  </div>

                  {/* Rows */}
                  <div className="divide-y divide-white/5 max-h-[60vh] overflow-y-auto">
                    {filteredLogs.map((log) => (
                      <div key={log.id}
                        className="grid grid-cols-[2fr_1fr_1fr_1fr_2fr_auto] gap-4 px-5 py-3.5
                          hover:bg-white/5 transition-colors items-center text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-lg shrink-0">{log.icon || '🥤'}</span>
                          <span className="text-white font-medium truncate">{log.name}</span>
                        </div>
                        <span className="text-blue-400 font-semibold">{log.caffeine} mg</span>
                        <span className="text-slate-400">{log.size} ml</span>
                        <span className="text-slate-400">{log.date || '–'}</span>
                        <span className="text-slate-500 text-xs">{formatDate(log.createdAt)}</span>
                        <button
                          onClick={() => handleDelete(log.id)}
                          disabled={deleting === log.id}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10
                            transition-all disabled:opacity-50 ml-auto"
                          aria-label="Löschen"
                        >
                          {deleting === log.id
                            ? <span className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin block" />
                            : <Trash2 className="w-4 h-4" />
                          }
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="px-5 py-3 border-t border-white/10 text-xs text-slate-600">
                    {filteredLogs.length} von {allLogs.length} Einträgen
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ══════════ USERS TAB ══════════ */}
        {activeTab === 'users' && (
          <div className="animate-fade-in pb-10 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-400" />
                Registrierte Benutzer
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowCreateUser(true); setUsersMsg(null); }}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl
                    bg-blue-600/20 border border-blue-500/30 text-blue-300
                    hover:bg-blue-600/30 text-sm transition-all">
                  <UserCheck className="w-4 h-4" />
                  Benutzer erstellen
                </button>
                <button onClick={loadRegUsers} disabled={usersLoading}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl glass-card
                    text-slate-400 hover:text-white text-sm transition-all disabled:opacity-50">
                  <RefreshCw className={`w-4 h-4 ${usersLoading ? 'animate-spin' : ''}`} />
                  Aktualisieren
                </button>
              </div>
            </div>

            {/* ── Create User Modal ── */}
            {showCreateUser && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                style={{ background: 'rgba(0,0,0,0.7)' }}
                onClick={(e) => { if (e.target === e.currentTarget) setShowCreateUser(false); }}>
                <div className="glass-card rounded-2xl p-6 w-full max-w-md space-y-5 animate-slide-in">
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <UserCheck className="w-5 h-5 text-blue-400" />
                    Neuen Benutzer erstellen
                  </h3>
                  <form onSubmit={handleCreateUser} className="space-y-4">
                    {/* Name */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Name</label>
                      <input type="text" required value={createForm.name}
                        onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Max Mustermann" className="input-dark" />
                    </div>
                    {/* Email */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">E-Mail</label>
                      <div className="relative">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input type="email" required value={createForm.email}
                          onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                          placeholder="user@example.com" className="input-dark pl-10" />
                      </div>
                    </div>
                    {/* Password */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Passwort</label>
                      <div className="relative">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input type={showCreatePw ? 'text' : 'password'} required minLength={8}
                          value={createForm.password}
                          onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                          placeholder="Min. 8 Zeichen" className="input-dark pl-10 pr-10" />
                        <button type="button" onClick={() => setShowCreatePw((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                          {showCreatePw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    {/* Role */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Rolle</label>
                      <div className="flex gap-2">
                        {[{ value: 'user', label: 'Benutzer', icon: Zap }, { value: 'admin', label: 'Admin', icon: Shield }].map(({ value, label, icon: Icon }) => (
                          <button key={value} type="button"
                            onClick={() => setCreateForm((p) => ({ ...p, role: value }))}
                            className={`flex items-center gap-2 flex-1 py-2.5 rounded-xl text-sm font-medium transition-all
                              ${createForm.role === value
                                ? value === 'admin'
                                  ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                                  : 'bg-blue-600/20 border border-blue-500/50 text-blue-300'
                                : 'bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10'}`}>
                            <Icon className="w-4 h-4 mx-auto" />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Verified toggle */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/10">
                      <div>
                        <p className="text-sm text-white font-medium">Sofort verifizieren</p>
                        <p className="text-xs text-slate-500">Benutzer kann sich direkt anmelden</p>
                      </div>
                      <button type="button"
                        onClick={() => setCreateForm((p) => ({ ...p, verified: !p.verified }))}
                        className={`relative w-12 h-6 rounded-full transition-all duration-300
                          ${createForm.verified ? 'bg-green-500' : 'bg-white/10'}`}>
                        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-300
                          ${createForm.verified ? 'left-7' : 'left-1'}`} />
                      </button>
                    </div>
                    {/* Actions */}
                    <div className="flex gap-3 pt-1">
                      <button type="button" onClick={() => setShowCreateUser(false)}
                        className="flex-1 py-2.5 rounded-xl text-slate-400 bg-white/5
                          border border-white/10 hover:bg-white/10 transition-all text-sm font-medium">
                        Abbrechen
                      </button>
                      <button type="submit" disabled={createUserLoading}
                        className="flex-1 py-2.5 rounded-xl font-semibold text-white
                          bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400
                          disabled:opacity-60 transition-all flex items-center justify-center gap-2">
                        {createUserLoading
                          ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : <UserCheck className="w-4 h-4" />}
                        Erstellen
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {usersMsg && (
              <div className={`glass-card rounded-2xl p-3 flex items-center gap-2 text-sm border animate-slide-in
                ${usersMsg.type === 'success'
                  ? 'bg-green-500/10 border-green-500/30 text-green-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                {usersMsg.type === 'success'
                  ? <CheckCircle className="w-4 h-4 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 shrink-0" />}
                {usersMsg.text}
              </div>
            )}

            <div className="glass-card rounded-2xl overflow-hidden">
              {usersLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => <div key={i} className="h-14 shimmer rounded-xl" />)}
                </div>
              ) : regUsers.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Noch keine registrierten Benutzer.</p>
                  <p className="text-xs mt-1 text-slate-600">
                    Konfiguriere SMTP und aktiviere die Registrierung im Tab "Einstellungen".
                  </p>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] gap-3 px-5 py-3
                    border-b border-white/10 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <span>Name</span><span>E-Mail</span><span>Rolle</span><span>Status</span><span>Registriert</span>
                    <span className="text-right">Aktionen</span>
                  </div>
                  <div className="divide-y divide-white/5 max-h-[60vh] overflow-y-auto">
                    {regUsers.map((u) => (
                      (() => {
                        const isSelf = (session?.id && session.id === u.id) || (!session?.id && u.email === session?.email);
                        const isSelfAdminDemotionBlocked = isSelf && u.role === 'admin';
                        return (
                      <div key={u.id}
                        className="grid grid-cols-[2fr_2fr_1fr_1fr_1fr_auto] gap-3 px-5 py-3.5
                          hover:bg-white/5 transition-colors items-center text-sm">
                        <span className="text-white font-medium truncate">{u.name}</span>
                        <span className="text-slate-400 truncate text-xs">{u.email}</span>
                        <span>
                          {u.role === 'admin'
                            ? <span className="flex items-center gap-1 text-xs text-amber-400">
                                <Shield className="w-3.5 h-3.5" />Admin
                              </span>
                            : <span className="flex items-center gap-1 text-xs text-slate-400">
                                <Zap className="w-3.5 h-3.5" />Benutzer
                              </span>
                          }
                        </span>
                        <span>
                          {u.verified
                            ? <span className="flex items-center gap-1 text-xs text-green-400">
                                <CheckCircle className="w-3.5 h-3.5" />Aktiv
                              </span>
                            : <span className="flex items-center gap-1 text-xs text-amber-400">
                                <Clock className="w-3.5 h-3.5" />Ausstehend
                              </span>
                          }
                        </span>
                        <span className="text-slate-600 text-xs">{formatDate(u.createdAt)}</span>
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => handleToggleRole(u.id, u.role)}
                            disabled={isSelfAdminDemotionBlocked}
                            className={`p-1.5 rounded-lg transition-all ${
                              isSelfAdminDemotionBlocked
                                ? 'text-slate-700 cursor-not-allowed'
                                : u.role === 'admin'
                                ? 'text-amber-400 hover:text-slate-400 hover:bg-white/5'
                                : 'text-slate-600 hover:text-amber-400 hover:bg-amber-500/10'
                            }`}
                            title={isSelfAdminDemotionBlocked
                              ? 'Eigenen Admin nicht herabstufen'
                              : u.role === 'admin' ? 'Zum Benutzer herabstufen' : 'Zum Admin befördern'}>
                            <Shield className="w-4 h-4" />
                          </button>
                          {!u.verified && (
                            <button onClick={() => handleVerifyUser(u.id)}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-green-400
                                hover:bg-green-500/10 transition-all"
                              title="Manuell verifizieren">
                              <UserCheck className="w-4 h-4" />
                            </button>
                          )}
                          {onImpersonate && (
                            <button
                              onClick={() => handleImpersonate(u)}
                              disabled={impersonatingId === u.id}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-blue-400
                                hover:bg-blue-500/10 transition-all disabled:opacity-50"
                              title={`Als ${u.name} anmelden`}>
                              {impersonatingId === u.id
                                ? <span className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin block" />
                                : <Eye className="w-4 h-4" />}
                            </button>
                          )}
                          <button onClick={() => handleDeleteUser(u.id)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-red-400
                              hover:bg-red-500/10 transition-all"
                            title="Benutzer löschen">
                            <UserX className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                        );
                      })()
                    ))}
                  </div>
                  <div className="px-5 py-3 border-t border-white/10 text-xs text-slate-600">
                    {regUsers.length} Benutzer
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ══════════ SETTINGS TAB ══════════ */}
        {activeTab === 'settings' && (
          <div className="animate-fade-in pb-10 space-y-6 max-w-2xl">

            {/* SMTP config card */}
            <div className="glass-card rounded-2xl p-6 space-y-5">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-amber-400" />
                SMTP-Server Konfiguration
              </h2>

              {/* Host + Port */}
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Server-Host
                  </label>
                  <input type="text" value={smtp.host} onChange={(e) => handleSmtpChange('host', e.target.value)}
                    placeholder="smtp.gmail.com" className="input-dark" />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Port
                  </label>
                  <input type="number" value={smtp.port} min="1" max="65535"
                    onChange={(e) => handleSmtpChange('port', Number(e.target.value))}
                    className="input-dark" />
                </div>
              </div>

              {/* Security */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Verbindungssicherheit
                </label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: 'Unverschlüsselt', secure: false, port: 25  },
                    { label: 'STARTTLS',         secure: false, port: 587 },
                    { label: 'SSL/TLS',          secure: true,  port: 465 },
                  ].map((opt) => (
                    <button key={opt.label} type="button"
                      onClick={() => { handleSmtpChange('secure', opt.secure); handleSmtpChange('port', opt.port); }}
                      className={`px-3 py-2 rounded-xl text-sm font-medium transition-all
                        ${smtp.secure === opt.secure && smtp.port === opt.port
                          ? 'bg-blue-600 text-white shadow-glow-blue'
                          : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'
                        }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auth */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Benutzername
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input type="email" value={smtp.auth.user}
                      onChange={(e) => handleSmtpChange('auth.user', e.target.value)}
                      placeholder="user@gmail.com" className="input-dark pl-10" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Passwort / App-Token
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input type={showSmtpPw ? 'text' : 'password'} value={smtp.auth.pass}
                      onChange={(e) => handleSmtpChange('auth.pass', e.target.value)}
                      placeholder="••••••••" className="input-dark pl-10 pr-10" />
                    <button type="button" onClick={() => setShowSmtpPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                      {showSmtpPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* From name + email */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Absender-Name
                  </label>
                  <input type="text" value={smtp.fromName}
                    onChange={(e) => handleSmtpChange('fromName', e.target.value)}
                    placeholder="Koffein-Tracker" className="input-dark" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Absender-E-Mail
                  </label>
                  <input type="email" value={smtp.fromEmail}
                    onChange={(e) => handleSmtpChange('fromEmail', e.target.value)}
                    placeholder="noreply@deine-domain.de" className="input-dark" />
                </div>
              </div>

              {/* Base URL */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  App-URL <span className="normal-case font-normal text-slate-600">(für Bestätigungslinks in E-Mails)</span>
                </label>
                <input type="url" value={smtp.baseUrl}
                  onChange={(e) => handleSmtpChange('baseUrl', e.target.value)}
                  placeholder="https://deine-app.de" className="input-dark" />
              </div>

              {/* Save button */}
              <button onClick={handleSmtpSave} disabled={smtpSaving}
                className="w-full py-3 rounded-xl font-semibold text-white
                  bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400
                  disabled:opacity-60 transition-all shadow-glow-blue flex items-center justify-center gap-2">
                {smtpSaving
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Server className="w-4 h-4" />}
                Einstellungen speichern
              </button>
            </div>

            {/* Registration toggle card */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-green-400" />
                    Benutzer-Registrierung
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Erlaubt neuen Benutzern, sich selbst zu registrieren.
                  </p>
                </div>
                <button type="button"
                  onClick={() => handleSmtpChange('registrationEnabled', !smtp.registrationEnabled)}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300
                    ${smtp.registrationEnabled ? 'bg-green-500' : 'bg-white/10'}`}>
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-300
                    ${smtp.registrationEnabled ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            </div>

            {/* Demo access toggle card */}
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-400" />
                    Demo-Zugang
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Zeigt Demo-Login-Buttons auf der Anmeldeseite (Admin + Benutzer).
                  </p>
                </div>
                <button type="button"
                  onClick={() => handleSmtpChange('demoEnabled', !smtp.demoEnabled)}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300
                    ${smtp.demoEnabled !== false ? 'bg-amber-500' : 'bg-white/10'}`}>
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-300
                    ${smtp.demoEnabled !== false ? 'left-7' : 'left-1'}`} />
                </button>
              </div>
            </div>

            {/* Test email card */}
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Send className="w-4 h-4 text-blue-400" />
                SMTP-Verbindung testen
              </h3>
              <p className="text-xs text-slate-500">
                Sendet eine Test-E-Mail um die Konfiguration zu prüfen. Speichere zuerst deine Einstellungen.
              </p>
              <div className="flex gap-2">
                <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="test@example.com" className="input-dark flex-1" />
                <button onClick={handleSmtpTest} disabled={smtpTesting || !testEmail.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                    bg-amber-500/20 border border-amber-500/30 text-amber-300
                    hover:bg-amber-500/30 transition-all text-sm disabled:opacity-50 shrink-0">
                  {smtpTesting
                    ? <span className="w-4 h-4 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                    : <Send className="w-4 h-4" />}
                  Test senden
                </button>
              </div>
            </div>

            {/* Discord test card */}
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-indigo-400" />
                Discord-Webhook testen
              </h3>
              <p className="text-xs text-slate-500">
                Sendet eine Testnachricht an deinen Discord Webhook.
              </p>
              <div className="flex gap-2">
                <input type="url" value={discordWebhook} onChange={(e) => setDiscordWebhook(e.target.value)}
                  placeholder="https://discord.com/api/webhooks/..." className="input-dark flex-1" />
                <button onClick={handleDiscordTest} disabled={discordTesting || !discordWebhook.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                    bg-indigo-500/20 border border-indigo-500/30 text-indigo-300
                    hover:bg-indigo-500/30 transition-all text-sm disabled:opacity-50 shrink-0">
                  {discordTesting
                    ? <span className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                    : <MessageCircle className="w-4 h-4" />}
                  Test senden
                </button>
              </div>
            </div>

            {/* AI / OpenRouter settings card */}
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Bot className="w-4 h-4 text-violet-400" />
                KI-Assistent (OpenRouter)
              </h3>
              <p className="text-xs text-slate-500">
                API-Key von <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-violet-400 underline">openrouter.ai</a> eingeben, um KI-Funktionen zu aktivieren.
                {aiKeyMasked && <span className="ml-1 text-slate-400">Aktueller Key: <span className="font-mono text-xs text-violet-300">{aiKeyMasked}</span></span>}
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">API-Key</label>
                  <input
                    type="password"
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    placeholder={aiKeyMasked ? 'Neuen Key eingeben zum Überschreiben…' : 'sk-or-v1-…'}
                    className="input-dark"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Modell</label>
                  <input
                    type="text"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    placeholder="deepseek/deepseek-v3"
                    className="input-dark font-mono text-sm"
                  />
                  <p className="text-xs text-slate-600 mt-1">z.B. google/gemini-2.0-flash-001, openai/gpt-4o-mini, meta-llama/llama-3.1-8b-instruct:free</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                    Brave Search API-Token
                  </label>
                  <input
                    type="password"
                    value={braveSearchKey}
                    onChange={(e) => setBraveSearchKey(e.target.value)}
                    placeholder={braveKeyMasked ? 'Neuen Token eingeben zum Überschreiben…' : 'BSA…'}
                    className="input-dark"
                  />
                  {braveKeyMasked && (
                    <p className="text-xs text-slate-500 mt-1">
                      Aktueller Token: <span className="font-mono text-orange-300">{braveKeyMasked}</span>
                    </p>
                  )}
                  <p className="text-xs text-slate-600 mt-1">
                    Optionaler <a href="https://brave.com/search/api/" target="_blank" rel="noreferrer" className="text-orange-400 underline">Brave Search API</a>-Token. Wenn gesetzt, wird Brave Search statt OpenFoodFacts für die KI-Getränkeerkennung verwendet.
                  </p>
                </div>
              </div>
              <button onClick={handleSaveAi} disabled={aiSaving}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl
                  bg-violet-500/20 border border-violet-500/30 text-violet-300
                  hover:bg-violet-500/30 transition-all text-sm disabled:opacity-50">
                {aiSaving
                  ? <span className="w-4 h-4 border-2 border-violet-400/30 border-t-violet-400 rounded-full animate-spin" />
                  : <Bot className="w-4 h-4" />}
                Speichern
              </button>
              {aiMsg && (
                <div className={`rounded-xl p-3 flex items-center gap-2 text-sm
                  ${aiMsg.type === 'success' ? 'bg-green-500/10 border border-green-500/30 text-green-300' : 'bg-red-500/10 border border-red-500/30 text-red-300'}`}>
                  {aiMsg.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                  {aiMsg.text}
                  <button onClick={() => setAiMsg(null)} className="ml-auto text-xs opacity-60 hover:opacity-100">×</button>
                </div>
              )}
            </div>

            {/* Redis Health card */}
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-green-400" />
                  Redis Datenpersistenz
                </h3>
                <button
                  onClick={handleRedisCheck}
                  disabled={redisChecking}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs
                    bg-white/5 border border-white/10 text-slate-300
                    hover:bg-white/10 transition-all disabled:opacity-50">
                  {redisChecking
                    ? <span className="w-3 h-3 border-2 border-slate-400/30 border-t-slate-400 rounded-full animate-spin" />
                    : <RefreshCw className="w-3 h-3" />}
                  Prüfen
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Prüft ob Redis erreichbar ist, wie viele Einträge pro Datenschlüssel gespeichert sind
                und wann zuletzt ein Snapshot gesichert wurde.
              </p>
              {redisError && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {redisError}
                </div>
              )}
              {redisHealth && !redisError && (
                <div className="space-y-3">
                  {/* Status row */}
                  <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium
                    ${redisHealth.connected
                      ? 'bg-green-500/10 border-green-500/30 text-green-300'
                      : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                    {redisHealth.connected
                      ? <CheckCircle className="w-4 h-4 shrink-0" />
                      : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    {redisHealth.connected ? 'Redis verbunden und erreichbar' : 'Redis nicht erreichbar'}
                  </div>
                  {/* Info grid */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white/5 rounded-xl px-3 py-2.5 border border-white/8">
                      <p className="text-slate-500 mb-1">Persistenz-Modus</p>
                      <p className="text-white font-mono">{redisHealth.persistMode}</p>
                    </div>
                    <div className="bg-white/5 rounded-xl px-3 py-2.5 border border-white/8">
                      <p className="text-slate-500 mb-1">Letzter Snapshot</p>
                      <p className="text-white">
                        {redisHealth.lastSave
                          ? new Date(redisHealth.lastSave).toLocaleString('de-DE')
                          : '–'}
                      </p>
                    </div>
                  </div>
                  {/* Keys table */}
                  {Object.keys(redisHealth.keys).length > 0 && (
                    <div className="rounded-xl border border-white/8 overflow-hidden text-xs">
                      <div className="grid grid-cols-[1fr_auto] px-3 py-2 bg-white/5
                        text-slate-500 font-semibold uppercase tracking-wider">
                        <span>Schlüssel</span>
                        <span className="text-right">Einträge</span>
                      </div>
                      {Object.entries(redisHealth.keys).map(([key, info]) => (
                        <div key={key} className="grid grid-cols-[1fr_auto] px-3 py-2.5
                          border-t border-white/5 hover:bg-white/5 transition-colors">
                          <span className="text-slate-300 font-mono">{key}</span>
                          <span className={`text-right font-semibold
                            ${info.count > 0 ? 'text-green-400' : 'text-slate-600'}`}>
                            {info.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Feedback message */}
            {smtpMsg && (
              <div className={`glass-card rounded-2xl p-4 flex items-center gap-3 border animate-slide-in
                ${smtpMsg.type === 'success'
                  ? 'bg-green-500/10 border-green-500/30 text-green-300'
                  : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
                {smtpMsg.type === 'success'
                  ? <CheckCircle className="w-5 h-5 shrink-0" />
                  : <AlertTriangle className="w-5 h-5 shrink-0" />}
                <span className="text-sm">{smtpMsg.text}</span>
                <button onClick={() => setSmtpMsg(null)} className="ml-auto text-xs underline opacity-60 hover:opacity-100">
                  ×
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default AdminPanel;
