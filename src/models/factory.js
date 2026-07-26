/* ============================================================
   Fabrique de modèles 3D procéduraux
   Toutes les unités, structures et décors sont générés par code :
   aucun asset externe n'est nécessaire.
   ============================================================ */
import * as THREE from 'three';

/* ------------------------------------------------ caches */
const geoCache = new Map();
const matCache = new Map();

function G(key, make){ let g = geoCache.get(key); if(!g){ g = make(); geoCache.set(key, g); } return g; }
export function M(color, opt = {}){
  const key = `${color}|${opt.emissive||0}|${opt.ei||0}|${opt.flat!==false?1:0}|${opt.op||1}|${opt.metal||0}`;
  let m = matCache.get(key);
  if(!m){
    m = new THREE.MeshLambertMaterial({
      color, flatShading: opt.flat !== false,
      emissive: opt.emissive || 0x000000,
      emissiveIntensity: opt.ei !== undefined ? opt.ei : 1,
      transparent: opt.op !== undefined && opt.op < 1,
      opacity: opt.op !== undefined ? opt.op : 1,
    });
    matCache.set(key, m);
  }
  return m;
}
const box = (w,h,d)=>G(`b${w},${h},${d}`, ()=>new THREE.BoxGeometry(w,h,d));
const cyl = (rt,rb,h,s=8)=>G(`c${rt},${rb},${h},${s}`, ()=>new THREE.CylinderGeometry(rt,rb,h,s));
const sph = (r,s=8,t=6)=>G(`s${r},${s},${t}`, ()=>new THREE.SphereGeometry(r,s,t));
const cone = (r,h,s=6)=>G(`k${r},${h},${s}`, ()=>new THREE.ConeGeometry(r,h,s));
const tor = (r,t,s=6,q=10)=>G(`t${r},${t},${s},${q}`, ()=>new THREE.TorusGeometry(r,t,s,q));

function mesh(geo, mat, x=0, y=0, z=0){
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = false;
  return m;
}

/* ------------------------------------------------ palette d'unité */
function palette(colors, age, alien){
  const c = colors;
  const glow = age >= 5;
  return {
    main:  M(c.main),
    dark:  M(c.dark),
    skin:  M(alien ? c.accent : 0xd8a87a),
    metal: M(age >= 3 ? 0x9aa6b4 : (age >= 1 ? 0xb08d4f : 0x8a6a4a)),
    wood:  M(0x7a5533),
    glow:  M(c.accent, {emissive:c.accent, ei:glow ? 1.5 : 0.7}),
    dim:   M(0x2a3040),
  };
}

/* ============================================================
   HUMANOÏDE — base de toutes les unités à pied
   ============================================================ */
function humanoid(p, opt = {}){
  const g = new THREE.Group();
  const s = opt.scale || 1;
  const bulk = opt.bulk || 1;
  const torsoMat = opt.torsoMat || p.main;

  // bassin + torse
  const hips = mesh(box(0.62*bulk*s, 0.34*s, 0.42*bulk*s), p.dark, 0, 1.02*s, 0);
  const torso = mesh(box(0.78*bulk*s, 0.86*s, 0.5*bulk*s), torsoMat, 0, 1.62*s, 0);
  g.add(hips, torso);

  // épaulières
  if(opt.pads){
    g.add(mesh(box(0.26*s, 0.24*s, 0.56*s), p.metal, -0.5*bulk*s, 1.96*s, 0));
    g.add(mesh(box(0.26*s, 0.24*s, 0.56*s), p.metal,  0.5*bulk*s, 1.96*s, 0));
  }

  // tête + casque
  const head = mesh(sph(0.27*s, 7, 5), p.skin, 0, 2.28*s, 0);
  g.add(head);
  if(opt.helm){
    const h = mesh(opt.helm === 'visor' ? box(0.5*s,0.3*s,0.46*s) : sph(0.31*s, 7, 4), p.metal, 0, 2.34*s, 0);
    if(opt.helm === 'visor'){
      const v = mesh(box(0.34*s, 0.1*s, 0.06*s), p.glow, 0, 2.32*s, 0.24*s);
      g.add(v);
    }
    g.add(h);
  }
  if(opt.crest){
    const c = mesh(box(0.06*s, 0.22*s, 0.4*s), p.glow, 0, 2.58*s, 0);
    g.add(c);
  }

  // bras
  const armGeo = box(0.2*s, 0.72*s, 0.2*s);
  const armL = mesh(armGeo, p.main, -0.52*bulk*s, 1.62*s, 0);
  const armR = mesh(armGeo, p.main,  0.52*bulk*s, 1.62*s, 0);
  armL.geometry = armGeo; armR.geometry = armGeo;
  // pivot à l'épaule
  const pivL = new THREE.Group(); pivL.position.set(-0.52*bulk*s, 1.98*s, 0);
  const pivR = new THREE.Group(); pivR.position.set( 0.52*bulk*s, 1.98*s, 0);
  armL.position.set(0, -0.36*s, 0); armR.position.set(0, -0.36*s, 0);
  pivL.add(armL); pivR.add(armR);
  g.add(pivL, pivR);

  // jambes
  const legGeo = box(0.24*s, 0.86*s, 0.26*s);
  const hipL = new THREE.Group(); hipL.position.set(-0.2*bulk*s, 1.02*s, 0);
  const hipR = new THREE.Group(); hipR.position.set( 0.2*bulk*s, 1.02*s, 0);
  const legL = mesh(legGeo, p.dark, 0, -0.43*s, 0);
  const legR = mesh(legGeo, p.dark, 0, -0.43*s, 0);
  hipL.add(legL); hipR.add(legR);
  g.add(hipL, hipR);

  g.userData.anim = { armL:pivL, armR:pivR, legL:hipL, legR:hipR, torso, head, type:'walk' };
  return g;
}

/* ------------------------------------------------ armes */
function weapon(kind, p, s = 1){
  const w = new THREE.Group();
  switch(kind){
    case 'club':
      w.add(mesh(cyl(0.07*s,0.09*s,0.8*s,6), p.wood, 0, -0.1*s, 0));
      w.add(mesh(box(0.24*s,0.26*s,0.24*s), M(0x6b6f74), 0, 0.34*s, 0));
      break;
    case 'spear':
      w.add(mesh(cyl(0.045*s,0.045*s,1.5*s,6), p.wood, 0, 0.2*s, 0));
      w.add(mesh(cone(0.1*s,0.34*s,5), p.metal, 0, 1.05*s, 0));
      break;
    case 'sword':
      w.add(mesh(box(0.1*s,0.9*s,0.03*s), p.metal, 0, 0.42*s, 0));
      w.add(mesh(box(0.3*s,0.07*s,0.09*s), p.dark, 0, -0.03*s, 0));
      w.add(mesh(cyl(0.05*s,0.05*s,0.24*s,6), p.wood, 0, -0.18*s, 0));
      break;
    case 'musket':{
      w.add(mesh(box(0.09*s,0.16*s,1.05*s), p.wood, 0, 0, 0.2*s));
      const mb = mesh(cyl(0.035*s,0.035*s,0.85*s,6), M(0x4a4f57), 0, 0.08*s, 0.62*s);
      mb.rotation.x = Math.PI/2;
      w.add(mb);
      break;
    }
    case 'rifle':{
      const b = mesh(box(0.1*s,0.18*s,0.95*s), M(0x33383f), 0, 0, 0.24*s);
      const bar = mesh(cyl(0.032*s,0.032*s,0.7*s,6), M(0x555c66), 0, 0.03*s, 0.7*s); bar.rotation.x = Math.PI/2;
      const mag = mesh(box(0.08*s,0.24*s,0.12*s), M(0x2a2e34), 0, -0.18*s, 0.12*s);
      w.add(b, bar, mag);
      break;
    }
    case 'bow':{
      const arc = mesh(tor(0.42*s, 0.035*s, 5, 9), p.wood, 0, 0.2*s, 0);
      arc.rotation.y = Math.PI/2;
      w.add(arc);
      w.add(mesh(box(0.01*s,0.8*s,0.01*s), M(0xe8e0cf), -0.05*s, 0.2*s, 0));
      break;
    }
    case 'crossbow':{
      w.add(mesh(box(0.9*s,0.06*s,0.07*s), p.wood, 0, 0.2*s, 0));
      w.add(mesh(box(0.1*s,0.08*s,0.7*s), p.dark, 0, 0.16*s, 0.2*s));
      break;
    }
    case 'railgun':{
      const b = mesh(box(0.13*s,0.2*s,1.3*s), M(0x3b4250), 0, 0, 0.4*s);
      const rail = mesh(box(0.03*s,0.05*s,1.0*s), p.glow, 0.08*s, 0.13*s, 0.55*s);
      const rail2 = mesh(box(0.03*s,0.05*s,1.0*s), p.glow, -0.08*s, 0.13*s, 0.55*s);
      w.add(b, rail, rail2);
      break;
    }
    case 'plasma':{
      const b = mesh(box(0.16*s,0.22*s,0.9*s), M(0x2e3644), 0, 0, 0.3*s);
      const orb = mesh(sph(0.15*s, 8, 6), p.glow, 0, 0.04*s, 0.78*s);
      w.add(b, orb);
      break;
    }
    case 'blade':{
      const b = mesh(box(0.07*s,1.15*s,0.05*s), p.glow, 0, 0.55*s, 0);
      const h = mesh(box(0.11*s,0.24*s,0.11*s), M(0x2e3644), 0, -0.06*s, 0);
      w.add(b, h);
      break;
    }
    case 'pick':
      w.add(mesh(cyl(0.05*s,0.05*s,0.9*s,6), p.wood, 0, 0.05*s, 0));
      w.add(mesh(box(0.5*s,0.09*s,0.09*s), M(0x808892), 0, 0.5*s, 0));
      break;
    case 'claw':
      for(let i=0;i<3;i++){
        const c = mesh(cone(0.06*s, 0.5*s, 4), p.metal, (i-1)*0.12*s, 0.2*s, 0);
        c.rotation.x = 0.25 * (i-1);
        w.add(c);
      }
      break;
  }
  return w;
}

/* ------------------------------------------------ bouclier */
function shield(p, s){
  const g = new THREE.Group();
  g.add(mesh(box(0.08*s, 0.8*s, 0.62*s), p.main, 0, 0, 0));
  g.add(mesh(box(0.05*s, 0.3*s, 0.22*s), p.glow, 0.06*s, 0, 0));
  return g;
}

/* ============================================================
   UNITÉS
   ============================================================ */
export function makeUnit(role, age, colors, alien = false){
  const p = palette(colors, age, alien);
  let g;

  if(alien && (role === 'melee' || role === 'ranged' || role === 'heavy')){
    g = alienCreature(role, age, p, colors);
  } else {
    switch(role){
      case 'worker':  g = unitWorker(age, p); break;
      case 'melee':   g = unitMelee(age, p); break;
      case 'ranged':  g = unitRanged(age, p); break;
      case 'heavy':   g = unitHeavy(age, p, colors); break;
      case 'air':     g = unitAir(age, p, colors); break;
      default:        g = unitMelee(age, p);
    }
  }
  // les fantassins sont agrandis pour rester lisibles à la distance de jeu
  if(role === 'worker' || role === 'melee' || role === 'ranged') g.scale.setScalar(1.32);
  g.traverse(o=>{ if(o.isMesh){ o.castShadow = true; } });
  return g;
}

function unitWorker(age, p){
  const g = humanoid(p, {scale:0.92, helm: age >= 4 ? 'visor' : null, bulk: age >= 4 ? 1.08 : 1});
  const w = weapon(age >= 5 ? 'plasma' : 'pick', p, 0.85);
  w.position.set(0.5, 1.5, 0.15); w.rotation.set(0.4, 0, -0.4);
  g.add(w);
  if(age >= 4){ // sac technique
    g.add(mesh(box(0.42,0.5,0.22), p.dim, 0, 1.66, -0.34));
    g.add(mesh(sph(0.08,6,5), p.glow, 0, 1.86, -0.46));
  } else {
    g.add(mesh(box(0.42,0.4,0.24), p.wood, 0, 1.6, -0.34));
  }
  g.userData.carry = w;
  return g;
}

function unitMelee(age, p){
  const cfg = [
    {w:'club',  helm:null,   pads:false, bulk:1.0},
    {w:'spear', helm:'dome', pads:false, bulk:1.0},
    {w:'sword', helm:'dome', pads:true,  bulk:1.06, shield:true},
    {w:'musket',helm:'dome', pads:true,  bulk:1.04},
    {w:'rifle', helm:'visor',pads:true,  bulk:1.06},
    {w:'rifle', helm:'visor',pads:true,  bulk:1.12, crest:true},
    {w:'blade', helm:'visor',pads:true,  bulk:1.3,  crest:true, exo:true},
  ][Math.min(age, 6)];

  const g = humanoid(p, {scale: cfg.exo ? 1.22 : 1, helm:cfg.helm, pads:cfg.pads, bulk:cfg.bulk, crest:cfg.crest});
  const s = cfg.exo ? 1.2 : 1;
  const w = weapon(cfg.w, p, s);
  w.position.set(0.56*s, 1.5*s, 0.2*s);
  w.rotation.set(cfg.w === 'rifle' || cfg.w === 'musket' ? 0.05 : -0.3, 0, -0.25);
  g.add(w);
  if(cfg.shield){ const sh = shield(p, 1); sh.position.set(-0.62, 1.6, 0.1); g.add(sh); }
  if(cfg.exo){
    g.add(mesh(box(0.5,0.4,0.3), p.dim, 0, 2.05*1.22, -0.4));
    g.add(mesh(sph(0.11,6,5), p.glow, -0.2, 2.2*1.22, -0.5));
    g.add(mesh(sph(0.11,6,5), p.glow,  0.2, 2.2*1.22, -0.5));
  }
  g.userData.weapon = w;
  return g;
}

function unitRanged(age, p){
  const cfg = [
    {w:'bow',      helm:null},
    {w:'bow',      helm:'dome'},
    {w:'crossbow', helm:'dome'},
    {w:'musket',   helm:'dome'},
    {w:'rifle',    helm:'visor'},
    {w:'railgun',  helm:'visor'},
    {w:'plasma',   helm:'visor'},
  ][Math.min(age, 6)];
  const g = humanoid(p, {scale:0.98, helm:cfg.helm, pads: age >= 3, bulk:1});
  const w = weapon(cfg.w, p, 1);
  const twoHand = cfg.w !== 'bow';
  w.position.set(twoHand ? 0.3 : 0.45, 1.55, twoHand ? 0.16 : 0.1);
  w.rotation.set(0, twoHand ? 0 : 0, twoHand ? 0 : -0.1);
  g.add(w);
  if(age >= 5) g.add(mesh(box(0.36,0.44,0.2), p.dim, 0, 1.66, -0.32));
  g.userData.weapon = w;
  g.userData.muzzle = new THREE.Vector3(twoHand ? 0.3 : 0.45, 1.62, 1.0);
  return g;
}

function unitHeavy(age, p, colors){
  const g = new THREE.Group();
  const glowM = p.glow;
  if(age <= 3){
    // canon à vapeur : châssis bois + roues + tube
    g.add(mesh(box(2.0, 0.5, 2.8), p.wood, 0, 0.85, 0));
    const barrel = mesh(cyl(0.28, 0.34, 2.6, 10), M(0x4a4f57), 0, 1.3, 0.6);
    barrel.rotation.x = Math.PI/2 - 0.12;
    g.add(barrel);
    const wheels = [];
    for(const sx of [-1, 1]){
      for(const sz of [-1, 1]){
        const wl = mesh(cyl(0.62,0.62,0.26,12), p.dark, sx*1.05, 0.62, sz*0.95);
        wl.rotation.z = Math.PI/2; g.add(wl); wheels.push(wl);
      }
    }
    g.add(mesh(cyl(0.3,0.36,0.7,8), M(0x6b6f74), -0.7, 1.5, -0.9));
    g.userData.anim = {type:'wheels', wheels};
    g.userData.muzzle = new THREE.Vector3(0, 1.35, 2.0);
  } else if(age === 4){
    // char : chenilles + tourelle
    g.add(mesh(box(2.5, 0.7, 3.7), p.main, 0, 0.95, 0));
    g.add(mesh(box(2.9, 0.55, 3.4), p.dark, 0, 0.62, 0));
    for(const sx of [-1, 1]) g.add(mesh(box(0.5, 0.7, 3.6), M(0x33383f), sx*1.3, 0.62, 0));
    const turret = new THREE.Group();
    turret.position.set(0, 1.5, -0.15);
    turret.add(mesh(box(1.7, 0.6, 2.0), p.main, 0, 0, 0));
    const bar = mesh(cyl(0.16,0.18,2.2,8), M(0x4a4f57), 0, 0.06, 1.5); bar.rotation.x = Math.PI/2;
    turret.add(bar);
    g.add(turret);
    g.userData.anim = {type:'turret', turret};
    g.userData.muzzle = new THREE.Vector3(0, 1.6, 2.6);
  } else if(age === 5){
    // marcheur : deux jambes + carlingue
    const body = mesh(box(2.4, 1.3, 2.6), p.main, 0, 3.0, 0);
    g.add(body);
    g.add(mesh(box(2.0, 0.5, 0.9), p.dim, 0, 3.8, -0.2));
    g.add(mesh(sph(0.2, 8, 6), glowM, 0, 3.2, 1.35));
    const legs = [];
    for(const sx of [-1, 1]){
      const hip = new THREE.Group(); hip.position.set(sx*0.95, 2.55, 0);
      const up = mesh(box(0.42, 1.4, 0.42), p.dark, 0, -0.7, 0);
      const knee = new THREE.Group(); knee.position.set(0, -1.4, 0);
      const lo = mesh(box(0.34, 1.3, 0.34), p.dark, 0, -0.65, 0);
      const foot = mesh(box(0.7, 0.22, 1.1), p.metal, 0, -1.3, 0.2);
      knee.add(lo, foot); hip.add(up, knee); g.add(hip); legs.push({hip, knee});
    }
    const gunL = mesh(cyl(0.13,0.15,1.8,7), M(0x4a4f57), -1.2, 3.2, 0.9); gunL.rotation.x = Math.PI/2;
    const gunR = mesh(cyl(0.13,0.15,1.8,7), M(0x4a4f57),  1.2, 3.2, 0.9); gunR.rotation.x = Math.PI/2;
    g.add(gunL, gunR);
    g.userData.anim = {type:'walker', legs, body};
    g.userData.muzzle = new THREE.Vector3(0, 3.2, 2.0);
  } else {
    // méca de siège
    const body = mesh(box(3.0, 1.7, 3.0), p.main, 0, 3.6, 0);
    g.add(body);
    g.add(mesh(box(1.4, 0.9, 1.2), p.dim, 0, 4.7, -0.1));
    g.add(mesh(box(0.9, 0.24, 0.3), glowM, 0, 4.7, 0.6));
    for(const sx of [-1,1]){
      g.add(mesh(box(0.7, 0.7, 2.2), p.dark, sx*1.9, 3.9, 0.3));
      g.add(mesh(sph(0.18,7,5), glowM, sx*1.9, 3.9, 1.5));
    }
    const legs = [];
    for(const sx of [-1, 1]){
      const hip = new THREE.Group(); hip.position.set(sx*1.05, 3.0, 0);
      const up = mesh(box(0.55, 1.5, 0.55), p.dark, 0, -0.75, 0);
      const knee = new THREE.Group(); knee.position.set(0, -1.5, 0);
      const lo = mesh(box(0.45, 1.5, 0.45), p.metal, 0, -0.75, 0);
      const foot = mesh(box(0.95, 0.3, 1.4), p.dark, 0, -1.5, 0.25);
      knee.add(lo, foot); hip.add(up, knee); g.add(hip); legs.push({hip, knee});
    }
    g.userData.anim = {type:'walker', legs, body};
    g.userData.muzzle = new THREE.Vector3(0, 3.9, 2.4);
  }
  return g;
}

function unitAir(age, p, colors){
  const g = new THREE.Group();
  const hull = new THREE.Group();
  if(age <= 4){
    // hélicoptère
    hull.add(mesh(box(1.2, 1.0, 2.6), p.main, 0, 0, 0));
    hull.add(mesh(sph(0.55, 8, 6), M(0x9fd8ff, {op:0.65}), 0, 0.1, 1.15));
    hull.add(mesh(box(0.25, 0.5, 2.2), p.dark, 0, 0.2, -2.0));
    hull.add(mesh(box(0.9, 0.1, 0.1), p.dark, 0, 0.55, -2.9));
    const rotor = new THREE.Group(); rotor.position.set(0, 0.85, 0);
    for(let i=0;i<2;i++){ const b = mesh(box(5.4, 0.06, 0.28), M(0x3a3f46), 0, 0, 0); b.rotation.y = i*Math.PI/2; rotor.add(b); }
    hull.add(rotor);
    const tail = new THREE.Group(); tail.position.set(0.2, 0.4, -2.85);
    for(let i=0;i<2;i++){ const b = mesh(box(0.06, 1.1, 0.14), M(0x3a3f46), 0, 0, 0); b.rotation.z = i*Math.PI/2; tail.add(b); }
    hull.add(tail);
    for(const sx of [-1,1]) hull.add(mesh(box(0.1, 0.1, 1.6), p.metal, sx*0.6, -0.65, 0));
    g.userData.anim = {type:'heli', rotor, tail};
  } else if(age === 5){
    // drone quadricoptère
    hull.add(mesh(box(1.1, 0.4, 1.5), p.main, 0, 0, 0));
    hull.add(mesh(sph(0.24, 7, 5), p.glow, 0, -0.05, 0.85));
    const rotors = [];
    for(const sx of [-1,1]) for(const sz of [-1,1]){
      hull.add(mesh(box(0.14, 0.1, 0.14), p.dark, sx*0.95, 0.06, sz*0.95));
      const arm = mesh(box(1.4, 0.09, 0.12), p.dark, sx*0.5, 0.03, sz*0.5);
      arm.rotation.y = sx*sz > 0 ? -Math.PI/4 : Math.PI/4;
      hull.add(arm);
      const r = new THREE.Group(); r.position.set(sx*0.95, 0.16, sz*0.95);
      for(let i=0;i<2;i++){ const b = mesh(box(1.0, 0.04, 0.14), M(0x51596a), 0, 0, 0); b.rotation.y = i*Math.PI/2; r.add(b); }
      hull.add(r); rotors.push(r);
    }
    g.userData.anim = {type:'quad', rotors};
  } else {
    // intercepteur orbital
    hull.add(mesh(cone(0.6, 3.2, 6), p.main, 0, 0, 0.4));
    hull.children[0].rotation.x = Math.PI/2;
    for(const sx of [-1,1]){
      const wing = mesh(box(2.2, 0.12, 1.0), p.dark, sx*1.3, -0.05, -0.5);
      wing.rotation.z = sx*0.18; wing.rotation.y = sx*0.22;
      hull.add(wing);
      hull.add(mesh(cyl(0.22,0.26,0.9,7), p.dim, sx*1.0, -0.05, -1.3));
      hull.add(mesh(sph(0.2, 7, 5), p.glow, sx*1.0, -0.05, -1.7));
    }
    hull.add(mesh(box(0.7, 0.16, 0.5), M(0x9fd8ff,{op:0.7, emissive:0x2a5f8a, ei:0.6}), 0, 0.28, 0.5));
    g.userData.anim = {type:'jet', hull};
  }
  g.add(hull);
  g.userData.hull = hull;
  g.userData.muzzle = new THREE.Vector3(0, 0, 1.6);
  return g;
}

/* ------------------------------------------------ créatures xéno */
function alienCreature(role, age, p, colors){
  const g = new THREE.Group();
  const scale = role === 'heavy' ? 1.9 : (role === 'ranged' ? 0.95 : 1.05);
  const body = new THREE.Group();
  body.position.y = 1.15 * scale;

  const shellM = M(colors.main, {});
  const fleshM = M(colors.accent, {emissive:colors.accent, ei:0.55});

  // carapace
  const core = mesh(sph(0.62*scale, 8, 6), shellM, 0, 0, 0);
  core.scale.set(1.05, 0.86, 1.5);
  body.add(core);
  // dorsale lumineuse
  for(let i=0;i<4;i++){
    const spine = mesh(cone(0.11*scale, 0.42*scale, 5), fleshM, 0, 0.42*scale - i*0.03*scale, -0.55*scale + i*0.36*scale);
    spine.rotation.x = -0.25; body.add(spine);
  }
  // tête
  const head = mesh(sph(0.34*scale, 7, 5), shellM, 0, -0.02*scale, 0.95*scale);
  head.scale.set(1, 0.8, 1.35); body.add(head);
  body.add(mesh(sph(0.1*scale, 6, 5), fleshM, -0.16*scale, 0.08*scale, 1.24*scale));
  body.add(mesh(sph(0.1*scale, 6, 5), fleshM,  0.16*scale, 0.08*scale, 1.24*scale));
  // mandibules
  for(const sx of [-1,1]){
    const md = mesh(cone(0.07*scale, 0.42*scale, 4), shellM, sx*0.2*scale, -0.1*scale, 1.35*scale);
    md.rotation.x = Math.PI/2 + 0.25; md.rotation.z = sx*0.3; body.add(md);
  }
  // queue
  if(role !== 'ranged'){
    const tail = new THREE.Group(); tail.position.set(0, 0.05*scale, -0.8*scale);
    let seg = tail;
    for(let i=0;i<3;i++){
      const s2 = new THREE.Group(); s2.position.set(0, 0.06*scale, -0.42*scale);
      s2.add(mesh(box(0.24*scale - i*0.05*scale, 0.2*scale, 0.44*scale), shellM, 0, 0, -0.2*scale));
      seg.add(s2); seg = s2;
    }
    seg.add(mesh(cone(0.13*scale, 0.5*scale, 5), fleshM, 0, 0, -0.5*scale));
    body.add(tail);
    g.userData.tail = tail;
  }
  // poche à acide
  if(role === 'ranged'){
    const sac = mesh(sph(0.4*scale, 8, 6), fleshM, 0, 0.28*scale, -0.35*scale);
    sac.scale.set(1, 0.9, 1.1); body.add(sac);
  }
  g.add(body);

  // pattes
  const legs = [];
  for(const sx of [-1, 1]){
    for(const sz of [0.45, -0.25]){
      const hip = new THREE.Group();
      hip.position.set(sx*0.5*scale, 1.15*scale, sz*scale);
      const up = mesh(box(0.14*scale, 0.16*scale, 0.8*scale), shellM, sx*0.28*scale, 0.1*scale, 0);
      up.rotation.z = sx*0.9; up.rotation.x = Math.PI/2;
      const knee = new THREE.Group(); knee.position.set(sx*0.55*scale, 0.25*scale, 0);
      const lo = mesh(cone(0.1*scale, 1.35*scale, 4), shellM, 0, -0.62*scale, 0);
      knee.add(lo);
      hip.add(up, knee); g.add(hip);
      legs.push({hip, knee, phase: (sx>0?0:Math.PI) + (sz>0?0:Math.PI/2)});
    }
  }
  g.userData.anim = {type:'bug', legs, body};
  g.userData.muzzle = new THREE.Vector3(0, 1.3*scale, 1.4*scale);
  return g;
}

/* ============================================================
   BÂTIMENTS
   ============================================================ */
export function makeBuilding(type, age, colors, alien = false){
  const p = palette(colors, age, alien);
  const g = alien ? alienStructure(type, age, p, colors) : humanStructure(type, age, p, colors);
  g.traverse(o=>{ if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/* toit pyramidal : le rayon est donné explicitement pour laisser
   les murs visibles sous les avancées de toiture */
function roof(mat, radius, h, y){
  const r = mesh(cone(radius, h, 4), mat, 0, y, 0);
  r.rotation.y = Math.PI/4;
  return r;
}

function humanStructure(type, age, p, colors){
  const g = new THREE.Group();
  const glow = p.glow;
  const wall = age <= 0 ? M(0x8b7355) : (age <= 2 ? M(0xbcae94) : (age <= 4 ? M(0x99a2ad) : M(0xd6dde6)));
  const trim = p.main;
  const modern = age >= 4;

  switch(type){
    case 'command':{
      const w = 6.4;
      if(age <= 1){
        g.add(mesh(cyl(w*0.34, w*0.46, 2.6, 8), wall, 0, 1.3, 0));
        g.add(roof(M(0x6d5a3a), w*0.54, 2.8, 4.0));
        for(let i=0;i<4;i++){
          const a = i/4*Math.PI*2;
          g.add(mesh(cyl(0.16,0.16,3.0,6), p.wood, Math.cos(a)*w*0.5, 1.5, Math.sin(a)*w*0.5));
        }
      } else if(age <= 3){
        g.add(mesh(box(w, 3.2, w), wall, 0, 1.6, 0));
        g.add(mesh(box(w*1.1, 0.4, w*1.1), trim, 0, 3.4, 0));
        for(const sx of [-1,1]) for(const sz of [-1,1]){
          g.add(mesh(cyl(0.7,0.8,4.6,8), wall, sx*w*0.5, 2.3, sz*w*0.5));
          g.add(mesh(cone(0.95, 1.3, 8), trim, sx*w*0.5, 5.2, sz*w*0.5));
        }
        g.add(mesh(box(1.4, 2.0, 0.3), M(0x5a4630), 0, 1.0, w*0.5+0.05));
      } else {
        g.add(mesh(box(w, 1.0, w), M(0x4d545e), 0, 0.5, 0));
        g.add(mesh(box(w*0.86, 3.6, w*0.86), wall, 0, 2.8, 0));
        g.add(mesh(box(w*0.5, 2.2, w*0.5), trim, 0, 5.6, 0));
        g.add(mesh(cyl(0.2,0.2,3.0,6), M(0x9aa6b4), 0, 8.0, 0));
        const ring = mesh(tor(w*0.42, 0.12, 6, 20), glow, 0, 4.8, 0);
        ring.rotation.x = Math.PI/2; g.add(ring);
        g.userData.spin = ring;
        for(const sx of [-1,1]) g.add(mesh(box(0.3, 2.4, 0.3), glow, sx*w*0.44, 2.6, w*0.44));
        if(age >= 6){
          const orb = mesh(sph(0.8, 10, 8), M(colors.accent, {emissive:colors.accent, ei:1.8}), 0, 8.6, 0);
          g.add(orb); g.userData.orb = orb;
        }
      }
      break;
    }
    case 'house':{
      const w = 3.2;
      if(age <= 0){
        g.add(mesh(cyl(w*0.42, w*0.5, 1.6, 7), M(0x9b8362), 0, 0.8, 0));
        g.add(roof(M(0x6d5a3a), w*0.56, 1.7, 2.35));
      } else if(age <= 3){
        g.add(mesh(box(w, 2.2, w*0.9), wall, 0, 1.1, 0));
        const r = mesh(box(w*1.15, 0.24, w*1.05), M(0x8a4b3a), 0, 2.35, 0);
        g.add(r);
        g.add(roof(M(0x8a4b3a), w*0.62, 1.5, 2.95));
        g.add(mesh(box(0.6,0.9,0.14), M(0x5a4630), 0, 0.55, w*0.46));
      } else {
        const lv = age >= 6 ? 4 : 3;
        for(let i=0;i<lv;i++){
          g.add(mesh(box(w - i*0.25, 1.5, w*0.9 - i*0.2), i%2 ? wall : M(0x7f8894), 0, 0.75 + i*1.5, 0));
          g.add(mesh(box(w - i*0.25 + 0.12, 0.1, w*0.9 - i*0.2 + 0.12), glow, 0, 1.42 + i*1.5, 0));
        }
      }
      break;
    }
    case 'farm':{
      const w = 4.0;
      g.add(mesh(box(w, 0.16, w), M(age >= 5 ? 0x2c3f4a : 0x6b5334), 0, 0.08, 0));
      const rows = 5;
      for(let i=0;i<rows;i++){
        const z = -w/2 + (i+0.5)*(w/rows);
        if(age >= 5){
          const t = mesh(box(w*0.86, 0.5, 0.42), M(0x2f4a55, {op:0.9}), 0, 0.4, z);
          g.add(t);
          g.add(mesh(box(w*0.8, 0.1, 0.2), M(0x6effc9, {emissive:0x2fffa8, ei:1.2}), 0, 0.68, z));
        } else {
          g.add(mesh(box(w*0.86, 0.36, 0.3), M(age >= 3 ? 0x7a9e4a : 0x8fae55), 0, 0.28, z));
        }
      }
      if(age >= 1 && age < 5){
        for(const sx of [-1,1]) for(const sz of [-1,1])
          g.add(mesh(cyl(0.08,0.08,1.0,5), p.wood, sx*w*0.48, 0.5, sz*w*0.48));
      }
      break;
    }
    case 'barracks':{
      const w = 4.6;
      g.add(mesh(box(w, 2.6, w*0.78), wall, 0, 1.3, 0));
      if(age <= 2){
        g.add(roof(M(0x7a4a3a), w*0.56, 1.6, 3.35));
        for(let i=0;i<3;i++) g.add(mesh(box(0.12, 1.8, 0.12), p.wood, -w*0.3 + i*w*0.3, 3.4, 0));
        g.add(mesh(box(0.7, 1.2, 0.1), trim, 0, 3.6, 0));
      } else {
        g.add(mesh(box(w*1.06, 0.3, w*0.84), trim, 0, 2.7, 0));
        for(const sx of [-1,1]) g.add(mesh(box(0.5, 1.2, 0.5), M(0x5c646f), sx*w*0.42, 3.3, 0));
        g.add(mesh(box(w*0.5, 0.16, 0.16), glow, 0, 2.95, w*0.4));
      }
      g.add(mesh(box(1.5, 1.8, 0.2), M(0x3d434c), 0, 0.9, w*0.4));
      // râtelier d'armes
      for(let i=0;i<3;i++){
        const sp = mesh(cyl(0.05,0.05,2.0,5), age >= 4 ? M(0x6e7681) : p.wood, -1.4 + i*0.5, 1.0, -w*0.44);
        sp.rotation.z = 0.16*(i-1); g.add(sp);
      }
      break;
    }
    case 'generator':{
      const w = 3.8;
      if(age <= 3){
        g.add(mesh(box(w*0.8, 2.2, w*0.8), wall, 0, 1.1, 0));
        const blades = new THREE.Group(); blades.position.set(0, 2.9, w*0.35);
        for(let i=0;i<4;i++){ const b = mesh(box(0.24, 2.6, 0.1), p.wood, 0, 1.2, 0); b.rotation.z = i*Math.PI/2; const h = new THREE.Group(); h.add(b); h.rotation.z = i*Math.PI/2; blades.add(b); }
        g.add(blades); g.userData.spin = blades; g.userData.spinAxis = 'z';
        g.add(mesh(cyl(0.2,0.2,0.6,6), M(0x5a4630), 0, 2.9, w*0.28));
      } else {
        g.add(mesh(cyl(w*0.42, w*0.5, 2.4, 10), M(0x7d8791), 0, 1.2, 0));
        const gring = mesh(tor(w*0.44, 0.12, 6, 18), glow, 0, 1.8, 0);
        gring.rotation.x = Math.PI/2; g.add(gring);
        const core = mesh(sph(0.7, 10, 8), M(colors.accent, {emissive:colors.accent, ei:1.6}), 0, 3.2, 0);
        g.add(core); g.userData.orb = core;
        for(let i=0;i<3;i++){
          const a = i/3*Math.PI*2;
          g.add(mesh(box(0.28, 3.4, 0.28), M(0x5c646f), Math.cos(a)*w*0.42, 1.7, Math.sin(a)*w*0.42));
        }
      }
      break;
    }
    case 'turret':{
      const w = 2.6;
      g.add(mesh(cyl(w*0.5, w*0.62, age <= 2 ? 3.4 : 2.4, 8), wall, 0, (age <= 2 ? 1.7 : 1.2), 0));
      const head = new THREE.Group();
      head.position.y = age <= 2 ? 3.6 : 2.7;
      if(age <= 2){
        head.add(mesh(cyl(w*0.6, w*0.55, 0.9, 8), wall, 0, 0, 0));
        for(let i=0;i<6;i++){ const a=i/6*Math.PI*2; head.add(mesh(box(0.34,0.6,0.34), wall, Math.cos(a)*w*0.55, 0.6, Math.sin(a)*w*0.55)); }
        head.add(mesh(box(0.16, 0.16, 1.6), p.wood, 0, 0.2, 0.9));
      } else {
        head.add(mesh(box(1.7, 0.8, 1.7), M(0x5c646f), 0, 0, 0));
        const bar = mesh(cyl(0.14,0.16,2.2,7), M(0x3d434c), 0, 0.1, 1.1); bar.rotation.x = Math.PI/2;
        head.add(bar);
        head.add(mesh(sph(0.16,7,5), glow, 0, 0.1, 2.1));
      }
      g.add(head);
      g.userData.turret = head;
      g.userData.muzzle = new THREE.Vector3(0, age <= 2 ? 3.8 : 2.9, 2.0);
      break;
    }
    case 'lab':{
      const w = 4.2;
      g.add(mesh(box(w*0.9, 2.0, w*0.9), wall, 0, 1.0, 0));
      const dome = mesh(sph(w*0.5, 12, 8, 0, Math.PI*2, 0, Math.PI/2), M(0x9fd8ff, {op:0.55, emissive:0x1c4e6e, ei:0.5}), 0, 2.0, 0);
      g.add(dome);
      const ring = mesh(tor(w*0.52, 0.1, 6, 20), glow, 0, 2.05, 0); ring.rotation.x = Math.PI/2;
      g.add(ring); g.userData.spin = ring;
      const core = mesh(sph(0.42, 10, 8), M(colors.accent, {emissive:colors.accent, ei:1.5}), 0, 2.5, 0);
      g.add(core); g.userData.orb = core;
      for(const sx of [-1,1]) g.add(mesh(box(0.3, 2.2, 0.3), M(0x5c646f), sx*w*0.5, 1.1, -w*0.42));
      break;
    }
    case 'factory':{
      const w = 5.4;
      g.add(mesh(box(w, 2.8, w*0.8), wall, 0, 1.4, 0));
      // toit en dents de scie
      for(let i=0;i<3;i++){
        const s = mesh(box(w*0.3, 0.9, w*0.8), M(0x6a727d), -w*0.33 + i*w*0.33, 3.2, 0);
        s.rotation.z = 0.22; g.add(s);
        g.add(mesh(box(w*0.24, 0.5, w*0.78), M(0x9fd8ff,{op:0.5, emissive:0x18384f, ei:0.6}), -w*0.3 + i*w*0.33, 3.5, 0));
      }
      for(let i=0;i<2;i++){
        g.add(mesh(cyl(0.34,0.4,3.4,8), M(0x59606a), -w*0.3 + i*w*0.6, 4.4, -w*0.28));
        if(age >= 5){
          const fr = mesh(tor(0.42,0.07,5,14), glow, -w*0.3 + i*w*0.6, 5.9, -w*0.28);
          fr.rotation.x = Math.PI/2; g.add(fr);
        }
      }
      g.add(mesh(box(2.2, 2.0, 0.2), M(0x3d434c), 0, 1.0, w*0.41));
      g.add(mesh(box(2.0, 0.14, 0.24), glow, 0, 2.1, w*0.42));
      break;
    }
  }
  return g;
}

function alienStructure(type, age, p, colors){
  const g = new THREE.Group();
  const shell = M(colors.main);
  const flesh = M(colors.accent, {emissive:colors.accent, ei:0.9});
  const sizes = {command:5.6, house:2.8, farm:3.4, barracks:4.2, generator:3.4, turret:2.4, lab:3.6, factory:4.8};
  const w = sizes[type] || 3.4;

  // socle organique
  const base = mesh(sph(w*0.55, 10, 7), shell, 0, w*0.16, 0);
  base.scale.set(1, 0.55, 1); g.add(base);
  // dôme principal
  const dome = mesh(sph(w*0.42, 10, 8), shell, 0, w*0.42, 0);
  dome.scale.set(1, type === 'turret' ? 1.5 : 1.15, 1); g.add(dome);
  // veines lumineuses
  for(let i=0;i<5;i++){
    const a = i/5*Math.PI*2;
    const v = mesh(box(0.14, w*0.7, 0.14), flesh, Math.cos(a)*w*0.3, w*0.42, Math.sin(a)*w*0.3);
    v.rotation.z = Math.cos(a)*0.4; v.rotation.x = -Math.sin(a)*0.4;
    g.add(v);
  }
  // pointes
  const spikes = type === 'command' ? 6 : (type === 'factory' ? 4 : 3);
  for(let i=0;i<spikes;i++){
    const a = i/spikes*Math.PI*2 + 0.4;
    const s = mesh(cone(w*0.12, w*0.9, 5), shell, Math.cos(a)*w*0.42, w*0.75, Math.sin(a)*w*0.42);
    s.rotation.z = -Math.cos(a)*0.35; s.rotation.x = Math.sin(a)*0.35;
    g.add(s);
  }
  // cœur pulsant
  const orb = mesh(sph(w*0.2, 10, 8), flesh, 0, w*0.72, 0);
  g.add(orb); g.userData.orb = orb;

  if(type === 'turret'){
    const head = new THREE.Group(); head.position.y = w*0.95;
    head.add(mesh(cone(w*0.22, w*0.8, 6), shell, 0, 0, 0.2));
    head.children[0].rotation.x = Math.PI/2;
    head.add(mesh(sph(w*0.12, 8, 6), flesh, 0, 0, w*0.45));
    g.add(head); g.userData.turret = head;
    g.userData.muzzle = new THREE.Vector3(0, w*0.95, w*0.5);
  }
  if(type === 'command'){
    const ring = mesh(tor(w*0.62, 0.1, 6, 22), flesh, 0, w*0.5, 0);
    ring.rotation.x = Math.PI/2; g.add(ring); g.userData.spin = ring;
  }
  return g;
}

/* ============================================================
   NATURE & RESSOURCES
   ============================================================ */
export function makeTree(region, rnd){
  const g = new THREE.Group();
  const r = rnd();
  const pal = region.palette;
  const leafBase = new THREE.Color(pal.mid).offsetHSL(0, 0.05, -0.02 + r*0.08).getHex();
  if(region.key === 'arctic' || region.key === 'himalaya'){
    g.add(mesh(cyl(0.14, 0.2, 1.6, 5), M(0x4a3826), 0, 0.8, 0));
    for(let i=0;i<3;i++){
      const c = mesh(cone(1.05 - i*0.24, 1.5, 6), M(0x2c4a34), 0, 1.5 + i*0.85, 0);
      g.add(c);
    }
  } else if(region.key === 'sahara'){
    g.add(mesh(cyl(0.16, 0.22, 2.2, 5), M(0x6b5334), 0, 1.1, 0));
    for(let i=0;i<6;i++){
      const a = i/6*Math.PI*2;
      const l = mesh(box(1.9, 0.08, 0.4), M(0x6f8a3e), Math.cos(a)*0.9, 2.4, Math.sin(a)*0.9);
      l.rotation.y = -a; l.rotation.z = -0.35; g.add(l);
    }
  } else if(region.key === 'amazonia'){
    g.add(mesh(cyl(0.2, 0.3, 4.4, 6), M(0x4c3a26), 0, 2.2, 0));
    for(let i=0;i<3;i++){
      const c = mesh(sph(1.5 - i*0.24, 7, 5), M(leafBase), (rnd()-0.5)*0.9, 4.3 + i*0.7, (rnd()-0.5)*0.9);
      c.scale.y = 0.62; g.add(c);
    }
  } else {
    g.add(mesh(cyl(0.16, 0.24, 1.9, 5), M(0x5a4128), 0, 0.95, 0));
    const c = mesh(sph(1.25, 7, 5), M(leafBase), 0, 2.6, 0);
    c.scale.set(1, 0.86, 1); g.add(c);
    g.add(mesh(sph(0.8, 6, 5), M(leafBase), 0.6, 3.3, -0.3));
  }
  g.scale.setScalar(0.8 + r*0.55);
  g.rotation.y = rnd()*Math.PI*2;
  g.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  return g;
}

export function makeRock(region, rnd){
  const g = new THREE.Group();
  const c = M(region.palette.rock);
  const n = 2 + (rnd()*3|0);
  for(let i=0;i<n;i++){
    const s = 0.6 + rnd()*1.1;
    const r = mesh(G(`rock${i%4}`, ()=>new THREE.DodecahedronGeometry(1, 0)), c,
      (rnd()-0.5)*1.6, s*0.45, (rnd()-0.5)*1.6);
    r.scale.set(s, s*(0.6+rnd()*0.5), s);
    r.rotation.set(rnd()*3, rnd()*3, rnd()*3);
    g.add(r);
  }
  g.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  return g;
}

export function makeCrystal(rnd){
  const g = new THREE.Group();
  const mat = M(0xb37bff, {emissive:0x7b3fff, ei:0.8});
  const n = 3 + (rnd()*3|0);
  for(let i=0;i<n;i++){
    const h = 1.4 + rnd()*2.6;
    const c = mesh(cone(0.32 + rnd()*0.24, h, 5), mat, (rnd()-0.5)*1.5, h*0.44, (rnd()-0.5)*1.5);
    c.rotation.set((rnd()-0.5)*0.4, rnd()*3, (rnd()-0.5)*0.4);
    g.add(c);
  }
  g.add(mesh(cyl(1.3, 1.5, 0.24, 8), M(0x3a2f52), 0, 0.12, 0));
  g.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  return g;
}

export function makeBerry(rnd){
  const g = new THREE.Group();
  const leaf = M(0x3f6b32);
  for(let i=0;i<4;i++){
    const s = 0.5 + rnd()*0.45;
    const b = mesh(sph(s, 6, 5), leaf, (rnd()-0.5)*1.5, s*0.7, (rnd()-0.5)*1.5);
    b.scale.y = 0.8; g.add(b);
    for(let k=0;k<3;k++)
      g.add(mesh(sph(0.11, 5, 4), M(0xff5a6e, {emissive:0x5a0e18, ei:0.5}),
        b.position.x + (rnd()-0.5)*s, s*0.9 + rnd()*0.3, b.position.z + (rnd()-0.5)*s));
  }
  g.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  return g;
}

/* ------------------------------------------------ nid / météore xéno */
export function makeMeteor(){
  const g = new THREE.Group();
  const rock = mesh(G('meteor', ()=>new THREE.IcosahedronGeometry(1.6, 0)), M(0x2a2028), 0, 0, 0);
  rock.scale.set(1, 0.85, 1.1);
  g.add(rock);
  g.add(mesh(sph(1.75, 10, 8), M(0xff5ad1, {emissive:0xff2fb0, ei:1.4, op:0.4}), 0, 0, 0));
  return g;
}

export function makeHive(colors){
  const g = new THREE.Group();
  const shell = M(colors.main);
  const flesh = M(colors.accent, {emissive:colors.accent, ei:1.1});
  const base = mesh(sph(3.4, 12, 8), shell, 0, 0.4, 0); base.scale.y = 0.7; g.add(base);
  for(let i=0;i<5;i++){
    const a = i/5*Math.PI*2;
    const s = mesh(cone(0.5, 4.4, 5), shell, Math.cos(a)*1.7, 2.4, Math.sin(a)*1.7);
    s.rotation.z = -Math.cos(a)*0.3; s.rotation.x = Math.sin(a)*0.3; g.add(s);
  }
  const core = mesh(sph(1.1, 12, 9), flesh, 0, 2.4, 0);
  g.add(core); g.userData.orb = core;
  g.traverse(o=>{ if(o.isMesh) o.castShadow = true; });
  return g;
}

/* ------------------------------------------------ marqueurs */
export function makeSelectionRing(radius, color){
  const geo = G(`ring${radius.toFixed(2)}`, ()=>new THREE.RingGeometry(radius*0.86, radius, 26));
  geo.rotateX(-Math.PI/2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, transparent:true, opacity:0.9, depthWrite:false, side:THREE.DoubleSide,
  }));
  m.renderOrder = 3;
  return m;
}

export function makeGhost(mesh3){
  mesh3.traverse(o=>{
    if(o.isMesh){
      o.material = new THREE.MeshBasicMaterial({ color:0x6cf0ff, transparent:true, opacity:0.42, depthWrite:false });
      o.castShadow = false; o.receiveShadow = false;
    }
  });
  return mesh3;
}
