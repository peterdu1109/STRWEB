/* ============================================================
   Directeur de l'invasion extraterrestre
   Une troisième force, hostile à tout le monde, s'abat sur la Terre.
   ============================================================ */
import * as THREE from 'three';
import { Unit, Building } from './entities.js';
import { ALIEN, AGES } from '../data/gamedata.js';
import { makeMeteor, makeHive } from '../models/factory.js';
import { HALF } from '../world/terrain.js';

export class AlienDirector{
  constructor(game, mode = 1){
    this.game = game;
    this.mode = mode;                 // 0 aucune, 1 progressive, 2 cataclysme
    this.p = game.alienPlayer;
    this.wave = 0;
    this.threat = 0;
    this.pending = [];
    this.hives = [];
    this.announced = false;
    this.next = mode === 2 ? ALIEN.firstWaveAt * 0.45 : ALIEN.firstWaveAt;
    this.warned = false;
    this.spawnTick = 0;
  }

  get active(){ return this.mode > 0; }

  /* -------------------------------------------------- boucle */
  update(dt){
    if(!this.active) return;
    const g = this.game;

    // niveau de menace : temps + avancement technologique des joueurs
    const maxAge = Math.max(...g.players.filter(p=>p.id !== 99).map(p=>p.age));
    const paceMul = this.mode === 2 ? 1.9 : 1;
    this.threat = Math.min(1, (g.time / 900) * paceMul * 0.6 + (maxAge / 6) * 0.4);
    this.p.age = Math.max(1, Math.min(AGES.length-1, Math.round(maxAge * 0.85 + this.threat * 1.6)));
    g.emit('threat', this.threat);

    // impacts programmés
    for(let i=this.pending.length-1;i>=0;i--){
      const m = this.pending[i];
      m.t -= dt;
      if(m.mesh){
        m.mesh.position.y = m.y0 * Math.max(0, m.t / m.dur) ** 1.5 + m.groundY + 1.2;
        m.mesh.rotation.x += dt*3; m.mesh.rotation.z += dt*2.2;
      }
      if(m.t <= 0){
        this._impact(m);
        this.pending.splice(i, 1);
      }
    }

    // production continue des nids
    if(this.hives.length){
      this.spawnTick -= dt;
      if(this.spawnTick <= 0){
        this.spawnTick = Math.max(5, 14 - this.threat*8);
        for(const h of this.hives){
          if(h.dead) continue;
          const key = Math.random() < 0.28 && this.p.age >= 3 ? 'xtitan' : (Math.random() < 0.45 ? 'xspitter' : 'xgrunt');
          this._spawnUnit(key, h.x, h.z, 5);
        }
      }
      this.hives = this.hives.filter(h=>!h.dead);
    }

    // ordres : les xénos convergent vers ce qui est proche
    this.orderTick = (this.orderTick || 0) - dt;
    if(this.orderTick <= 0){
      this.orderTick = 3.2;
      this._commandSwarm();
    }

    // vague suivante
    this.next -= dt;
    if(!this.warned && this.next < 18 && this.wave > 0){
      this.warned = true;
      g.emit('alert', {kind:'bad', title:'Signaux orbitaux', text:'De nouvelles signatures xéno entrent dans l\'atmosphère.'});
    }
    if(this.next <= 0){
      this.warned = false;
      this.launchWave();
      const base = this.mode === 2 ? ALIEN.waveInterval*0.6 : ALIEN.waveInterval;
      this.next = Math.max(52, base - this.wave*6);
    }
  }

  /* -------------------------------------------------- vagues */
  launchWave(){
    const g = this.game;
    this.wave++;
    const mult = this.mode === 2 ? 1.8 : 1;
    const count = Math.round((2 + this.wave*1.35) * mult);
    const strikes = Math.min(5, 1 + Math.floor(this.wave/2));

    if(!this.announced){
      this.announced = true;
      g.emit('banner', {
        title:'CONTACT XÉNO',
        text:"Des corps non identifiés percent l'atmosphère terrestre. Ils n'appartiennent à aucune nation.",
      });
      g.emit('alert', {kind:'bad', title:'ALERTE', text:"L'Essaim Zaal'Ki a franchi l'orbite basse."});
    } else {
      g.emit('alert', {kind:'bad', title:`Vague xéno n°${this.wave}`, text:`${count} organismes détectés en approche.`});
    }
    g.audio.play('alien', 1);
    g.audio.tension = Math.min(1, 0.35 + this.threat*0.65);

    for(let i=0;i<strikes;i++){
      const spot = this._pickImpact();
      this._dropMeteor(spot.x, spot.z, Math.ceil(count/strikes), i*0.5);
    }

    // nid à partir de la 3e vague (2e en cataclysme)
    const hiveWave = this.mode === 2 ? 2 : 3;
    if(this.wave >= hiveWave && this.hives.length < 1 + Math.floor(this.wave/4)){
      const spot = this._pickImpact(true);
      this._dropMeteor(spot.x, spot.z, 2, 1.2, true);
    }
  }

  _pickImpact(forHive){
    const g = this.game;
    // cible : à proximité (mais pas au cœur) d'une base joueur, ou au hasard
    const targets = g.players.filter(p=>p.id !== 99 && !p.defeated && p.buildings.length);
    for(let i=0;i<50;i++){
      let x, z;
      if(targets.length && Math.random() < (forHive ? 0.5 : 0.75)){
        const t = targets[(Math.random()*targets.length)|0];
        const b = t.buildings[(Math.random()*t.buildings.length)|0];
        const a = Math.random()*Math.PI*2;
        const d = forHive ? 46 + Math.random()*30 : 26 + Math.random()*26;
        x = b.x + Math.cos(a)*d; z = b.z + Math.sin(a)*d;
      } else {
        x = (Math.random()*2-1)*(HALF-16); z = (Math.random()*2-1)*(HALF-16);
      }
      if(Math.abs(x) > HALF-10 || Math.abs(z) > HALF-10) continue;
      if(!g.terrain.isLand(x, z)) continue;
      if(forHive && !g.canPlaceAt('barracks', x, z)) continue;
      return {x, z};
    }
    return {x:0, z:0};
  }

  _dropMeteor(x, z, count, delay = 0, hive = false){
    const g = this.game;
    const groundY = g.terrain.heightAt(x, z);
    const mesh = makeMeteor();
    mesh.position.set(x, groundY + 120, z);
    mesh.scale.setScalar(hive ? 1.9 : 1);
    g.scene.add(mesh);
    const dur = 2.2 + delay;
    g.fx.pillar({x, y:groundY, z}, hive ? 0xff3fd0 : 0xb14dff, dur);
    this.pending.push({ x, z, t:dur, dur, mesh, y0:120, groundY, count, hive });
    g.emit('meteor', {x, z});
  }

  _impact(m){
    const g = this.game;
    if(m.mesh) g.scene.remove(m.mesh);
    const y = g.terrain.heightAt(m.x, m.z);
    g.fx.boom({x:m.x, y:y+1, z:m.z}, m.hive ? 5 : 3.2, 0xd44dff, m.hive ? 34 : 20);
    g.fx.dust({x:m.x, y:y+0.5, z:m.z}, 0x7a5f8a, 14);
    g.audio.play('boom', 1);
    g.shakeAt(m.x, m.z, m.hive ? 1.8 : 1.1);

    // dégâts de l'impact
    for(const u of g.units){
      if(u.dead || u.player === this.p) continue;
      const d = Math.hypot(u.x-m.x, u.z-m.z);
      if(d < 7) u.damage(90 * (1 - d/7), { player:this.p, siege:1 });
    }

    if(m.hive){
      const h = new Building(g, this.p, 'barracks', m.x, m.z, true);
      h.isHive = true;
      // habillage « ruche »
      g.scene.remove(h.mesh);
      const hv = makeHive(this.p.colors);
      hv.position.copy(h.mesh.position);
      hv.userData.entity = h;
      g.scene.add(hv);
      h.mesh = hv;
      h.maxHp *= 2.4; h.hp = h.maxHp;
      this.hives.push(h);
      g.emit('banner', { title:'RUCHE ÉTABLIE', text:"Une structure xéno s'est implantée. Détruisez-la avant qu'elle ne prolifère." });
      g.emit('alert', {kind:'bad', title:'Ruche Zaal\'Ki', text:'Une ruche produit désormais des organismes en continu.'});
    }

    for(let i=0;i<m.count;i++){
      const key = this._pickUnitKey();
      this._spawnUnit(key, m.x, m.z, 6);
    }
  }

  _pickUnitKey(){
    const r = Math.random();
    if(this.p.age >= 3 && r < 0.18 + this.threat*0.16) return 'xtitan';
    if(this.p.age >= 1 && r < 0.55) return 'xspitter';
    return 'xgrunt';
  }

  _spawnUnit(key, x, z, radius){
    const g = this.game;
    const spot = g.freeSpotAround(x, z, radius);
    const u = new Unit(g, this.p, key, spot.x, spot.z);
    u.aggro = true;
    g.fx.spark({x:spot.x, y:u.y+1, z:spot.z}, 0xd06bff, 6, 0.8);
    return u;
  }

  /* -------------------------------------------------- comportement de l'essaim */
  _commandSwarm(){
    const g = this.game;
    const swarm = this.p.units.filter(u=>!u.dead && (u.state === 'idle' || !u.state));
    if(!swarm.length) return;
    for(const u of swarm){
      const t = this._nearestPrey(u);
      if(t) u.attackEntity(t);
    }
  }

  _nearestPrey(u){
    const g = this.game;
    let best = null, bestD = Infinity;
    for(const o of g.units){
      if(o.dead || o.player === this.p) continue;
      const d = (o.x-u.x)**2 + (o.z-u.z)**2;
      if(d < bestD && d < 120*120){ bestD = d; best = o; }
    }
    if(best && bestD < 55*55) return best;
    for(const b of g.buildings){
      if(b.dead || b.player === this.p) continue;
      const d = (b.x-u.x)**2 + (b.z-u.z)**2;
      if(d < bestD){ bestD = d; best = b; }
    }
    return best;
  }
}
