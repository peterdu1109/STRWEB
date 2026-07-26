/* ============================================================
   Effets visuels : projectiles, explosions, étincelles, rayons
   ============================================================ */
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class FX{
  constructor(scene){
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.frustumCulled = false;
    scene.add(this.root);
    this.items = [];
    this.pool = { sphere:[], box:[] };

    this.geoSphere = new THREE.SphereGeometry(1, 7, 5);
    this.geoBox = new THREE.BoxGeometry(1, 1, 1);
    this.geoRing = new THREE.RingGeometry(0.72, 1, 22);
    this.geoRing.rotateX(-Math.PI/2);
  }

  _get(kind, color, opacity = 1){
    const arr = this.pool[kind];
    let m = arr.pop();
    if(!m){
      m = new THREE.Mesh(kind === 'sphere' ? this.geoSphere : this.geoBox,
        new THREE.MeshBasicMaterial({ transparent:true, depthWrite:false }));
      m.frustumCulled = false;
    }
    m.material.color.setHex(color);
    m.material.opacity = opacity;
    m.visible = true;
    m.scale.setScalar(1);
    m.rotation.set(0,0,0);
    this.root.add(m);
    return m;
  }
  _free(kind, m){ this.root.remove(m); this.pool[kind].push(m); }

  /* ------------------------------------------------ projectiles */
  shot(from, to, opt = {}){
    const kind = opt.kind || 'bullet';
    const color = opt.color !== undefined ? opt.color : 0xffe08a;
    const speed = opt.speed || (kind === 'arrow' ? 42 : (kind === 'shell' ? 40 : 130));
    const dist = Math.hypot(to.x-from.x, to.y-from.y, to.z-from.z);
    const life = Math.max(0.05, dist / speed);

    if(kind === 'beam'){
      this.beam(from, to, color, 0.14, opt.width || 0.13);
      return;
    }
    const m = this._get(kind === 'shell' || kind === 'plasma' ? 'sphere' : 'box', color, 1);
    if(kind === 'arrow'){ m.scale.set(0.06, 0.06, 0.8); }
    else if(kind === 'shell'){ m.scale.setScalar(0.28); }
    else if(kind === 'plasma'){ m.scale.setScalar(0.34); }
    else { m.scale.set(0.07, 0.07, 0.6); }
    m.position.set(from.x, from.y, from.z);
    m.lookAt(to.x, to.y, to.z);

    this.items.push({
      kind:'proj', m, t:0, life,
      from:{x:from.x, y:from.y, z:from.z}, to:{x:to.x, y:to.y, z:to.z},
      arc: kind === 'shell' || kind === 'arrow' ? Math.min(6, dist*0.18) : 0,
      mesh:kind === 'shell' || kind === 'plasma' ? 'sphere' : 'box',
      trail: kind === 'plasma' || kind === 'shell', color,
    });
  }

  beam(from, to, color, dur = 0.14, width = 0.12){
    const m = this._get('box', color, 0.95);
    const d = Math.hypot(to.x-from.x, to.y-from.y, to.z-from.z);
    m.position.set((from.x+to.x)/2, (from.y+to.y)/2, (from.z+to.z)/2);
    m.lookAt(to.x, to.y, to.z);
    m.scale.set(width, width, d);
    this.items.push({ kind:'beam', m, t:0, life:dur, mesh:'box' });
  }

  muzzle(pos, color = 0xffd68a, size = 0.5){
    const m = this._get('sphere', color, 0.95);
    m.position.set(pos.x, pos.y, pos.z);
    m.scale.setScalar(size);
    this.items.push({ kind:'flash', m, t:0, life:0.09, mesh:'sphere', s0:size });
  }

  /* ------------------------------------------------ explosions */
  boom(pos, scale = 1, color = 0xffa94d, sparks = 10){
    const m = this._get('sphere', color, 0.85);
    m.position.set(pos.x, pos.y, pos.z);
    m.scale.setScalar(scale*0.4);
    this.items.push({ kind:'boom', m, t:0, life:0.42, mesh:'sphere', s0:scale*0.4, s1:scale*2.3 });

    // onde de choc
    const ring = new THREE.Mesh(this.geoRing, new THREE.MeshBasicMaterial({
      color, transparent:true, opacity:0.7, depthWrite:false, side:THREE.DoubleSide,
    }));
    ring.position.set(pos.x, pos.y - 0.4, pos.z);
    ring.scale.setScalar(scale*0.6);
    this.root.add(ring);
    this.items.push({ kind:'ring', m:ring, t:0, life:0.5, s0:scale*0.6, s1:scale*3.4, dispose:true });

    this.spark(pos, color, sparks, scale);
  }

  spark(pos, color, count = 8, scale = 1){
    for(let i=0;i<count;i++){
      const m = this._get('box', color, 1);
      const s = (0.08 + Math.random()*0.13) * scale;
      m.scale.setScalar(s);
      m.position.set(pos.x, pos.y, pos.z);
      const a = Math.random()*Math.PI*2, e = Math.random()*1.1 + 0.2;
      const sp = (5 + Math.random()*9) * Math.sqrt(scale);
      this.items.push({
        kind:'spark', m, t:0, life:0.45 + Math.random()*0.5, mesh:'box',
        v:{ x:Math.cos(a)*Math.cos(e)*sp, y:Math.sin(e)*sp*1.35, z:Math.sin(a)*Math.cos(e)*sp },
        p:{ x:pos.x, y:pos.y, z:pos.z },
      });
    }
  }

  dust(pos, color = 0xbba98a, count = 5){
    for(let i=0;i<count;i++){
      const m = this._get('box', color, 0.55);
      m.scale.setScalar(0.16 + Math.random()*0.2);
      m.position.set(pos.x + (Math.random()-0.5), pos.y, pos.z + (Math.random()-0.5));
      this.items.push({
        kind:'spark', m, t:0, life:0.7 + Math.random()*0.5, mesh:'box',
        v:{ x:(Math.random()-0.5)*1.6, y:1.4 + Math.random()*1.4, z:(Math.random()-0.5)*1.6 },
        p:{ x:m.position.x, y:m.position.y, z:m.position.z },
      });
    }
  }

  /* marqueur d'ordre au sol */
  marker(pos, color = 0x6cf0ff){
    const ring = new THREE.Mesh(this.geoRing, new THREE.MeshBasicMaterial({
      color, transparent:true, opacity:0.9, depthWrite:false, side:THREE.DoubleSide,
    }));
    ring.position.set(pos.x, pos.y + 0.2, pos.z);
    ring.scale.setScalar(2.4);
    this.root.add(ring);
    this.items.push({ kind:'ring', m:ring, t:0, life:0.65, s0:2.4, s1:0.9, dispose:true });
  }

  /* colonne de lumière (arrivée xéno) */
  pillar(pos, color = 0xff5ad1, dur = 2.2){
    const m = this._get('box', color, 0.5);
    m.position.set(pos.x, pos.y + 30, pos.z);
    m.scale.set(2.6, 60, 2.6);
    this.items.push({ kind:'pillar', m, t:0, life:dur, mesh:'box' });
  }

  /* ------------------------------------------------ boucle */
  update(dt){
    const it = this.items;
    for(let i=it.length-1;i>=0;i--){
      const o = it[i];
      o.t += dt;
      const k = Math.min(1, o.t / o.life);

      switch(o.kind){
        case 'proj':{
          const p = o.m.position;
          p.x = o.from.x + (o.to.x-o.from.x)*k;
          p.y = o.from.y + (o.to.y-o.from.y)*k + (o.arc ? Math.sin(k*Math.PI)*o.arc : 0);
          p.z = o.from.z + (o.to.z-o.from.z)*k;
          if(o.arc) o.m.lookAt(o.to.x, o.to.y, o.to.z);
          if(o.trail && Math.random() < 0.5){
            const t = this._get('box', o.color, 0.55);
            t.scale.setScalar(0.14);
            t.position.copy(p);
            it.push({ kind:'fade', m:t, t:0, life:0.22, mesh:'box' });
          }
          break;
        }
        case 'beam':  o.m.material.opacity = 0.95 * (1-k); break;
        case 'flash': o.m.scale.setScalar(o.s0 * (1 + k*1.4)); o.m.material.opacity = 1-k; break;
        case 'fade':  o.m.material.opacity = 0.55 * (1-k); o.m.scale.multiplyScalar(0.94); break;
        case 'boom':
          o.m.scale.setScalar(o.s0 + (o.s1-o.s0)*Math.sqrt(k));
          o.m.material.opacity = 0.85 * (1-k*k);
          break;
        case 'ring':
          o.m.scale.setScalar(o.s0 + (o.s1-o.s0)*Math.sqrt(k));
          o.m.material.opacity = 0.7 * (1-k);
          break;
        case 'spark':{
          o.v.y -= 22 * dt;
          o.p.x += o.v.x*dt; o.p.y += o.v.y*dt; o.p.z += o.v.z*dt;
          o.m.position.set(o.p.x, o.p.y, o.p.z);
          o.m.rotation.x += dt*7; o.m.rotation.y += dt*5;
          o.m.material.opacity = 1-k;
          break;
        }
        case 'pillar':
          o.m.material.opacity = 0.5 * (1 - k) * (0.6 + 0.4*Math.sin(o.t*22));
          o.m.scale.x = o.m.scale.z = 2.6 * (1 + Math.sin(o.t*7)*0.12);
          break;
      }

      if(o.t >= o.life){
        if(o.dispose){ this.root.remove(o.m); o.m.material.dispose(); }
        else this._free(o.mesh || 'box', o.m);
        it.splice(i, 1);
      }
    }
  }

  clear(){
    for(const o of this.items){
      if(o.dispose){ this.root.remove(o.m); o.m.material.dispose(); }
      else this._free(o.mesh || 'box', o.m);
    }
    this.items.length = 0;
  }
}
