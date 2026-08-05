# Architecture

```text
Navigateur React
  ├── REST /api/* ──> Express ──> statistiques ──> SQLite locale
  └── SSE /api/events <───────── collecte Linky et Sonoff
                                      ├── Conso API (HTTPS)
                                      ├── eWeLink (HTTPS/WebSocket)
                                      └── Sonoff LAN (mDNS/HTTP chiffré)
```

`server/index.js` expose l'API, le flux SSE et le build statique. `server/db.js` possède le schéma
SQLite et les migrations additives. `server/stats.js` contient les agrégations. `server/linky.js`
gère la synchronisation et le rattrapage. `server/sonoff/` sépare cloud, découverte LAN et
cryptographie. `web/src/` contient l'interface React et les pages métier.

## Invariants

- les données maison Linky et les mesures des prises sont comparées, jamais additionnées ;
- les données `source='demo'` restent séparées des données réelles ;
- les clés Sonoff, jetons, PRM et données SQLite ne quittent pas le stockage local ;
- les réponses API ne renvoient ni `conso_token`, ni `apikey`, ni `devicekey` ;
- une seule instance de collecte eWeLink doit fonctionner ;
- les migrations existantes restent additives et compatibles avec une base déjà remplie.

L'interface n'a pas d'authentification et suppose un réseau local de confiance. Une exposition à
Internet exige une couche d'authentification, TLS, contrôle d'accès et revue de menace séparée.
