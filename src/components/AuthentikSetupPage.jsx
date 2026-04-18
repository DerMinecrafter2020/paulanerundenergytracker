import React, { useEffect, useState } from 'react';
import { KeyRound, Save, ShieldCheck, AlertTriangle } from 'lucide-react';
import { fetchAuthentikSetupStatus, submitAuthentikSetup } from '../services/adminApi';

const defaultRedirect = `${window.location.origin}/api/auth/authentik/callback`;

const AuthentikSetupPage = ({ onConfigured }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({
    baseUrl: '',
    clientId: '',
    clientSecret: '',
    redirectUri: defaultRedirect,
    scopes: 'openid profile email',
    authorizeUrl: '',
    tokenUrl: '',
    userInfoUrl: '',
    adminEmails: '',
  });

  useEffect(() => {
    let mounted = true;
    const loadStatus = async () => {
      try {
        const status = await fetchAuthentikSetupStatus();
        if (!mounted) return;
        if (status?.configured) {
          onConfigured?.();
          return;
        }

        const cfg = status?.config || {};
        setForm((prev) => ({
          ...prev,
          baseUrl: cfg.baseUrl || prev.baseUrl,
          clientId: cfg.clientId || prev.clientId,
          redirectUri: cfg.redirectUri || prev.redirectUri,
          scopes: cfg.scopes || prev.scopes,
          authorizeUrl: cfg.authorizeUrl || prev.authorizeUrl,
          tokenUrl: cfg.tokenUrl || prev.tokenUrl,
          userInfoUrl: cfg.userInfoUrl || prev.userInfoUrl,
          adminEmails: Array.isArray(cfg.adminEmails) ? cfg.adminEmails.join(', ') : prev.adminEmails,
        }));
      } catch (err) {
        if (mounted) setError(err.message || 'Setup-Status konnte nicht geladen werden.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadStatus();
    return () => {
      mounted = false;
    };
  }, [onConfigured]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!form.baseUrl.trim() || !form.clientId.trim() || !form.clientSecret.trim()) {
      setError('Bitte baseUrl, clientId und clientSecret ausfüllen.');
      return;
    }

    setSaving(true);
    try {
      await submitAuthentikSetup({
        baseUrl: form.baseUrl.trim(),
        clientId: form.clientId.trim(),
        clientSecret: form.clientSecret,
        redirectUri: form.redirectUri.trim() || defaultRedirect,
        scopes: form.scopes.trim() || 'openid profile email',
        authorizeUrl: form.authorizeUrl.trim(),
        tokenUrl: form.tokenUrl.trim(),
        userInfoUrl: form.userInfoUrl.trim(),
        adminEmails: form.adminEmails,
      });
      setSuccess('Authentik-Konfiguration gespeichert. Du kannst dich jetzt anmelden.');
      onConfigured?.();
    } catch (err) {
      setError(err.message || 'Authentik-Setup konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-950">
        <div className="text-slate-300 text-sm">Lade Authentik-Setup...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-3 sm:p-4 lg:p-8">
      <div className="w-full max-w-5xl rounded-2xl border border-slate-800 bg-slate-900/80 p-4 sm:p-6 lg:p-8 shadow-2xl">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-300">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Authentik einrichten</h1>
            <p className="text-slate-400 text-sm mt-1">
              Trage die OIDC-Daten deiner Authentik-Application ein. Der erste erfolgreiche Login wird automatisch als Admin angelegt.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300 text-sm flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-emerald-300 text-sm flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="md:col-span-2 lg:col-span-3">
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Base URL</label>
            <input className="input-dark" placeholder="https://auth.example.com" value={form.baseUrl} onChange={handleChange('baseUrl')} />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Client ID</label>
            <input className="input-dark" value={form.clientId} onChange={handleChange('clientId')} />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Client Secret</label>
            <input type="password" className="input-dark" value={form.clientSecret} onChange={handleChange('clientSecret')} />
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Redirect URI</label>
            <input className="input-dark" value={form.redirectUri} onChange={handleChange('redirectUri')} />
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Scopes</label>
            <input className="input-dark" value={form.scopes} onChange={handleChange('scopes')} />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Authorize URL (optional)</label>
            <input className="input-dark" value={form.authorizeUrl} onChange={handleChange('authorizeUrl')} />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Token URL (optional)</label>
            <input className="input-dark" value={form.tokenUrl} onChange={handleChange('tokenUrl')} />
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Userinfo URL (optional)</label>
            <input className="input-dark" value={form.userInfoUrl} onChange={handleChange('userInfoUrl')} />
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Admin E-Mails (optional, Komma-getrennt)</label>
            <input className="input-dark" placeholder="admin@example.com, ops@example.com" value={form.adminEmails} onChange={handleChange('adminEmails')} />
          </div>

          <div className="md:col-span-2 lg:col-span-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {saving ? 'Speichere...' : <><Save className="w-4 h-4" /> Setup speichern</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AuthentikSetupPage;
