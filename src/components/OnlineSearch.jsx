import React, { useState } from 'react';
import { Plus, Search, Loader2 } from 'lucide-react';
import { searchProducts } from '../services/openFoodFacts';

const OnlineSearch = ({ onSelect }) => {
  const [query, setQuery]       = useState('');
  const [results, setResults]   = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError]       = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await searchProducts(query);
      setResults(data);
      if (data.length === 0) setError('Keine Treffer gefunden.');
    } catch (err) {
      setError('Fehler bei der Online-Suche.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-3xl p-6 mb-6 animate-fade-in">
      <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
        <Search className="w-5 h-5 text-blue-400" />
        Online-Suche
        <span className="text-xs font-normal text-slate-600">Open Food Facts</span>
      </h3>

      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="z.B. Red Bull, Monster, Club Mate"
          className="input-dark flex-1"
        />
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-semibold
            disabled:opacity-50 hover:bg-blue-500 transition-all flex items-center gap-1.5"
        >
          {isLoading
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Search className="w-4 h-4" />
          }
        </button>
      </form>

      {error && (
        <div className="text-sm text-orange-300 bg-orange-500/10 border border-orange-500/30
          rounded-xl p-3 mb-4">
          {error}
        </div>
      )}

      <div className="space-y-2.5">
        {results.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 p-3.5 rounded-2xl
              bg-white/5 border border-white/8 hover:bg-white/10
              transition-all duration-200"
          >
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-white text-sm truncate">{item.name}</h4>
              <p className="text-xs text-slate-500 truncate">
                {item.brand || 'Unbekannte Marke'}
                {item.quantity ? ` • ${item.quantity}` : ''}
              </p>
              <p className="text-xs text-slate-600 mt-0.5">
                Koffein/100ml: {item.caffeinePer100ml ?? 'unbekannt'}
              </p>
            </div>
            <button
              onClick={() => onSelect(item)}
              className="p-2 rounded-xl bg-blue-600/20 border border-blue-500/30
                hover:bg-blue-600/40 transition-all"
              aria-label="In den Rechner übernehmen"
            >
              <Plus className="w-4 h-4 text-blue-400" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OnlineSearch;
