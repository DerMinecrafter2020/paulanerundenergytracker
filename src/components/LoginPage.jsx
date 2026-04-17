import React, { useState } from 'react';
import { Zap, Mail, Lock, Eye, EyeOff, LogIn, ShieldCheck } from 'lucide-react';
import { login } from '../services/auth';

const LoginPage = ({ onLogin }) => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Bitte alle Felder ausfüllen.');
      return;
    }
    setError('');
    setIsLoading(true);
    try {
      // Artificial short delay for UX
      await new Promise((r) => setTimeout(r, 500));
      const session = login(email, password);
      onLogin(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemo = (role) => {
    if (role === 'admin') {
      setEmail(import.meta.env.VITE_ADMIN_EMAIL || 'admin@energytracker.de');
      setPassword(import.meta.env.VITE_ADMIN_PASSWORD || 'Admin@2024!');
    } else {
      setEmail(import.meta.env.VITE_USER_EMAIL || 'user@energytracker.de');
      setPassword(import.meta.env.VITE_USER_PASSWORD || 'User@2024!');
    }
    setError('');
  };

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center p-4"
         style={{ background: 'radial-gradient(ellipse at top, #0f172a 0%, #070b14 60%)' }}>

      {/* ── Background orbs ── */}
      <div className="orb w-96 h-96 bg-blue-600/20 top-[-8rem] left-[-8rem] animate-float" />
      <div className="orb w-80 h-80 bg-amber-500/15 bottom-[-6rem] right-[-6rem] animate-float-delayed" />
      <div className="orb w-64 h-64 bg-purple-600/15 top-1/2 left-1/2 -translate-x-1/2 animate-float-slow" />

      {/* ── Card ── */}
      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="glass-card rounded-3xl p-8">

          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4
              bg-gradient-to-br from-blue-500 to-amber-400 shadow-glow-blue">
              <Zap className="w-9 h-9 text-white" fill="white" />
            </div>
            <h1 className="text-2xl font-bold text-gradient">Koffein-Tracker</h1>
            <p className="text-slate-400 text-sm mt-1">Melde dich an, um fortzufahren</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* E-Mail */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                E-Mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="deine@email.de"
                  autoComplete="email"
                  className="input-dark pl-10"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Passwort
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="input-dark pl-10 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500
                    hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3
                text-red-400 text-sm animate-slide-in">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-200
                bg-gradient-to-r from-blue-600 to-blue-500
                hover:from-blue-500 hover:to-blue-400
                disabled:opacity-60 disabled:cursor-not-allowed
                shadow-glow-blue hover:shadow-glow-blue
                flex items-center justify-center gap-2 mt-2"
            >
              {isLoading ? (
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Anmelden
                </>
              )}
            </button>
          </form>

          {/* Quick fill hints */}
          <div className="mt-6 pt-5 border-t border-white/10">
            <p className="text-xs text-slate-500 text-center mb-3">Demo-Zugänge</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fillDemo('admin')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl
                  bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium
                  hover:bg-amber-500/20 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Admin
              </button>
              <button
                type="button"
                onClick={() => fillDemo('user')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl
                  bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium
                  hover:bg-blue-500/20 transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                Benutzer
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          Koffein-Tracker &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
