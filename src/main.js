/* ============================================================
   AEON — Terre en Guerre
   Point d'entrée : assemblage moteur / interface / partie
   ============================================================ */
import * as THREE from 'three';
import { Engine } from './engine/renderer.js';
import { Input } from './engine/input.js';
import { audio } from './engine/audio.js';
import { Game } from './game/game.js';
import { Menu } from './ui/menu.js';
import { HUD } from './ui/hud.js';
import { AGES, RES, FACTIONS, REGIONS } from './data/gamedata.js';
import { updater } from './updater.js';

const $ = s=>document.querySelector(s);

/* ============================================================ démarrage */
const engine = new Engine($('#scene'));
const input = new Input($('#scene'));
const game = new Game(engine, audio);
const hud = new HUD(game, engine);
const overlay = $('#overlay');
const octx = overlay.getContext('2d');

let menu = null;
let state = 'boot';           // boot | menu | play | pause | end
let lastT = performance.now();
let elapsed = 0;

/* ------------------------------------------------ séquence de démarrage */
const bootSteps = [
  'Initialisation du noyau…',
  'Compilation des shaders…',
  'Génération des silhouettes continentales…',
  'Étalonnage des unités…',
  'Liaison satellite établie',
];
async function boot(){
  const fill = $('#bootFill'), text = $('#bootText');
  for(let i=0;i<bootSteps.length;i++){
    text.textContent = bootSteps[i];
    fill.style.width = ((i+1)/bootSteps.length*100) + '%';
    await new Promise(r=>setTimeout(r, 190));
  }
  await updater.init();
  menu = new Menu(startGame, audio);
  menu.onOption = applyOption;
  applyOption('quality', menu.cfg.quality);
  applyOption('shadows', menu.cfg.shadows);
  applyOption('edge', menu.cfg.edge);
  audio.setMusic(menu.cfg.music/100);
  audio.setSfx(menu.cfg.sfx/100);
  $('#boot').classList.add('hidden');
  menu.show();
  state = 'menu';
  hookUpdater();
}

function applyOption(key, v){
  if(key === 'quality') engine.setQuality(v);
  else if(key === 'shadows') engine.setShadows(v);
  else if(key === 'edge') input.edgeScroll = v;
}

/* ------------------------------------------------ mise à jour automatique */
function hookUpdater(){
  updater.onUpdate = (info)=>{
    const v = info.version || '';
    if(state === 'menu'){
      // rechargement immédiat hors partie
      showToast(`Nouvelle version ${v} — rechargement…`);
      setTimeout(()=>updater.apply(), 1400);
    } else {
      hud.alert({ kind:'good', title:'Mise à jour disponible',
        text:`Version ${v} prête. Elle sera appliquée au retour au menu.` });
      showToast(`Nouvelle version ${v} disponible`);
    }
  };
}
function showToast(msg){
  let t = $('#toast');
  if(!t){
    t = document.createElement('div');
    t.id = 'toast';
    t.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:99;'+
      'padding:11px 22px;border-radius:10px;background:rgba(10,16,28,.92);border:1px solid rgba(56,225,255,.4);'+
      'color:#dceaff;font:600 12px/1 system-ui;letter-spacing:.1em;backdrop-filter:blur(10px);'+
      'box-shadow:0 12px 40px rgba(0,0,0,.5)';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.display = 'block';
  clearTimeout(t._h);
  t._h = setTimeout(()=>{ t.style.display = 'none'; }, 6000);
}

/* ============================================================ partie */
function startGame(cfg){
  menu.hide();
  state = 'play';
  input.enabled = true;
  audio.startMusic();
  audio.tension = 0;
  game.start(cfg);
  hud.onGameStart();
  hud.alert({ kind:'good', title:'Débarquement', text:`${FACTIONS[cfg.faction].name} prend position — ${REGIONS[cfg.region].name}.` });
  hud.banner(AGES[cfg.startAge].name.toUpperCase(), REGIONS[cfg.region].desc, 3.4);
  $('#endScreen').classList.add('hidden');
  $('#pauseScreen').classList.add('hidden');
}

function quitToMenu(){
  if(updater.pending){ updater.apply(); return; }
  input.enabled = false;
  game.dispose();
  hud.hide();
  audio.tension = 0;
  state = 'menu';
  menu.show();
  $('#endScreen').classList.add('hidden');
  $('#pauseScreen').classList.add('hidden');
}

/* ------------------------------------------------ événements de partie */
game.on('alert', a=>hud.alert(a));
game.on('banner', b=>{ hud.banner(b.title, b.text); audio.play('alert'); });
game.on('selection', sel=>hud.refreshSelection(sel));
game.on('groups', g=>hud.updateGroups(g));
game.on('threat', v=>{ hud.setThreat(v); audio.tension = v; });
game.on('order', o=>{ if(game.fx) game.fx.marker({x:o.x, y:game.terrain.heightAt(o.x, o.z)+0.2, z:o.z}, o.kind === 'attack' ? 0xff4d6d : (o.kind === 'gather' ? 0x8fd6ff : 0x6cf0ff)); });
game.on('rally', p=>{ if(game.fx) game.fx.marker({x:p.x, y:game.terrain.heightAt(p.x, p.z)+0.2, z:p.z}, 0xffc857); });
game.on('meteor', m=>{
  hud.alert({ kind:'bad', title:'Impact imminent', text:'Trajectoire xéno détectée. Cliquez pour localiser.', at:m });
  audio.play('alert');
});
game.on('playerDefeated', p=>{
  if(p === game.human) return;
  hud.alert({ kind:'good', title:'Faction éliminée', text:`${p.name} n'a plus de présence sur le théâtre.` });
});
game.onAgeUp = (p)=>{
  if(p === game.human){
    audio.play('age');
    hud.banner(AGES[p.age].name.toUpperCase(), AGES[p.age].desc, 4);
    hud.alert({ kind:'good', title:'Nouvel âge', text:`Vos forces entrent dans l'${AGES[p.age].name}.` });
    hud.refreshSelection(game.selected);
  }
};
game.onUnitTrained = (u)=>{
  if(u.player === game.human) audio.play('ready');
};
game.onBuildingDone = (b)=>{
  if(b.player === game.human){
    audio.play('ready');
    hud.alert({ kind:'good', title:'Construction terminée', text:b.name, at:{x:b.x, z:b.z} });
    hud.refreshSelection(game.selected);
  }
};
game.onResearch = (p, key, lvl)=>{
  if(p === game.human){
    audio.play('ready');
    hud.alert({ kind:'good', title:'Recherche achevée', text:`${game.RESEARCH[key].name} niveau ${lvl}.` });
    hud.refreshSelection(game.selected);
  }
};
let hitCooldown = 0;
game.onBuildingHit = (b)=>{
  if(b.player !== game.human || hitCooldown > 0) return;
  hitCooldown = 9;
  hud.alert({ kind:'bad', title:'Base attaquée', text:`${b.name} subit des dégâts.`, at:{x:b.x, z:b.z} });
  audio.play('alert');
};
game.on('gameOver', win=>{
  state = 'end';
  input.enabled = false;
  audio.play(win ? 'win' : 'lose');
  const p = game.human;
  $('#endTitle').textContent = win ? 'VICTOIRE' : 'DÉFAITE';
  $('#endTitle').classList.toggle('lose', !win);
  $('#endSub').textContent = win
    ? `La Terre est vôtre — ${AGES[p.age].name}`
    : `Vos forces ont été anéanties — ${AGES[p.age].name}`;
  const t = Math.floor(game.time);
  $('#endStats').innerHTML = [
    ['Durée', `${String((t/60)|0).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`],
    ['Âge atteint', String(p.age+1)],
    ['Unités formées', String(p.stats.trained)],
    ['Éliminations', String(p.stats.killed)],
    ['Bâtiments', String(p.stats.built)],
  ].map(([l, v])=>`<div class="estat"><b>${v}</b><span>${l}</span></div>`).join('');
  $('#endScreen').classList.remove('hidden');
});

/* ============================================================ entrées */
input.on('click', (x, y, add, dbl)=>{
  if(state !== 'play') return;
  if(game.placement){ game.confirmPlacement(x, y); return; }
  game.clickSelect(x, y, add, dbl);
});
input.on('boxSelect', (x0, y0, x1, y1, add)=>{
  if(state !== 'play') return;
  if(game.placement) return;
  game.boxSelect(x0, y0, x1, y1, add);
});
input.on('command', (x, y, queue)=>{
  if(state !== 'play') return;
  if(game.placement){ game.cancelPlacement(); return; }
  game.command(x, y, queue);
});
input.on('move', (x, y)=>{
  if(state !== 'play') return;
  if(game.placement) game.movePlacement(x, y);
});
input.on('zoom', d=>{ if(state === 'play') engine.zoom(d); });
input.on('orbit', (dx, dy)=>{ if(state === 'play'){ engine.rotate(-dx); engine.tilt(dy); } });

input.on('key', (k, e)=>{
  if(state === 'end'){ return; }
  if(state !== 'play' && state !== 'pause') return;

  if(k === 'escape'){
    if(game.placement) game.cancelPlacement();
    else if(state === 'pause') resume();
    else if(game.selected.length) game.clearSelection();
    else pause();
    return;
  }
  if(state === 'pause') return;

  if(k === 'p'){ pause(); return; }

  // groupes de contrôle
  if(/^[1-9]$/.test(k)){
    if(e.ctrlKey || e.metaKey){ e.preventDefault(); game.setGroup(k); }
    else game.recallGroup(k);
    return;
  }
  // raccourcis du panneau de commandes
  if(hud.triggerHotkey(k)) return;

  switch(k){
    case 'h': game.focusOnHome(); break;
    case 'o': game.selectIdleWorker(); break;
    case 'r': {
      const cc = game.human.buildings.find(b=>b.def.key === 'command' && !b.dead);
      if(cc) engine.lookAt(cc.x, cc.z);
      engine.dist = 58; engine.pitch = 0.92;
      break;
    }
    case ' ': case 'space': hud.gotoLastAlert(); break;
    case 'a': engine.rotate(0.12); break;
    case 'e': engine.rotate(-0.12); break;
  }
});

/* boutons d'interface */
$('#btnPause').addEventListener('click', ()=>pause());
$('#btnQuit').addEventListener('click', ()=>quitToMenu());
$('#btnResume').addEventListener('click', ()=>resume());
$('#btnPauseQuit').addEventListener('click', ()=>quitToMenu());
$('#btnEndMenu').addEventListener('click', ()=>quitToMenu());
$('#btnEndReplay').addEventListener('click', ()=>{
  if(updater.pending){ updater.apply(); return; }
  startGame(menu.cfg);
});

function pause(){
  if(state !== 'play') return;
  state = 'pause';
  game.paused = true;
  input.enabled = false;
  $('#pauseScreen').classList.remove('hidden');
}
function resume(){
  if(state !== 'pause') return;
  state = 'play';
  game.paused = false;
  input.enabled = true;
  $('#pauseScreen').classList.add('hidden');
}

/* ============================================================ boucle */
function frame(now){
  requestAnimationFrame(frame);
  const dt = Math.min(0.06, (now - lastT)/1000);
  lastT = now;
  elapsed += dt;

  if(state === 'play'){
    // caméra
    const v = input.scrollVector();
    if(v.x || v.z){
      const sp = 26 + engine.dist * 0.55;
      engine.pan(v.x * sp * dt, v.z * sp * dt);
    }
    if(input.isDown('a')) engine.rotate(1.4 * dt);
    if(input.isDown('e')) engine.rotate(-1.4 * dt);

    game.update(dt);
    if(hitCooldown > 0) hitCooldown -= dt;
    hud.update(dt);
  }

  if(game.running) game.render(dt, elapsed);
  engine.updateCamera(dt);
  engine.render(elapsed);
  drawOverlay();
}

/* ------------------------------------------------ calque 2D */
function drawOverlay(){
  const w = window.innerWidth, h = window.innerHeight;
  if(overlay.width !== w || overlay.height !== h){ overlay.width = w; overlay.height = h; }
  octx.clearRect(0, 0, w, h);
  if(state !== 'play' || !game.running) return;

  // barres de vie
  const p = new THREE.Vector3();
  const drawBar = (e, wide)=>{
    const pr = engine.project(e.center(p));
    if(!pr.visible) return;
    const bw = wide ? 42 : 26, bh = 3.4;
    const x = pr.x - bw/2, y = pr.y - (wide ? 26 : 20);
    const r = Math.max(0, Math.min(1, e.hp/e.maxHp));
    octx.fillStyle = 'rgba(0,0,0,.55)';
    octx.fillRect(x-1, y-1, bw+2, bh+2);
    octx.fillStyle = e.player === game.human ? '#57e08a'
      : (e.player.hostileToAll ? '#c06bff' : '#ff5a6e');
    octx.fillRect(x, y, bw*r, bh);
    if(e.type === 'building' && !e.complete){
      octx.fillStyle = '#6cf0ff';
      octx.fillRect(x, y + bh + 1.5, bw*e.progress, 2);
    }
  };

  for(const u of game.units){
    if(u.dead) continue;
    const dmg = u.hp < u.maxHp - 0.5;
    const sel = game.selected.includes(u);
    if(!dmg && !sel) continue;
    const d = Math.hypot(u.x - engine.target.x, u.z - engine.target.z);
    if(d > 110) continue;
    drawBar(u, u.role === 'heavy');
  }
  for(const b of game.buildings){
    if(b.dead) continue;
    const dmg = b.hp < b.maxHp - 0.5 || !b.complete;
    const sel = game.selected.includes(b);
    if(!dmg && !sel) continue;
    drawBar(b, true);
  }

  // rectangle de sélection
  const d = input.drag;
  if(d && d.active){
    const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1);
    const bw = Math.abs(d.x1-d.x0), bh = Math.abs(d.y1-d.y0);
    octx.fillStyle = 'rgba(56,225,255,.10)';
    octx.fillRect(x, y, bw, bh);
    octx.strokeStyle = 'rgba(108,240,255,.9)';
    octx.lineWidth = 1.4;
    octx.strokeRect(x+0.5, y+0.5, bw, bh);
    // coins
    octx.strokeStyle = '#fff';
    const c = 9;
    octx.beginPath();
    for(const [cx, cy, sx, sy] of [[x,y,1,1],[x+bw,y,-1,1],[x,y+bh,1,-1],[x+bw,y+bh,-1,-1]]){
      octx.moveTo(cx + sx*c, cy); octx.lineTo(cx, cy); octx.lineTo(cx, cy + sy*c);
    }
    octx.stroke();
  }

  // indicateur de placement
  if(game.placement){
    octx.fillStyle = 'rgba(220,238,255,.85)';
    octx.font = '600 12px system-ui, sans-serif';
    octx.textAlign = 'center';
    octx.fillText('Clic gauche : poser   ·   Clic droit / Échap : annuler',
      w/2, h - 210);
    octx.textAlign = 'left';
  }
}

/* ============================================================ go */
requestAnimationFrame(frame);
boot();

window.addEventListener('pointerdown', ()=>audio.resume(), { once:false });
window.AEON = { game, engine, audio, updater };
