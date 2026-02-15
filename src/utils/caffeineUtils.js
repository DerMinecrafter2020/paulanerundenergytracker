// Vordefinierte Getränke mit Koffeinwerten
export const PRESET_DRINKS = [
  {
    id: 'redbull-250',
    name: 'Red Bull',
    size: 250,
    caffeinePerMl: 0.32, // 32mg/100ml = 0.32mg/ml
    totalCaffeine: 80,
    icon: '🥤',
    color: 'bg-blue-500'
  },
  {
    id: 'monster-500',
    name: 'Monster Energy',
    size: 500,
    caffeinePerMl: 0.32,
    totalCaffeine: 160,
    icon: '⚡',
    color: 'bg-green-500'
  },
  {
    id: 'coffee-200',
    name: 'Kaffee',
    size: 200,
    caffeinePerMl: 0.40, // 40mg/100ml
    totalCaffeine: 80,
    icon: '☕',
    color: 'bg-amber-700'
  },
  {
    id: 'espresso-30',
    name: 'Espresso',
    size: 30,
    caffeinePerMl: 2.12, // ~63mg/30ml
    totalCaffeine: 63,
    icon: '☕',
    color: 'bg-amber-900'
  },
  {
    id: 'rockstar-500',
    name: 'Rockstar',
    size: 500,
    caffeinePerMl: 0.32,
    totalCaffeine: 160,
    icon: '⭐',
    color: 'bg-yellow-500'
  },
  {
    id: 'goenrgy-500',
    name: 'Gönrgy',
    size: 500,
    caffeinePerMl: 0.32,
    totalCaffeine: 160,
    icon: '⚡',
    color: 'bg-indigo-500'
  },
  {
    id: 'holy-500',
    name: 'Holy Energy',
    size: 500,
    caffeinePerMl: 0.32,
    totalCaffeine: 160,
    icon: '✨',
    color: 'bg-purple-500'
  },
  {
    id: 'mate-500',
    name: 'Club Mate',
    size: 500,
    caffeinePerMl: 0.20, // 20mg/100ml
    totalCaffeine: 100,
    icon: '🧉',
    color: 'bg-lime-500'
  }
];

// Verfügbare Dosengrößen
export const DRINK_SIZES = [
  { value: 250, label: '250 ml' },
  { value: 330, label: '330 ml' },
  { value: 500, label: '500 ml' }
];

// Empfohlenes Tageslimit für Koffein (in mg)
export const DAILY_CAFFEINE_LIMIT = 400;

// Koffeingehalt berechnen
export const calculateCaffeine = (caffeinePerMl, sizeInMl) => {
  return Math.round(caffeinePerMl * sizeInMl);
};

// Koffeingehalt aus mg/100ml berechnen
export const calculateFromPer100ml = (mgPer100ml, sizeInMl) => {
  return Math.round((mgPer100ml / 100) * sizeInMl);
};

// Fortschrittsprozentsatz berechnen
export const calculateProgress = (currentCaffeine, limit = DAILY_CAFFEINE_LIMIT) => {
  return Math.min((currentCaffeine / limit) * 100, 100);
};

// Statusfarbe basierend auf dem Fortschritt
export const getProgressColor = (percentage) => {
  if (percentage >= 100) return 'bg-energy-red';
  if (percentage >= 75) return 'bg-energy-orange';
  return 'bg-energy-green';
};

// Statusmeldung basierend auf dem Fortschritt
export const getStatusMessage = (currentCaffeine, limit = DAILY_CAFFEINE_LIMIT) => {
  const percentage = (currentCaffeine / limit) * 100;
  
  if (currentCaffeine === 0) {
    return { text: 'Noch kein Koffein heute - starte frisch! ☀️', type: 'info' };
  }
  if (percentage < 25) {
    return { text: 'Guter Start! Du bist im grünen Bereich. 🌱', type: 'success' };
  }
  if (percentage < 50) {
    return { text: 'Moderate Aufnahme - alles im Rahmen. 👍', type: 'success' };
  }
  if (percentage < 75) {
    return { text: 'Über die Hälfte - behalte es im Auge! 👀', type: 'warning' };
  }
  if (percentage < 100) {
    return { text: 'Fast am Limit - sei vorsichtig! ⚠️', type: 'warning' };
  }
  return { text: 'Tageslimit überschritten! Kein weiteres Koffein empfohlen. 🛑', type: 'error' };
};

// Zeit formatieren
export const formatTime = (date) => {
  return new Date(date).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit'
  });
};
