import React from 'react';
import { Zap } from 'lucide-react';
import {
  calculateProgress,
  getProgressColor,
  getStatusMessage,
  DAILY_CAFFEINE_LIMIT,
} from '../utils/caffeineUtils';

const ProgressBar = ({ currentCaffeine }) => {
  const percentage    = calculateProgress(currentCaffeine);
  const status        = getStatusMessage(currentCaffeine);

  // Gradient based on level
  const barGradient =
    percentage >= 100 ? 'from-red-600 to-red-400' :
    percentage >= 75  ? 'from-orange-500 to-amber-400' :
    percentage >= 50  ? 'from-amber-500 to-yellow-400' :
                        'from-blue-600 to-blue-400';

  const glowClass =
    percentage >= 100 ? 'shadow-[0_0_20px_rgba(239,68,68,0.5)]' :
    percentage >= 75  ? 'shadow-[0_0_20px_rgba(249,115,22,0.4)]' :
    percentage >= 50  ? 'shadow-[0_0_20px_rgba(251,191,36,0.4)]' :
                        'shadow-glow-blue';

  const statusBg =
    status.type === 'error'   ? 'bg-red-500/10 border-red-500/30 text-red-300' :
    status.type === 'warning' ? 'bg-orange-500/10 border-orange-500/30 text-orange-300' :
    status.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-300' :
                                'bg-blue-500/10 border-blue-500/30 text-blue-300';

  return (
    <div className="glass-card rounded-3xl p-6 mb-6 animate-fade-in">
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center
            bg-gradient-to-br ${barGradient} ${glowClass}`}>
            <Zap className="w-6 h-6 text-white" fill="white" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Koffein heute</h2>
            <p className="text-xs text-slate-500">Limit: {DAILY_CAFFEINE_LIMIT} mg</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-3xl font-bold text-white">{currentCaffeine}</span>
          <span className="text-lg text-slate-400 ml-1">mg</span>
        </div>
      </div>

      {/* Track */}
      <div className="relative h-5 bg-white/5 rounded-full overflow-hidden border border-white/10 mb-3">
        <div
          className={`absolute inset-y-0 left-0 bg-gradient-to-r ${barGradient}
            rounded-full transition-all duration-700 ease-out`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/20 rounded-full" />
        </div>
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs text-slate-600 mb-4">
        <span>0 mg</span>
        <span className="font-semibold text-slate-400">{Math.round(percentage)}%</span>
        <span>{DAILY_CAFFEINE_LIMIT} mg</span>
      </div>

      {/* Status */}
      <div className={`px-4 py-3 rounded-2xl border ${statusBg}`}>
        <p className="text-sm font-medium text-center">{status.text}</p>
      </div>
    </div>
  );
};

export default ProgressBar;

