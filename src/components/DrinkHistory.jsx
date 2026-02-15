import React from 'react';
import { History, Trash2, Info } from 'lucide-react';
import { formatTime } from '../utils/caffeineUtils';

const DrinkHistory = ({ logs, onDeleteLog, isLoading }) => {
  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-3xl shadow-lg p-6 animate-fade-in">
        <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
          <History className="w-5 h-5 text-slate-400" />
          Heutiger Verlauf
        </h3>
        <div className="flex flex-col items-center justify-center py-8 text-slate-400">
          <Info className="w-12 h-12 mb-3 opacity-50" />
          <p className="text-center">Noch keine Getränke heute protokolliert.</p>
          <p className="text-sm text-center mt-1">Füge dein erstes Getränk hinzu!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl shadow-lg p-6 animate-fade-in">
      <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
        <History className="w-5 h-5 text-energy-blue" />
        Heutiger Verlauf
        <span className="ml-auto text-sm font-normal text-slate-500">
          {logs.length} {logs.length === 1 ? 'Eintrag' : 'Einträge'}
        </span>
      </h3>

      <div className="space-y-3">
        {logs.map((log) => (
          <div 
            key={log.id}
            className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl
              hover:bg-slate-100 transition-all duration-200 animate-slide-in group"
          >
            {/* Icon */}
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center
              shadow-sm text-xl">
              {log.icon || '🥤'}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-slate-800 truncate">{log.name}</h4>
              <p className="text-sm text-slate-500">
                {log.size} ml • {formatTime(log.createdAt)}
              </p>
            </div>

            {/* Koffein */}
            <div className="text-right">
              <span className="text-lg font-bold text-energy-blue">{log.caffeine}</span>
              <span className="text-sm text-slate-500 ml-1">mg</span>
            </div>

            {/* Löschen Button */}
            <button
              onClick={() => onDeleteLog(log.id)}
              disabled={isLoading}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 
                rounded-xl transition-all duration-200 disabled:opacity-50
                opacity-0 group-hover:opacity-100"
              aria-label="Eintrag löschen"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DrinkHistory;
