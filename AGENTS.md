# Instructions pour les agents

## Architecture et invariants

Le backend Express et SQLite se trouve dans `server/`, le frontend React/Vite dans `web/`, et les
tests dans `test/`. Lire `docs/ARCHITECTURE.md` avant toute modification métier. Ne jamais
additionner la consommation Linky de la maison avec celle des prises. Préserver la séparation des
sources réelles, manuelles et de démonstration, ainsi que les migrations SQLite additives.

## Validation obligatoire

Exécuter `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` et
`npm run audit`. Ajouter un test de régression pour chaque correction. Ne pas utiliser la base
personnelle pour les tests.

## Conventions

Utiliser JavaScript ES modules, Prettier, des erreurs utilisateur en français et Conventional
Commits. Garder les frontières HTTP petites et testables. Éviter les dépendances et migrations
inutiles.

## Fichiers sensibles et autorisations

`.env`, `data/`, `*.db`, journaux, archives, jetons Linky, PRM, identifiants eWeLink et clés Sonoff
ne doivent jamais être lus à voix haute, journalisés, commités ou copiés dans des tests. Ne jamais
exposer `conso_token`, `apikey` ou `devicekey` via l'API.

Une autorisation explicite est obligatoire avant de rendre le dépôt public, réécrire l'historique,
ajouter un collaborateur, fusionner une PR, créer une release, publier ou déployer. Toute
modification après le commit initial passe par une branche et une PR.
