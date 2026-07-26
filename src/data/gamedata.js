/* ============================================================
   AEON — données de jeu : âges, races, unités, bâtiments, régions
   ============================================================ */

/* ------------------------------------------------------------------ ÂGES */
export const AGES = [
  {
    name:'Âge de Pierre', short:'Pierre', icon:'🪨',
    desc:"Feu, silex et survie. Les premiers clans arrachent leur pitance à la Terre.",
    tags:['Ouvriers','Gourdins','Huttes'],
    cost:null, time:0,
  },
  {
    name:'Âge Antique', short:'Antique', icon:'🏺',
    desc:"Bronze, phalanges et premières cités fortifiées. La guerre devient un métier.",
    tags:['Lanciers','Archers','Remparts'],
    cost:{food:400, mat:260, energy:0}, time:34,
  },
  {
    name:'Âge Médiéval', short:'Médiéval', icon:'⚔️',
    desc:"Acier trempé, cavalerie lourde et machines de siège. Les royaumes s'entredéchirent.",
    tags:['Chevaliers','Arbalètes','Trébuchets'],
    cost:{food:700, mat:520, energy:80}, time:42,
  },
  {
    name:'Âge Industriel', short:'Industriel', icon:'⚙️',
    desc:"Vapeur, charbon et poudre noire. Les usines crachent des armées entières.",
    tags:['Fusiliers','Canons','Générateurs'],
    cost:{food:1000, mat:820, energy:280}, time:52,
  },
  {
    name:'Âge Moderne', short:'Moderne', icon:'🚁',
    desc:"Blindés, aviation et logistique globale. Le champ de bataille devient tridimensionnel.",
    tags:['Chars','Hélicoptères','Radars'],
    cost:{food:1400, mat:1200, energy:620}, time:64,
  },
  {
    name:"Âge de l'Information", short:'Information', icon:'🛰️',
    desc:"Réseaux, drones autonomes et guerre électronique. L'information tue avant la balle.",
    tags:['Drones','Railguns','Cyber-fantassins'],
    cost:{food:1800, mat:1650, energy:1050}, time:76,
  },
  {
    name:'Âge Futuriste', short:'Futuriste', icon:'🌌',
    desc:"Singularité, exosquelettes et réacteurs à antimatière. L'humanité affronte les étoiles.",
    tags:['Méchas','Vaisseaux','Antimatière'],
    cost:{food:2400, mat:2250, energy:1700}, time:90,
  },
];

export const MAX_AGE = AGES.length - 1;

/* multiplicateurs de puissance appliqués à chaque âge */
export const AGE_POWER = [1.00, 1.35, 1.78, 2.30, 2.95, 3.75, 4.80];

/* ------------------------------------------------------------------ RACES */
export const FACTIONS = {
  coalition:{
    key:'coalition', name:'Coalition Terrienne', tag:'Humains — Équilibre', glyph:'🛡',
    color:0x3ba7ff, accent:0x9ce6ff, css:'#3ba7ff',
    desc:"Héritière des vieilles nations, la Coalition mise sur une économie robuste et une infanterie polyvalente capable de tenir n'importe quel terrain.",
    traits:['Récolte +15 %','Construction +15 %','Habitats +2 population'],
    mods:{ gather:1.15, build:1.15, hp:1.0, atk:1.0, speed:1.0, ageCost:1.0, bldCost:1.0, popBonus:2 },
  },
  boreal:{
    key:'boreal', name:'Clan Boréal', tag:'Humains — Guerre', glyph:'🪓',
    color:0x57e08a, accent:0xbcffd8, css:'#57e08a',
    desc:"Descendants des tribus du grand Nord. Ils forgent des guerriers taillés pour l'endurance et méprisent le confort des cités.",
    traits:['Points de vie +20 %','Unités militaires -10 % coût','Récolte -8 %'],
    mods:{ gather:0.92, build:1.0, hp:1.20, atk:1.05, speed:1.0, ageCost:1.0, bldCost:1.0, unitCost:0.90, popBonus:0 },
  },
  solaris:{
    key:'solaris', name:'Dominion Solaire', tag:'Humains — Technologie', glyph:'☀',
    color:0xffc857, accent:0xfff0c0, css:'#ffc857',
    desc:"Théocratie scientifique tournée vers l'énergie. Le Dominion traverse les âges plus vite que quiconque et frappe à distance.",
    traits:['Passage d\'âge -22 %','Énergie passive +50 %','Unités à distance +15 % dégâts'],
    mods:{ gather:1.0, build:1.0, hp:0.95, atk:1.0, rangedAtk:1.15, speed:1.0, ageCost:0.78, energyIncome:1.5, bldCost:1.0, popBonus:0 },
  },
  neon:{
    key:'neon', name:'Syndicat Néon', tag:'Humains — Vitesse', glyph:'⚡',
    color:0xff4d9d, accent:0xffb3dc, css:'#ff4d9d',
    desc:"Cartel urbain né des mégapoles. Le Syndicat frappe vite, bouge vite et bâtit pour trois fois rien.",
    traits:['Vitesse +18 %','Bâtiments -18 % coût','Formation des unités +20 % rapide'],
    mods:{ gather:1.0, build:1.2, hp:0.92, atk:1.0, speed:1.18, ageCost:1.0, bldCost:0.82, trainSpeed:1.2, popBonus:0 },
  },
  xenos:{
    key:'xenos', name:"Xénos Zaal'Ki", tag:'Extraterrestre — Biomasse', glyph:'👁',
    color:0x9d5cff, accent:0xd9b8ff, css:'#9d5cff', alien:true,
    desc:"Essaim bio-mécanique venu de l'amas d'Ophiuchus. Ses organismes régénèrent leurs tissus et prolifèrent sans relâche.",
    traits:['Régénération constante','Population +4 par nid','Coût en matériaux -12 %','Fragile au début'],
    mods:{ gather:1.0, build:1.0, hp:0.95, atk:1.05, speed:1.06, ageCost:1.0, bldCost:0.88, regen:1.6, popBonus:4 },
  },
};
export const FACTION_LIST = Object.values(FACTIONS);

/* ------------------------------------------------------------------ RÉGIONS TERRESTRES */
export const REGIONS = {
  europe:{
    key:'europe', name:'Plaines d\'Europe', sub:'48°N 9°E', lat:48, lon:9,
    desc:"Prairies tempérées, forêts denses et rivières lentes. Terrain équilibré, riche en bois.",
    palette:{ low:0x35502c, mid:0x4a6b34, high:0x6d7f4a, rock:0x6b6f74, water:0x1d3f63, sky:0x0a1424, fog:0x0d1c30, sun:0xfff2d0 },
    bias:{ mat:1.25, food:1.1, energy:0.8 }, roughness:0.85, water:0.16, trees:1.4,
  },
  sahara:{
    key:'sahara', name:'Erg du Sahara', sub:'23°N 12°E', lat:23, lon:12,
    desc:"Dunes brûlantes et plateaux rocheux. Peu de bois, mais des gisements d'énergie affleurants.",
    palette:{ low:0x9a7a45, mid:0xbe9a5c, high:0xd9bd82, rock:0x8a7351, water:0x2f6a7a, sky:0x1a1408, fog:0x2a2110, sun:0xffe0a0 },
    bias:{ mat:0.7, food:0.75, energy:1.6 }, roughness:0.7, water:0.03, trees:0.25,
  },
  amazonia:{
    key:'amazonia', name:'Bassin Amazonien', sub:'3°S 60°W', lat:-3, lon:-60,
    desc:"Canopée impénétrable et fleuves gonflés. Nourriture et bois à profusion, visibilité réduite.",
    palette:{ low:0x1d4426, mid:0x266b32, high:0x3a7c3f, rock:0x5c6455, water:0x14483f, sky:0x07160f, fog:0x0d2418, sun:0xdfffd0 },
    bias:{ mat:1.5, food:1.5, energy:0.6 }, roughness:0.95, water:0.2, trees:2.0,
  },
  arctic:{
    key:'arctic', name:'Toundra Arctique', sub:'71°N 24°E', lat:71, lon:24,
    desc:"Glace éternelle et vents polaires. Ressources rares mais lignes de vue dégagées.",
    palette:{ low:0xa9c2d6, mid:0xd3e5f2, high:0xffffff, rock:0x7d8fa0, water:0x123a55, sky:0x0b1826, fog:0x16283a, sun:0xdfefff },
    bias:{ mat:0.65, food:0.7, energy:1.15 }, roughness:0.6, water:0.12, trees:0.4,
  },
  himalaya:{
    key:'himalaya', name:'Hauts Plateaux Himalayens', sub:'29°N 84°E', lat:29, lon:84,
    desc:"Vallées encaissées et cols disputés. Le relief dicte chaque manœuvre.",
    palette:{ low:0x4a5340, mid:0x6a6a58, high:0xe6ecf2, rock:0x767b82, water:0x1c4a63, sky:0x081321, fog:0x152436, sun:0xffeecf },
    bias:{ mat:0.9, food:0.8, energy:1.35 }, roughness:1.6, water:0.06, trees:0.7,
  },
  pacific:{
    key:'pacific', name:'Archipel Pacifique', sub:'12°S 160°E', lat:-12, lon:160,
    desc:"Îles volcaniques cernées par l'océan. Espaces cloisonnés, affrontements en goulot.",
    palette:{ low:0x3f6b3a, mid:0x5b8a45, high:0x8a7d55, rock:0x4a4a4a, water:0x0f5a78, sky:0x061420, fog:0x0b2438, sun:0xfff0d8 },
    bias:{ mat:1.0, food:1.25, energy:1.0 }, roughness:1.35, water:0.38, trees:1.1,
  },
};
export const REGION_LIST = Object.values(REGIONS);

/* ------------------------------------------------------------------ RESSOURCES */
export const RES = {
  food:  { key:'food',   name:'Nourriture', css:'#ff8f57', icon:'🍖' },
  mat:   { key:'mat',    name:'Matériaux',  css:'#8fd6ff', icon:'⛏' },
  energy:{ key:'energy', name:'Énergie',    css:'#c48bff', icon:'⚡' },
};

/* ------------------------------------------------------------------ UNITÉS
   names[] : un nom par âge (0..6)
   role    : worker | melee | ranged | heavy | air | alien
*/
export const UNITS = {
  worker:{
    key:'worker', role:'worker', icon:'⛏', from:'command', minAge:0, pop:1,
    names:['Chasseur-cueilleur','Serf','Paysan','Ouvrier','Technicien','Ingénieur','Nano-Forgeron'],
    cost:{food:50, mat:0, energy:0}, time:11,
    hp:70, atk:5, range:1.4, rate:1.1, speed:5.4, armor:0, los:18,
    desc:"Récolte les ressources, érige et répare les structures. Le cœur de votre économie.",
  },
  melee:{
    key:'melee', role:'melee', icon:'⚔', from:'barracks', minAge:0, pop:1,
    names:['Porteur de gourdin','Lancier de bronze','Chevalier','Grenadier','Fantassin','Cyber-Fantassin','Exo-Chevalier'],
    cost:{food:70, mat:30, energy:0}, time:14,
    hp:150, atk:16, range:1.6, rate:1.0, speed:5.2, armor:2, los:20,
    desc:"Infanterie de contact. Solide, bon marché, redoutable en nombre.",
  },
  ranged:{
    key:'ranged', role:'ranged', icon:'🏹', from:'barracks', minAge:1, pop:1,
    names:['Frondeur','Archer','Arbalétrier','Mousquetaire','Tireur d\'élite','Opérateur Railgun','Lance-Plasma'],
    cost:{food:50, mat:55, energy:0}, time:16,
    hp:95, atk:19, range:9.5, rate:1.35, speed:4.9, armor:1, los:26,
    desc:"Tire à distance. Fragile au corps à corps, dévastateur derrière une ligne de front.",
  },
  heavy:{
    key:'heavy', role:'heavy', icon:'🚜', from:'factory', minAge:3, pop:3,
    names:['—','—','—','Canon à vapeur','Char lourd','Marcheur autonome','Méca de Siège'],
    cost:{food:80, mat:180, energy:120}, time:30,
    hp:520, atk:62, range:11.5, rate:2.2, speed:3.5, armor:8, los:26, splash:3.0, siege:2.2,
    desc:"Blindé d'assaut. Dégâts de zone considérables, redoutable contre les structures.",
  },
  air:{
    key:'air', role:'air', icon:'🛩', from:'factory', minAge:4, pop:2, flying:true,
    names:['—','—','—','—','Hélicoptère','Drone de frappe','Intercepteur Orbital'],
    cost:{food:60, mat:130, energy:180}, time:26,
    hp:230, atk:38, range:10.5, rate:1.1, speed:9.5, armor:3, los:34,
    desc:"Unité aérienne rapide. Ignore le relief et frappe les lignes arrière.",
  },
  /* ---- créatures xéno (IA hostile & race Zaal'Ki) ---- */
  xgrunt:{
    key:'xgrunt', role:'melee', alien:true, icon:'🦂', from:'barracks', minAge:0, pop:1,
    names:['Larve Zaal\'Ki','Rôdeur Zaal\'Ki','Rôdeur Zaal\'Ki','Écorcheur','Écorcheur','Chasseur Chitineux','Chasseur Chitineux'],
    cost:{food:65, mat:25, energy:10}, time:13,
    hp:165, atk:18, range:1.6, rate:0.95, speed:6.1, armor:2, los:22,
    desc:"Organisme de mêlée agressif, régénère ses tissus hors combat.",
  },
  xspitter:{
    key:'xspitter', role:'ranged', alien:true, icon:'🧪', from:'barracks', minAge:1, pop:1,
    names:['—','Cracheur d\'acide','Cracheur d\'acide','Corrosif','Corrosif','Vecteur Bio-Plasma','Vecteur Bio-Plasma'],
    cost:{food:55, mat:45, energy:35}, time:17,
    hp:105, atk:22, range:9.0, rate:1.4, speed:5.2, armor:1, los:26,
    desc:"Projette un acide qui ronge armures et bâtiments.",
  },
  xtitan:{
    key:'xtitan', role:'heavy', alien:true, icon:'🦖', from:'factory', minAge:3, pop:3,
    names:['—','—','—','Colosse Chitineux','Colosse Chitineux','Titan Zaal\'Ki','Titan Zaal\'Ki'],
    cost:{food:140, mat:150, energy:150}, time:32,
    hp:640, atk:70, range:2.4, rate:1.9, speed:4.2, armor:9, los:24, splash:3.4, siege:2.4,
    desc:"Masse de chitine et de muscles. Écrase tout ce qui se trouve devant lui.",
  },
};

/* liste des unités disponibles pour une race donnée */
export function unitsFor(factionKey){
  const f = FACTIONS[factionKey];
  if(f.alien) return ['worker','xgrunt','xspitter','xtitan','air'];
  return ['worker','melee','ranged','heavy','air'];
}

/* ------------------------------------------------------------------ BÂTIMENTS */
export const BUILDINGS = {
  command:{
    key:'command', icon:'🏛', minAge:0, size:7.0, hp:2200, armor:6, los:30, unique:false,
    names:['Foyer du clan','Palais antique','Donjon','Hôtel de ville','Quartier Général','Nexus de commandement','Nexus de Singularité'],
    cost:{food:0, mat:320, energy:0}, time:38, drop:true, pop:12,
    produces:['worker'], canAge:true,
    desc:"Cœur de votre empire : forme les ouvriers, stocke les ressources et permet le passage à l'âge suivant.",
  },
  house:{
    key:'house', icon:'🏠', minAge:0, size:3.6, hp:420, armor:2, los:14,
    names:['Hutte','Maison de pierre','Chaumière','Immeuble ouvrier','Résidence','Habitat modulaire','Arcologie'],
    cost:{food:0, mat:70, energy:0}, time:14, pop:10,
    desc:"Augmente votre limite de population de 10.",
  },
  farm:{
    key:'farm', icon:'🌾', minAge:0, size:4.4, hp:320, armor:0, los:12,
    names:['Cueillette','Champ','Ferme','Exploitation agricole','Complexe agricole','Ferme hydroponique','Bio-Synthétiseur'],
    cost:{food:0, mat:60, energy:0}, time:12, income:{food:0.55},
    desc:"Produit un flux constant de nourriture, sans ouvrier.",
  },
  barracks:{
    key:'barracks', icon:'⚔', minAge:0, size:5.0, hp:900, armor:4, los:18,
    names:['Cercle des guerriers','Caserne de bronze','Caserne','Arsenal','Base militaire','Centre de conscription','Forge Exo'],
    cost:{food:0, mat:150, energy:0}, time:20,
    produces:['melee','ranged','xgrunt','xspitter'],
    desc:"Forme l'infanterie : unités de mêlée et de tir.",
  },
  generator:{
    key:'generator', icon:'⚡', minAge:2, size:4.2, hp:620, armor:3, los:14,
    names:['—','—','Moulin','Machine à vapeur','Centrale','Réacteur à fusion','Puits à singularité'],
    cost:{food:0, mat:160, energy:0}, time:20, income:{energy:0.45},
    desc:"Génère de l'énergie en continu. Indispensable aux technologies avancées.",
  },
  turret:{
    key:'turret', icon:'🗼', minAge:1, size:3.2, hp:1000, armor:8, los:26,
    names:['—','Tour de guet','Tour de garde','Bastion','Tourelle automatisée','Tourelle railgun','Tourelle à plasma'],
    cost:{food:0, mat:140, energy:20}, time:22,
    attack:{atk:30, range:13.5, rate:1.25},
    desc:"Défense statique qui ouvre le feu automatiquement sur les intrus.",
  },
  lab:{
    key:'lab', icon:'🔬', minAge:2, size:4.6, hp:700, armor:3, los:18,
    names:['—','—','Atelier du sage','Institut','Laboratoire','Centre de recherche','Complexe quantique'],
    cost:{food:0, mat:180, energy:70}, time:24, research:true,
    desc:"Débloque les améliorations permanentes de votre armée et de votre économie.",
  },
  factory:{
    key:'factory', icon:'🏭', minAge:3, size:6.0, hp:1200, armor:5, los:20,
    names:['—','—','—','Manufacture','Usine blindée','Chaîne robotisée','Chantier Orbital'],
    cost:{food:0, mat:260, energy:120}, time:32,
    produces:['heavy','air','xtitan'],
    desc:"Assemble les unités lourdes et aériennes.",
  },
};

/* liste des bâtiments constructibles pour une race */
export function buildingsFor(){
  return ['house','farm','barracks','generator','turret','lab','factory','command'];
}

/* ------------------------------------------------------------------ RECHERCHES */
export const RESEARCH = {
  weapons:{ key:'weapons', icon:'🗡', name:'Armement', levels:3, minAge:2,
    cost:(l)=>({food:120*l, mat:150*l, energy:60*l}), time:(l)=>26+10*l,
    desc:'+15 % de dégâts pour toutes vos unités (cumulable 3 fois).' },
  armor:{ key:'armor', icon:'🛡', name:'Blindage', levels:3, minAge:2,
    cost:(l)=>({food:100*l, mat:180*l, energy:50*l}), time:(l)=>26+10*l,
    desc:'+18 % de points de vie et +2 armure (cumulable 3 fois).' },
  logistics:{ key:'logistics', icon:'📦', name:'Logistique', levels:3, minAge:2,
    cost:(l)=>({food:140*l, mat:120*l, energy:40*l}), time:(l)=>22+8*l,
    desc:'+20 % de vitesse de récolte et de transport (cumulable 3 fois).' },
  reactor:{ key:'reactor', icon:'☢', name:'Réacteurs', levels:3, minAge:3,
    cost:(l)=>({food:80*l, mat:160*l, energy:140*l}), time:(l)=>30+10*l,
    desc:'+25 % de production passive et +10 % de vitesse des unités.' },
};

/* ------------------------------------------------------------------ INVASION XÉNO */
export const ALIEN = {
  // seuils de menace : chaque palier déclenche une vague de plus en plus lourde
  firstWaveAt: 260,      // secondes avant la première pluie de météores (mode progressif)
  waveInterval: 175,     // intervalle entre vagues
  color: 0x9d5cff,
  accent: 0xff4dcd,
  names:['Éclaireur Zaal\'Ki','Essaim Zaal\'Ki','Ruche Zaal\'Ki','Vaisseau-Mère Zaal\'Ki'],
};

/* ------------------------------------------------------------------ UTILITAIRES */
export function unitName(key, age){
  const u = UNITS[key]; if(!u) return '???';
  const i = Math.min(age, u.names.length-1);
  let n = u.names[i];
  if(n === '—'){ // remonter au premier nom valide
    for(let k=i;k>=0;k--){ if(u.names[k] !== '—'){ n = u.names[k]; break; } }
  }
  return n;
}
export function buildingName(key, age){
  const b = BUILDINGS[key]; if(!b) return '???';
  const i = Math.min(age, b.names.length-1);
  let n = b.names[i];
  if(n === '—'){ for(let k=i;k>=0;k--){ if(b.names[k] !== '—'){ n = b.names[k]; break; } } }
  return n;
}
export function scaleCost(cost, mul){
  return { food:Math.round((cost.food||0)*mul), mat:Math.round((cost.mat||0)*mul), energy:Math.round((cost.energy||0)*mul) };
}
