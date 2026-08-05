# Sécurité

## Signaler une vulnérabilité

Utilisez exclusivement le
[signalement privé GitHub](https://github.com/N0thyTVOff/suivi-elec/security/advisories/new). Ne
publiez aucune faille, clé ou donnée personnelle dans une issue. Indiquez la version, l'impact, une
reproduction minimale anonymisée et une piste de correction. Un accusé de réception est visé sous
sept jours, sans garantie de délai de correction.

Seule la dernière version publiée est prise en charge.

## Modèle de sécurité

Suivi Élec est une application locale sans comptes utilisateurs. Elle doit rester sur un réseau
de confiance derrière un pare-feu et ne doit pas être publiée directement sur Internet. La base
`data/elec.db` et `.env` sont sensibles : ils peuvent contenir identifiants eWeLink, jeton et PRM
Linky, clés Sonoff, habitudes de consommation et noms d'appareils.

Utilisez si possible un compte eWeLink dédié, protégez les sauvegardes, limitez les permissions du
compte système et renouvelez tout secret suspecté compromis. Les réponses API masquent les clés et
le jeton, mais toute personne ayant accès à la machine peut lire les fichiers locaux.
