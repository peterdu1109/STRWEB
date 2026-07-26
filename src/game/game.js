/* ============================================================
   Orchestrateur de partie : monde, joueurs, sélection, ordres
   ============================================================ */
import * as THREE from 'three';
import { Terrain, WORLD, HALF, mulberry32 } from '../world/terrain.js';
import { NavGrid } from '../world/grid.js';
import { FX } from '../models/effects.js';
import { Player, Unit, Building, ResNode } from './entities.js';
import { makeBuilding, makeGhost } from '../models/factory.js';
import {
  AGES, UNITS, BUILDINGS, RESEARCH, FACTIONS, REGIONS, RES,
  unitsFor, buildingsFor, unitName, buildingName,
} from '../data/gamedata.js';
import { AI } from './ai.js';
import { AlienDirector } from './aliens.js';

const HASH_CELL = 9;

export class Game{
  constructor(engine, audio){
    this.engine = engine;
    this.scene = engine.scene;
    this.audio = audio;
    this.RESEARCH = RESEARCH;

    this.units = [];
    this.buildings = [];
    this.nodes = [];
    this.players = [];
    this.selected = [];
    this.groups = {};
    this.running = false;
    this.paused = false;
    this.speed = 1;
    this.time = 0;
    this.hash = new Map();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.placement = null;
    this.hover = null;
    this.events = {};
    this.acc = 0;
  }

  on(name, fn){ this.events[name] = fn; return this; }
  emit(name, ...a){ const f = this.events[name]; if(f) f(...a); }

  /* ============================================================ mise en place */
  start(cfg){
    this.dispose();
    this.cfg = cfg;
    this.seed = cfg.seed || (Math.random()*1e9)|0;
    const rnd = mulberry32(this.seed);
    this.rnd = rnd;
    this.region = REGIONS[cfg.region] || REGIONS.europe;

    this.terrain = new Terrain(this.region, this.seed);
    this.terrain.addTo(this.scene);
    this.grid = new NavGrid(this.terrain);
    this.fx = new FX(this.scene);
    this.engine.setRegionMood(this.region.palette);

    // --- joueurs ---
    const colors = [0x3ba7ff, 0xff5a4d, 0x57e08a, 0xffc857, 0xff4d9d];
    const humanColor = FACTIONS[cfg.faction].color;
    this.human = new Player(this, 0, cfg.faction, humanColor, false, 'Vous', cfg.startAge);
    this.players.push(this.human);

    const pool = Object.keys(FACTIONS).filter(k=>k !== cfg.faction);
    for(let i=0;i<cfg.opponents;i++){
      const fk = pool[(rnd()*pool.length)|0];
      let col = colors[(i+1) % colors.length];
      if(col === humanColor) col = colors[(i+3) % colors.length];
      const p = new Player(this, i+1, fk, col, true, `${FACTIONS[fk].name}`, cfg.startAge);
      p.ai = new AI(this, p, cfg.difficulty);
      this.players.push(p);
    }

    // --- faction xéno hostile ---
    this.alienPlayer = new Player(this, 99, 'xenos', 0xb14dff, true, "Essaim Zaal'Ki", Math.max(1, cfg.startAge));
    this.alienPlayer.hostileToAll = true;
    this.alienPlayer.popCap = 999;
    this.players.push(this.alienPlayer);
    this.aliens = new AlienDirector(this, cfg.aliens);

    // --- bases ---
    const sites = this.terrain.startSites.slice();
    const order = [0, 2, 1, 3];
    const active = this.players.filter(p=>p.id !== 99);
    active.forEach((p, i)=>{
      const s = sites[order[i % 4]];
      p.startSite = s;
      this._createBase(p, s.x, s.z);
    });

    this._scatterResources(rnd);

    // --- les ouvriers se mettent au travail immédiatement ---
    for(const p of this.players){
      if(p.id === 99) continue;
      const order = ['mat','food','mat','energy','mat'];
      p.units.filter(u=>u.role === 'worker').forEach((u, i)=>{
        const n = this.findNode(u.x, u.z, order[i % order.length]) || this.findNode(u.x, u.z, null);
        if(n) u.gatherFrom(n);
      });
    }

    // --- caméra sur la base du joueur ---
    const s0 = this.human.startSite;
    this.engine.lookAt(s0.x, s0.z);
    this.engine.dist = 58;
    this.engine.yaw = Math.atan2(-s0.x, -s0.z);

    this.time = 0;
    this.running = true;
    this.paused = false;
    this.ended = false;
    this.selected = [];
    this.groups = {};
    for(const p of this.players) p.recomputePop();
    this.emit('ready');
  }

  _createBase(p, x, z){
    const cc = new Building(this, p, 'command', x, z, true);
    cc.rally = null;
    const nWorkers = 5;
    for(let i=0;i<nWorkers;i++){
      const a = i/nWorkers * Math.PI*2;
      const spot = this.freeSpotAround(x + Math.cos(a)*7, z + Math.sin(a)*7, 2);
      new Unit(this, p, 'worker', spot.x, spot.z);
    }
    // maison de départ pour la population
    const hx = x + 9, hz = z + 9;
    if(this.terrain.isBuildable(hx, hz)) new Building(this, p, 'house', hx, hz, true);
    else new Building(this, p, 'house', x - 9, z - 9, true);
    p.recomputePop();
  }

  /* --- répartition des gisements --- */
  _scatterResources(rnd){
    const bias = this.region.bias;
    const region = this.region;
    const place = (res, x, z, amount)=>{
      if(Math.abs(x) > HALF-6 || Math.abs(z) > HALF-6) return false;
      if(!this.terrain.isLand(x, z) || this.terrain.slopeAt(x, z) > 0.6) return false;
      for(const n of this.nodes) if(Math.hypot(n.x-x, n.z-z) < 3.4) return false;
      for(const b of this.buildings) if(Math.hypot(b.x-x, b.z-z) < b.def.size*0.9 + 3) return false;
      this.nodes.push(new ResNode(this, res, x, z, amount, region, rnd));
      return true;
    };

    // grappes proches de chaque base
    for(const p of this.players){
      if(!p.startSite) continue;
      const s = p.startSite;
      const packs = [['mat', 7, 16], ['food', 5, 20], ['energy', 3, 26]];
      for(const [res, count, dist] of packs){
        let placed = 0, tries = 0;
        while(placed < count && tries++ < 260){
          const a = rnd()*Math.PI*2;
          const d = dist + rnd()*12;
          if(place(res, s.x + Math.cos(a)*d, s.z + Math.sin(a)*d, res === 'energy' ? 420 : 520)) placed++;
        }
      }
    }

    // dispersion générale
    const total = 210;
    for(let i=0;i<total;i++){
      const r = rnd();
      let res = 'mat';
      const wMat = 0.5*bias.mat, wFood = 0.3*bias.food, wEn = 0.2*bias.energy;
      const sum = wMat + wFood + wEn;
      const pick = r*sum;
      if(pick < wMat) res = 'mat';
      else if(pick < wMat + wFood) res = 'food';
      else res = 'energy';
      const x = (rnd()*2-1) * (HALF-10);
      const z = (rnd()*2-1) * (HALF-10);
      place(res, x, z, res === 'energy' ? 380 : 500);
    }

    // forêts décoratives supplémentaires (aussi récoltables)
    const extra = Math.round(60 * (region.trees || 1));
    for(let i=0;i<extra;i++){
      const cx = (rnd()*2-1)*(HALF-20), cz = (rnd()*2-1)*(HALF-20);
      for(let k=0;k<5;k++){
        place('mat', cx + (rnd()-0.5)*16, cz + (rnd()-0.5)*16, 460);
      }
    }
  }

  dispose(){
    if(!this.terrain) return;
    for(const u of this.units) u.dispose();
    for(const b of this.buildings) b.dispose();
    for(const n of this.nodes) this.scene.remove(n.mesh);
    if(this.fx) this.fx.clear();
    this.scene.remove(this.terrain.mesh);
    this.scene.remove(this.terrain.water);
    if(this.placement) this.cancelPlacement();
    this.units = []; this.buildings = []; this.nodes = []; this.players = [];
    this.selected = []; this.groups = {}; this.hash.clear();
    this.terrain = null;
    this.running = false;
  }

  /* ============================================================ requêtes spatiales */
  _hashKey(x, z){ return ((x/HASH_CELL)|0) * 10007 + ((z/HASH_CELL)|0); }
  rebuildHash(){
    this.hash.clear();
    for(const u of this.units){
      if(u.dead) continue;
      const k = this._hashKey(u.x + HALF, u.z + HALF);
      let a = this.hash.get(k);
      if(!a){ a = []; this.hash.set(k, a); }
      a.push(u);
    }
  }
  neighbors(x, z, r, out){
    if(out) out.length = 0; else out = [];
    const cx = ((x + HALF)/HASH_CELL)|0, cz = ((z + HALF)/HASH_CELL)|0;
    const span = Math.max(1, Math.ceil(r / HASH_CELL));
    for(let j=-span;j<=span;j++){
      for(let i=-span;i<=span;i++){
        const a = this.hash.get((cx+i)*10007 + (cz+j));
        if(a) for(const u of a) out.push(u);
      }
    }
    return out;
  }

  findEnemyNear(src, range){
    const p = src.player;
    let best = null, bestD = range*range;
    for(const u of this.neighbors(src.x, src.z, range)){
      if(u.dead || !p.isEnemy(u.player)) continue;
      const d = (u.x-src.x)**2 + (u.z-src.z)**2;
      if(d < bestD){ bestD = d; best = u; }
    }
    if(best) return best;
    for(const b of this.buildings){
      if(b.dead || !p.isEnemy(b.player)) continue;
      const d = (b.x-src.x)**2 + (b.z-src.z)**2;
      const rr = (range + b.def.size*0.5)**2;
      if(d < rr && d < bestD*4){ bestD = d; best = b; }
    }
    return best;
  }

  findNode(x, z, res){
    let best = null, bestD = Infinity;
    for(const n of this.nodes){
      if(n.depleted || (res && n.res !== res)) continue;
      const d = (n.x-x)**2 + (n.z-z)**2;
      if(d < bestD){ bestD = d; best = n; }
    }
    return best;
  }

  findDropSite(player, x, z){
    let best = null, bestD = Infinity;
    for(const b of player.buildings){
      if(b.dead || !b.complete || !b.def.drop) continue;
      const d = (b.x-x)**2 + (b.z-z)**2;
      if(d < bestD){ bestD = d; best = b; }
    }
    return best;
  }

  freeSpotAround(x, z, r){
    for(let i=0;i<40;i++){
      const a = Math.random()*Math.PI*2;
      const d = r + Math.random()*r*0.9;
      const px = x + Math.cos(a)*d, pz = z + Math.sin(a)*d;
      if(this.grid.walkableWorld(px, pz)) return {x:px, z:pz};
    }
    const f = this.grid.nearestFree(x, z);
    return f;
  }

  damageArea(x, z, r, dmg, src){
    for(const u of this.neighbors(x, z, r + 2)){
      if(u.dead || !src.player.isEnemy(u.player)) continue;
      const d = Math.hypot(u.x-x, u.z-z);
      if(d <= r + u.radius) u.damage(dmg * (1 - 0.45*d/r), src);
    }
    for(const b of this.buildings){
      if(b.dead || !src.player.isEnemy(b.player)) continue;
      const d = Math.hypot(b.x-x, b.z-z);
      if(d <= r + b.radius) b.damage(dmg * (1 - 0.35*d/r) * (src.siege||1), src);
    }
  }

  shakeAt(x, z, amount){
    const d = Math.hypot(x - this.engine.target.x, z - this.engine.target.z);
    const f = Math.max(0, 1 - d/90);
    if(f > 0) this.engine.shake(amount * f);
  }

  removeUnit(u){
    u.dispose();
    let i = this.units.indexOf(u); if(i >= 0) this.units.splice(i, 1);
    i = u.player.units.indexOf(u); if(i >= 0) u.player.units.splice(i, 1);
    i = this.selected.indexOf(u); if(i >= 0){ this.selected.splice(i, 1); this.emit('selection', this.selected); }
    u.player.recomputePop();
    this._checkDefeat(u.player);
  }
  removeBuilding(b){
    b.dispose();
    let i = this.buildings.indexOf(b); if(i >= 0) this.buildings.splice(i, 1);
    i = b.player.buildings.indexOf(b); if(i >= 0) b.player.buildings.splice(i, 1);
    i = this.selected.indexOf(b); if(i >= 0){ this.selected.splice(i, 1); this.emit('selection', this.selected); }
    b.player.recomputePop();
    // toutes les unités qui construisaient ce bâtiment repassent en attente
    for(const u of this.units) if(u.task && u.task.site === b) u.stop();
    this._checkDefeat(b.player);
  }

  _checkDefeat(p){
    if(p.defeated || p.id === 99) return;
    const hasCC = p.buildings.some(b=>!b.dead && b.def.key === 'command');
    const hasWorker = p.units.some(u=>!u.dead && u.role === 'worker');
    const hasArmy = p.units.some(u=>!u.dead && u.role !== 'worker');
    if(!hasCC && !hasWorker && !hasArmy){
      p.defeated = true;
      this.emit('playerDefeated', p);
      this._checkEnd();
    }
  }
  _checkEnd(){
    if(this.ended) return;
    const alive = this.players.filter(p=>p.id !== 99 && !p.defeated);
    if(this.human.defeated){ this.ended = true; this.emit('gameOver', false); }
    else if(alive.length === 1 && alive[0] === this.human){ this.ended = true; this.emit('gameOver', true); }
  }

  /* ============================================================ boucle */
  update(dtReal){
    if(!this.running || this.paused || this.ended) return;
    const dt = Math.min(0.05, dtReal) * this.speed;
    this.time += dt;

    this.rebuildHash();

    for(let i=this.units.length-1;i>=0;i--){ const u = this.units[i]; if(!u.dead) u.update(dt); }
    for(let i=this.buildings.length-1;i>=0;i--){ const b = this.buildings[i]; if(!b.dead) b.update(dt); }

    // production passive
    for(const p of this.players){
      if(p.defeated) continue;
      const inc = p.income();
      p.res.food += inc.food * dt;
      p.res.mat += inc.mat * dt;
      p.res.energy += inc.energy * dt;
      if(p.isAI && p.ai) p.ai.update(dt);
    }
    this.aliens.update(dt);

    this.fx.update(dt);
    this.terrain.update(this.time);
  }

  render(dt, t){
    if(!this.running) return;
    for(const u of this.units) u.render(dt, t);
    for(const b of this.buildings) b.render(dt, t);
    if(this.placement) this._renderPlacement();
  }

  /* ============================================================ picking */
  _ray(sx, sy){
    this.pointer.x = (sx / window.innerWidth) * 2 - 1;
    this.pointer.y = -(sy / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.engine.camera);
    return this.raycaster;
  }

  groundAt(sx, sy){
    const ray = this._ray(sx, sy);
    const hit = ray.intersectObject(this.terrain.mesh, false);
    if(hit.length) return hit[0].point;
    // repli : plan y=0
    const dir = ray.ray.direction, org = ray.ray.origin;
    if(Math.abs(dir.y) < 1e-4) return null;
    const t = -org.y / dir.y;
    if(t < 0) return null;
    return new THREE.Vector3(org.x + dir.x*t, 0, org.z + dir.z*t);
  }

  entityAt(sx, sy){
    const ray = this._ray(sx, sy);
    const list = [];
    for(const u of this.units) if(!u.dead) list.push(u.mesh);
    for(const b of this.buildings) if(!b.dead) list.push(b.mesh);
    for(const n of this.nodes) if(!n.depleted) list.push(n.mesh);
    const hits = ray.intersectObjects(list, true);
    for(const h of hits){
      let o = h.object;
      while(o && !o.userData.entity) o = o.parent;
      if(o && o.userData.entity && !o.userData.entity.dead) return o.userData.entity;
    }
    return null;
  }

  /* ============================================================ sélection */
  clearSelection(){
    for(const e of this.selected) e.setSelected(false);
    this.selected = [];
    this.emit('selection', this.selected);
  }
  select(list, add){
    if(!add) for(const e of this.selected) e.setSelected(false);
    const base = add ? this.selected.slice() : [];
    for(const e of list) if(!base.includes(e)) base.push(e);
    this.selected = base.slice(0, 60);
    for(const e of this.selected) e.setSelected(true);
    this.emit('selection', this.selected);
    if(this.selected.length) this.audio.play('select');
  }

  clickSelect(sx, sy, add, dbl){
    const e = this.entityAt(sx, sy);
    if(!e || e.type === 'node'){ if(!add) this.clearSelection(); return; }
    if(dbl && e.type === 'unit' && e.player === this.human){
      // toutes les unités visibles du même type
      const same = this.human.units.filter(u=>u.key === e.key && !u.dead && this._onScreen(u));
      this.select(same, add);
      return;
    }
    this.select([e], add);
  }

  _onScreen(u){
    const p = this.engine.project(u.center());
    return p.x > -50 && p.x < window.innerWidth + 50 && p.y > -50 && p.y < window.innerHeight + 50;
  }

  boxSelect(x0, y0, x1, y1, add){
    const picked = [];
    const v = new THREE.Vector3();
    for(const u of this.human.units){
      if(u.dead) continue;
      const p = this.engine.project(u.center(v));
      if(p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) picked.push(u);
    }
    if(!picked.length){
      for(const b of this.human.buildings){
        if(b.dead) continue;
        const p = this.engine.project(b.center(v));
        if(p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1){ picked.push(b); break; }
      }
    }
    if(picked.length) this.select(picked, add);
    else if(!add) this.clearSelection();
  }

  selectIdleWorker(){
    const w = this.human.units.find(u=>u.role === 'worker' && u.state === 'idle' && !u.dead);
    if(w){ this.select([w], false); this.focusOn(w); }
    else this.emit('alert', {kind:'warn', title:'Ouvriers', text:'Aucun ouvrier inactif.'});
  }
  focusOnHome(){
    const cc = this.human.buildings.find(b=>b.def.key === 'command' && !b.dead);
    if(cc){ this.engine.lookAt(cc.x, cc.z); this.select([cc], false); }
  }
  focusOn(e){ this.engine.lookAt(e.x, e.z); }

  setGroup(n){
    const list = this.selected.filter(e=>e.type === 'unit' && e.player === this.human);
    if(!list.length) return;
    this.groups[n] = list.slice();
    this.emit('groups', this.groups);
  }
  recallGroup(n){
    const g = (this.groups[n] || []).filter(u=>!u.dead);
    this.groups[n] = g;
    if(g.length){ this.select(g, false); }
  }

  /* ============================================================ ordres */
  command(sx, sy, queue){
    if(this.placement) return;
    const sel = this.selected.filter(e=>e.player === this.human && !e.dead);
    if(!sel.length) return;

    const ent = this.entityAt(sx, sy);
    const ground = this.groundAt(sx, sy);

    // rallye pour les bâtiments sélectionnés
    const blds = sel.filter(e=>e.type === 'building');
    if(blds.length && ground){
      for(const b of blds){
        b.rally = ent && ent.type === 'node' ? { x:ent.x, z:ent.z, node:ent } : { x:ground.x, z:ground.z };
      }
      this.emit('rally', ground);
      this.audio.play('move');
    }

    const units = sel.filter(e=>e.type === 'unit');
    if(!units.length) return;

    if(ent && ent.type !== 'node' && this.human.isEnemy(ent.player)){
      for(const u of units) u.attackEntity(ent);
      this.audio.play('move');
      this.emit('order', {kind:'attack', x:ent.x, z:ent.z});
      return;
    }
    if(ent && ent.type === 'node'){
      let any = false;
      for(const u of units){
        if(u.role === 'worker'){ u.gatherFrom(ent); any = true; }
        else if(ground) u.moveTo(ground.x, ground.z);
      }
      this.emit('order', {kind:'gather', x:ent.x, z:ent.z});
      this.audio.play('move');
      return;
    }
    if(ent && ent.type === 'building' && ent.player === this.human && !ent.complete){
      for(const u of units){
        if(u.role === 'worker') u.buildAt(ent);
        else if(ground) u.moveTo(ground.x, ground.z);
      }
      this.emit('order', {kind:'build', x:ent.x, z:ent.z});
      this.audio.play('move');
      return;
    }
    if(!ground) return;

    // déplacement en formation
    this._formationMove(units, ground.x, ground.z);
    this.emit('order', {kind:'move', x:ground.x, z:ground.z});
    this.audio.play('move');
  }

  _formationMove(units, x, z){
    const n = units.length;
    if(n === 1){ units[0].moveTo(x, z); return; }
    const cols = Math.ceil(Math.sqrt(n));
    const gap = 2.6;
    let i = 0;
    // orientation depuis le centre de masse
    let cx = 0, cz = 0;
    for(const u of units){ cx += u.x; cz += u.z; }
    cx /= n; cz /= n;
    const ang = Math.atan2(x - cx, z - cz);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for(const u of units){
      const r = (i / cols)|0, c = i % cols;
      const ox = (c - (cols-1)/2) * gap;
      const oz = (r - (Math.ceil(n/cols)-1)/2) * gap;
      const px = x + ox*ca - oz*sa;
      const pz = z - ox*sa - oz*ca;
      const f = this.grid.walkableWorld(px, pz) ? {x:px, z:pz} : this.grid.nearestFree(px, pz, 8);
      u.moveTo(f.x, f.z);
      i++;
    }
  }

  attackMoveSelected(x, z){
    const units = this.selected.filter(e=>e.type === 'unit' && e.player === this.human && !e.dead);
    for(const u of units) u.moveTo(x, z, {attackMove:true});
  }
  stopSelected(){
    for(const e of this.selected) if(e.type === 'unit') e.stop();
  }

  /* ============================================================ placement de bâtiment */
  beginPlacement(key){
    this.cancelPlacement();
    const p = this.human;
    const def = BUILDINGS[key];
    if(p.age < def.minAge){ this.audio.play('deny'); return; }
    const cost = p.buildingCost(key);
    if(!p.canAfford(cost)){
      this.audio.play('deny');
      this.emit('alert', {kind:'bad', title:'Ressources insuffisantes', text:`${buildingName(key, p.age)} nécessite plus de matériaux.`});
      return;
    }
    const ghost = makeGhost(makeBuilding(key, p.age, p.colors, p.alien));
    ghost.userData.isGhost = true;
    this.scene.add(ghost);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(def.size*0.5, def.size*0.56, 30).rotateX(-Math.PI/2),
      new THREE.MeshBasicMaterial({ color:0x6cf0ff, transparent:true, opacity:0.6, depthWrite:false, side:THREE.DoubleSide })
    );
    this.scene.add(ring);
    this.placement = { key, def, ghost, ring, ok:false, x:0, z:0 };
    this.emit('placement', key);
  }
  cancelPlacement(){
    if(!this.placement) return;
    this.scene.remove(this.placement.ghost);
    this.scene.remove(this.placement.ring);
    this.placement.ring.geometry.dispose();
    this.placement = null;
    this.emit('placement', null);
  }
  movePlacement(sx, sy){
    if(!this.placement) return;
    const g = this.groundAt(sx, sy);
    if(!g) return;
    this.placement.x = g.x; this.placement.z = g.z;
  }
  _renderPlacement(){
    const pl = this.placement;
    const y = this.terrain.heightAt(pl.x, pl.z);
    pl.ghost.position.set(pl.x, y, pl.z);
    pl.ring.position.set(pl.x, y + 0.15, pl.z);
    const ok = this.canPlaceAt(pl.key, pl.x, pl.z);
    if(ok !== pl.ok){
      pl.ok = ok;
      const col = ok ? 0x6cf0ff : 0xff4d6d;
      pl.ring.material.color.setHex(col);
      pl.ghost.traverse(o=>{ if(o.isMesh) o.material.color.setHex(col); });
    }
  }
  canPlaceAt(key, x, z){
    const def = BUILDINGS[key];
    const r = def.size*0.5;
    if(Math.abs(x) > HALF-8 || Math.abs(z) > HALF-8) return false;
    // terrain praticable sur toute l'emprise
    for(let a=0;a<8;a++){
      const ang = a/8*Math.PI*2;
      const px = x + Math.cos(ang)*r, pz = z + Math.sin(ang)*r;
      if(!this.terrain.isLand(px, pz)) return false;
      if(this.terrain.slopeAt(px, pz) > 0.5) return false;
    }
    for(const b of this.buildings){
      if(b.dead) continue;
      if(Math.hypot(b.x-x, b.z-z) < r + b.def.size*0.5 + 1.1) return false;
    }
    for(const n of this.nodes){
      if(n.depleted) continue;
      if(Math.hypot(n.x-x, n.z-z) < r + n.radius*0.8) return false;
    }
    return true;
  }
  confirmPlacement(sx, sy){
    const pl = this.placement;
    if(!pl) return false;
    this.movePlacement(sx, sy);
    if(!this.canPlaceAt(pl.key, pl.x, pl.z)){
      this.audio.play('deny');
      this.emit('alert', {kind:'bad', title:'Emplacement invalide', text:'Terrain trop escarpé ou déjà occupé.'});
      return false;
    }
    const p = this.human;
    const cost = p.buildingCost(pl.key);
    if(!p.canAfford(cost)){ this.audio.play('deny'); this.cancelPlacement(); return false; }
    p.pay(cost);
    const b = new Building(this, p, pl.key, pl.x, pl.z, false);
    // envoie les ouvriers sélectionnés (sinon le plus proche)
    let workers = this.selected.filter(e=>e.type === 'unit' && e.role === 'worker' && e.player === p && !e.dead);
    if(!workers.length){
      const w = p.units.filter(u=>u.role === 'worker' && !u.dead)
        .sort((a,c)=>Math.hypot(a.x-b.x,a.z-b.z) - Math.hypot(c.x-b.x,c.z-b.z)).slice(0, 2);
      workers = w;
    }
    for(const w of workers) w.buildAt(b);
    this.audio.play('place');
    const keep = this.keepPlacing;
    this.cancelPlacement();
    if(keep) this.beginPlacement(pl.key);
    return true;
  }

  /* ============================================================ actions UI */
  trainFromSelection(key){
    const b = this.selected.find(e=>e.type === 'building' && e.player === this.human && e.complete
      && e.def.produces && e.def.produces.includes(key));
    if(!b){ this.audio.play('deny'); return; }
    const err = b.queueUnit(key);
    if(err){
      this.audio.play('deny');
      const msg = err === 'pop' ? "Population maximale atteinte — construisez des habitats."
        : err === 'res' ? "Ressources insuffisantes."
        : "File de production pleine.";
      this.emit('alert', {kind:'warn', title:'Impossible', text:msg});
    } else this.audio.play('click');
  }
  advanceAge(){
    const b = this.selected.find(e=>e.type === 'building' && e.player === this.human && e.complete && e.def.canAge)
      || this.human.buildings.find(x=>x.def.canAge && x.complete && !x.dead);
    if(!b){ this.audio.play('deny'); return; }
    const err = b.queueAge();
    if(err){
      this.audio.play('deny');
      this.emit('alert', {kind:'warn', title:'Passage d\'âge impossible',
        text: err === 'res' ? "Ressources insuffisantes pour l'âge suivant." : (err === 'max' ? "Vous avez atteint l'âge ultime." : "Déjà en cours.")});
    } else {
      this.audio.play('click');
      this.emit('alert', {kind:'good', title:'Évolution lancée', text:`Passage vers ${AGES[this.human.age+1].name}.`});
    }
  }
  research(key){
    const b = this.selected.find(e=>e.type === 'building' && e.player === this.human && e.complete && e.def.research)
      || this.human.buildings.find(x=>x.def.research && x.complete && !x.dead);
    if(!b){ this.audio.play('deny'); return; }
    const err = b.queueResearch(key);
    if(err){ this.audio.play('deny'); }
    else this.audio.play('click');
  }
}
