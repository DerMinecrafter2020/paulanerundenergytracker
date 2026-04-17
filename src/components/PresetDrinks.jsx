import React from 'react';
import { Plus } from 'lucide-react';
import { PRESET_DRINKS } from '../utils/caffeineUtils';

const PresetDrinks = ({ onAddDrink, isLoading }) => {
  const handleAddPreset = (drink) => {
    onAddDrink({
      name: drink.name,
      size: drink.size,
      caffeine: drink.totalCaffeine,
      caffeinePerMl: drink.caffeinePerMl,
      icon: drink.icon,
      isPreset: true,
    });
  };

  // Map old Tailwind bg classes to gradient styles
  const gradients = {
    'bg-blue-500':   'from-blue-600 to-blue-400',
    'bg-green-500':  'from-green-600 to-green-400',
    'bg-amber-700':  'from-amber-700 to-amber-500',
    'bg-amber-900':  'from-amber-900 to-amber-700',
    'bg-yellow-500': 'from-yellow-500 to-amber-400',
    'bg-indigo-500': 'from-indigo-600 to-indigo-400',
    'bg-purple-500': 'from-purple-600 to-purple-400',
    'bg-lime-500':   'from-lime-600 to-lime-400',
  };

  return (
    <div className="glass-card rounded-3xl p-6 mb-6 animate-fade-in">
      <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
        <Plus className="w-5 h-5 text-blue-400" />
        Schnell hinzufügen
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {PRESET_DRINKS.map((drink) => (
          <button
            key={drink.id}
            onClick={() => handleAddPreset(drink)}
            disabled={isLoading}
            className={`bg-gradient-to-br ${gradients[drink.color] || 'from-blue-600 to-blue-400'}
              disabled:opacity-50 text-white rounded-2xl p-4
              transition-all duration-200 hover:scale-105 active:scale-95
              shadow-card hover:shadow-lg
              flex flex-col items-center gap-2`}
          >
            <span className="text-2xl">{drink.icon}</span>
            <span className="font-semibold text-sm">{drink.name}</span>
            <span className="text-xs text-white/70">{drink.size} ml • {drink.totalCaffeine} mg</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default PresetDrinks;
