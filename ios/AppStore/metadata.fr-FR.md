# Métadonnées App Store — français (France)

## Nom

Wattelier

## Sous-titre

Votre énergie, enfin claire

## Texte promotionnel

Suivez votre consommation, vos coûts et vos prises connectées depuis votre serveur Wattelier, à la maison comme à distance.

## Description

Wattelier transforme les mesures de votre serveur énergétique auto-hébergé en informations claires et utiles sur iPhone et iPad.

Consultez la consommation quotidienne de votre logement, suivez en direct la puissance de vos prises et explorez votre historique. Wattelier distingue toujours les données de la maison de celles des prises : elles sont comparées, jamais additionnées.

Gardez un œil sur votre budget grâce aux estimations de coût, à l’échéancier et à la projection de facturation. Pilotez aussi les prises compatibles directement depuis l’application.

Fonctionnalités principales :

• vue d’ensemble de la consommation et des coûts ;
• puissance en temps réel des prises connectées ;
• historique sur 7, 30 ou 90 jours ;
• ajout de relevés manuels ;
• commande marche/arrêt des appareils compatibles ;
• projection de facturation et suivi des échéances ;
• widgets de plusieurs tailles ;
• thèmes clair, sombre ou automatique ;
• interface native adaptée à l’iPhone et à l’iPad ;
• mode de démonstration accessible sans serveur.

Vos mesures restent sous votre contrôle. Wattelier ne crée aucun compte central, n’affiche aucune publicité et n’intègre aucun outil de suivi tiers. La connexion s’effectue directement en HTTPS avec le jeton généré par votre propre serveur.

Pour afficher vos données, l’application nécessite un serveur Wattelier auto-hébergé. L’accès à distance nécessite une adresse HTTPS joignable, par exemple au moyen d’un réseau privé Tailscale correctement configuré.

Wattelier ne remplace ni un dispositif de sécurité électrique ni la facture de votre fournisseur d’énergie.

## Mots-clés

énergie,électricité,consommation,linky,prises,domotique,facture,puissance,autohébergé

## URL d’assistance

https://github.com/Anth-off/wattelier/issues

## URL marketing

https://github.com/Anth-off/wattelier

## URL de confidentialité

https://github.com/Anth-off/wattelier/blob/main/PRIVACY.md

## Copyright

2026 Anth-off

## Couverture géographique

Sans objet. Wattelier ne fournit pas d’itinéraires point à point et n’est pas une app de routage.
Ne pas joindre de fichier GeoJSON.

## Build

Version 1.0.0 — build 6

## Notes pour App Review

Aucun compte Wattelier n’est requis. Sur l’écran de connexion, choisissez « Découvrir avec des données de démonstration » afin d’accéder immédiatement aux vues de l’application sans serveur externe ni identifiants.

Le mode réel se connecte au serveur auto-hébergé de l’utilisateur au moyen d’un jeton `wtl1_…` contenant une URL HTTPS et un secret d’accès. Ce jeton n’est pas requis pour la revue grâce au mode de démonstration.

La consommation « Maison » et la consommation « Prises » sont volontairement présentées comme deux séries distinctes : les prises sont un sous-ensemble de la maison et ne sont jamais additionnées à la mesure globale.

## Plan des captures

1. Aujourd’hui — « Votre consommation en un coup d’œil »
2. Temps réel — « La puissance de vos prises, en direct »
3. Historique — « Maison et prises, clairement distinguées »
4. Appareils — « Pilotez vos prises compatibles »
5. Facturation — « Anticipez votre budget énergie »

Les captures sont générées depuis le mode de démonstration, sans données personnelles, par le
workflow GitHub Actions `iOS · Captures App Store`. Les JPG produits sont RVB, sans canal alpha.
La série iPhone cible le compartiment 6,5 pouces demandé par App Store Connect (`1284 × 2778`).
