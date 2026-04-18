import React from 'react';
import { Heart, HeartOff, Plus } from 'lucide-react';

const PresetDrinks = ({ favorites, onAddDrink, onRemoveFavorite, isLoading }) => {
  const handleAddFavorite = (drink) => {
    onAddDrink({
      name: drink.name,
      size: drink.size,
      caffeine: drink.caffeine,
      caffeinePerMl: drink.caffeinePerMl,
      icon: drink.icon,
      isPreset: false,
    });
  };

  return (
    <div className="glass-card rounded-3xl p-6 mb-6 animate-fade-in">
      <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
        <Heart className="w-5 h-5 text-pink-400" />
        Favoriten
      </h3>

      {Array.isArray(favorites) && favorites.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {favorites.map((drink) => (
            <div
              key={drink.id}
              className="bg-gradient-to-br from-pink-600/25 to-blue-500/20
                text-white rounded-2xl p-4 border border-white/10
                transition-all duration-200 shadow-card hover:shadow-lg"
            >
              <button
                onClick={() => handleAddFavorite(drink)}
                disabled={isLoading}
                className="w-full text-left"
              >
                <span className="text-2xl block text-center">{drink.icon || '🥤'}</span>
                <span className="font-semibold text-sm block text-center mt-1 truncate">{drink.name}</span>
                <span className="text-xs text-white/70 block text-center mt-1">{drink.size} ml • {drink.caffeine} mg</span>
              </button>
              <div className="mt-3 flex justify-end">
                <button
                  onClick={() => onRemoveFavorite && onRemoveFavorite(drink.id)}
                  disabled={isLoading}
                  className="p-1.5 rounded-lg text-pink-300 hover:text-red-300 hover:bg-red-500/15 transition-all"
                  title="Aus Favoriten entfernen"
                  aria-label="Aus Favoriten entfernen"
                >
                  <HeartOff className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-400">
          Noch keine Favoriten gespeichert. Markiere ein Getränk im Verlauf mit dem Herz-Symbol, um es hier schnell wiederzuverwenden.
        </div>
      )}

      <p className="text-xs text-slate-600 mt-3 flex items-center gap-1.5">
        <Plus className="w-3.5 h-3.5" />
        Klick auf einen Favoriten fügt ihn direkt erneut hinzu.
      </p>
    </div>
  );
};

export default PresetDrinks;
