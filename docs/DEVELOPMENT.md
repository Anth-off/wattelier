# Développement

Utilisez Node.js 22 et `npm ci`. `npm run dev` démarre Express et Vite. Avant chaque PR, lancez
`npm run check` puis `npm run audit`.

Le projet reste en JavaScript ES modules. ESLint couvre tout le code ; TypeScript vérifie en mode
strict les nouveaux modules de frontière HTTP, avec une extension progressive au code historique.
Prettier est l'unique référence de formatage.

Les tests utilisent `node:test`. Toute correction doit reproduire la régression avant de la
corriger. Les calculs doivent couvrir unités, fuseau local, données manquantes et bornes de dates.
La couverture minimale des modules testés est de 90 % pour les lignes et fonctions, 85 % pour les
branches.

Les commits et titres de PR suivent Conventional Commits. Le sujet commence par une minuscule :
`feat(stats): ajoute une projection`, `fix(linky): gère une période vide`.

Ne lancez jamais les tests avec une base personnelle. N'ajoutez pas de dépendance sans besoin
précis, et vérifiez sa licence ainsi que `npm audit`.
