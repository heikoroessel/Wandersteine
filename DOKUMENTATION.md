# Wandersteine – App-Dokumentation
*Erstellt: März 2026 | Für zukünftige Entwicklungssessions*

---

## Konzept

**Wandersteine** ist eine Web-App für die Hochzeit von **Rieke & Leo (18.07.2026)**. Jeder Gast erhält einen nummerierten Stein mit QR-Code. Der QR-Code führt direkt auf die Steinseite. Finder des Steins können sich eintragen (Name, Foto, GPS-Standort, Nachricht) und den Stein weiterlegen. So entsteht eine Reisegeschichte pro Stein.

---

## Live-URLs

| Service | URL |
|---------|-----|
| **App (Frontend + Backend)** | `https://wandersteine-backend-production.up.railway.app` |
| **Admin-Login** | `https://wandersteine-backend-production.up.railway.app/admin` |
| **Steinseite** | `https://wandersteine-backend-production.up.railway.app/stein/[1-100]` |
| **API Health** | `https://wandersteine-backend-production.up.railway.app/api/health` |

> ⚠️ Frontend und Backend laufen jetzt auf **einem einzigen Service** auf Railway.
> Der separate Frontend-Service (`wandersteine-frontend-production.up.railway.app`) wurde abgeschaltet.

---

## Zugangsdaten

| Benutzer | Benutzername | Passwort | Rechte |
|---------|-------------|----------|--------|
| Heiko (Admin) | `admin` | `Xcbiker0815##w` | Alles inkl. Einträge löschen |
| Rieke & Leo | `rieke-leo` | `RiekeLeo` | Lesen: Karte + Liste |

---

## Architektur

**Ein einziger Railway-Service** liefert sowohl API als auch React-Frontend aus:
- Express serviert `/api/*` als API
- Express serviert `/uploads/*` für Fotos (Railway Volume)
- Express serviert `public/` als statische React-App
- Alle anderen Routen → `index.html` (SPA-Fallback)

Das Dockerfile baut in zwei Stages:
1. Node 20 baut das React-Frontend mit Vite → `dist/`
2. Node 20 kopiert Backend + `dist/` → läuft als ein Prozess

**Kosten:** ~$10/Monat (1 Service + PostgreSQL + Volume)

| Schicht | Technologie |
|---------|-------------|
| Hosting | Railway (PaaS) |
| Backend | Node.js / Express |
| Datenbank | PostgreSQL (Railway) |
| Foto-Speicher | Railway Volume (`/mnt/uploads`) |
| Frontend | React + Vite |
| Web-Server | nginx (im Docker-Container) |
| Karten | Leaflet + OpenStreetMap |
| Auth | JWT (jsonwebtoken + bcryptjs) |
| Foto-Verarbeitung | sharp (resize auf max 1200px) |

---

## Projektstruktur

```
wandersteine/
├── backend/
│   ├── server.js              # Express-Server, Port via ENV
│   ├── db.js                  # PostgreSQL-Verbindung + DB-Init (100 Steine)
│   ├── Dockerfile             # Node 20 Alpine
│   ├── package.json
│   ├── middleware/
│   │   └── auth.js            # JWT-Middleware (authenticate, requireAdmin)
│   └── routes/
│       ├── stones.js          # Haupt-API (Steine, Einträge, Fotos)
│       └── auth.js            # Login + einmaliger Setup-Endpoint
└── frontend/
    ├── index.html             # Google Fonts: Cormorant Garamond, Jost, Dancing Script
    ├── vite.config.js         # Proxy /api → localhost:3001 (nur lokal)
    ├── Dockerfile             # Multi-stage: Vite build → nginx
    ├── nginx.conf             # SPA-Routing: try_files → index.html
    └── src/
        ├── main.jsx           # React entry point
        ├── App.jsx            # Router: /, /stein/:number, /login, /admin
        ├── api.js             # axios mit hardcodierter Backend-URL + JWT-Header
        ├── i18n.js            # DE/EN automatisch via navigator.language
        ├── styles.css         # Design-System (CSS-Variablen)
        └── pages/
            ├── Home.jsx       # Reine Suchseite (Steinnummer eingeben)
            ├── Stone.jsx      # Steinseite: Erklärung, Karte, Historie, Formular
            ├── Login.jsx      # Admin-Login
            └── Admin.jsx      # Übersicht: Stats, Weltkarte, Steintabelle
```

---

## Datenbank-Schema

```sql
-- Steine (1-100, beim Start automatisch angelegt)
CREATE TABLE stones (
  id SERIAL PRIMARY KEY,
  number INTEGER UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'inactive',  -- 'inactive' | 'active'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Einträge (pro Scan eines Steins)
CREATE TABLE entries (
  id SERIAL PRIMARY KEY,
  stone_number INTEGER NOT NULL REFERENCES stones(number),
  name VARCHAR(255) NOT NULL,
  message TEXT,
  location_name VARCHAR(255),       -- manuell eingegebener Ort
  latitude DECIMAL(10, 8),          -- GPS
  longitude DECIMAL(11, 8),         -- GPS
  created_at TIMESTAMP DEFAULT NOW()
);

-- Fotos (mehrere pro Eintrag möglich)
CREATE TABLE entry_photos (
  id SERIAL PRIMARY KEY,
  entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,   -- Dateiname auf Railway Volume
  created_at TIMESTAMP DEFAULT NOW()
);

-- Benutzer (Admin + Viewer)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'viewer',  -- 'admin' | 'viewer'
  created_at TIMESTAMP DEFAULT NOW()
);
```

---

## API-Endpunkte

### Öffentlich (kein Login nötig)
| Method | Endpoint | Beschreibung |
|--------|----------|--------------|
| GET | `/api/health` | Health-Check → `{"status":"ok","timestamp":"..."}` |
| GET | `/api/stones/:number` | Stein + alle Einträge mit Fotos |
| POST | `/api/stones/:number/entries` | Neuen Eintrag anlegen (multipart/form-data) |

**POST /api/stones/:number/entries – Felder:**
- `name` (string, Pflicht)
- `message` (string, optional)
- `location_name` (string, optional)
- `latitude` / `longitude` (decimal, optional – aber eines von beiden Pflicht)
- `photos` (files, Pflicht, max 5, max 10MB each)

### Geschützt (JWT erforderlich)
| Method | Endpoint | Rechte | Beschreibung |
|--------|----------|--------|--------------|
| POST | `/api/auth/login` | – | Login → JWT Token |
| POST | `/api/auth/setup` | – | Einmalig: Admin + Viewer anlegen |
| GET | `/api/stones` | viewer + admin | Alle 100 Steine mit Stats |
| DELETE | `/api/stones/entries/:id` | admin only | Eintrag löschen |

---

## Umgebungsvariablen

### Backend (Railway)
```
DATABASE_URL=postgresql://...     # Automatisch von Railway gesetzt
JWT_SECRET=wandersteine-rieke-leo-2026-geheim
NODE_ENV=production
UPLOAD_PATH=/mnt/uploads          # Railway Volume Mount Path
FRONTEND_URL=https://wandersteine-frontend-production.up.railway.app
PORT=8080                         # Railway setzt PORT automatisch
```

### Frontend (Railway – werden beim Build eingebaut!)
```
VITE_API_URL=https://wandersteine-backend-production.up.railway.app/api
VITE_UPLOAD_URL=https://wandersteine-backend-production.up.railway.app
```

⚠️ **Wichtig:** VITE_* Variablen werden beim Build-Zeitpunkt eingebaut, nicht zur Laufzeit. Deshalb ist die Backend-URL in `api.js` und `Stone.jsx` **hardcoded**:
- `api.js`: `const API_BASE = 'https://wandersteine-backend-production.up.railway.app/api'`
- `Stone.jsx`: `const UPLOAD_BASE = 'https://wandersteine-backend-production.up.railway.app'`

---

## Design-System

### Farben (CSS-Variablen in styles.css)
```css
--sage: #6B7F5E          /* Hauptfarbe: Salbeigrün (wie Einladungskuvert) */
--sage-light: #8A9E7B
--sage-dark: #4A5940
--sage-muted: #E8EDE4    /* Heller Hintergrund */
--cream: #F7F5F0         /* Seiten-Hintergrund */
--cream-dark: #EDE9E1
--stone: #9B9086         /* Grau für Metadaten */
--ink: #2C2A27           /* Haupttextfarbe */
--ink-light: #5C5850
```

### Schriften (Google Fonts)
- `Cormorant Garamond` – Überschriften (elegant, serif)
- `Dancing Script` – Akzente (Handschrift, z.B. "Rieke & Leo")
- `Jost` – Fließtext (clean, modern)

---

## Wichtige Designentscheidungen

1. **Hardcoded Backend-URL** in `api.js` und `Stone.jsx` – weil Vite VITE_* Variablen beim Build einbaut und Railway die Variable erst zur Laufzeit setzt. Wenn die Backend-URL sich ändert, müssen diese beiden Dateien manuell angepasst werden.

2. **Leaflet dynamisch importiert** in `Stone.jsx` – wegen eines `S.length` Fehlers beim statischen Import. Leaflet wird via `Promise.all([import('leaflet'), import('react-leaflet'), import('leaflet/dist/leaflet.css')])` geladen.

3. **100 Steine vorab in DB angelegt** – beim Server-Start via `db.js` `initDB()`. Status startet als `inactive`, wird beim ersten Eintrag auf `active` gesetzt.

4. **Fotos auf Railway Volume** (`/mnt/uploads`) – werden mit sharp auf max 1200px resized, Original wird gelöscht. Filename: `resized-[timestamp]-[random].[ext]`

5. **Mehrsprachigkeit** via `navigator.language` – Deutsch wenn `de`, sonst Englisch. Texte in `i18n.js`.

---

## Bekannte Eigenheiten & Fixes

| Problem | Ursache | Fix |
|---------|---------|-----|
| `S.length` TypeError | Leaflet statisch importiert | Dynamischer Import in Stone.jsx |
| Steinseite leer (weiß) | API-URL zeigte auf Frontend | Backend-URL hardcoded in api.js |
| Port-Mismatch | Railway nutzt Port 8080, nicht 3001 | PORT=8080 in Railway Variables |
| Fotos als "?" | UPLOAD_BASE zeigte auf Frontend | UPLOAD_BASE hardcoded in Stone.jsx |

---

## Deployment-Workflow

**Änderungen deployen:**
1. Datei auf GitHub ändern (direkt im Browser oder Upload)
2. Railway erkennt den Commit automatisch
3. Neues Deployment startet (ca. 2-3 Min für Frontend, 1 Min für Backend)

**Backend-Änderungen:** Starten automatisch neu, DB-Schema wird via `initDB()` aktualisiert (nur additive Änderungen, keine Drops).

**Frontend-Änderungen:** Vite baut neu, nginx serviert die neue Version.

---

## Railway-Infrastruktur

```
Railway Projekt: "artistic-reflection" (oder ähnlich)
├── Wandersteine-backend    (GitHub: heikoroessel/Wandersteine-backend)
│   └── wandersteine-backend-volume  (Mount: /mnt/uploads)
├── Wandersteine--Frontend  (GitHub: heikoroessel/Wandersteine--Frontend)
└── Postgres                (mit postgres-volume)
```

**Kosten:** ~$15/Monat (Hobby Plan, 3 Services + Volume)

---

## QR-Codes

Die QR-Codes zeigen direkt auf die Steinseite:
```
https://wandersteine-frontend-production.up.railway.app/stein/1
https://wandersteine-frontend-production.up.railway.app/stein/2
...
https://wandersteine-frontend-production.up.railway.app/stein/100
```

⚠️ Die URL darf sich nie ändern – QR-Codes auf den Steinen sind permanent!

---

## Mögliche zukünftige Verbesserungen

- [ ] Eigene Domain (z.B. `wandersteine-rieke-leo.de`) für stabilere URL
- [ ] E-Mail-Benachrichtigung wenn neuer Eintrag (wurde bewusst weggelassen)
- [ ] Foto-Rotation wird clientseitig angezeigt aber nicht serverseitig gespeichert – könnte mit sharp beim Upload implementiert werden
- [ ] Admin-Seite: Einzelnen Stein zurücksetzen (status → inactive)
- [ ] Paginierung der Steintabelle im Admin bei vielen Einträgen
- [ ] Umzug zu Hetzner VPS wenn weitere Projekte dazukommen (~$4/Monat für alles)
