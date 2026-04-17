import React from 'react';
import { Zap, Loader2, LogOut, User } from 'lucide-react';

const Header = ({ isAuthenticated, isLoading, session, onLogout }) => {
  const today = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <header className="glass-card border-b border-white/10 px-4 py-5 mb-6 sticky top-0 z-20">
      <div className="max-w-lg mx-auto flex items-center gap-3">
        {/* Logo */}
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0
          bg-gradient-to-br from-blue-500 to-amber-400 shadow-glow-blue">
          <Zap className="w-5 h-5 text-white" fill="white" />
        </div>

        {/* Title + date */}
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gradient leading-tight">Koffein-Tracker</h1>
          <p className="text-xs text-slate-500 truncate">{today}</p>
        </div>

        {/* Spinner */}
        {isLoading && (
          <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
        )}

        {/* User badge + logout */}
        {session && (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl
              bg-white/5 border border-white/10">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-400 hidden sm:inline">{session.name}</span>
            </div>
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-1.5 rounded-xl text-slate-500 hover:text-red-400
                  hover:bg-red-500/10 transition-all"
                aria-label="Abmelden"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {!isAuthenticated && (
          <p className="text-xs text-slate-600">Verbinde…</p>
        )}
      </div>
    </header>
  );
};

export default Header;
