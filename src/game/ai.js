/* ============================================================
   Intelligence artificielle des adversaires
   ============================================================ */
import { UNITS, BUILDINGS, AGES } from '../data/gamedata.js';
import { Building } from './entities.js';

const PROFILES = [
  { name:'Recrue',     workers:10, army:6,  think:1.6, econ:1.00, expand:1, aggro:0.55 },
  { name:'Vétéran',    workers:16, army:11, think:1.15, econ:1.12, expand:2, aggro:0.8 },
  { name:'Implacable', workers:22, army:16, think:0.85, econ:1.28, expand:3, aggro:1.0 },
];

export class AI{
  constructor(game, player, difficulty = 1){
    this.game = game;
    this.p = player;
    this.prof = PROFILES[Math.max(0, Math.min(2, difficulty))];
    this.t = Math.random()*1.2;
    this.attackTimer = 60 / this.prof.aggro;
    this.waveSize = this.prof.army;
    this.army = [];
    this.rallyPoint = null;
    this.lastBuild = 0;
    this.militaryUntil = 0;      // pendant cette fenêtre, aucune réserve : on produit
    this.reserveCache = { food:0, mat:0, energy:0 };
  }

  /* -------------------------------------------------- boucle */
  update(dt){
    const p = this.p;
    if(p.defeated) return;
    // léger bonus d'économie selon la difficulté (compense l'absence de micro-gestion)
    if(this.prof.econ > 1){
      const k = (this.prof.econ - 1) * dt * 1.6;
      p.res.food += k*3; p.res.mat += k*3.2; p.res.energy += k*1.4;
    }
    this.t -= dt;
    this.attackTimer -= dt;
    if(this.t > 0) return;
    this.t = this.prof.think;
    this.think();
  }

  think(){
    const p = this.p;
    this.cc = p.buildings.find(b=>b.def.key === 'command' && !b.dead && b.complete);
    this.threatNow = this.nearestThreat();
    this.reserveCache = this._reserve();
    this.assignWorkers();
    this.manageEconomy();
    this.manageBuild();
    this.manageArmy();
  }

  /* Budget mis de côté pour le prochain âge : tant que la réserve n'est pas
     constituée, seules l'économie et la défense peuvent puiser dans le trésor.
     Après chaque passage d'âge, une fenêtre militaire libère la réserve. */
  _reserve(){
    const zero = { food:0, mat:0, energy:0 };
    const p = this.p;
    if(p.age >= AGES.length-1) return zero;
    if(this.threatNow) return zero;
    if(this.game.time < this.militaryUntil) return zero;
    if(this.cc && this.cc.queue.some(q=>q.kind === 'age')) return zero;
    const workers = p.units.filter(u=>u.role === 'worker' && !u.dead).length;
    if(workers < Math.min(8, Math.round(this.prof.workers*0.5))) return zero;
    // on ne thésaurise pas tant qu'une garde minimale n'est pas levée
    const army = p.units.filter(u=>!u.dead && u.role !== 'worker').length;
    if(army < Math.max(2, Math.round(this.prof.army*0.25))) return zero;
    return p.ageCost();
  }

  /* peut-on dépenser sans entamer la réserve ? */
  canSpend(cost){
    const p = this.p, r = this.reserveCache;
    return p.res.food   - r.food   >= (cost.food||0)
        && p.res.mat    - r.mat    >= (cost.mat||0)
        && p.res.energy - r.energy >= (cost.energy||0);
  }

  /* -------------------------------------------------- ouvriers */
  assignWorkers(){
    const p = this.p, g = this.game;
    const workers = p.units.filter(u=>u.role === 'worker' && !u.dead);
    this.rebalance(workers);
    const idle = workers.filter(u=>u.state === 'idle');
    if(!idle.length) return;
    // priorité à la ressource la plus basse
    for(const w of idle){
      const need = this.neededResource();
      const n = g.findNode(w.x, w.z, need) || g.findNode(w.x, w.z, null);
      if(n) w.gatherFrom(n);
    }
  }

  _scores(){
    const r = this.p.res;
    const want = { food: 1.0, mat: 1.25, energy: this.p.age >= 2 ? 0.85 : 0.35 };
    const out = {};
    for(const k in want) out[k] = r[k] / (want[k] * 300 + 1);
    return out;
  }
  neededResource(){
    const s = this._scores();
    return Object.keys(s).reduce((a, b)=> s[b] < s[a] ? b : a);
  }
  abundantResource(){
    const s = this._scores();
    return Object.keys(s).reduce((a, b)=> s[b] > s[a] ? b : a);
  }

  /* redéploie quelques ouvriers d'une ressource excédentaire vers celle qui manque */
  rebalance(workers){
    this.rebalT = (this.rebalT || 0) - this.prof.think;
    if(this.rebalT > 0) return;
    this.rebalT = 13;
    const need = this.neededResource(), rich = this.abundantResource();
    if(need === rich) return;
    const movers = workers.filter(u=>u.task && u.task.node && u.task.node.res === rich).slice(0, 3);
    for(const w of movers){
      const n = this.game.findNode(w.x, w.z, need);
      if(n) w.gatherFrom(n);
    }
  }

  /* -------------------------------------------------- économie */
  manageEconomy(){
    const p = this.p;
    if(!this.cc) return;
    const workers = p.units.filter(u=>u.role === 'worker' && !u.dead).length;
    const queued = this.cc.queue.length;
    if(workers + queued < this.prof.workers && p.pop < p.popCap && queued < 3){
      this.cc.queueUnit('worker');
    }
    // passage d'âge dès que possible
    if(p.age < AGES.length-1 && workers >= 6 && !this.cc.queue.some(q=>q.kind === 'age')){
      if(p.canAfford(p.ageCost()) && !this.cc.queueAge()){
        // âge lancé : on relâche la réserve pour reconstituer une armée
        this.militaryUntil = this.game.time + 55 + Math.random()*35;
      }
    }
    // recherches
    const lab = p.buildings.find(b=>b.def.research && b.complete && !b.dead);
    if(lab && !lab.queue.length && p.age >= 3 && !this.reserveCache.food){
      const order = ['weapons','armor','logistics','reactor'];
      for(const k of order){
        if(p.upgrades[k] < 3){ if(!lab.queueResearch(k)) break; }
      }
    }
  }

  /* -------------------------------------------------- construction */
  wants(){
    const p = this.p;
    const count = (k)=>p.buildings.filter(b=>b.def.key === k && !b.dead).length;
    const list = [];
    // population
    if(p.popCap - p.pop < 6 && p.popCap < 190) list.push('house');
    if(count('farm') < 2 + this.prof.expand) list.push('farm');
    if(count('barracks') < 1) list.push('barracks');
    if(p.age >= 2 && count('generator') < 1 + this.prof.expand) list.push('generator');
    if(p.age >= 2 && count('lab') < 1) list.push('lab');
    if(count('barracks') < 1 + this.prof.expand) list.push('barracks');
    if(p.age >= 3 && count('factory') < 1) list.push('factory');
    if(p.age >= 1 && count('turret') < this.prof.expand) list.push('turret');
    if(p.age >= 4 && count('factory') < 2) list.push('factory');
    if(count('house') < 3 + p.age) list.push('house');
    return list;
  }

  manageBuild(){
    const p = this.p, g = this.game;
    if(!this.cc) return;
    const underway = p.buildings.filter(b=>!b.complete && !b.dead);
    if(underway.length >= 2) {
      // s'assurer que des ouvriers y travaillent
      for(const b of underway){
        const on = p.units.filter(u=>u.task && u.task.site === b).length;
        if(on < 2){
          const free = p.units.filter(u=>u.role === 'worker' && !u.dead && u.state !== 'build')
            .sort((a,c)=>Math.hypot(a.x-b.x,a.z-b.z) - Math.hypot(c.x-b.x,c.z-b.z))[0];
          if(free) free.buildAt(b);
        }
      }
      return;
    }
    const wanted = this.wants();
    for(const key of wanted){
      const def = BUILDINGS[key];
      if(p.age < def.minAge) continue;
      const cost = p.buildingCost(key);
      const essential = key === 'house' || key === 'farm';
      if(!(essential ? p.canAfford(cost) : this.canSpend(cost))) continue;
      const spot = this.findSpot(key);
      if(!spot) continue;
      p.pay(cost);
      const b = new Building(g, p, key, spot.x, spot.z, false);
      const crew = p.units.filter(u=>u.role === 'worker' && !u.dead)
        .sort((a,c)=>Math.hypot(a.x-b.x,a.z-b.z) - Math.hypot(c.x-b.x,c.z-b.z)).slice(0, 3);
      for(const w of crew) w.buildAt(b);
      break;
    }
  }

  findSpot(key){
    const g = this.game, p = this.p;
    const base = this.cc || p.buildings[0];
    if(!base) return null;
    const def = BUILDINGS[key];
    const isDefense = key === 'turret';
    for(let i=0;i<70;i++){
      let ang, dist;
      if(isDefense && this.threatDir !== undefined){
        ang = this.threatDir + (Math.random()-0.5)*1.1;
        dist = 13 + Math.random()*9;
      } else {
        ang = Math.random()*Math.PI*2;
        dist = 11 + Math.random()*22 + def.size;
      }
      const x = base.x + Math.cos(ang)*dist;
      const z = base.z + Math.sin(ang)*dist;
      if(g.canPlaceAt(key, x, z)) return {x, z};
    }
    return null;
  }

  /* -------------------------------------------------- armée */
  manageArmy(){
    const p = this.p, g = this.game;
    this.army = p.units.filter(u=>!u.dead && u.role !== 'worker');
    const threat = this.threatNow;

    // production militaire : uniquement avec le surplus au-delà de la réserve
    const prodBuildings =
      p.buildings.filter(b=>b.complete && !b.dead && b.def.produces && b.def.produces.some(k=>k !== 'worker'));
    for(const b of prodBuildings){
      if(b.queue.length >= 2) continue;
      const options = b.def.produces.filter(k=>{
        const d = UNITS[k]; if(!d) return false;
        if(d.role === 'worker') return false;
        if(p.age < d.minAge) return false;
        if(!!d.alien !== !!p.alien) return false;
        return true;
      });
      if(!options.length) continue;
      // mélange de rôles
      const roll = Math.random();
      let key = options[0];
      const heavy = options.find(k=>UNITS[k].role === 'heavy');
      const air = options.find(k=>UNITS[k].role === 'air');
      const ranged = options.find(k=>UNITS[k].role === 'ranged');
      const melee = options.find(k=>UNITS[k].role === 'melee');
      if(heavy && roll < 0.3) key = heavy;
      else if(air && roll < 0.45) key = air;
      else if(ranged && roll < 0.75) key = ranged;
      else key = melee || options[0];
      if(p.pop + UNITS[key].pop <= p.popCap && this.canSpend(p.unitCost(key))) b.queueUnit(key);
    }

    // défense : ennemi proche de la base ?
    if(threat){
      this.threatDir = Math.atan2(threat.z - (this.cc ? this.cc.z : 0), threat.x - (this.cc ? this.cc.x : 0));
      for(const u of this.army){
        if(u.state === 'idle' || (u.state === 'move' && !u.combatOrder)){
          u.attackEntity(threat);
        }
      }
      return;
    }

    // regroupement puis assaut
    const ready = this.army.filter(u=>u.state === 'idle');
    if(this.army.length >= this.waveSize && this.attackTimer <= 0){
      const target = this.pickTarget();
      if(target){
        for(const u of this.army){
          u.combatOrder = true;
          u.moveTo(target.x + (Math.random()-0.5)*10, target.z + (Math.random()-0.5)*10, {attackMove:true});
        }
        this.attackTimer = (70 + Math.random()*40) / this.prof.aggro;
        this.waveSize = Math.min(48, this.waveSize + 3);
      }
    } else {
      // point de ralliement devant la base
      if(this.cc && ready.length){
        for(const u of ready){
          if(Math.hypot(u.x - this.cc.x, u.z - this.cc.z) > 26){
            u.moveTo(this.cc.x + (Math.random()-0.5)*14, this.cc.z + (Math.random()-0.5)*14);
          }
        }
      }
    }
  }

  nearestThreat(){
    const p = this.p, g = this.game;
    let best = null, bestD = 46*46;
    const base = this.cc || p.buildings[0];
    if(!base) return null;
    for(const u of g.units){
      if(u.dead || !p.isEnemy(u.player)) continue;
      const d = (u.x-base.x)**2 + (u.z-base.z)**2;
      if(d < bestD){ bestD = d; best = u; }
    }
    return best;
  }

  pickTarget(){
    const p = this.p, g = this.game;
    const base = this.cc || p.buildings[0];
    if(!base) return null;
    let best = null, bestD = Infinity;
    for(const q of g.players){
      if(q === p || q.defeated) continue;
      if(q.id === 99 && Math.random() > 0.35) continue;   // priorité aux humains
      if(!p.isEnemy(q)) continue;
      for(const b of q.buildings){
        if(b.dead) continue;
        const w = b.def.key === 'command' ? 0.55 : 1;
        const d = ((b.x-base.x)**2 + (b.z-base.z)**2) * w;
        if(d < bestD){ bestD = d; best = b; }
      }
    }
    return best;
  }
}
