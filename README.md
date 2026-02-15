# Koffein-Tracker ⚡

Eine moderne Web-Anwendung zum Protokollieren des täglichen Koffeinkonsums durch Energy Drinks.

![Version](https://img.shields.io/badge/version-1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3.4-06B6D4?logo=tailwindcss&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-10-FFCA28?logo=firebase&logoColor=black)

## 🎯 Features

- 📊 **Dashboard mit Fortschrittsbalken** - Visualisiere deinen Tageskonsum
- ⚡ **Schnelles Hinzufügen** - Preset-Buttons für gängige Getränke
- 🧮 **Manueller Rechner** - Berechne Koffein für beliebige Getränke
- 📝 **Verlaufsprotokoll** - Sieh alle heutigen Einträge
- ☁️ **Cloud-Sync** - Deine Daten werden sicher in Firebase gespeichert
- 📱 **Mobile-First** - Optimiert für Smartphones
- 🚫 **Keine Installation** - Single HTML File

## 🚀 Quick Start

### Option 1: Direkt nutzen
1. `caffeine-tracker.html` herunterladen
2. Im Browser öffnen
3. Loslegen! 🎉

### Option 2: GitHub Pages
1. Repository forken
2. Settings → Pages → Source: main
3. Verfügbar unter: `https://USERNAME.github.io/REPO-NAME/caffeine-tracker.html`

## 📸 Screenshots

### Dashboard
![Dashboard mit Statistiken](https://via.placeholder.com/800x400/667eea/FFFFFF?text=Dashboard+Screenshot)

### Visuelle Suche
![Getränke-Suche mit Grid](https://via.placeholder.com/800x400/667eea/FFFFFF?text=Suche+Screenshot)

### Mobile View
![Mobile Ansicht](https://via.placeholder.com/400x800/667eea/FFFFFF?text=Mobile+Screenshot)

## 🥤 Getränke-Datenbank

### Energy Drinks
- **Deutsche Marken**: Red Bull, Monster, Effect, 28 Black, Booster, Flying Horse, Gönergy
- **Internationale**: Rockstar, Bang, Celsius, Prime, Reign, C4, Nocco
- **Koffein**: 24-67mg/100ml

### Limonaden
- **Deutsche**: Paulaner Spezi, Club Mate, Fritz Kola, Afri Cola, Vita Cola
- **Internationale**: Coca-Cola, Pepsi
- **Koffein**: 8-25mg/100ml

## 🎨 Features im Detail

### 1. Dashboard
- Koffein heute/Woche/Monat
- Anzahl Drinks heute
- 7-Tage-Balkendiagramm
- Farbcodierte Warnungen

### 2. Eingabe-Methoden
- 🔍 **Visuelle Suche** - Modal mit Grid-Layout
- ⌨️ **Autocomplete** - Live-Vorschläge während Eingabe
- 🎯 **Schnellauswahl** - Beliebte Drinks als Chips
- ✍️ **Manuell** - Eigene Werte eingeben

### 3. Filter & Suche
- Nach Land: 🇩🇪 🇺🇸 🇦🇹
- Nach Typ: Energy Drinks / Limonaden
- Live-Suche nach Name/Marke

### 4. Historie
- Alle heutigen Einträge
- Mit Uhrzeit & Details
- Lösch-Funktion

## 💻 Technologie

```
HTML5 + CSS3 + Vanilla JavaScript
├── Keine Frameworks
├── Keine Dependencies
├── Single File App
└── Offline-fähig
```

### Code-Struktur
- **HTML**: Semantic Markup
- **CSS**: Flexbox + Grid, Custom Properties
- **JavaScript**: ES6+, Storage API
- **Datenspeicherung**: window.storage (persistent)

## 📊 Datenstruktur

```javascript
{
  id: 1708086000000,
  name: "Red Bull",
  caffeinePer100ml: 32,
  size: 250,
  totalCaffeine: 80,
  timestamp: "2026-02-15T10:30:00.000Z"
}
```

## ⚙️ Installation & Deployment

### Lokal
```bash
# Einfach öffnen
open caffeine-tracker.html
```

### GitHub Pages
```bash
# Repository erstellen
git init
git add caffeine-tracker.html
git commit -m "Initial commit"
git remote add origin https://github.com/USERNAME/caffeine-tracker.git
git push -u origin main

# GitHub Pages in Settings aktivieren
```

### Webhosting
```bash
# Auf beliebigen Webserver hochladen
# Keine Backend-Anforderungen!
```

## 🔒 Datenschutz

✅ Alle Daten bleiben auf deinem Gerät  
✅ Keine Server-Kommunikation  
✅ Keine Cookies  
✅ Keine persönlichen Daten erforderlich  
✅ Kein Login notwendig  

## 🤝 Contributing

Beiträge sind willkommen! 

### Wie beitragen?
1. Fork das Repository
2. Feature-Branch erstellen (`git checkout -b feature/AmazingFeature`)
3. Änderungen committen (`git commit -m 'Add some AmazingFeature'`)
4. Branch pushen (`git push origin feature/AmazingFeature`)
5. Pull Request öffnen

### Gewünschte Beiträge
- ✨ Neue Getränke zur Datenbank
- 🐛 Bug-Fixes
- 🎨 UI-Verbesserungen
- 🌍 Übersetzungen
- ⚡ Performance-Optimierungen

## 📋 Roadmap

### Geplante Features
- [ ] Export als CSV/PDF
- [ ] Dark Mode
- [ ] PWA (Progressive Web App)
- [ ] Barcode-Scanner
- [ ] Mehrsprachigkeit
- [ ] Wochenberichte
- [ ] Kosten-Tracking
- [ ] Custom Drinks
- [ ] Sharing-Funktionen
- [ ] Reminder-Funktion

## 🐛 Bug Reports

Probleme gefunden? [Issue erstellen](https://github.com/USERNAME/REPO/issues)

## 📄 Lizenz

MIT License - Frei verwendbar für private und kommerzielle Zwecke

```
Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software...
```

## ⚠️ Disclaimer

Diese App dient nur zu Informationszwecken. Die Koffeindaten basieren auf Herstellerangaben und können variieren. Bei gesundheitlichen Bedenken konsultiere bitte einen Arzt. Die empfohlene Tagesdosis von **400mg Koffein** sollte nicht überschritten werden.

## 🙏 Credits

Entwickelt mit ❤️ und ☕

**Technologien:**
- Vanilla JavaScript
- CSS3 Grid & Flexbox
- HTML5 Storage API
- Placeholder.com für Produktbilder

**Inspiriert von:**
- Gesundheitsbewussten Energy Drink Fans
- Fitness-Tracker Apps
- Material Design

## 📞 Kontakt & Support

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/USERNAME/REPO/issues)
- 💡 **Feature Requests**: [GitHub Discussions](https://github.com/USERNAME/REPO/discussions)
- ⭐ **Star das Projekt** wenn es dir gefällt!

---

**Made with ⚡ by Cornelius**  
**Version 1.0** | **Februar 2026**
