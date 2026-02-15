import React, { useState, useMemo, useEffect } from 'react';
import { Calculator, Plus } from 'lucide-react';
import { DRINK_SIZES, calculateFromPer100ml } from '../utils/caffeineUtils';

const ManualCalculator = ({ onAddDrink, isLoading, prefill, onPrefillApplied }) => {
  const [drinkName, setDrinkName] = useState('');
  const [caffeinePer100ml, setCaffeinePer100ml] = useState(32);
  const [selectedSize, setSelectedSize] = useState(250);

  useEffect(() => {
    if (!prefill) return;

    if (prefill.name) setDrinkName(prefill.name);
    if (typeof prefill.caffeinePer100ml === 'number') {
      setCaffeinePer100ml(prefill.caffeinePer100ml);
    }
    if (typeof prefill.sizeMl === 'number') {
      setSelectedSize(prefill.sizeMl);
    }

    if (onPrefillApplied) {
      onPrefillApplied();
    }
  }, [prefill, onPrefillApplied]);

  // Automatische Berechnung der Gesamtdosis
  const totalCaffeine = useMemo(() => {
    return calculateFromPer100ml(caffeinePer100ml, selectedSize);
  }, [caffeinePer100ml, selectedSize]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!drinkName.trim()) {
      return;
    }

    onAddDrink({
      name: drinkName.trim(),
      size: selectedSize,
      caffeine: totalCaffeine,
      caffeinePerMl: caffeinePer100ml / 100,
      icon: '🥤',
      isPreset: false
    });

    // Formular zurücksetzen
    setDrinkName('');
    setCaffeinePer100ml(32);
    setSelectedSize(250);
  };

  return (
    <div className="bg-white rounded-3xl shadow-lg p-6 mb-6 animate-fade-in">
      <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
        <Calculator className="w-5 h-5 text-energy-yellow" />
        Manueller Rechner
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Getränkename */}
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-2">
            Getränkename
          </label>
          <input
            type="text"
            value={drinkName}
            onChange={(e) => setDrinkName(e.target.value)}
            placeholder="z.B. Energy Drink XYZ"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 
              focus:outline-none focus:ring-2 focus:ring-energy-blue focus:border-transparent
              transition-all duration-200"
          />
        </div>

        {/* Koffeingehalt pro 100ml */}
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-2">
            Koffeingehalt pro 100 ml
          </label>
          <div className="relative">
            <input
              type="number"
              value={caffeinePer100ml}
              onChange={(e) => setCaffeinePer100ml(Math.max(0, Number(e.target.value)))}
              min="0"
              max="500"
              className="w-full px-4 py-3 pr-16 rounded-xl border border-slate-200 
                focus:outline-none focus:ring-2 focus:ring-energy-blue focus:border-transparent
                transition-all duration-200"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
              mg
            </span>
          </div>
        </div>

        {/* Dosengröße */}
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-2">
            Dosengröße
          </label>
          <div className="flex gap-2">
            {DRINK_SIZES.map((size) => (
              <button
                key={size.value}
                type="button"
                onClick={() => setSelectedSize(size.value)}
                className={`flex-1 py-3 px-4 rounded-xl font-medium transition-all duration-200
                  ${selectedSize === size.value 
                    ? 'bg-energy-blue text-white shadow-md' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
              >
                {size.label}
              </button>
            ))}
            {!DRINK_SIZES.some((size) => size.value === selectedSize) && (
              <div className="flex-1 py-3 px-4 rounded-xl font-medium bg-slate-100 text-slate-600 text-center">
                {selectedSize} ml
              </div>
            )}
          </div>
        </div>

        {/* Berechnete Gesamtdosis */}
        <div className="bg-gradient-to-r from-slate-50 to-slate-100 rounded-2xl p-4">
          <div className="flex justify-between items-center">
            <span className="text-slate-600 font-medium">Gesamtdosis:</span>
            <span className="text-2xl font-bold text-energy-blue">
              {totalCaffeine} mg
            </span>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!drinkName.trim() || isLoading}
          className="w-full bg-gradient-to-r from-energy-yellow to-energy-blue 
            text-white font-bold py-4 px-6 rounded-2xl
            hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200 shadow-lg hover:shadow-xl
            flex items-center justify-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Hinzufügen
        </button>
      </form>
    </div>
  );
};

export default ManualCalculator;
