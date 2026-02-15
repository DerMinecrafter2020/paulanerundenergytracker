import React from 'react';
import { Zap } from 'lucide-react';
import { 
  calculateProgress, 
  getProgressColor, 
  getStatusMessage, 
  DAILY_CAFFEINE_LIMIT 
} from '../utils/caffeineUtils';

const ProgressBar = ({ currentCaffeine }) => {
  const percentage = calculateProgress(currentCaffeine);
  const progressColor = getProgressColor(percentage);
  const status = getStatusMessage(currentCaffeine);

  return (
    <div className="bg-white rounded-3xl shadow-lg p-6 mb-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-energy-yellow to-energy-blue rounded-2xl flex items-center justify-center shadow-md">
            <Zap className="w-6 h-6 text-white" fill="white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Koffein heute</h2>
            <p className="text-sm text-slate-500">Tageslimit: {DAILY_CAFFEINE_LIMIT} mg</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-3xl font-bold text-slate-800">{currentCaffeine}</span>
          <span className="text-lg text-slate-500 ml-1">mg</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative h-6 bg-slate-100 rounded-full overflow-hidden mb-4">
        <div 
          className={`absolute top-0 left-0 h-full ${progressColor} transition-all duration-500 ease-out rounded-full`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/20"></div>
        </div>
        {/* Marker bei 100% */}
        <div 
          className="absolute top-0 w-0.5 h-full bg-slate-300"
          style={{ left: '100%', transform: 'translateX(-2px)' }}
        ></div>
      </div>

      {/* Prozentanzeige */}
      <div className="flex justify-between text-sm text-slate-500 mb-4">
        <span>0 mg</span>
        <span className="font-medium">{Math.round(percentage)}%</span>
        <span>{DAILY_CAFFEINE_LIMIT} mg</span>
      </div>

      {/* Status Meldung */}
      <div className={`p-4 rounded-2xl ${
        status.type === 'error' ? 'bg-red-50 text-red-700' :
        status.type === 'warning' ? 'bg-orange-50 text-orange-700' :
        status.type === 'success' ? 'bg-green-50 text-green-700' :
        'bg-blue-50 text-blue-700'
      }`}>
        <p className="text-sm font-medium text-center">{status.text}</p>
      </div>
    </div>
  );
};

export default ProgressBar;
