/* ============================================================
   Terrain procédural : relief, colorisation, eau, sites de départ
   ============================================================ */
import * as THREE from 'three';

export const WORLD = 240;          // taille du carré de jeu (unités monde)
export const HALF = WORLD / 2;
export const SEG = 168;            // subdivisions du maillage
export const WATER_Y = 0;

/* ---------------------------------------------------- bruit */
export function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

class ValueNoise{
  constructor(seed){
    const rnd = mulberry32(seed);
    this.p = new Uint8Array(512);
    const perm = new Uint8Array(256);
    for(let i=0;i<256;i++) perm[i] = i;
    for(let i=255;i>0;i--){ const j = (rnd()*(i+1))|0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for(let i=0;i<512;i++) this.p[i] = perm[i & 255];
    this.g = new Float32Array(512);
    for(let i=0;i<512;i++) this.g[i] = rnd()*2-1;
  }
  _h(xi, yi){ return this.g[(this.p[(xi & 255)] + (yi & 255)) & 511]; }
  at(x, y){
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf);
    const a = this._h(xi, yi),   b = this._h(xi+1, yi);
    const c = this._h(xi, yi+1), d = this._h(xi+1, yi+1);
    return (a + (b-a)*u) + ((c + (d-c)*u) - (a + (b-a)*u)) * v;
  }
  fbm(x, y, oct=4, lac=2.03, gain=0.5){
    let s = 0, amp = 1, f = 1, norm = 0;
    for(let i=0;i<oct;i++){ s += this.at(x*f, y*f) * amp; norm += amp; amp *= gain; f *= lac; }
    return s / norm;
  }
  ridged(x, y, oct=4){
    let s = 0, amp = 1, f = 1, norm = 0;
    for(let i=0;i<oct;i++){ s += (1 - Math.abs(this.at(x*f, y*f))) * amp; norm += amp; amp *= 0.5; f *= 2.07; }
    return s / norm * 2 - 1;
  }
}

/* ---------------------------------------------------- terrain */
export class Terrain{
  constructor(region, seed = 1337){
    this.region = region;
    this.seed = seed;
    this.rnd = mulberry32(seed ^ 0x9e3779b9);
    this.noise = new ValueNoise(seed);
    this.n = SEG;
    this.step = WORLD / SEG;
    this.h = new Float32Array((SEG+1) * (SEG+1));
    this._flats = [];
    this._generate();
  }

  /* --- profil de relief propre à chaque région --- */
  _profile(x, z){
    const r = this.region, N = this.noise;
    const s = 0.016;
    const nx = x * s, nz = z * s;
    const edge = Math.max(Math.abs(x), Math.abs(z)) / HALF;      // 0 centre → 1 bord
    let h = 0;

    switch(r.key){
      case 'himalaya':{
        h = N.ridged(nx*0.9, nz*0.9, 5) * 15 + N.fbm(nx*2.4, nz*2.4, 4) * 4.5;
        h += 5;
        break;
      }
      case 'pacific':{
        const isl = N.fbm(nx*0.85, nz*0.85, 4);
        const cluster = Math.max(
          1 - Math.hypot(x-52, z-46)/62,
          1 - Math.hypot(x+56, z+50)/62,
          1 - Math.hypot(x-58, z+54)/54,
          1 - Math.hypot(x+50, z-52)/54,
          1 - Math.hypot(x, z)/70,
        );
        h = (isl*0.55 + Math.max(0, cluster)*1.35 - 0.42) * 26;
        h += N.fbm(nx*3.4, nz*3.4, 3) * 1.6;
        break;
      }
      case 'sahara':{
        h = N.fbm(nx*0.8, nz*0.8, 3) * 5.5;
        h += Math.sin(x*0.09 + N.at(nx*0.6, nz*0.6)*2.4) * 2.6;   // crêtes de dunes
        h += N.fbm(nx*3.2, nz*3.2, 3) * 1.1 + 3.2;
        break;
      }
      case 'arctic':{
        h = N.fbm(nx*0.75, nz*0.75, 4) * 6.5 + 2.4;
        h += N.ridged(nx*2.2, nz*2.2, 3) * 1.3;
        break;
      }
      case 'amazonia':{
        h = N.fbm(nx*0.9, nz*0.9, 5) * 7.5 + 3.0;
        const river = Math.abs(N.at(nx*0.5, nz*0.5 + 4.2));       // méandres
        if(river < 0.09) h -= (0.09 - river) * 58;
        break;
      }
      default:{ // europe
        h = N.fbm(nx*0.85, nz*0.85, 5) * 8.5 + 2.6;
        const river = Math.abs(N.at(nx*0.42 + 8.3, nz*0.42));
        if(river < 0.055) h -= (0.055 - river) * 62;
      }
    }

    h *= (this.region.roughness || 1) * 0.9;
    // adoucir vers les bords pour éviter les murs verticaux au bord du monde
    h *= 1 - Math.pow(Math.max(0, edge - 0.86) / 0.14, 2) * 0.35;
    return h;
  }

  _generate(){
    const n = SEG;
    for(let j=0;j<=n;j++){
      for(let i=0;i<=n;i++){
        const x = -HALF + i * this.step;
        const z = -HALF + j * this.step;
        this.h[j*(n+1)+i] = this._profile(x, z);
      }
    }
    this._pickStartSites();
    this.buildMesh();
  }

  idx(i, j){
    const n = SEG;
    i = i < 0 ? 0 : (i > n ? n : i);
    j = j < 0 ? 0 : (j > n ? n : j);
    return j*(n+1)+i;
  }

  /* hauteur interpolée en tout point du monde */
  heightAt(x, z){
    const fx = (x + HALF) / this.step, fz = (z + HALF) / this.step;
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const a = this.h[this.idx(i, j)],   b = this.h[this.idx(i+1, j)];
    const c = this.h[this.idx(i, j+1)], d = this.h[this.idx(i+1, j+1)];
    return (a + (b-a)*tx) * (1-tz) + (c + (d-c)*tx) * tz;
  }

  slopeAt(x, z){
    const d = 2.2;
    const hx = this.heightAt(x+d, z) - this.heightAt(x-d, z);
    const hz = this.heightAt(x, z+d) - this.heightAt(x, z-d);
    return Math.hypot(hx, hz) / (2*d);
  }

  isLand(x, z){ return this.heightAt(x, z) > WATER_Y + 0.55; }
  isBuildable(x, z){ return this.isLand(x, z) && this.slopeAt(x, z) < 0.42; }

  /* aplanit une zone (sites de départ, poses de bâtiments) */
  flatten(cx, cz, radius, blend = 1.6){
    const n = SEG;
    const target = this.heightAt(cx, cz);
    const i0 = Math.max(0, Math.floor((cx - radius - blend + HALF)/this.step));
    const i1 = Math.min(n, Math.ceil((cx + radius + blend + HALF)/this.step));
    const j0 = Math.max(0, Math.floor((cz - radius - blend + HALF)/this.step));
    const j1 = Math.min(n, Math.ceil((cz + radius + blend + HALF)/this.step));
    for(let j=j0;j<=j1;j++){
      for(let i=i0;i<=i1;i++){
        const x = -HALF + i*this.step, z = -HALF + j*this.step;
        const d = Math.hypot(x-cx, z-cz);
        if(d > radius + blend) continue;
        const t = d <= radius ? 1 : 1 - (d - radius)/blend;
        const k = this.idx(i, j);
        this.h[k] = this.h[k]*(1-t) + target*t;
      }
    }
    return target;
  }

  /* --- recherche de plateaux dégagés pour les bases --- */
  _pickStartSites(){
    const cand = [];
    const R = HALF - 34;
    for(let a=0;a<64;a++){
      const ang = (a/64) * Math.PI*2;
      for(const rad of [R, R*0.78, R*0.56]){
        const x = Math.cos(ang)*rad, z = Math.sin(ang)*rad;
        if(this.heightAt(x, z) < WATER_Y + 1.4) continue;
        // qualité = platitude moyenne autour
        let bad = 0;
        for(let k=0;k<12;k++){
          const aa = k/12*Math.PI*2;
          const px = x + Math.cos(aa)*11, pz = z + Math.sin(aa)*11;
          if(this.heightAt(px, pz) < WATER_Y + 0.8) bad += 2;
          bad += this.slopeAt(px, pz);
        }
        cand.push({x, z, ang, score:bad});
      }
    }
    cand.sort((p,q)=>p.score - q.score);
    // sélectionne jusqu'à 4 sites bien séparés angulairement
    const picked = [];
    for(const c of cand){
      if(picked.length >= 4) break;
      if(picked.every(p=>{
        let d = Math.abs(p.ang - c.ang) % (Math.PI*2);
        if(d > Math.PI) d = Math.PI*2 - d;
        return d > 1.15 && Math.hypot(p.x-c.x, p.z-c.z) > 70;
      })) picked.push(c);
    }
    while(picked.length < 4){
      const ang = picked.length / 4 * Math.PI * 2 + 0.6;
      picked.push({x:Math.cos(ang)*(HALF-42), z:Math.sin(ang)*(HALF-42), ang, score:99});
    }
    this.startSites = picked.slice(0, 4);
    for(const s of this.startSites) s.y = this.flatten(s.x, s.z, 15, 9);
  }

  /* ---------------------------------------------------- maillage */
  buildMesh(){
    const n = SEG;
    const geo = new THREE.PlaneGeometry(WORLD, WORLD, n, n);
    geo.rotateX(-Math.PI/2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const pal = this.region.palette;
    const cLow = new THREE.Color(pal.low), cMid = new THREE.Color(pal.mid);
    const cHigh = new THREE.Color(pal.high), cRock = new THREE.Color(pal.rock);
    const cSand = new THREE.Color(pal.key === 'arctic' ? 0xdfeaf5 : 0xc9b183);
    const tmp = new THREE.Color();

    for(let j=0;j<=n;j++){
      for(let i=0;i<=n;i++){
        const k = j*(n+1)+i;
        const y = this.h[k];
        pos.setY(k, y);
        const x = -HALF + i*this.step, z = -HALF + j*this.step;
        const sl = this.slopeAt(x, z);
        const t = Math.max(0, Math.min(1, (y - 1) / 15));
        if(t < 0.42) tmp.copy(cLow).lerp(cMid, t/0.42);
        else tmp.copy(cMid).lerp(cHigh, (t-0.42)/0.58);
        if(sl > 0.34) tmp.lerp(cRock, Math.min(1, (sl-0.34)*1.7));
        if(y < 1.4) tmp.lerp(cSand, Math.max(0, Math.min(1, (1.4-y)/1.6)));
        // granulation
        const g = 0.94 + this.noise.at(x*0.55, z*0.55)*0.09;
        colors[k*3] = tmp.r*g; colors[k*3+1] = tmp.g*g; colors[k*3+2] = tmp.b*g;
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshLambertMaterial({ vertexColors:true, flatShading:true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    this.mesh.userData.pickGround = true;

    // eau
    const wgeo = new THREE.PlaneGeometry(WORLD*1.9, WORLD*1.9, 1, 1);
    wgeo.rotateX(-Math.PI/2);
    this.waterMat = new THREE.ShaderMaterial({
      transparent:true,
      uniforms:{
        uTime:{value:0},
        uColor:{value:new THREE.Color(pal.water)},
        uFoam:{value:new THREE.Color(0xbfe9ff)},
      },
      vertexShader:`
        varying vec2 vUv; varying vec3 vW; uniform float uTime;
        void main(){
          vUv = uv * 60.0; vec3 p = position;
          p.y += sin(position.x*0.25 + uTime*1.4)*0.16 + cos(position.z*0.31 + uTime*1.1)*0.14;
          vW = (modelMatrix*vec4(p,1.0)).xyz;
          gl_Position = projectionMatrix*modelViewMatrix*vec4(p,1.0);
        }`,
      fragmentShader:`
        varying vec2 vUv; varying vec3 vW; uniform float uTime; uniform vec3 uColor, uFoam;
        void main(){
          float w = sin(vUv.x*3.0 + uTime*1.6) * cos(vUv.y*2.4 - uTime*1.2);
          float sp = smoothstep(0.72, 1.0, w);
          vec3 c = mix(uColor, uFoam, sp*0.34);
          gl_FragColor = vec4(c, 0.86);
        }`,
    });
    this.water = new THREE.Mesh(wgeo, this.waterMat);
    this.water.position.y = WATER_Y;
    this.water.renderOrder = -1;
  }

  update(t){ if(this.waterMat) this.waterMat.uniforms.uTime.value = t; }

  /* met à jour le maillage après aplanissement local (pose de bâtiment) */
  refreshMeshRegion(){
    const pos = this.mesh.geometry.attributes.position;
    for(let k=0;k<this.h.length;k++) pos.setY(k, this.h[k]);
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }

  addTo(scene){ scene.add(this.mesh); scene.add(this.water); }
}
