/* ============================================================
   Globe terrestre interactif du menu principal
   ============================================================ */
import * as THREE from 'three';
import { LANDMASSES, antarcticRing } from '../data/worldmap.js';

const TEX_W = 2048, TEX_H = 1024;

/* longitude/latitude → position sur la sphère (aligné sur l'UV de SphereGeometry) */
export function lonLatToVec3(lon, lat, r = 1){
  const u = (lon + 180) / 360;
  const v = (90 - lat) / 180;
  const phi = u * Math.PI * 2;
  const theta = v * Math.PI;
  return new THREE.Vector3(
    -r * Math.cos(phi) * Math.sin(theta),
     r * Math.cos(theta),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

function buildEarthTexture(){
  const c = document.createElement('canvas');
  c.width = TEX_W; c.height = TEX_H;
  const g = c.getContext('2d');

  // --- océan ---
  const grd = g.createLinearGradient(0, 0, 0, TEX_H);
  grd.addColorStop(0,   '#0a2036');
  grd.addColorStop(0.5, '#0d3352');
  grd.addColorStop(1,   '#0a2036');
  g.fillStyle = grd;
  g.fillRect(0, 0, TEX_W, TEX_H);

  // texture d'océan
  g.globalAlpha = 0.05;
  for(let i=0;i<2600;i++){
    const x = Math.random()*TEX_W, y = Math.random()*TEX_H;
    g.fillStyle = Math.random() > 0.5 ? '#5fd6ff' : '#03101c';
    g.fillRect(x, y, 2, 2);
  }
  g.globalAlpha = 1;

  const project = ([lon, lat])=>[ (lon + 180)/360*TEX_W, (90 - lat)/180*TEX_H ];

  const drawPoly = (poly, fill, stroke)=>{
    g.beginPath();
    poly.forEach((p, i)=>{
      const [x, y] = project(p);
      if(i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    });
    g.closePath();
    g.fillStyle = fill; g.fill();
    if(stroke){ g.strokeStyle = stroke; g.lineWidth = 2.5; g.stroke(); }
  };

  // --- terres ---
  for(const poly of LANDMASSES) drawPoly(poly, '#1d4a35', '#4fe0a0');
  drawPoly(antarcticRing(), '#d8ecf5', '#9fd8ff');

  // relief simplifié (granulation sur les terres)
  g.globalAlpha = 0.16;
  g.globalCompositeOperation = 'source-atop';
  for(let i=0;i<9000;i++){
    const x = Math.random()*TEX_W, y = Math.random()*TEX_H;
    g.fillStyle = Math.random() > 0.55 ? '#8fdc7a' : '#0d2a1c';
    g.fillRect(x, y, 3, 3);
  }
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;

  // --- graticule ---
  g.strokeStyle = 'rgba(120,200,255,.13)';
  g.lineWidth = 1;
  for(let lat=-75; lat<=75; lat+=15){
    const y = (90 - lat)/180*TEX_H;
    g.beginPath(); g.moveTo(0, y); g.lineTo(TEX_W, y); g.stroke();
  }
  for(let lon=-180; lon<=180; lon+=15){
    const x = (lon + 180)/360*TEX_W;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, TEX_H); g.stroke();
  }
  g.strokeStyle = 'rgba(120,220,255,.28)';
  g.lineWidth = 2;
  const eq = TEX_H/2;
  g.beginPath(); g.moveTo(0, eq); g.lineTo(TEX_W, eq); g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class Globe{
  constructor(canvas, regions, onPick){
    this.canvas = canvas;
    this.regions = regions;
    this.onPick = onPick;
    this.active = null;
    this.running = false;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    this.camera.position.set(0, 0.12, 4.35);
    this.camera.lookAt(0, 0, 0);

    const light = new THREE.DirectionalLight(0xffffff, 2.2);
    light.position.set(3, 2, 4);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0x5580bb, 0.9));

    this.root = new THREE.Group();
    this.scene.add(this.root);

    // --- planète ---
    const tex = buildEarthTexture();
    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 48),
      new THREE.MeshLambertMaterial({ map:tex })
    );
    this.root.add(this.earth);

    // --- atmosphère ---
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(1.14, 48, 32),
      new THREE.ShaderMaterial({
        side:THREE.BackSide, transparent:true, depthWrite:false,
        uniforms:{ uColor:{ value:new THREE.Color(0x4fb8ff) } },
        vertexShader:`varying vec3 vN; void main(){ vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader:`
          varying vec3 vN; uniform vec3 uColor;
          void main(){
            float i = pow(0.72 - dot(vN, vec3(0.0,0.0,1.0)), 2.6);
            gl_FragColor = vec4(uColor, clamp(i,0.0,1.0)*0.9);
          }`,
      })
    );
    this.scene.add(atmo);

    // --- anneau orbital ---
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.42, 0.004, 6, 96),
      new THREE.MeshBasicMaterial({ color:0x6fe6ff, transparent:true, opacity:0.35 })
    );
    ring.rotation.x = Math.PI/2.4;
    this.scene.add(ring);
    this.ring = ring;

    // --- marqueurs de régions ---
    this.markers = [];
    for(const r of regions){
      const pos = lonLatToVec3(r.lon, r.lat, 1.0);
      const grp = new THREE.Group();
      grp.position.copy(pos);
      grp.lookAt(pos.clone().multiplyScalar(2));

      const pin = new THREE.Mesh(
        new THREE.ConeGeometry(0.035, 0.14, 8),
        new THREE.MeshBasicMaterial({ color:0x6cf0ff })
      );
      pin.rotation.x = Math.PI/2;
      pin.position.z = 0.07;
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.05, 0.075, 20),
        new THREE.MeshBasicMaterial({ color:0x6cf0ff, transparent:true, opacity:0.55, side:THREE.DoubleSide })
      );
      halo.position.z = 0.012;
      grp.add(pin, halo);
      grp.userData.region = r;
      grp.userData.pin = pin; grp.userData.halo = halo;
      this.root.add(grp);
      this.markers.push(grp);
    }

    // --- interaction ---
    this.rot = { y: -0.4, x: 0.25 };
    this.autoRot = 0.06;
    this.drag = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.hover = null;
    this._bind();
    this.resize();

    // le canvas est masqué au premier rendu (menu display:none) : on suit sa taille
    if(window.ResizeObserver){
      this._ro = new ResizeObserver(()=>this.resize());
      this._ro.observe(canvas);
    }
  }

  _bind(){
    const c = this.canvas;
    c.addEventListener('pointerdown', e=>{
      this.drag = { x:e.clientX, y:e.clientY, moved:0 };
      c.setPointerCapture?.(e.pointerId);
    });
    c.addEventListener('pointermove', e=>{
      const r = c.getBoundingClientRect();
      this.pointer.x = ((e.clientX - r.left)/r.width)*2 - 1;
      this.pointer.y = -((e.clientY - r.top)/r.height)*2 + 1;
      if(this.drag){
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        this.rot.y += dx * 0.0065;
        this.rot.x = Math.max(-1.2, Math.min(1.2, this.rot.x + dy * 0.005));
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        this.drag.x = e.clientX; this.drag.y = e.clientY;
      }
    });
    c.addEventListener('pointerup', e=>{
      const wasDrag = this.drag && this.drag.moved > 6;
      this.drag = null;
      if(!wasDrag && this.hover && this.onPick) this.onPick(this.hover.userData.region);
    });
    c.addEventListener('pointerleave', ()=>{ this.drag = null; });
    window.addEventListener('resize', ()=>this.resize());
  }

  resize(){
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, r.width|0), h = Math.max(1, r.height|0);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w/h;
    this.camera.updateProjectionMatrix();
  }

  setActive(key){ this.active = key; }

  /* fait pivoter le globe pour centrer une région */
  focus(region){
    this.targetRot = { y: -(region.lon + 180) * Math.PI/180 - Math.PI/2, x: region.lat * Math.PI/180 * 0.85 };
  }

  start(){
    if(this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = ()=>{
      if(!this.running) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.last)/1000);
      this.last = now;
      this.update(dt, now/1000);
      this.renderer.render(this.scene, this.camera);
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }
  stop(){
    this.running = false;
    if(this._raf) cancelAnimationFrame(this._raf);
  }

  update(dt, t){
    if(this.targetRot){
      this.rot.y += (this.targetRot.y - this.rot.y) * Math.min(1, dt*3);
      this.rot.x += (this.targetRot.x - this.rot.x) * Math.min(1, dt*3);
      if(Math.abs(this.targetRot.y - this.rot.y) < 0.01) this.targetRot = null;
    } else if(!this.drag){
      this.rot.y += this.autoRot * dt;
    }
    this.root.rotation.y = this.rot.y;
    this.root.rotation.x = this.rot.x;
    this.ring.rotation.z += dt * 0.12;

    // survol
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.markers, true);
    let hovered = null;
    for(const h of hits){
      let o = h.object;
      while(o && !o.userData.region) o = o.parent;
      if(o){ hovered = o; break; }
    }
    // le marqueur doit être face à la caméra
    if(hovered){
      const wp = new THREE.Vector3();
      hovered.getWorldPosition(wp);
      if(wp.z < 0.05) hovered = null;
    }
    this.hover = hovered;
    this.canvas.style.cursor = hovered ? 'pointer' : (this.drag ? 'grabbing' : 'grab');

    for(const m of this.markers){
      const isActive = this.active === m.userData.region.key;
      const isHover = this.hover === m;
      const pulse = 1 + Math.sin(t*3 + m.position.x*4) * 0.18;
      const s = (isActive ? 1.55 : (isHover ? 1.3 : 1)) * pulse;
      m.userData.halo.scale.setScalar(s);
      m.userData.pin.scale.setScalar(isActive ? 1.45 : (isHover ? 1.2 : 1));
      const col = isActive ? 0xffc857 : (isHover ? 0xffffff : 0x6cf0ff);
      m.userData.pin.material.color.setHex(col);
      m.userData.halo.material.color.setHex(col);
      m.userData.halo.material.opacity = isActive ? 0.85 : 0.5;
    }
  }

  dispose(){
    this.stop();
    this.renderer.dispose();
  }
}
