import React, { useState, useEffect } from 'react';
import { Zap, Mail, Lock, Eye, EyeOff, LogIn, ShieldCheck, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { login } from '../services/auth';
import { fetchPublicSettings } from '../services/adminApi';

const LoginPage = ({ onLogin, onShowRegister }) => {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [verifiedBanner, setVerifiedBanner] = useState(null);
  const [publicSettings, setPublicSettings] = useState({ demoEnabled: true, registrationEnabled: true });

  // Load public settings (demo toggle, registration toggle)
  useEffect(() => {
    fetchPublicSettings()
      .then((s) => setPublicSettings(s))
      .catch(() => {});
  }, []);

  // Handle ?verified= query param (from email-verification redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('verified');
    if (v === '1')       setVerifiedBanner({ type: 'success', text: 'E-Mail erfolgreich bestätigt! Du kannst dich jetzt anmelden.' });
    else if (v === 'expired') setVerifiedBanner({ type: 'warning', text: 'Der Bestätigungslink ist abgelaufen. Bitte registriere dich erneut.' });
    else if (v === 'invalid') setVerifiedBanner({ type: 'error',   text: 'Ungültiger Bestätigungslink.' });
    if (v) window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError('Bitte alle Felder ausfüllen.'); return; }
    setError('');
    setIsLoading(true);
    try {
      const session = await login(email, password);
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

  const BannerIcon = verifiedBanner?.type === 'success' ? CheckCircle
    : verifiedBanner?.type === 'warning' ? Clock : AlertCircle;

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center p-4"
         style={{ background: 'radial-gradient(ellipse at top, #0f172a 0%, #070b14 60%)' }}>

      {/* Background orbs */}
      <div className="orb w-96 h-96 bg-blue-600/20 top-[-8rem] left-[-8rem] animate-float" />
      <div className="orb w-80 h-80 bg-amber-500/15 bottom-[-6rem] right-[-6rem] animate-float-delayed" />
      <div className="orb w-64 h-64 bg-purple-600/15 top-1/2 left-1/2 -translate-x-1/2 animate-float-slow" />

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="glass-card rounded-3xl p-8">

          {/* Logo */}
          <div className="flex flex-col items-center mb-7">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4
              bg-gradient-to-br from-blue-500 to-amber-400 shadow-glow-blue">
              <Zap className="w-9 h-9 text-white" fill="white" />
            </div>
            <h1 className="text-2xl font-bold text-gradient">Koffein-Tracker</h1>
            <p className="text-slate-400 text-sm mt-1">Melde dich an, um fortzufahren</p>
          </div>

          {/* Verified banner */}
          {verifiedBanner && (
            <div className={`flex items-start gap-2 px-4 py-3 rounded-2xl mb-5 text-sm animate-slide-in border
              ${verifiedBanner.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-300'
              : verifiedBanner.type === 'warning'  ? 'bg-amber-500/10  border-amber-500/30  text-amber-300'
              :                                      'bg-red-500/10    border-red-500/30    text-red-300'}`}>
              <BannerIcon className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{verifiedBanner.text}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">E-Mail</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="deine@email.de" autoComplete="email" className="input-dark pl-12" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Passwort</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input type={showPw ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" autoComplete="current-password"
                  className="input-dark pl-12 pr-12" />
                <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm animate-slide-in">
                {error}
              </div>
            )}

            <button type="submit" disabled={isLoading}
              className="w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-200
                bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400
                disabled:opacity-60 disabled:cursor-not-allowed shadow-glow-blue
                flex items-center justify-center gap-2 mt-2">
              {isLoading
                ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <><LogIn className="w-4 h-4" />Anmelden</>
              }
            </button>
          </form>

          {/* Register link */}
          {publicSettings.registrationEnabled && (
          <div className="mt-5 pt-4 border-t border-white/10 text-center">
            <p className="text-sm text-slate-500">
              Noch kein Konto?{' '}
              <button onClick={onShowRegister}
                className="text-blue-400 hover:text-blue-300 font-medium transition-colors">
                Jetzt registrieren
              </button>
            </p>
          </div>
          )}

          {/* Demo fill */}
          {publicSettings.demoEnabled && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <p className="text-xs text-slate-600 text-center mb-3">Demo-Zugänge</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => fillDemo('admin')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl
                  bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium
                  hover:bg-amber-500/20 transition-colors">
                <ShieldCheck className="w-3.5 h-3.5" />Admin
              </button>
              <button type="button" onClick={() => fillDemo('user')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl
                  bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium
                  hover:bg-blue-500/20 transition-colors">
                <Zap className="w-3.5 h-3.5" />Benutzer
              </button>
            </div>
          </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          Koffein-Tracker &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
