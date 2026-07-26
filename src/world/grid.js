/* ============================================================
   Grille de navigation + A* (avec lissage de chemin)
   ============================================================ */
import { WORLD, HALF, WATER_Y } from './terrain.js';

const CELL = 2;
const N = Math.round(WORLD / CELL);

class Heap{
  constructor(){ this.a = []; }
  get size(){ return this.a.length; }
  push(node){
    const a = this.a; a.push(node); let i = a.length-1;
    while(i > 0){ const p = (i-1)>>1; if(a[p].f <= a[i].f) break; [a[p],a[i]] = [a[i],a[p]]; i = p; }
  }
  pop(){
    const a = this.a, top = a[0], last = a.pop();
    if(a.length){ a[0] = last; let i = 0;
      for(;;){ const l = i*2+1, r = l+1; let m = i;
        if(l < a.length && a[l].f < a[m].f) m = l;
        if(r < a.length && a[r].f < a[m].f) m = r;
        if(m === i) break; [a[m],a[i]] = [a[i],a[m]]; i = m;
      }
    }
    return top;
  }
}

export class NavGrid{
  constructor(terrain){
    this.terrain = terrain;
    this.n = N; this.cell = CELL;
    this.terrainBlock = new Uint8Array(N*N);   // eau / pente
    this.staticBlock = new Uint8Array(N*N);    // bâtiments, ressources
    this.cost = new Float32Array(N*N);         // surcoût de terrain (pentes douces)
    this._g = new Float32Array(N*N);
    this._came = new Int32Array(N*N);
    this._stamp = new Int32Array(N*N);
    this._mark = 0;
    this.rebuildTerrain();
  }

  toCell(v){ return Math.max(0, Math.min(N-1, Math.floor((v + HALF) / CELL))); }
  toWorld(c){ return -HALF + (c + 0.5) * CELL; }
  index(cx, cz){ return cz * N + cx; }

  rebuildTerrain(){
    const t = this.terrain;
    for(let j=0;j<N;j++){
      for(let i=0;i<N;i++){
        const x = this.toWorld(i), z = this.toWorld(j);
        const h = t.heightAt(x, z);
        const s = t.slopeAt(x, z);
        const k = j*N+i;
        this.terrainBlock[k] = (h < WATER_Y + 0.6 || s > 0.72) ? 1 : 0;
        this.cost[k] = 1 + Math.min(2.2, s * 2.4);
      }
    }
  }

  /* --- occupation statique --- */
  block(x, z, radius, on = true){
    const c0 = this.toCell(x - radius), c1 = this.toCell(x + radius);
    const r0 = this.toCell(z - radius), r1 = this.toCell(z + radius);
    for(let j=r0;j<=r1;j++) for(let i=c0;i<=c1;i++){
      const wx = this.toWorld(i), wz = this.toWorld(j);
      if(Math.hypot(wx-x, wz-z) <= radius + CELL*0.35) this.staticBlock[j*N+i] = on ? 1 : 0;
    }
  }

  blocked(cx, cz){ const k = cz*N+cx; return this.terrainBlock[k] || this.staticBlock[k]; }
  walkableWorld(x, z){
    if(x < -HALF || x > HALF || z < -HALF || z > HALF) return false;
    return !this.blocked(this.toCell(x), this.toCell(z));
  }

  /* cellule libre la plus proche */
  nearestFree(x, z, maxR = 26){
    if(this.walkableWorld(x, z)) return {x, z};
    const cx = this.toCell(x), cz = this.toCell(z);
    for(let r=1;r<maxR;r++){
      for(let d=-r;d<=r;d++){
        const cand = [[cx+d, cz-r],[cx+d, cz+r],[cx-r, cz+d],[cx+r, cz+d]];
        for(const [i,j] of cand){
          if(i<0||j<0||i>=N||j>=N) continue;
          if(!this.blocked(i,j)) return {x:this.toWorld(i), z:this.toWorld(j)};
        }
      }
    }
    return {x, z};
  }

  /* ------------------------------------------------ A* */
  findPath(sx, sz, tx, tz, maxNodes = 5200){
    const s = this.nearestFree(sx, sz);
    let scx = this.toCell(s.x), scz = this.toCell(s.z);
    let tcx = this.toCell(tx), tcz = this.toCell(tz);
    if(this.blocked(tcx, tcz)){
      const f = this.nearestFree(tx, tz, 18);
      tcx = this.toCell(f.x); tcz = this.toCell(f.z);
    }
    if(scx === tcx && scz === tcz) return [{x:tx, z:tz}];

    const start = this.index(scx, scz), goal = this.index(tcx, tcz);
    this._mark++;
    const mark = this._mark;
    const open = new Heap();
    this._g[start] = 0; this._came[start] = -1; this._stamp[start] = mark;
    open.push({i:start, f:0});
    let found = false, expanded = 0;

    const hx = (i)=>{ const ax = i % N, az = (i / N)|0; return (Math.abs(ax-tcx) + Math.abs(az-tcz)) * 1.02; };

    while(open.size && expanded < maxNodes){
      const cur = open.pop();
      if(cur.i === goal){ found = true; break; }
      expanded++;
      const ci = cur.i % N, cj = (cur.i / N)|0;
      const gc = this._g[cur.i];
      for(let dj=-1;dj<=1;dj++){
        for(let di=-1;di<=1;di++){
          if(!di && !dj) continue;
          const ni = ci+di, nj = cj+dj;
          if(ni<0||nj<0||ni>=N||nj>=N) continue;
          const k = nj*N+ni;
          if(this.terrainBlock[k] || this.staticBlock[k]) continue;
          if(di && dj){ // pas de coupe de coin
            if(this.blocked(ci+di, cj) || this.blocked(ci, cj+dj)) continue;
          }
          const step = (di && dj ? 1.4142 : 1) * this.cost[k];
          const ng = gc + step;
          if(this._stamp[k] === mark && ng >= this._g[k]) continue;
          this._stamp[k] = mark; this._g[k] = ng; this._came[k] = cur.i;
          open.push({i:k, f:ng + hx(k)});
        }
      }
    }

    // reconstitution (au pire : meilleur nœud atteint)
    let end = goal;
    if(!found){
      let best = -1, bestScore = Infinity;
      for(let k=0;k<N*N;k++){
        if(this._stamp[k] !== mark) continue;
        const sc = this._g[k]*0.35 + hx(k);
        if(sc < bestScore){ bestScore = sc; best = k; }
      }
      if(best < 0) return null;
      end = best;
    }
    const cells = [];
    let cur = end, guard = 0;
    while(cur !== -1 && guard++ < 9000){ cells.push(cur); cur = this._came[cur]; }
    cells.reverse();

    // conversion + lissage par visibilité
    const pts = cells.map(k=>({x:this.toWorld(k % N), z:this.toWorld((k / N)|0)}));
    if(found && pts.length) pts[pts.length-1] = {x:tx, z:tz};
    return this.smooth(pts);
  }

  lineFree(x0, z0, x1, z1){
    const d = Math.hypot(x1-x0, z1-z0);
    const steps = Math.ceil(d / (CELL*0.7));
    for(let i=1;i<steps;i++){
      const t = i/steps;
      if(!this.walkableWorld(x0 + (x1-x0)*t, z0 + (z1-z0)*t)) return false;
    }
    return true;
  }

  smooth(pts){
    if(pts.length <= 2) return pts;
    const out = [pts[0]];
    let i = 0;
    while(i < pts.length - 1){
      let j = pts.length - 1;
      for(; j > i+1; j--){ if(this.lineFree(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) break; }
      out.push(pts[j]); i = j;
    }
    out.shift();
    return out;
  }
}
