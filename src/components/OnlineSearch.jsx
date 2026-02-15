import React, { useState } from 'react';
import { Plus, Info } from 'lucide-react';
import { searchProducts } from '../services/openFoodFacts';

const OnlineSearch = ({ onSelect }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await searchProducts(query);
      setResults(data);
      if (data.length === 0) {
        setError('Keine Treffer gefunden.');
      }
    } catch (err) {
      setError('Fehler bei der Online-Suche.');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-lg p-6 mb-6 animate-fade-in">
      <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
        <Info className="w-5 h-5 text-energy-blue" />
        Online-Suche (Open Food Facts)
      </h3>

      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="z.B. Red Bull, Monster, Club Mate"
          className="flex-1 px-4 py-3 rounded-xl border border-slate-200 
            focus:outline-none focus:ring-2 focus:ring-energy-blue focus:border-transparent
            transition-all duration-200"
        />
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="px-4 py-3 rounded-xl bg-energy-blue text-white font-semibold
            disabled:opacity-50 hover:opacity-90 transition-all"
        >
          Suchen
        </button>
      </form>

      {error && (
        <div className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-xl p-3 mb-4">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {results.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl
              hover:bg-slate-100 transition-all duration-200"
          >
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-slate-800 truncate">{item.name}</h4>
              <p className="text-sm text-slate-500 truncate">
                {item.brand || 'Unbekannte Marke'}
                {item.quantity ? ` • ${item.quantity}` : ''}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Koffein/100ml: {item.caffeinePer100ml ?? 'unbekannt'}
              </p>
            </div>
            <button
              onClick={() => onSelect(item)}
              className="p-2 bg-white rounded-xl shadow-sm hover:shadow-md transition-all"
              aria-label="In den Rechner übernehmen"
            >
              <Plus className="w-5 h-5 text-energy-blue" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OnlineSearch;
