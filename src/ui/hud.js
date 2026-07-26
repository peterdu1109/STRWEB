/* ============================================================
   Interface de jeu : ressources, sélection, commandes, minimap
   ============================================================ */
import { AGES, UNITS, BUILDINGS, RESEARCH, RES, unitName, buildingName, unitsFor } from '../data/gamedata.js';
import { HALF, WORLD } from '../world/terrain.js';

const $ = s=>document.querySelector(s);

const BUILD_ORDER = ['house','farm','barracks','generator','turret','lab','factory','command'];
const BUILD_KEYS  = { house:'b', farm:'f', barracks:'c', generator:'g', turret:'t', lab:'l', factory:'u', command:'n' };

export class HUD{
  constructor(game, engine){
    this.game = game;
    this.engine = engine;
    this.el = {
      hud: $('#hud'),
      food: $('#resFood'), mat: $('#resMat'), energy: $('#resEnergy'), pop: $('#resPop'),
      ageName: $('#ageName'), ageFill: $('#ageFill'),
      clock: $('#clock'),
      threatBox: $('#threatBox'), threatFill: $('#threatFill'),
      alerts: $('#alerts'), banner: $('#banner'),
      bannerTitle: $('#bannerTitle'), bannerText: $('#bannerText'),
      selName: $('#selName'), selStats: $('#selStats'), selBar: $('#selBar').firstElementChild,
      selPortrait: $('#selPortrait'), selList: $('#selList'), queueRow: $('#queueRow'),
      cmdGrid: $('#cmdGrid'), cmdTip: $('#cmdTip'),
      minimap: $('#minimap'), mmRegion: $('#mmRegion'),
      groups: $('#groups'),
      speed: $('#btnSpeed'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this.mmBase = null;
    this.alerts = [];
    this.lastAlertPos = null;
    this.bannerT = 0;
    this._lastSelKey = '';
    this._bindMinimap();
    this._bindTopbar();
  }

  /* ============================================================ démarrage */
  onGameStart(){
    this.el.hud.classList.remove('hidden');
    this.el.mmRegion.textContent = this.game.region.name.toUpperCase();
    this._renderMinimapBase();
    this.el.alerts.innerHTML = '';
    this.alerts = [];
    this.el.threatBox.classList.toggle('hidden', !this.game.aliens.active);
    this.refreshSelection([]);
  }
  hide(){ this.el.hud.classList.add('hidden'); }

  /* ============================================================ barre supérieure */
  _bindTopbar(){
    this.el.speed.addEventListener('click', ()=>{
      const g = this.game;
      g.speed = g.speed === 1 ? 2 : (g.speed === 2 ? 3 : 1);
      this.el.speed.textContent = '×' + g.speed;
    });
  }

  update(dt){
    const g = this.game, p = g.human;
    if(!g.running) return;
    const inc = p.income();
    this._setRes(this.el.food, p.res.food, inc.food);
    this._setRes(this.el.mat, p.res.mat, inc.mat);
    this._setRes(this.el.energy, p.res.energy, inc.energy);
    this.el.pop.querySelector('b').textContent = `${p.pop}/${p.popCap}`;
    this.el.pop.querySelector('b').style.color = p.pop >= p.popCap ? '#ff8f9d' : '';

    // âge + progression
    const cc = p.buildings.find(b=>b.def.canAge && b.complete && !b.dead);
    const q = cc && cc.queue.find(x=>x.kind === 'age');
    this.el.ageName.textContent = AGES[p.age].name;
    if(q){ this.el.ageFill.style.width = (q.t/q.dur*100).toFixed(1) + '%'; }
    else {
      const nx = p.ageCost();
      if(nx){
        const ratio = Math.min(1,
          (Math.min(1, p.res.food/Math.max(1,nx.food)) +
           Math.min(1, p.res.mat/Math.max(1,nx.mat)) +
           Math.min(1, p.res.energy/Math.max(1,nx.energy||1))) / 3);
        this.el.ageFill.style.width = (ratio*100).toFixed(1) + '%';
        this.el.ageFill.style.opacity = 0.4;
      } else { this.el.ageFill.style.width = '100%'; }
    }
    if(q) this.el.ageFill.style.opacity = 1;

    const t = Math.floor(g.time);
    this.el.clock.textContent = `${String((t/60)|0).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;

    // alertes temporisées
    for(let i=this.alerts.length-1;i>=0;i--){
      const a = this.alerts[i];
      a.t -= dt;
      if(a.t <= 0){ a.el.remove(); this.alerts.splice(i, 1); }
    }
    if(this.bannerT > 0){
      this.bannerT -= dt;
      if(this.bannerT <= 0) this.el.banner.classList.add('hidden');
    }

    this._refreshSelectionLive();
    this._drawMinimap();
  }

  _setRes(el, v, inc){
    el.querySelector('b').textContent = Math.floor(v);
    const e = el.querySelector('em');
    e.textContent = inc > 0.01 ? '+' + inc.toFixed(1) : '';
  }

  setThreat(v){
    this.el.threatFill.style.width = (v*100).toFixed(0) + '%';
  }

  /* ============================================================ alertes */
  alert({kind = 'info', title = '', text = '', at = null}){
    const d = document.createElement('div');
    d.className = 'alert ' + (kind === 'bad' ? 'bad' : kind === 'warn' ? 'warn' : kind === 'good' ? 'good' : '');
    d.innerHTML = `<b>${title}</b>${text}`;
    if(at){
      d.style.cursor = 'pointer';
      d.classList.add('clickable');
      d.addEventListener('click', ()=>this.engine.lookAt(at.x, at.z));
      this.lastAlertPos = at;
    }
    this.el.alerts.appendChild(d);
    this.alerts.push({ el:d, t:7 });
    while(this.alerts.length > 5){ const a = this.alerts.shift(); a.el.remove(); }
  }

  banner(title, text, dur = 4.5){
    this.el.bannerTitle.textContent = title;
    this.el.bannerText.textContent = text;
    this.el.banner.classList.remove('hidden');
    this.bannerT = dur;
  }

  gotoLastAlert(){
    if(this.lastAlertPos) this.engine.lookAt(this.lastAlertPos.x, this.lastAlertPos.z);
  }

  /* ============================================================ minimap */
  _bindMinimap(){
    const c = this.el.minimap;
    const move = (e)=>{
      const r = c.getBoundingClientRect();
      const x = ((e.clientX - r.left)/r.width) * WORLD - HALF;
      const z = ((e.clientY - r.top)/r.height) * WORLD - HALF;
      this.engine.lookAt(x, z);
    };
    c.addEventListener('pointerdown', e=>{ this._mmDrag = true; move(e); c.setPointerCapture?.(e.pointerId); });
    c.addEventListener('pointermove', e=>{ if(this._mmDrag) move(e); });
    window.addEventListener('pointerup', ()=>{ this._mmDrag = false; });
    c.classList.add('clickable');
  }

  _renderMinimapBase(){
    const g = this.game, t = g.terrain;
    const S = 220;
    const cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(S, S);
    const pal = g.region.palette;
    const hex = (h)=>[ (h>>16)&255, (h>>8)&255, h&255 ];
    const cLow = hex(pal.low), cMid = hex(pal.mid), cHigh = hex(pal.high), cW = hex(pal.water);
    for(let j=0;j<S;j++){
      for(let i=0;i<S;i++){
        const x = (i/S)*WORLD - HALF, z = (j/S)*WORLD - HALF;
        const h = t.heightAt(x, z);
        let c;
        if(h < 0.55){ c = cW; }
        else {
          const k = Math.max(0, Math.min(1, (h-1)/15));
          const a = k < 0.45 ? cLow : cMid, b = k < 0.45 ? cMid : cHigh;
          const kk = k < 0.45 ? k/0.45 : (k-0.45)/0.55;
          c = [ a[0]+(b[0]-a[0])*kk, a[1]+(b[1]-a[1])*kk, a[2]+(b[2]-a[2])*kk ];
        }
        const sh = 0.72 + Math.max(0, Math.min(1, (t.heightAt(x+2,z) - h) * -0.22 + 0.28));
        const o = (j*S+i)*4;
        img.data[o] = c[0]*sh; img.data[o+1] = c[1]*sh; img.data[o+2] = c[2]*sh; img.data[o+3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.mmBase = cv;
  }

  _drawMinimap(){
    const g = this.game;
    const ctx = this.mm, S = 220;
    if(!this.mmBase) return;
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(this.mmBase, 0, 0);
    const P = (x, z)=>[ ((x + HALF)/WORLD)*S, ((z + HALF)/WORLD)*S ];

    // gisements
    ctx.globalAlpha = 0.65;
    for(const n of g.nodes){
      const [x, y] = P(n.x, n.z);
      ctx.fillStyle = n.res === 'food' ? '#ff8f57' : n.res === 'energy' ? '#c48bff' : '#8fd6ff';
      ctx.fillRect(x-0.6, y-0.6, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;

    // bâtiments
    for(const b of g.buildings){
      if(b.dead) continue;
      const [x, y] = P(b.x, b.z);
      ctx.fillStyle = '#' + b.player.color.toString(16).padStart(6,'0');
      const s = b.def.key === 'command' ? 6 : 4;
      ctx.fillRect(x - s/2, y - s/2, s, s);
      if(b.player === g.human){ ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1; ctx.strokeRect(x-s/2, y-s/2, s, s); }
    }
    // unités
    for(const u of g.units){
      if(u.dead) continue;
      const [x, y] = P(u.x, u.z);
      ctx.fillStyle = u.player.hostileToAll ? '#e04dff' : '#' + u.player.color.toString(16).padStart(6,'0');
      const s = u.role === 'heavy' ? 3 : 2.2;
      ctx.fillRect(x - s/2, y - s/2, s, s);
    }
    // sélection
    ctx.fillStyle = '#ffffff';
    for(const e of g.selected){
      const [x, y] = P(e.x, e.z);
      ctx.fillRect(x-1, y-1, 2.6, 2.6);
    }

    // cadre caméra
    const c = this.engine;
    const [cx, cy] = P(c.target.x, c.target.z);
    const w = (c.dist * 1.15 / WORLD) * S;
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(cx - w/2, cy - w/2*0.66, w, w*0.66);
  }

  /* ============================================================ sélection */
  refreshSelection(sel){
    const g = this.game;
    this._sel = sel;
    const el = this.el;

    if(!sel.length){
      el.selName.textContent = 'Aucune sélection';
      el.selStats.innerHTML = '';
      el.selPortrait.textContent = '';
      el.selBar.style.width = '0%';
      el.selList.innerHTML = '';
      el.queueRow.innerHTML = '';
      this._buildCommands(null);
      return;
    }

    const main = sel[0];
    el.selPortrait.textContent = main.type === 'unit' ? UNITS[main.key].icon : BUILDINGS[main.key].icon;
    el.selName.textContent = sel.length > 1 ? `${sel.length} unités sélectionnées` : main.name;

    const stats = [];
    if(main.type === 'unit'){
      stats.push(`<span>PV <b>${Math.ceil(main.hp)}/${main.maxHp}</b></span>`);
      stats.push(`<span>ATQ <b>${main.atk.toFixed(0)}</b></span>`);
      stats.push(`<span>ARM <b>${main.armor.toFixed(0)}</b></span>`);
      if(main.range > 3) stats.push(`<span>PORTÉE <b>${main.range.toFixed(0)}</b></span>`);
      if(main.role === 'worker' && main.carry.amount > 0.5)
        stats.push(`<span>PORTE <b>${Math.floor(main.carry.amount)} ${RES[main.carry.type].name}</b></span>`);
    } else {
      stats.push(`<span>PV <b>${Math.ceil(main.hp)}/${main.maxHp}</b></span>`);
      if(!main.complete) stats.push(`<span>CONSTRUCTION <b>${(main.progress*100).toFixed(0)} %</b></span>`);
      if(main.def.pop) stats.push(`<span>POP <b>+${main.def.pop}</b></span>`);
      if(main.def.income){
        for(const k in main.def.income) stats.push(`<span>${RES[k].name.toUpperCase()} <b>continu</b></span>`);
      }
    }
    el.selStats.innerHTML = stats.join('');
    el.selBar.style.width = (main.hp/main.maxHp*100).toFixed(0) + '%';

    // vignettes
    if(sel.length > 1){
      el.selList.innerHTML = sel.map((e, i)=>{
        const icon = e.type === 'unit' ? UNITS[e.key].icon : BUILDINGS[e.key].icon;
        return `<div class="selchip clickable" data-i="${i}" title="${e.name}">${icon}<i style="transform:scaleX(${(e.hp/e.maxHp).toFixed(2)})"></i></div>`;
      }).join('');
      el.selList.querySelectorAll('.selchip').forEach(c=>{
        c.addEventListener('click', ()=>{
          const e = sel[+c.dataset.i];
          if(e && !e.dead) this.game.select([e], false);
        });
      });
    } else el.selList.innerHTML = '';

    this._buildCommands(main);
    this._lastSelKey = '';
  }

  _refreshSelectionLive(){
    const sel = this._sel;
    if(!sel || !sel.length) return;
    const main = sel[0];
    if(main.dead) return;
    this.el.selBar.style.width = (main.hp/main.maxHp*100).toFixed(0) + '%';

    // file de production
    if(main.type === 'building' && main.queue){
      const key = main.queue.map(q=>q.kind + (q.key||'') + q.t.toFixed(1)).join('|');
      if(key !== this._lastSelKey){
        this._lastSelKey = key;
        this.el.queueRow.innerHTML = main.queue.map((q, i)=>{
          const pct = Math.min(100, q.t/q.dur*100);
          return `<div class="qchip clickable" data-i="${i}" title="Annuler"><div class="fill" style="height:${pct}%"></div>${q.icon || '⏳'}</div>`;
        }).join('');
        this.el.queueRow.querySelectorAll('.qchip').forEach(c=>{
          c.addEventListener('click', ()=>{ main.cancelQueue(+c.dataset.i); this._lastSelKey = ''; });
        });
      }
      if(!main.complete){
        this.el.selStats.querySelectorAll('span')[1] &&
          (this.el.selStats.querySelectorAll('span')[1].innerHTML = `CONSTRUCTION <b>${(main.progress*100).toFixed(0)} %</b>`);
      }
    } else if(this.el.queueRow.innerHTML) this.el.queueRow.innerHTML = '';

    // état des boutons (coût atteignable)
    if(this._cmdRefresh) this._cmdRefresh();
  }

  /* ============================================================ panneau de commandes */
  _buildCommands(main){
    const g = this.game, p = g.human;
    const grid = this.el.cmdGrid;
    grid.innerHTML = '';
    this._cmdRefresh = null;
    const cmds = [];

    const isOwn = main && main.player === p;

    if(isOwn && main.type === 'building' && main.complete){
      const d = main.def;
      if(d.produces){
        for(const key of d.produces){
          const u = UNITS[key];
          if(!u) continue;
          if(!!u.alien !== !!p.alien) continue;
          if(!unitsFor(p.faction).includes(key)) continue;
          cmds.push({
            icon:u.icon, label:unitName(key, p.age), locked:p.age < u.minAge,
            cost:()=>p.unitCost(key),
            tip:`${unitName(key, p.age)} — ${u.desc}`,
            lockTip:`Disponible à l'${AGES[u.minAge].name}`,
            action:()=>g.trainFromSelection(key),
          });
        }
      }
      if(d.canAge){
        const nx = AGES[p.age+1];
        if(nx) cmds.push({
          icon:nx.icon, label:'Âge suivant', hot:true,
          cost:()=>p.ageCost(),
          tip:`Passer à l'${nx.name} — ${nx.desc}`,
          action:()=>g.advanceAge(),
        });
      }
      if(d.research){
        for(const k in RESEARCH){
          const R = RESEARCH[k];
          const lvl = p.upgrades[k];
          cmds.push({
            icon:R.icon, label:`${R.name} ${lvl}/${R.levels}`,
            locked: lvl >= R.levels || p.age < R.minAge,
            cost:()=> lvl >= R.levels ? null : R.cost(lvl+1),
            tip:`${R.name} — ${R.desc}`,
            lockTip: lvl >= R.levels ? 'Niveau maximal atteint' : `Requiert l'${AGES[R.minAge].name}`,
            action:()=>g.research(k),
          });
        }
      }
    }

    if(isOwn && main.type === 'unit'){
      const workers = g.selected.filter(e=>e.type === 'unit' && e.role === 'worker' && e.player === p);
      if(workers.length){
        for(const key of BUILD_ORDER){
          const b = BUILDINGS[key];
          cmds.push({
            icon:b.icon, label:buildingName(key, p.age), key:BUILD_KEYS[key],
            locked:p.age < b.minAge,
            cost:()=>p.buildingCost(key),
            tip:`${buildingName(key, p.age)} — ${b.desc}`,
            lockTip:`Disponible à l'${AGES[b.minAge].name}`,
            action:()=>g.beginPlacement(key),
          });
        }
      }
      cmds.push({ icon:'✋', label:'Stop', key:'x', tip:'Interrompt tous les ordres en cours.', action:()=>g.stopSelected() });
    }

    // rendu
    for(const c of cmds){
      const b = document.createElement('button');
      b.className = 'cmd clickable' + (c.locked ? ' locked' : '') + (c.hot ? ' hot' : '');
      b.innerHTML = `${c.icon}<small>${c.label}</small>` + (c.key ? `<span class="hk">${c.key.toUpperCase()}</span>` : '');
      b.addEventListener('click', ()=>{ if(!c.locked) c.action(); else this.game.audio.play('deny'); });
      b.addEventListener('mouseenter', ()=>this._tip(c));
      b.addEventListener('mouseleave', ()=>this._tip(null));
      grid.appendChild(b);
      c.el = b;
      if(c.key) (this.hotkeys = this.hotkeys || {})[c.key] = c;
    }
    this.hotkeys = {};
    for(const c of cmds) if(c.key && !c.locked) this.hotkeys[c.key] = c;

    this._cmdRefresh = ()=>{
      for(const c of cmds){
        if(c.locked) continue;
        const cost = c.cost ? c.cost() : null;
        const ok = !cost || p.canAfford(cost);
        c.el.style.opacity = ok ? '' : '0.55';
      }
    };
    this._cmdRefresh();
  }

  _tip(c){
    const t = this.el.cmdTip;
    if(!c){ t.innerHTML = ''; return; }
    const cost = c.cost ? c.cost() : null;
    let cl = '';
    if(cost){
      const parts = [];
      for(const k of ['food','mat','energy']){
        if(cost[k]) parts.push(`<u><i style="background:${RES[k].css}"></i>${cost[k]}</u>`);
      }
      cl = `<div class="costline">${parts.join('')}</div>`;
    }
    t.innerHTML = `<b>${c.label}</b>${c.locked ? (c.lockTip || 'Indisponible') : c.tip}${c.locked ? '' : cl}`;
  }

  triggerHotkey(k){
    const c = this.hotkeys && this.hotkeys[k];
    if(c && !c.locked){ c.action(); return true; }
    return false;
  }

  updateGroups(groups){
    const el = this.el.groups;
    el.innerHTML = '';
    for(const k of Object.keys(groups).sort()){
      const list = (groups[k] || []).filter(u=>!u.dead);
      if(!list.length) continue;
      const d = document.createElement('div');
      d.className = 'grp clickable';
      d.innerHTML = `${k}<sub style="font-size:7px;opacity:.7">${list.length}</sub>`;
      d.addEventListener('click', ()=>this.game.recallGroup(k));
      el.appendChild(d);
    }
  }
}
