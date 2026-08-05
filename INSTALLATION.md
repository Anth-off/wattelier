# Installation

## Prérequis

- Node.js 22 et npm 10 ou ultérieur ;
- une machine qui reste allumée pour une collecte continue ;
- facultatif : un compte eWeLink et/ou un accès Conso API autorisé pour votre Linky.

## Installation standard

```bash
npm ci
copy .env.example .env   # Windows ; utilisez cp sous macOS/Linux
npm run build
npm start
```

L'application écoute sur le port `3017`. Pour y accéder depuis un téléphone, utilisez une adresse
locale affichée dans Réglages et gardez l'appareil sur le même réseau. N'exposez pas ce port sur
Internet : l'application est conçue pour un réseau local de confiance et ne possède pas
d'authentification utilisateur.

## Sonoff/eWeLink

Renseignez `EWELINK_EMAIL`, `EWELINK_PASSWORD` et éventuellement `EWELINK_REGION` dans `.env`.
Les prises compatibles sont découvertes après redémarrage. Le premier accès cloud récupère des
clés stockées dans `data/elec.db`, puis la collecte LAN peut continuer localement.

## Linky

Activez la collecte horaire dans votre espace Enedis, obtenez un consentement et un jeton auprès
de Conso API, puis saisissez le jeton et le PRM dans Réglages. Ces informations restent dans la
base locale. Elles ne doivent jamais être jointes à une issue ou copiées dans Git.

## Démarrage automatique sous Windows

Exécutez `install-startup.ps1` pour créer une tâche planifiée à l'ouverture de session. Le script
`uninstall-startup.ps1` la supprime. Vérifiez d'abord qu'une seule instance fonctionne ; deux
connexions simultanées peuvent perturber eWeLink. Les journaux se trouvent dans `data/`.

## Mise à jour

Arrêtez le serveur, sauvegardez `data/` hors du dépôt, puis exécutez :

```bash
git pull --ff-only
npm ci
npm run build
npm start
```
