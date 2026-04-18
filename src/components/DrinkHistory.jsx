import React from 'react';
import { History, Trash2, Coffee, Heart, HeartOff } from 'lucide-react';
import { formatTime } from '../utils/caffeineUtils';

const DrinkHistory = ({ logs, onDeleteLog, onToggleFavorite, isFavoriteLog, isLoading }) => {
  if (logs.length === 0) {
    return (
      <div className="glass-card rounded-3xl p-6 animate-fade-in">
        <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
          <History className="w-5 h-5 text-slate-500" />
          Heutiger Verlauf
        </h3>
        <div className="flex flex-col items-center justify-center py-10 text-slate-600">
          <Coffee className="w-10 h-10 mb-3 opacity-30" />
          <p className="text-sm text-center">Noch keine Getränke heute protokolliert.</p>
          <p className="text-xs text-center mt-1 text-slate-700">Füge dein erstes Getränk hinzu!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-3xl p-6 animate-fade-in">
      <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
        <History className="w-5 h-5 text-blue-400" />
        Heutiger Verlauf
        <span className="ml-auto text-xs font-normal text-slate-500">
          {logs.length} {logs.length === 1 ? 'Eintrag' : 'Einträge'}
        </span>
      </h3>

      <div className="space-y-2.5">
        {logs.map((log) => (
          (() => {
            const isFavorite = isFavoriteLog ? isFavoriteLog(log) : false;
            return (
          <div
            key={log.id}
            className="flex items-center gap-3 p-3.5 rounded-2xl
              bg-white/5 border border-white/8
              hover:bg-white/10 hover:border-white/15
              transition-all duration-200 animate-slide-in group"
          >
            {/* Icon */}
            <div className="w-9 h-9 rounded-xl flex items-center justify-center
              bg-gradient-to-br from-blue-600/30 to-blue-400/10 border border-blue-500/20 shrink-0 text-lg">
              {log.icon || '🥤'}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-white text-sm truncate">{log.name}</h4>
              <p className="text-xs text-slate-500">
                {log.size} ml • {formatTime(log.createdAt)}
              </p>
            </div>

            {/* Caffeine badge */}
            <div className="text-right shrink-0">
              <span className="text-base font-bold text-blue-400">{log.caffeine}</span>
              <span className="text-xs text-slate-500 ml-0.5">mg</span>
            </div>

            <button
              onClick={() => onToggleFavorite && onToggleFavorite(log, isFavorite)}
              disabled={isLoading}
              className={`p-1.5 rounded-xl transition-all duration-200 disabled:opacity-50
                ${isFavorite
                  ? 'text-pink-400 hover:text-pink-300 hover:bg-pink-500/10'
                  : 'text-slate-600 hover:text-pink-400 hover:bg-pink-500/10'}
              `}
              aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Als Favorit markieren'}
              title={isFavorite ? 'Aus Favoriten entfernen' : 'Als Favorit markieren'}
            >
              {isFavorite ? <HeartOff className="w-4 h-4" /> : <Heart className="w-4 h-4" />}
            </button>

            {/* Delete */}
            <button
              onClick={() => onDeleteLog(log.id)}
              disabled={isLoading}
              className="p-1.5 text-slate-700 hover:text-red-400 hover:bg-red-500/10
                rounded-xl transition-all duration-200 disabled:opacity-50
                opacity-0 group-hover:opacity-100"
              aria-label="Eintrag löschen"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
            );
          })()
        ))}
      </div>
    </div>
  );
};

export default DrinkHistory;
