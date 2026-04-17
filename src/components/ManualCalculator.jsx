import React, { useState, useMemo, useEffect } from 'react';
import { Calculator, Plus } from 'lucide-react';
import { DRINK_SIZES, calculateFromPer100ml } from '../utils/caffeineUtils';

const ManualCalculator = ({ onAddDrink, isLoading, prefill, onPrefillApplied }) => {
  const [drinkName, setDrinkName]           = useState('');
  const [caffeinePer100ml, setCaffeinePer100ml] = useState(32);
  const [selectedSize, setSelectedSize]     = useState(250);

  useEffect(() => {
    if (!prefill) return;
    if (prefill.name) setDrinkName(prefill.name);
    if (typeof prefill.caffeinePer100ml === 'number') setCaffeinePer100ml(prefill.caffeinePer100ml);
    if (typeof prefill.sizeMl === 'number') setSelectedSize(prefill.sizeMl);
    if (onPrefillApplied) onPrefillApplied();
  }, [prefill, onPrefillApplied]);

  const totalCaffeine = useMemo(
    () => calculateFromPer100ml(caffeinePer100ml, selectedSize),
    [caffeinePer100ml, selectedSize]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!drinkName.trim()) return;
    onAddDrink({
      name: drinkName.trim(),
      size: selectedSize,
      caffeine: totalCaffeine,
      caffeinePerMl: caffeinePer100ml / 100,
      icon: '🥤',
      isPreset: false,
    });
    setDrinkName('');
    setCaffeinePer100ml(32);
    setSelectedSize(250);
  };

  return (
    <div className="glass-card rounded-3xl p-6 mb-6 animate-fade-in">
      <h3 className="text-base font-bold text-white mb-5 flex items-center gap-2">
        <Calculator className="w-5 h-5 text-amber-400" />
        Manueller Rechner
      </h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Getränkename
          </label>
          <input
            type="text"
            value={drinkName}
            onChange={(e) => setDrinkName(e.target.value)}
            placeholder="z.B. Energy Drink XYZ"
            className="input-dark"
          />
        </div>

        {/* Koffein/100ml */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Koffein pro 100 ml
          </label>
          <div className="relative">
            <input
              type="number"
              value={caffeinePer100ml}
              onChange={(e) => setCaffeinePer100ml(Math.max(0, Number(e.target.value)))}
              min="0"
              max="500"
              className="input-dark pr-12"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 font-medium text-sm">
              mg
            </span>
          </div>
        </div>

        {/* Size buttons */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Dosengröße
          </label>
          <div className="flex gap-2 flex-wrap">
            {DRINK_SIZES.map((size) => (
              <button
                key={size.value}
                type="button"
                onClick={() => setSelectedSize(size.value)}
                className={`flex-1 min-w-0 py-2.5 px-3 rounded-xl font-medium transition-all duration-200 text-sm
                  ${selectedSize === size.value
                    ? 'bg-blue-600 text-white shadow-glow-blue'
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10'
                  }`}
              >
                {size.label}
              </button>
            ))}
            {!DRINK_SIZES.some((s) => s.value === selectedSize) && (
              <div className="flex-1 py-2.5 px-3 rounded-xl text-sm bg-white/5 text-slate-400 text-center border border-white/10">
                {selectedSize} ml
              </div>
            )}
          </div>
        </div>

        {/* Total dose preview */}
        <div className="flex justify-between items-center px-4 py-3.5 rounded-2xl
          bg-gradient-to-r from-blue-600/10 to-amber-500/10 border border-white/10">
          <span className="text-slate-400 font-medium text-sm">Gesamtdosis:</span>
          <div>
            <span className="text-2xl font-bold text-gradient">{totalCaffeine}</span>
            <span className="text-sm text-slate-500 ml-1">mg</span>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!drinkName.trim() || isLoading}
          className="w-full bg-gradient-to-r from-blue-600 to-amber-500
            text-white font-bold py-3.5 px-6 rounded-2xl
            hover:from-blue-500 hover:to-amber-400
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200
            shadow-glow-blue hover:shadow-glow-amber
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

