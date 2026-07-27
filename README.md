<div align="center">

# ⚡ AEON — Terre en Guerre

**Un jeu de stratégie en temps réel 3D qui tient dans un navigateur.**
De la pierre taillée aux réacteurs à singularité — sept âges, cinq races, une planète.

[![Statut](https://img.shields.io/badge/statut-jouable-2ee6a8?style=flat-square)](#)
[![Moteur](https://img.shields.io/badge/moteur-Three.js%20r160-38e1ff?style=flat-square)](https://threejs.org)
[![Build](https://img.shields.io/badge/build-aucun-7b5cff?style=flat-square)](#-installation)
[![Licence](https://img.shields.io/badge/licence-Apache%202.0-ffc857?style=flat-square)](LICENSE)

</div>

---

## 🌍 Le pitch

La Terre est le champ de bataille. Quatre puissances humaines se disputent les
derniers territoires viables pendant que, dans le ciel, quelque chose descend.

Vous démarrez avec cinq ouvriers et une hutte. Vous finissez, si vous survivez,
avec des méchas de siège et des tourelles à plasma — pendant que l'**Essaim
Zaal'Ki** tombe du ciel et attaque *tout le monde*, vous comme vos adversaires.

**Aucun asset externe.** Terrain, unités, bâtiments, musique, bruitages, globe
terrestre : tout est généré par le code, à l'exécution.

---

## ✨ Ce qu'il y a dedans

| | |
|---|---|
| 🏛 **7 âges** | Pierre → Antique → Médiéval → Industriel → Moderne → Information → **Futuriste**. Chaque passage transforme l'allure *et* les statistiques de vos unités et bâtiments. |
| 🧬 **5 races** | Coalition Terrienne, Clan Boréal, Dominion Solaire, Syndicat Néon et les extraterrestres **Zaal'Ki** — jouables, avec bonus, malus et architecture propres. |
| 🌐 **Globe 3D** | Choisissez votre théâtre d'opérations en cliquant directement sur une Terre en 3D, dessinée à partir de contours continentaux réels. |
| 🗺 **6 régions** | Europe, Sahara, Amazonie, Arctique, Himalaya, Pacifique — relief, palette, ressources et densité de végétation générés pour chacune. |
| 👽 **Invasion alien** | Météores, essaims et ruches qui prolifèrent. Une troisième force hostile à toutes les factions, avec une jauge de menace qui monte. |
| 🎖 **RTS complet** | Récolte, construction, files de production, population, 4 arbres de recherche, groupes de contrôle, minimap, formations, brouillard atmosphérique. |
| 🤖 **IA à 3 niveaux** | Elle gère son économie, rééquilibre ses ouvriers, met de côté pour passer les âges, fortifie et lance des vagues d'assaut. |
| 🔊 **Audio procédural** | Nappe musicale générée en WebAudio dont la tension monte avec l'invasion — aucun fichier son. |

---

## 🚀 Installation

Aucune dépendance, aucun bundler, aucune étape de build. Les modules ES et
Three.js sont servis tels quels.

```bash
git clone https://github.com/peterdu1109/STRWEB.git
cd STRWEB

# n'importe quel serveur statique fait l'affaire
npx serve .          # puis http://localhost:3000
# ou
python3 -m http.server 8080
```

> ⚠️ Ouvrir `index.html` par double-clic ne fonctionne pas : les modules ES
> exigent le protocole `http://`. Un serveur statique local suffit.

**Configuration requise** — un navigateur avec WebGL2 (Chrome, Edge, Firefox,
Safari 15+). Aucune installation côté serveur.

---

## 🎮 Commandes

| Action | Touche |
|---|---|
| Sélectionner / valider | **Clic gauche** |
| Sélection rectangulaire | **Glisser** |
| Déplacer · Attaquer · Récolter · Construire · **Réparer** | **Clic droit** (contextuel) |
| Sélectionner tout le même type | **Double-clic** |
| Déplacer la caméra | **Z Q S D** / flèches / bords de l'écran |
| Pivoter · Zoomer | **A / E** · **molette** · **clic milieu** |
| Créer / rappeler un groupe | **Ctrl+1…9** / **1…9** |
| Centre de commandement · Ouvrier inactif | **H** · **O** |
| Construire (ouvrier sélectionné) | **B** habitat · **F** ferme · **C** caserne · **G** générateur · **T** tourelle · **L** labo · **U** usine · **N** nexus |
| Stop · Dernière alerte · Pause | **X** · **Espace** · **P** |

---

## 🧠 Boucle de jeu

1. **Récoltez** nourriture 🍖, matériaux ⛏ et énergie ⚡ avec vos ouvriers.
2. **Bâtissez** des habitats pour repousser la limite de population.
3. **Passez les âges** depuis le centre de commandement : chaque âge débloque de
   nouveaux bâtiments, de nouvelles unités et multiplie votre puissance.
4. **Recherchez** armement, blindage, logistique et réacteurs au laboratoire.
   Un clic droit d'ouvrier sur une structure amie abîmée la **répare**.
5. **Détruisez** tous les centres de commandement adverses… en survivant aux
   vagues xéno qui ne font de cadeau à personne.

---

## 🏗 Architecture

```
index.html              page unique + import map
version.json            version courante (réécrite à chaque release)
vendor/three.module.js  Three.js r160 embarqué (fonctionne hors-ligne)
src/
├── main.js             assemblage, boucle de rendu, calque 2D
├── updater.js          détection de release et rechargement automatique
├── data/               âges, races, unités, bâtiments, régions, carte du monde
├── engine/             rendu WebGL, caméra RTS, entrées, audio procédural
├── world/              terrain procédural, grille de navigation + A*
├── models/             fabrique de modèles 3D, effets et projectiles
├── game/               entités, orchestrateur, IA, directeur d'invasion
└── ui/                 menu, globe interactif, HUD, minimap
```

**Points techniques**

- Terrain : bruit de valeur multi-octaves, colorisation par pente et altitude,
  aplanissement local à la pose des bâtiments.
- Navigation : grille 120×120, A* avec tas binaire, lissage de chemin par
  visibilité, plus une séparation locale entre unités.
- Rendu : géométries et matériaux mutualisés par cache, animations
  procédurales (marche, tourelles, rotors, pattes d'insecte).
- Simulation : pas de temps fixe borné, hachage spatial pour les requêtes de
  voisinage, acquisition de cibles échelonnée.

---

## 🔄 Mises à jour automatiques

Le jeu se met à jour **tout seul**, sans intervention.

```
push sur main ─▶ GitHub Actions ─▶ version.json réécrit
                                 ├─▶ déploiement GitHub Pages
                                 └─▶ Release taguée + archive .zip
```

Côté client, `src/updater.js` interroge `version.json` toutes les 90 secondes
(et au retour d'onglet). Dès qu'une nouvelle version est publiée :

- **au menu** → rechargement immédiat sur la nouvelle version ;
- **en pleine partie** → une notification s'affiche, et la mise à jour
  s'applique au retour au menu. Votre partie n'est jamais interrompue.

Le rechargement force le contournement du cache navigateur.

---

## 🗺 Suite possible

- Multijoueur en réseau et parties classées
- Brouillard de guerre et exploration
- Éditeur de cartes et campagne scénarisée
- Héros, capacités actives et améliorations par race

---

<div align="center">

**Bon jeu.** 🌍⚔️

<sub>Généré par du code, jusqu'au dernier pixel.</sub>

</div>
