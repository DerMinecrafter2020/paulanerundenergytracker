import React, { useState } from 'react';
import { Zap, Mail, Lock, Eye, EyeOff, User, ArrowLeft, CheckCircle, AlertTriangle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || window.location.origin;

const RegisterPage = ({ onBack }) => {
  const [form, setForm]       = useState({ name: '', email: '', password: '', confirm: '' });
  const [showPw, setShowPw]   = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult]   = useState(null); // { type: 'success'|'error', text, warning? }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const validate = () => {
    if (!form.name.trim())               return 'Bitte gib deinen Namen ein.';
    if (!form.email.trim())              return 'Bitte gib deine E-Mail-Adresse ein.';
    if (form.password.length < 8)        return 'Passwort muss mindestens 8 Zeichen lang sein.';
    if (form.password !== form.confirm)  return 'Passwörter stimmen nicht überein.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { setResult({ type: 'error', text: err }); return; }

    setIsLoading(true);
    setResult(null);
    try {
      const resp = await fetch(`${API_BASE}/api/register`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: form.name.trim(), email: form.email.trim(), password: form.password }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setResult({ type: 'error', text: data.error || 'Registrierung fehlgeschlagen.' });
      } else {
        setResult({
          type:    'success',
          text:    'Registrierung erfolgreich! Bitte prüfe dein Postfach und bestätige deine E-Mail-Adresse.',
          warning: data.emailWarning || null,
        });
      }
    } catch {
      setResult({ type: 'error', text: 'Verbindungsfehler. Bitte versuche es erneut.' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center p-4"
         style={{ background: 'radial-gradient(ellipse at top, #0f172a 0%, #070b14 60%)' }}>

      {/* Background orbs */}
      <div className="orb w-96 h-96 bg-green-600/15  top-[-8rem] right-[-6rem]  animate-float" />
      <div className="orb w-72 h-72 bg-blue-600/20   bottom-[-6rem] left-[-4rem] animate-float-delayed" />
      <div className="orb w-56 h-56 bg-purple-600/10 top-1/3 left-1/2 -translate-x-1/2 animate-float-slow" />

      <div className="relative z-10 w-full max-w-md animate-fade-in">
        <div className="glass-card rounded-3xl p-8">

          {/* Header */}
          <div className="flex flex-col items-center mb-7">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4
              bg-gradient-to-br from-green-500 to-blue-500 shadow-glow-green">
              <Zap className="w-9 h-9 text-white" fill="white" />
            </div>
            <h1 className="text-2xl font-bold text-gradient-green">Registrieren</h1>
            <p className="text-slate-400 text-sm mt-1">Erstelle dein Koffein-Tracker-Konto</p>
          </div>

          {/* Success state */}
          {result?.type === 'success' ? (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-500/15 border border-green-500/30
                flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
              <p className="text-white font-semibold">Fast geschafft!</p>
              <p className="text-slate-400 text-sm">{result.text}</p>
              {result.warning && (
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30
                  rounded-xl px-4 py-3 text-amber-300 text-xs text-left">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{result.warning}</span>
                </div>
              )}
              <button onClick={onBack}
                className="w-full mt-2 py-3 rounded-xl font-semibold text-white
                  bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400
                  transition-all shadow-glow-blue">
                Zur Anmeldung
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Name
                </label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type="text" value={form.name} onChange={set('name')}
                    placeholder="Max Mustermann" autoComplete="name" className="input-dark pl-12" />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  E-Mail
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type="email" value={form.email} onChange={set('email')}
                    placeholder="deine@email.de" autoComplete="email" className="input-dark pl-12" />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Passwort <span className="text-slate-600 normal-case font-normal">(min. 8 Zeichen)</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type={showPw ? 'text' : 'password'} value={form.password}
                    onChange={set('password')} placeholder="••••••••"
                    autoComplete="new-password" className="input-dark pl-12 pr-12" />
                  <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Passwort bestätigen
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input type={showPw ? 'text' : 'password'} value={form.confirm}
                    onChange={set('confirm')} placeholder="••••••••"
                    autoComplete="new-password" className="input-dark pl-12" />
                </div>
              </div>

              {/* Error */}
              {result?.type === 'error' && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3
                  text-red-400 text-sm animate-slide-in">
                  {result.text}
                </div>
              )}

              <button type="submit" disabled={isLoading}
                className="w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-200
                  bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500
                  disabled:opacity-60 disabled:cursor-not-allowed shadow-glow-green
                  flex items-center justify-center gap-2 mt-2">
                {isLoading
                  ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : 'Konto erstellen'
                }
              </button>
            </form>
          )}

          {/* Back to login */}
          {result?.type !== 'success' && (
            <div className="mt-5 pt-4 border-t border-white/10 text-center">
              <button onClick={onBack}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300
                  transition-colors mx-auto">
                <ArrowLeft className="w-4 h-4" />
                Zurück zur Anmeldung
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
