# Diagnostic OBD-II

GaragePro lit une voiture par un adaptateur **ELM327** branché sur la prise OBD (sous le volant).
Page : fiche client → véhicule → **Diagnostic OBD**, ou ordre de réparation → **Diagnostic OBD**.
Droits : Admin, Responsable, Réception, Mécanicien.

## Ce qu'il faut

- Un adaptateur ELM327 **série** : USB, ou Bluetooth classique appairé dans Windows (il apparaît comme un port COM).
- **Chrome ou Edge** sur un ordinateur (Web Serial). Firefox, Safari et les téléphones ne le permettent pas.
- Une adresse **https** (site en ligne) ou **http://localhost:3000** (sur le PC du garage). Depuis un autre PC
  sur `http://DESKTOP-…:3000` le navigateur bloque l'accès au port : utilisez le site en ligne ou le PC du garage.
- Contact mis (moteur arrêté ou tournant).

Non pris en charge : adaptateurs **Wi-Fi** et **Bluetooth Low Energy** (BLE), données propres aux constructeurs
(ABS, airbag, boîte, programmation de clés…).

## Ce qui est lu

| Donnée | Source | Si la voiture ne la fournit pas |
| --- | --- | --- |
| Codes défauts mémorisés / en attente / permanents | modes 03, 07, 0A | « Aucun code » ou listé comme non fourni |
| Régime, température, charge, vitesse, tension… | mode 01 (seulement les PID annoncés par la voiture) | non lu, listé « non fourni » |
| VIN | mode 09 02 | « non fourni » |
| Kilométrage | PID A6 (voitures récentes seulement) | « relevez-le au compteur » |

GaragePro **n'efface jamais** les codes (le mode 04 n'est pas implémenté et est bloqué). Rien n'est estimé.

## Règles d'enregistrement

- **VIN différent** de celui de la fiche → relevé refusé (mauvaise voiture branchée).
- **Kilométrage inférieur** au dernier relevé → signalé, jamais appliqué.
- **Kilométrage supérieur** → appliqué à la fiche seulement si vous cochez la case ; écrit dans le journal.
- **Simulateur** (bouton « Démonstration ») → enregistré « SIMULÉ », ne modifie jamais la fiche ni les rappels.

## Dépannage

- « L'adaptateur répond mais pas la voiture » : contact mis ? adaptateur bien enfoncé ?
- « Aucun adaptateur ne répond » : mauvais port COM choisi, ou adaptateur Wi-Fi/BLE.
- Délai dépassé : débrancher / rebrancher l'adaptateur, fermer les autres logiciels qui utilisent le port.

## État des tests

Protocole (décodage des réponses, codes, VIN, kilométrage) et règles d'enregistrement testés automatiquement
avec des réponses enregistrées et le simulateur. **Pas encore essayé avec un vrai adaptateur sur une vraie voiture.**
