/* ============================================================
   Entités : joueurs, unités, bâtiments, gisements
   ============================================================ */
import * as THREE from 'three';
import { UNITS, BUILDINGS, AGES, AGE_POWER, FACTIONS, unitName, buildingName } from '../data/gamedata.js';
import { makeUnit, makeBuilding, makeSelectionRing, makeTree, makeRock, makeCrystal, makeBerry } from '../models/factory.js';

let NEXT_ID = 1;
const _nearBuf = [];

/* ============================================================ JOUEUR */
export class Player{
  constructor(game, id, factionKey, colorHex, isAI, name, startAge = 0){
    this.game = game;
    this.id = id;
    this.faction = factionKey;
    this.def = FACTIONS[factionKey];
    this.alien = !!this.def.alien;
    this.mods = this.def.mods;
    this.isAI = isAI;
    this.name = name;
    this.color = colorHex;
    this.colors = {
      main: colorHex,
      dark: new THREE.Color(colorHex).multiplyScalar(0.55).getHex(),
      accent: this.def.accent,
    };
    this.age = startAge;
    this.res = { food:220 + startAge*260, mat:260 + startAge*300, energy:startAge*180 };
    this.pop = 0;
    this.popCap = 0;
    this.upgrades = { weapons:0, armor:0, logistics:0, reactor:0 };
    this.units = [];
    this.buildings = [];
    this.defeated = false;
    this.stats = { built:0, trained:0, killed:0, lost:0, gathered:0 };
    this.hostileToAll = false;
  }

  get ageName(){ return AGES[this.age].name; }
  get power(){ return AGE_POWER[this.age]; }

  canAfford(c){
    return this.res.food >= (c.food||0) && this.res.mat >= (c.mat||0) && this.res.energy >= (c.energy||0);
  }
  pay(c){
    this.res.food -= (c.food||0); this.res.mat -= (c.mat||0); this.res.energy -= (c.energy||0);
  }
  refund(c){
    this.res.food += (c.food||0); this.res.mat += (c.mat||0); this.res.energy += (c.energy||0);
  }
  gain(type, amount){
    this.res[type] += amount;
    this.stats.gathered += amount;
  }

  /* --- coûts effectifs (âge + race) --- */
  unitCost(key){
    const d = UNITS[key];
    const m = (1 + 0.20 * this.age) * (this.mods.unitCost || 1);
    return { food:Math.round((d.cost.food||0)*m), mat:Math.round((d.cost.mat||0)*m), energy:Math.round((d.cost.energy||0)*m) };
  }
  buildingCost(key){
    const d = BUILDINGS[key];
    const m = (1 + 0.16 * this.age) * (this.mods.bldCost || 1);
    return { food:Math.round((d.cost.food||0)*m), mat:Math.round((d.cost.mat||0)*m), energy:Math.round((d.cost.energy||0)*m) };
  }
  ageCost(){
    const nx = AGES[this.age + 1];
    if(!nx) return null;
    const m = this.mods.ageCost || 1;
    return { food:Math.round(nx.cost.food*m), mat:Math.round(nx.cost.mat*m), energy:Math.round(nx.cost.energy*m) };
  }

  recomputePop(){
    let cap = 0;
    for(const b of this.buildings){ if(b.complete && b.def.pop) cap += b.def.pop + (b.def.key === 'house' ? (this.mods.popBonus||0) : 0); }
    this.popCap = Math.min(220, cap);
    let p = 0;
    for(const u of this.units) p += UNITS[u.key].pop;
    this.pop = p;
  }

  /* production passive des bâtiments */
  income(){
    const inc = { food:0, mat:0, energy:0 };
    for(const b of this.buildings){
      if(!b.complete || !b.def.income) continue;
      for(const k in b.def.income){
        let v = b.def.income[k] * (1 + 0.25*this.upgrades.reactor) * (1 + this.age*0.16);
        if(k === 'energy') v *= (this.mods.energyIncome || 1);
        inc[k] += v;
      }
    }
    return inc;
  }

  isEnemy(other){
    if(!other || other === this) return false;
    return this.hostileToAll || other.hostileToAll || other.id !== this.id;
  }
}

/* ============================================================ UNITÉ */
export class Unit{
  constructor(game, player, key, x, z){
    this.game = game;
    this.id = NEXT_ID++;
    this.player = player;
    this.key = key;
    this.def = UNITS[key];
    this.role = this.def.role;
    this.age = player.age;
    this.type = 'unit';
    this.name = unitName(key, this.age);

    const pw = AGE_POWER[this.age], m = player.mods, up = player.upgrades;
    this.maxHp = Math.round(this.def.hp * pw * (m.hp||1) * (1 + 0.18*up.armor));
    this.hp = this.maxHp;
    this.atk = this.def.atk * pw * (m.atk||1) * (1 + 0.15*up.weapons) * (this.role === 'ranged' ? (m.rangedAtk||1) : 1);
    this.armor = this.def.armor + 2*up.armor;
    this.speed = this.def.speed * (m.speed||1) * (1 + 0.10*up.reactor);
    this.range = this.def.range;
    this.rate = this.def.rate;
    this.los = this.def.los;
    this.splash = this.def.splash || 0;
    this.siege = this.def.siege || 1;
    this.flying = !!this.def.flying;
    this.radius = this.role === 'heavy' ? 1.6 : (this.flying ? 1.4 : 0.75);

    this.x = x; this.z = z;
    this.y = game.terrain.heightAt(x, z);
    this.facing = Math.random()*Math.PI*2;
    this.vx = 0; this.vz = 0;

    this.state = 'idle';
    this.path = null; this.pathIdx = 0;
    this.dest = null;
    this.target = null;
    this.task = null;              // {kind:'gather'|'build'|'repair', node, site}
    this.carry = { type:null, amount:0 };
    this.cool = 0;
    this.gatherT = 0;
    this.repathT = 0;
    this.acqT = Math.random()*0.5;
    this.animT = Math.random()*10;
    this.stuck = 0;
    this.aggro = true;
    this.dead = false;

    // visuel
    this.mesh = makeUnit(this.role, this.age, player.colors, player.alien || !!this.def.alien);
    this.mesh.position.set(x, this.y, z);
    this.mesh.userData.entity = this;
    this.anim = this.mesh.userData.anim || null;
    this.muzzle = this.mesh.userData.muzzle || new THREE.Vector3(0, 1.6, 0.8);
    game.scene.add(this.mesh);

    this.ring = makeSelectionRing(this.radius + 0.55, player.color);
    this.ring.visible = false;
    game.scene.add(this.ring);

    // porteur de ressource (visuel)
    this.carryMesh = null;
    player.units.push(this);
    game.units.push(this);
    if(this.flying) this.alt = 9 + Math.random()*1.5;
  }

  get selectable(){ return !this.dead; }
  get worldY(){ return this.flying ? this.y + this.alt : this.y; }

  center(out){
    const v = out || new THREE.Vector3();
    return v.set(this.x, this.worldY + (this.role === 'heavy' ? 1.8 : 1.2), this.z);
  }

  /* ---------------------------------------------- ordres */
  moveTo(x, z, opts = {}){
    this.clearTask(opts.keepTarget);
    this.dest = { x, z };
    this.state = opts.attackMove ? 'attackMove' : 'move';
    this._repath();
  }
  _repath(){
    if(!this.dest) return;
    if(this.flying){ this.path = [{x:this.dest.x, z:this.dest.z}]; this.pathIdx = 0; return; }
    const p = this.game.grid.findPath(this.x, this.z, this.dest.x, this.dest.z);
    this.path = p && p.length ? p : [{x:this.dest.x, z:this.dest.z}];
    this.pathIdx = 0;
    this.repathT = 0;
  }
  attackEntity(e){
    this.clearTask();
    this.target = e;
    this.state = 'attack';
    this.dest = { x:e.x, z:e.z };
    this._repath();
  }
  gatherFrom(node){
    this.clearTask();
    this.task = { kind:'gather', node };
    this.state = 'gather';
    this.dest = { x:node.x, z:node.z };
    this._repath();
  }
  buildAt(site){
    this.clearTask();
    this.task = { kind:'build', site };
    this.state = 'build';
    this.dest = { x:site.x, z:site.z };
    this._repath();
  }
  stop(){
    this.clearTask();
    this.state = 'idle';
    this.path = null; this.dest = null; this.target = null;
  }
  clearTask(keepTarget){
    this.task = null;
    if(!keepTarget) this.target = null;
  }

  /* ---------------------------------------------- dégâts */
  damage(amount, from){
    if(this.dead) return;
    const dmg = Math.max(1, amount * (1 - Math.min(0.62, this.armor * 0.028)));
    this.hp -= dmg;
    if(this.hp <= 0){ this.die(from); return; }
    // riposte
    if(from && this.state === 'idle' && this.role !== 'worker' && this.aggro){
      this.attackEntity(from);
    } else if(from && this.role === 'worker' && this.state === 'idle'){
      this.attackEntity(from);
    }
  }
  die(killer){
    if(this.dead) return;
    this.dead = true;
    this.player.stats.lost++;
    if(killer && killer.player) killer.player.stats.killed++;
    const c = this.center();
    this.game.fx.boom(c, this.role === 'heavy' ? 1.5 : 0.75, this.player.alien ? 0xd06bff : 0xff8a4d, this.role === 'heavy' ? 14 : 6);
    this.game.audio.play('boom', this.role === 'heavy' ? 0.9 : 0.45);
    this.game.removeUnit(this);
  }

  dispose(){
    this.game.scene.remove(this.mesh);
    this.game.scene.remove(this.ring);
    if(this.carryMesh) this.game.scene.remove(this.carryMesh);
  }

  /* ---------------------------------------------- IA locale */
  /* la détection de cible est échelonnée dans le temps pour éviter
     de scanner le voisinage de chaque unité à chaque tick */
  _acquire(dt){
    if(this.role === 'worker' && !this.player.hostileToAll) return null;
    this.acqT -= dt;
    if(this.acqT > 0) return null;
    this.acqT = 0.35 + Math.random()*0.25;
    return this.game.findEnemyNear(this, this.los);
  }

  _inRange(e){
    const d = Math.hypot(e.x - this.x, e.z - this.z);
    const r = this.range + (e.type === 'building' ? e.def.size*0.42 : e.radius);
    return d <= r;
  }

  _fire(e){
    const g = this.game;
    this.cool = this.rate;
    const from = new THREE.Vector3();
    this.mesh.localToWorld(from.copy(this.muzzle));
    const to = e.center ? e.center() : new THREE.Vector3(e.x, e.y + 1, e.z);

    const isB = e.type === 'building';
    let dmg = this.atk * (isB ? this.siege : 1);

    if(this.range > 3){
      const alien = this.player.alien || this.def.alien;
      const kind = this.role === 'heavy' ? 'shell' : (this.age >= 5 ? (alien ? 'plasma' : 'beam') : (this.age >= 3 ? 'bullet' : 'arrow'));
      const col = alien ? 0xc06bff : (this.age >= 5 ? 0x8ef0ff : (this.age >= 3 ? 0xffe08a : 0xd8c9a8));
      g.fx.shot(from, to, { kind, color:col });
      g.fx.muzzle(from, col, 0.34);
      g.audio.play('shoot', 0.5);
    } else {
      g.fx.spark(to, this.player.alien ? 0xc06bff : 0xffd18a, 4, 0.6);
      g.audio.play('hit', 0.45);
    }

    if(this.splash > 0){
      g.damageArea(e.x, e.z, this.splash, dmg, this);
      g.fx.boom(to, this.splash*0.6, 0xffa94d, 8);
    } else {
      e.damage(dmg, this);
    }
    this.swing = 0.28;
  }

  /* ---------------------------------------------- mise à jour */
  update(dt){
    if(this.dead) return;
    this.cool = Math.max(0, this.cool - dt);
    if(this.swing) this.swing = Math.max(0, this.swing - dt);

    // régénération xéno
    if(this.player.mods.regen && this.hp < this.maxHp && this.cool <= 0){
      this.hp = Math.min(this.maxHp, this.hp + this.player.mods.regen * dt);
    }

    switch(this.state){
      case 'idle':      this._sIdle(dt); break;
      case 'move':      this._sMove(dt); break;
      case 'attackMove':this._sAttackMove(dt); break;
      case 'attack':    this._sAttack(dt); break;
      case 'gather':    this._sGather(dt); break;
      case 'deliver':   this._sDeliver(dt); break;
      case 'build':     this._sBuild(dt); break;
    }
    this._integrate(dt);
  }

  _sIdle(dt){
    if(this.role === 'worker'){
      // reprise automatique si une tâche a été perdue
      return;
    }
    const e = this._acquire(dt);
    if(e) this.attackEntity(e);
  }

  _sMove(dt){
    if(!this._follow(dt)){ this.state = 'idle'; this.path = null; }
  }

  _sAttackMove(dt){
    const e = this._acquire(dt);
    if(e){ const d = this.dest; this.attackEntity(e); this._returnTo = d; return; }
    if(!this._follow(dt)) this.state = 'idle';
  }

  _sAttack(dt){
    const e = this.target;
    if(!e || e.dead || (e.player && e.player.defeated && e.type === 'building' && e.dead)){
      this.target = null;
      if(this._returnTo){ const d = this._returnTo; this._returnTo = null; this.moveTo(d.x, d.z, {attackMove:true}); }
      else this.state = 'idle';
      return;
    }
    if(this._inRange(e)){
      this.path = null;
      this._face(e.x, e.z, dt);
      if(this.cool <= 0) this._fire(e);
    } else {
      // poursuite
      this.repathT -= dt;
      if(!this.path || this.repathT <= 0 || Math.hypot(e.x - this.dest.x, e.z - this.dest.z) > 3.5){
        this.dest = { x:e.x, z:e.z };
        this._repath();
        this.repathT = 0.55 + Math.random()*0.3;
      }
      if(!this._follow(dt)){
        if(!this._inRange(e)) this.state = 'idle';
      }
    }
  }

  _sGather(dt){
    const t = this.task;
    if(!t || !t.node || t.node.depleted){
      // cherche un autre gisement du même type
      const n = t && t.node ? this.game.findNode(this.x, this.z, t.node.res) : null;
      if(n){ this.task = { kind:'gather', node:n }; this.dest = {x:n.x, z:n.z}; this._repath(); }
      else this.state = 'idle';
      return;
    }
    const node = t.node;
    const d = Math.hypot(node.x - this.x, node.z - this.z);
    if(d > node.radius + 1.5){
      if(!this._follow(dt)){
        this.dest = { x:node.x, z:node.z }; this._repath();
        if(!this.path || !this.path.length){ this.state = 'idle'; }
      }
      return;
    }
    // récolte
    this.path = null;
    this._face(node.x, node.z, dt);
    const rate = 0.72 * (this.player.mods.gather || 1) * (1 + 0.2*this.player.upgrades.logistics) * (1 + this.player.age*0.1);
    this.gatherT += dt;
    if(this.gatherT > 0.55){
      this.gatherT = 0;
      this.game.fx.dust({x:node.x, y:node.y + 0.6, z:node.z}, node.res === 'mat' ? 0xa8875f : (node.res === 'energy' ? 0xc48bff : 0xff8f57), 2);
      this.game.audio.play('build', 0.25);
    }
    const got = Math.min(rate * dt * 10, node.amount, 12 - this.carry.amount);
    node.amount -= got;
    this.carry.type = node.res;
    this.carry.amount += got;
    if(node.amount <= 0) node.deplete();
    if(this.carry.amount >= 11.5){
      this._updateCarryMesh();
      this.state = 'deliver';
      this._pickDrop();
    } else if(this.carry.amount > 0.5 && !this.carryMesh){
      this._updateCarryMesh();
    }
  }

  _pickDrop(){
    const b = this.game.findDropSite(this.player, this.x, this.z);
    if(!b){ this.state = 'gather'; return; }
    this.dropTarget = b;
    this.dest = { x:b.x, z:b.z };
    this._repath();
  }

  _sDeliver(dt){
    const b = this.dropTarget;
    if(!b || b.dead){ this._pickDrop(); if(!this.dropTarget) this.state = 'idle'; return; }
    const d = Math.hypot(b.x - this.x, b.z - this.z);
    if(d > b.def.size*0.5 + 1.6){
      if(!this._follow(dt)){ this.dest = {x:b.x, z:b.z}; this._repath(); if(!this.path) this.state = 'idle'; }
      return;
    }
    this.player.gain(this.carry.type, Math.round(this.carry.amount));
    this.game.onResourceDelivered?.(this.player, this.carry.type, this.carry.amount);
    this.carry.amount = 0;
    this._updateCarryMesh();
    // retour au gisement
    if(this.task && this.task.node && !this.task.node.depleted){
      this.state = 'gather';
      this.dest = { x:this.task.node.x, z:this.task.node.z };
      this._repath();
    } else {
      const n = this.game.findNode(this.x, this.z, this.carry.type || 'mat');
      if(n){ this.task = { kind:'gather', node:n }; this.state = 'gather'; this.dest = {x:n.x, z:n.z}; this._repath(); }
      else this.state = 'idle';
    }
  }

  _sBuild(dt){
    const s = this.task && this.task.site;
    if(!s || s.dead || s.complete){
      if(s && s.complete){
        // reprend la récolte automatiquement
        const n = this.game.findNode(this.x, this.z, 'mat');
        if(n){ this.gatherFrom(n); return; }
      }
      this.state = 'idle'; this.task = null; return;
    }
    const d = Math.hypot(s.x - this.x, s.z - this.z);
    if(d > s.def.size*0.5 + 1.8){
      if(!this._follow(dt)){ this.dest = {x:s.x, z:s.z}; this._repath(); if(!this.path) this.state = 'idle'; }
      return;
    }
    this.path = null;
    this._face(s.x, s.z, dt);
    s.addProgress(dt * (this.player.mods.build || 1) * (1 + 0.12*this.player.upgrades.logistics));
    this.gatherT += dt;
    if(this.gatherT > 0.4){
      this.gatherT = 0;
      this.game.fx.dust({x:s.x + (Math.random()-0.5)*s.def.size, y:s.y + 0.5, z:s.z + (Math.random()-0.5)*s.def.size}, 0xcbb894, 2);
      this.game.audio.play('build', 0.3);
    }
    this.swing = 0.3;
  }

  _updateCarryMesh(){
    const has = this.carry.amount > 0.5;
    if(has && !this.carryMesh){
      const col = this.carry.type === 'food' ? 0xff8f57 : (this.carry.type === 'mat' ? 0x9a7a52 : 0xc48bff);
      this.carryMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.44, 0.4, 0.44),
        new THREE.MeshLambertMaterial({ color:col, flatShading:true, emissive: this.carry.type === 'energy' ? 0x6b2fbf : 0x000000 })
      );
      this.carryMesh.castShadow = true;
      this.game.scene.add(this.carryMesh);
    } else if(!has && this.carryMesh){
      this.game.scene.remove(this.carryMesh);
      this.carryMesh = null;
    }
  }

  /* --- suivi de chemin ; retourne false si terminé --- */
  _follow(dt){
    if(!this.path || this.pathIdx >= this.path.length) return false;
    const wp = this.path[this.pathIdx];
    const dx = wp.x - this.x, dz = wp.z - this.z;
    const d = Math.hypot(dx, dz);
    if(d < 1.1){
      this.pathIdx++;
      if(this.pathIdx >= this.path.length){ this.path = null; return false; }
      return true;
    }
    const sp = this.speed;
    this.vx += (dx/d) * sp * dt * 7;
    this.vz += (dz/d) * sp * dt * 7;
    this._face(wp.x, wp.z, dt);
    return true;
  }

  _face(x, z, dt){
    const want = Math.atan2(x - this.x, z - this.z);
    let d = want - this.facing;
    while(d > Math.PI) d -= Math.PI*2;
    while(d < -Math.PI) d += Math.PI*2;
    this.facing += d * Math.min(1, dt * 9);
  }

  _integrate(dt){
    // séparation locale (tampon réutilisé : ce chemin est exécuté par unité et par tick)
    const near = this.game.neighbors(this.x, this.z, this.radius + 2.2, _nearBuf);
    let sx = 0, sz = 0;
    for(const o of near){
      if(o === this || o.dead || o.flying !== this.flying) continue;
      const dx = this.x - o.x, dz = this.z - o.z;
      const d2 = dx*dx + dz*dz;
      const minD = this.radius + o.radius;
      if(d2 < minD*minD && d2 > 0.0001){
        const d = Math.sqrt(d2);
        const push = (minD - d) / minD;
        sx += (dx/d) * push; sz += (dz/d) * push;
      }
    }
    this.vx += sx * this.speed * dt * 9;
    this.vz += sz * this.speed * dt * 9;

    // friction
    const damp = Math.pow(0.0015, dt);
    this.vx *= damp; this.vz *= damp;

    const sp = Math.hypot(this.vx, this.vz);
    const max = this.speed;
    if(sp > max){ this.vx = this.vx/sp*max; this.vz = this.vz/sp*max; }

    let nx = this.x + this.vx * dt;
    let nz = this.z + this.vz * dt;

    if(!this.flying){
      const g = this.game.grid;
      if(!g.walkableWorld(nx, nz)){
        if(g.walkableWorld(nx, this.z)) nz = this.z;
        else if(g.walkableWorld(this.x, nz)) nx = this.x;
        else { nx = this.x; nz = this.z; this.vx *= 0.2; this.vz *= 0.2; this.stuck += dt; }
      }
    }
    const B = 118;
    nx = Math.max(-B, Math.min(B, nx));
    nz = Math.max(-B, Math.min(B, nz));
    this.moved = Math.hypot(nx - this.x, nz - this.z);
    this.x = nx; this.z = nz;
    this.y = this.game.terrain.heightAt(this.x, this.z);

    // déblocage
    if(this.stuck > 1.4){
      this.stuck = 0;
      if(this.dest) this._repath();
    }
  }

  /* ---------------------------------------------- rendu */
  render(dt, t){
    const m = this.mesh;
    m.position.set(this.x, this.worldY, this.z);
    m.rotation.y = this.facing;

    if(this.flying){
      m.position.y += Math.sin(t*2.2 + this.id) * 0.35;
      m.rotation.z = -Math.min(0.4, this.vx * 0.02);
      m.rotation.x = Math.min(0.3, this.vz * 0.012);
    }

    const moving = this.moved > 0.008;
    this.animT += dt * (moving ? this.speed * 1.5 : 1.4);
    const a = this.anim;
    if(a){
      const sw = Math.sin(this.animT);
      switch(a.type){
        case 'walk':{
          const amp = moving ? 0.75 : 0.06;
          a.legL.rotation.x = sw * amp;
          a.legR.rotation.x = -sw * amp;
          const armAmp = this.swing ? 0 : amp*0.7;
          a.armL.rotation.x = -sw * armAmp;
          a.armR.rotation.x = this.swing ? -1.15 + this.swing*2.6 : sw * armAmp;
          a.torso.position.y = (a.torso.userData.y0 ?? (a.torso.userData.y0 = a.torso.position.y)) + (moving ? Math.abs(sw)*0.06 : Math.sin(this.animT*0.6)*0.02);
          break;
        }
        case 'bug':{
          for(const l of a.legs){
            const s2 = Math.sin(this.animT*1.5 + l.phase);
            l.hip.rotation.y = s2 * (moving ? 0.42 : 0.06);
            l.knee.rotation.z = Math.abs(s2) * (moving ? 0.3 : 0.05);
          }
          a.body.position.y = (a.body.userData.y0 ?? (a.body.userData.y0 = a.body.position.y)) + Math.sin(this.animT*3) * (moving ? 0.09 : 0.03);
          if(this.mesh.userData.tail) this.mesh.userData.tail.rotation.y = Math.sin(this.animT*0.8) * 0.28;
          break;
        }
        case 'walker':{
          for(let i=0;i<a.legs.length;i++){
            const l = a.legs[i];
            const s2 = Math.sin(this.animT*0.9 + i*Math.PI);
            l.hip.rotation.x = s2 * (moving ? 0.5 : 0.03);
            l.knee.rotation.x = Math.max(0, -s2) * (moving ? 0.7 : 0.04);
          }
          a.body.position.y = (a.body.userData.y0 ?? (a.body.userData.y0 = a.body.position.y)) + Math.abs(Math.sin(this.animT*0.9))*(moving?0.14:0.02);
          break;
        }
        case 'wheels':
          for(const w of a.wheels) w.rotation.y += this.moved * 1.6;
          break;
        case 'turret':
          if(this.target && !this.target.dead){
            const want = Math.atan2(this.target.x - this.x, this.target.z - this.z) - this.facing;
            a.turret.rotation.y += (want - a.turret.rotation.y) * Math.min(1, dt*5);
          }
          break;
        case 'heli':
          a.rotor.rotation.y += dt * 34;
          a.tail.rotation.x += dt * 40;
          break;
        case 'quad':
          for(const r of a.rotors) r.rotation.y += dt * 42;
          break;
        case 'jet':
          a.hull.rotation.z = Math.sin(t*1.6 + this.id)*0.08;
          break;
      }
    }

    if(this.carryMesh){
      this.carryMesh.position.set(
        this.x - Math.sin(this.facing)*0.1,
        this.worldY + 2.35,
        this.z - Math.cos(this.facing)*0.1
      );
      this.carryMesh.rotation.y = this.facing;
    }

    if(this.ring.visible){
      this.ring.position.set(this.x, this.worldY + 0.12, this.z);
    }
  }

  setSelected(v){
    this.ring.visible = v;
    if(v) this.ring.position.set(this.x, this.worldY + 0.12, this.z);
  }
}

/* ============================================================ BÂTIMENT */
export class Building{
  constructor(game, player, key, x, z, complete = false){
    this.game = game;
    this.id = NEXT_ID++;
    this.player = player;
    this.key = key;
    this.def = BUILDINGS[key];
    this.age = player.age;
    this.type = 'building';
    this.name = buildingName(key, this.age);

    const pw = AGE_POWER[this.age], m = player.mods, up = player.upgrades;
    this.maxHp = Math.round(this.def.hp * (0.7 + pw*0.4) * (1 + 0.18*up.armor));
    this.armor = this.def.armor + 2*up.armor;
    this.radius = this.def.size * 0.5;

    this.x = x; this.z = z;
    game.terrain.flatten(x, z, this.def.size*0.55, 2.6);
    this.y = game.terrain.heightAt(x, z);
    this.complete = complete;
    this.progress = complete ? 1 : 0;
    this.buildTime = this.def.time * (1 + this.age*0.12);
    this.hp = complete ? this.maxHp : this.maxHp * 0.12;
    this.dead = false;
    this.queue = [];
    this.rally = null;
    this.cool = 0;
    this.facing = 0;

    if(this.def.attack){
      const a = this.def.attack;
      this.atk = a.atk * pw * (m.atk||1) * (1 + 0.15*up.weapons);
      this.range = a.range;
      this.rate = a.rate;
      this.target = null;
    }

    this.mesh = makeBuilding(key, this.age, player.colors, player.alien);
    this.mesh.position.set(x, this.y, z);
    this.mesh.rotation.y = Math.random()*0.4 - 0.2;
    this.mesh.userData.entity = this;
    game.scene.add(this.mesh);

    this.ring = makeSelectionRing(this.radius + 0.9, player.color);
    this.ring.visible = false;
    this.ring.position.set(x, this.y + 0.12, z);
    game.scene.add(this.ring);

    if(!complete) this._applyBuildVisual();

    game.grid.block(x, z, this.def.size*0.48, true);
    player.buildings.push(this);
    game.buildings.push(this);
    player.recomputePop();
    game.terrain.refreshMeshRegion();
  }

  center(out){
    const v = out || new THREE.Vector3();
    return v.set(this.x, this.y + this.def.size*0.35, this.z);
  }

  _applyBuildVisual(){
    // le bâtiment « sort de terre » au fur et à mesure
    this.mesh.scale.set(1, Math.max(0.06, this.progress), 1);
    this.mesh.position.y = this.y - (1 - this.progress) * 0.6;
    this.mesh.traverse(o=>{
      if(o.isMesh){
        if(!o.userData._mat0) o.userData._mat0 = o.material;
        if(this.progress < 1){
          if(!o.userData._matB){
            o.userData._matB = o.userData._mat0.clone();
            o.userData._matB.transparent = true;
            o.userData._matB.opacity = 0.55;
            o.userData._matB.emissive = new THREE.Color(0x1a4a6a);
          }
          o.material = o.userData._matB;
        } else {
          o.material = o.userData._mat0;
        }
      }
    });
  }

  addProgress(dt){
    if(this.complete) return;
    this.progress = Math.min(1, this.progress + dt / this.buildTime);
    this.hp = Math.max(this.hp, this.maxHp * (0.12 + 0.88*this.progress));
    if(this.progress >= 1){
      this.complete = true;
      this.hp = this.maxHp;
      this._applyBuildVisual();
      this.player.recomputePop();
      this.player.stats.built++;
      this.game.onBuildingDone?.(this);
    } else {
      this._applyBuildVisual();
    }
  }

  /* ---------------------------------------------- production */
  canQueue(){ return this.queue.length < 8; }

  queueUnit(key){
    const p = this.player;
    const cost = p.unitCost(key);
    if(!p.canAfford(cost)) return 'res';
    if(p.pop + UNITS[key].pop > p.popCap) return 'pop';
    if(!this.canQueue()) return 'full';
    p.pay(cost);
    const dur = UNITS[key].time * (1 + this.age*0.1) / (p.mods.trainSpeed || 1);
    this.queue.push({ kind:'unit', key, t:0, dur, cost, icon:UNITS[key].icon });
    return null;
  }
  queueAge(){
    const p = this.player;
    if(p.age >= AGES.length-1) return 'max';
    const cost = p.ageCost();
    if(!p.canAfford(cost)) return 'res';
    if(this.queue.some(q=>q.kind === 'age')) return 'busy';
    p.pay(cost);
    this.queue.unshift({ kind:'age', t:0, dur:AGES[p.age+1].time, cost, icon:AGES[p.age+1].icon });
    return null;
  }
  queueResearch(key){
    const p = this.player;
    const R = this.game.RESEARCH[key];
    const lvl = p.upgrades[key] + 1;
    if(lvl > R.levels) return 'max';
    const cost = R.cost(lvl);
    if(!p.canAfford(cost)) return 'res';
    if(this.queue.some(q=>q.kind === 'research' && q.key === key)) return 'busy';
    p.pay(cost);
    this.queue.push({ kind:'research', key, level:lvl, t:0, dur:R.time(lvl), cost, icon:R.icon });
    return null;
  }
  cancelQueue(i){
    const q = this.queue[i];
    if(!q) return;
    this.player.refund(q.cost);
    this.queue.splice(i, 1);
  }

  _finish(q){
    const p = this.player, g = this.game;
    if(q.kind === 'unit'){
      const spot = g.freeSpotAround(this.x, this.z, this.def.size*0.6 + 1.6);
      const u = new Unit(g, p, q.key, spot.x, spot.z);
      p.stats.trained++;
      p.recomputePop();
      if(this.rally){
        if(this.rally.node) u.gatherFrom(this.rally.node);
        else u.moveTo(this.rally.x, this.rally.z);
      }
      g.onUnitTrained?.(u, this);
    } else if(q.kind === 'age'){
      p.age++;
      g.onAgeUp?.(p);
    } else if(q.kind === 'research'){
      p.upgrades[q.key] = q.level;
      g.onResearch?.(p, q.key, q.level);
    }
  }

  /* ---------------------------------------------- dégâts */
  damage(amount, from){
    if(this.dead) return;
    const dmg = Math.max(1, amount * (1 - Math.min(0.62, this.armor*0.028)));
    this.hp -= dmg;
    this.game.onBuildingHit?.(this, from);
    if(this.hp <= 0) this.die(from);
  }
  die(killer){
    if(this.dead) return;
    this.dead = true;
    if(killer && killer.player) killer.player.stats.killed++;
    const c = this.center();
    this.game.fx.boom(c, this.def.size*0.5, 0xff9a4d, 20);
    this.game.fx.dust({x:this.x, y:this.y+0.4, z:this.z}, 0x9c8a72, 10);
    this.game.audio.play('boom', 1);
    this.game.shakeAt(this.x, this.z, 0.6);
    this.game.removeBuilding(this);
  }
  dispose(){
    this.game.grid.block(this.x, this.z, this.def.size*0.48, false);
    this.game.scene.remove(this.mesh);
    this.game.scene.remove(this.ring);
  }

  /* ---------------------------------------------- mise à jour */
  update(dt){
    if(this.dead) return;
    if(!this.complete) return;

    // file de production
    if(this.queue.length){
      const q = this.queue[0];
      let blocked = false;
      if(q.kind === 'unit'){
        const p = this.player;
        if(p.pop + UNITS[q.key].pop > p.popCap) blocked = true;
      }
      q.blocked = blocked;
      if(!blocked){
        q.t += dt;
        if(q.t >= q.dur){ this.queue.shift(); this._finish(q); }
      }
    }

    // tourelle
    if(this.def.attack){
      this.cool = Math.max(0, this.cool - dt);
      if(!this.target || this.target.dead || Math.hypot(this.target.x-this.x, this.target.z-this.z) > this.range + 2){
        this.target = this.game.findEnemyNear(this, this.range);
      }
      if(this.target && this.cool <= 0){
        this.cool = this.rate;
        const from = new THREE.Vector3();
        const mz = this.mesh.userData.muzzle || new THREE.Vector3(0, this.def.size*0.7, 0);
        this.mesh.localToWorld(from.copy(mz));
        const to = this.target.center();
        const col = this.player.alien ? 0xc06bff : (this.age >= 4 ? 0x8ef0ff : 0xffe08a);
        this.game.fx.shot(from, to, { kind: this.age >= 5 ? 'beam' : (this.age >= 3 ? 'bullet' : 'arrow'), color:col });
        this.game.fx.muzzle(from, col, 0.32);
        this.game.audio.play('shoot', 0.4);
        this.target.damage(this.atk, this);
      }
    }
  }

  render(dt, t){
    const ud = this.mesh.userData;
    if(ud.spin) ud.spin.rotation.z += dt * 0.6;
    if(ud.orb){
      const s = 1 + Math.sin(t*2.2 + this.id)*0.12;
      ud.orb.scale.setScalar(s);
    }
    if(ud.turret && this.target && !this.target.dead){
      const want = Math.atan2(this.target.x - this.x, this.target.z - this.z) - this.mesh.rotation.y;
      ud.turret.rotation.y += (want - ud.turret.rotation.y) * Math.min(1, dt*4);
    }
  }

  setSelected(v){ this.ring.visible = v; }
}

/* ============================================================ GISEMENT */
export class ResNode{
  constructor(game, res, x, z, amount, region, rnd){
    this.game = game;
    this.id = NEXT_ID++;
    this.type = 'node';
    this.res = res;                 // food | mat | energy
    this.x = x; this.z = z;
    this.y = game.terrain.heightAt(x, z);
    this.amount = amount;
    this.max = amount;
    this.depleted = false;
    this.dead = false;

    if(res === 'mat') this.mesh = rnd() < 0.72 ? makeTree(region, rnd) : makeRock(region, rnd);
    else if(res === 'energy') this.mesh = makeCrystal(rnd);
    else this.mesh = rnd() < 0.5 ? makeBerry(rnd) : makeTree(region, rnd);

    this.radius = res === 'energy' ? 2.0 : 1.6;
    this.mesh.position.set(x, this.y, z);
    this.mesh.userData.entity = this;
    game.scene.add(this.mesh);
    game.grid.block(x, z, this.radius*0.6, true);
  }
  deplete(){
    if(this.depleted) return;
    this.depleted = true; this.dead = true;
    this.game.fx.dust({x:this.x, y:this.y+0.5, z:this.z}, 0x9c8a72, 6);
    this.game.grid.block(this.x, this.z, this.radius*0.6, false);
    this.game.scene.remove(this.mesh);
    const i = this.game.nodes.indexOf(this);
    if(i >= 0) this.game.nodes.splice(i, 1);
  }
  damage(){ /* les gisements ne subissent pas de dégâts */ }
  center(out){ const v = out || new THREE.Vector3(); return v.set(this.x, this.y+1, this.z); }
}
