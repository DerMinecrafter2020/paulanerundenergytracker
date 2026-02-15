import React from 'react';
import { Zap, Loader2 } from 'lucide-react';

const Header = ({ isAuthenticated, isLoading }) => {
  const today = new Date().toLocaleDateString('de-DE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <header className="bg-gradient-to-r from-energy-yellow via-amber-400 to-energy-blue 
      text-white py-6 px-4 mb-6 shadow-lg">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-xl 
            flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" fill="white" />
          </div>
          <h1 className="text-2xl font-bold">Koffein-Tracker</h1>
          {isLoading && (
            <Loader2 className="w-5 h-5 ml-auto animate-spin" />
          )}
        </div>
        <p className="text-white/80 text-sm">{today}</p>
        {!isAuthenticated && (
          <p className="text-white/60 text-xs mt-1">Verbinde mit der Cloud...</p>
        )}
      </div>
    </header>
  );
};

export default Header;
