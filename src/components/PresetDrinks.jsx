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
      isPreset: true
    });
  };

  return (
    <div className="bg-white rounded-3xl shadow-lg p-6 mb-6 animate-fade-in">
      <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
        <Plus className="w-5 h-5 text-energy-blue" />
        Schnell hinzufügen
      </h3>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {PRESET_DRINKS.map((drink) => (
          <button
            key={drink.id}
            onClick={() => handleAddPreset(drink)}
            disabled={isLoading}
            className={`${drink.color} hover:opacity-90 disabled:opacity-50 
              text-white rounded-2xl p-4 transition-all duration-200 
              hover:scale-105 active:scale-95 shadow-md
              flex flex-col items-center gap-2`}
          >
            <span className="text-2xl">{drink.icon}</span>
            <span className="font-semibold text-sm">{drink.name}</span>
            <span className="text-xs opacity-80">{drink.size} ml • {drink.totalCaffeine} mg</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default PresetDrinks;
