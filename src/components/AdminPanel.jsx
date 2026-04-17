import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck, LogOut, Trash2, RefreshCw, Database,
  TrendingUp, Users, Zap, Calendar, BarChart2, AlertTriangle,
  Download, Search, ChevronDown, ChevronUp, Coffee,
} from 'lucide-react';
import { logout } from '../services/auth';
import { fetchLogs, deleteLog as deleteApiLog } from '../services/api';

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
const AdminPanel = ({ session, onLogout }) => {
  const [allLogs, setAllLogs]     = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState(null);
  const [deleting, setDeleting]   = useState(null);
  const [search, setSearch]       = useState('');
  const [sortField, setSortField] = useState('createdAt');
  const [sortDir, setSortDir]     = useState('desc');
  const [activeTab, setActiveTab] = useState('overview');

  // ── Fetch all logs for the last 30 days ────────────────────────────────
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
        <div className="flex gap-1 glass-card rounded-2xl p-1 mb-6 w-fit">
          {[
            { id: 'overview', label: 'Übersicht',  icon: BarChart2 },
            { id: 'logs',     label: 'Alle Logs',  icon: Database   },
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
      </div>
    </div>
  );
};

export default AdminPanel;
