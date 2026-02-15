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

## 🛠️ Technologie-Stack

- **Frontend:** React 18 + Vite
- **Styling:** Tailwind CSS
- **Backend:** Firebase (Auth & Firestore)
- **Icons:** Lucide React

## 🚀 Installation

1. **Repository klonen und Dependencies installieren:**
   ```bash
   npm install
   ```

2. **Firebase-Projekt einrichten:**
   - Erstelle ein neues Projekt auf [Firebase Console](https://console.firebase.google.com/)
   - Aktiviere "Anonymous Authentication"
   - Erstelle eine Firestore-Datenbank
   - Kopiere deine Firebase-Konfiguration

3. **Umgebungsvariablen konfigurieren:**
   ```bash
   cp .env.example .env.local
   ```
   Fülle dann die Werte in `.env.local` aus:
   ```
   VITE_FIREBASE_API_KEY=dein_api_key
   VITE_FIREBASE_AUTH_DOMAIN=dein_projekt.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=dein_projekt_id
   VITE_FIREBASE_STORAGE_BUCKET=dein_projekt.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=deine_sender_id
   VITE_FIREBASE_APP_ID=deine_app_id
   ```

4. **Firestore-Regeln einrichten:**
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /artifacts/{appId}/users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

5. **Entwicklungsserver starten:**
   ```bash
   npm run dev
   ```

## 📁 Projektstruktur

```
src/
├── components/
│   ├── Header.jsx         # App-Header mit Datum
│   ├── ProgressBar.jsx    # Fortschrittsbalken & Status
│   ├── PresetDrinks.jsx   # Schnell-Buttons für Getränke
│   ├── ManualCalculator.jsx # Manueller Koffein-Rechner
│   └── DrinkHistory.jsx   # Verlaufsliste
├── services/
│   └── caffeineService.js # Firebase Firestore-Operationen
├── utils/
│   └── caffeineUtils.js   # Hilfsfunktionen & Konstanten
├── firebase.js            # Firebase-Konfiguration
├── App.jsx                # Haupt-App-Komponente
├── main.jsx               # Entry Point
└── index.css              # Globale Styles
```

## 🚦 Koffein-Grenzwerte

- **Grün (0-74%):** Sicherer Bereich
- **Orange (75-99%):** Nähert sich dem Limit
- **Rot (100%+):** Tageslimit überschritten

Das empfohlene Tageslimit beträgt **400 mg Koffein** für gesunde Erwachsene.

## 🥤 Verfügbare Presets

| Getränk | Größe | Koffein |
|---------|-------|---------|
| Red Bull | 250 ml | 80 mg |
| Monster Energy | 500 ml | 160 mg |
| Kaffee | 200 ml | 80 mg |
| Espresso | 30 ml | 63 mg |
| Rockstar | 500 ml | 160 mg |
| Club Mate | 500 ml | 100 mg |

## 📜 Scripts

- `npm run dev` - Startet den Entwicklungsserver
- `npm run build` - Erstellt einen Production Build
- `npm run preview` - Vorschau des Production Builds

## ⚠️ Disclaimer

Diese App dient nur zu Informationszwecken. Die Koffeindaten basieren auf Herstellerangaben und können variieren. Bei gesundheitlichen Bedenken konsultiere bitte einen Arzt.

## 📄 Lizenz

MIT License

---

**Made with ⚡ by Cornelius**  
**Version 1.0** | **Februar 2026**
