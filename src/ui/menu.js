/* ============================================================
   Menu principal : races, régions, options, globe interactif
   ============================================================ */
import { FACTION_LIST, FACTIONS, REGION_LIST, REGIONS, AGES } from '../data/gamedata.js';
import { Globe } from './globe.js';

const $ = s=>document.querySelector(s);
const $$ = s=>Array.from(document.querySelectorAll(s));

export class Menu{
  constructor(onLaunch, audio){
    this.onLaunch = onLaunch;
    this.audio = audio;
    this.cfg = {
      faction:'coalition', region:'europe', opponents:2, difficulty:1,
      startAge:0, aliens:1, quality:1, shadows:true, edge:true, music:45, sfx:70,
    };
    this._loadPrefs();
    this._buildNav();
    this._buildRaces();
    this._buildRegions();
    this._buildSegments();
    this._buildRaceCards();
    this._buildAges();
    this._buildOptions();
    this._buildGlobe();
    this._updateMeta();

    $('#btnLaunch').addEventListener('click', ()=>{
      this.audio.resume();
      this.audio.play('click');
      this._savePrefs();
      this.onLaunch({ ...this.cfg });
    });
  }

  /* -------------------------------------------------- persistance */
  _loadPrefs(){
    try{
      const raw = localStorage.getItem('aeon.cfg');
      if(raw) Object.assign(this.cfg, JSON.parse(raw));
    }catch(e){ /* stockage indisponible : on garde les valeurs par défaut */ }
  }
  _savePrefs(){
    try{ localStorage.setItem('aeon.cfg', JSON.stringify(this.cfg)); }catch(e){}
  }

  show(){
    $('#menu').classList.remove('hidden');
    if(this.globe){ this.globe.resize(); this.globe.start(); }
  }
  hide(){ $('#menu').classList.add('hidden'); if(this.globe) this.globe.stop(); }

  /* -------------------------------------------------- navigation */
  _buildNav(){
    $$('.nav-btn').forEach(b=>{
      b.addEventListener('click', ()=>{
        $$('.nav-btn').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        $$('.panel').forEach(p=>p.classList.remove('active'));
        $('#panel-' + b.dataset.panel).classList.add('active');
        this.audio.play('click');
      });
    });
  }

  /* -------------------------------------------------- races */
  _buildRaces(){
    const el = $('#raceStrip');
    el.innerHTML = FACTION_LIST.map(f=>`
      <button class="race-chip clickable" data-k="${f.key}" style="--c:${f.css}">
        <span class="bg" style="background:radial-gradient(circle at 50% 20%, ${f.css}, transparent 70%)"></span>
        <span class="glyph" style="color:${f.css}">${f.glyph}</span>
        <div class="rn">${f.name.split(' ')[0]}</div>
        <div class="rt">${f.tag.split(' — ')[1] || f.tag}</div>
      </button>`).join('');
    el.querySelectorAll('.race-chip').forEach(b=>{
      b.addEventListener('click', ()=>{
        this.cfg.faction = b.dataset.k;
        this._syncRaces();
        this.audio.play('select');
        this._updateMeta();
      });
    });
    this._syncRaces();
  }
  _syncRaces(){
    $$('#raceStrip .race-chip').forEach(b=>{
      const on = b.dataset.k === this.cfg.faction;
      b.classList.toggle('on', on);
      const f = FACTIONS[b.dataset.k];
      b.style.background = on ? `linear-gradient(180deg, ${f.css}28, ${f.css}08)` : '';
      b.style.boxShadow = on ? `0 0 0 1px ${f.css}88, 0 10px 26px ${f.css}30` : '';
    });
  }

  /* -------------------------------------------------- régions */
  _buildRegions(){
    const el = $('#regionStrip');
    el.innerHTML = REGION_LIST.map(r=>`
      <button class="region-chip clickable" data-k="${r.key}">
        <b>${r.name}</b><span>${r.sub}</span>
      </button>`).join('');
    el.querySelectorAll('.region-chip').forEach(b=>{
      b.addEventListener('click', ()=>this.pickRegion(b.dataset.k));
    });
    this._syncRegions();
  }
  pickRegion(key){
    this.cfg.region = key;
    this._syncRegions();
    this.audio.play('select');
    if(this.globe){ this.globe.setActive(key); this.globe.focus(REGIONS[key]); }
    const r = REGIONS[key];
    $('#globeTitle').textContent = r.name.toUpperCase();
    $('#globeSub').textContent = r.desc;
    $('#regionHint').textContent = '— ' + r.sub;
    this._updateMeta();
  }
  _syncRegions(){
    $$('#regionStrip .region-chip').forEach(b=>b.classList.toggle('on', b.dataset.k === this.cfg.region));
  }

  /* -------------------------------------------------- segments */
  _buildSegments(){
    const map = [
      ['#segOpponents', 'opponents'],
      ['#segDifficulty', 'difficulty'],
      ['#segStart', 'startAge'],
      ['#segAliens', 'aliens'],
    ];
    for(const [sel, key] of map){
      const el = $(sel);
      el.querySelectorAll('button').forEach(b=>{
        b.addEventListener('click', ()=>{
          this.cfg[key] = +b.dataset.v;
          el.querySelectorAll('button').forEach(x=>x.classList.remove('on'));
          b.classList.add('on');
          this.audio.play('click');
          this._updateMeta();
        });
      });
      // synchronisation avec la config chargée
      el.querySelectorAll('button').forEach(b=>b.classList.toggle('on', +b.dataset.v === this.cfg[key]));
      if(!el.querySelector('button.on')) el.querySelector('button').classList.add('on');
    }
  }

  _updateMeta(){
    const f = FACTIONS[this.cfg.faction], r = REGIONS[this.cfg.region];
    const diff = ['Recrue','Vétéran','Implacable'][this.cfg.difficulty];
    const al = ['désactivée','progressive','cataclysme'][this.cfg.aliens];
    $('#launchMeta').innerHTML =
      `<b>${f.name}</b> · ${r.name}<br/>` +
      `${this.cfg.opponents} adversaire${this.cfg.opponents>1?'s':''} (${diff}) · Départ : ${AGES[this.cfg.startAge].name}<br/>` +
      `Menace xéno : <b>${al}</b>`;
  }

  /* -------------------------------------------------- fiches races */
  _buildRaceCards(){
    $('#raceCards').innerHTML = FACTION_LIST.map(f=>`
      <div class="rcard" style="--c:${f.css}">
        <h3 style="color:${f.css}">${f.glyph} ${f.name}</h3>
        <div class="sub">${f.tag}</div>
        <p>${f.desc}</p>
        <ul>${f.traits.map(t=>`<li>${t}</li>`).join('')}</ul>
      </div>`).join('');
  }

  /* -------------------------------------------------- âges */
  _buildAges(){
    $('#ageTrack').innerHTML = AGES.map((a, i)=>`
      <div class="age-row">
        <div class="age-num">${i+1}</div>
        <div>
          <h4>${a.icon} ${a.name}</h4>
          <p>${a.desc}</p>
          <div class="tags">${a.tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div>
        </div>
      </div>`).join('');
  }

  /* -------------------------------------------------- options */
  _buildOptions(){
    const music = $('#optMusic'), sfx = $('#optSfx');
    music.value = this.cfg.music; sfx.value = this.cfg.sfx;
    $('#optMusicVal').textContent = this.cfg.music;
    $('#optSfxVal').textContent = this.cfg.sfx;
    music.addEventListener('input', ()=>{
      this.cfg.music = +music.value;
      $('#optMusicVal').textContent = music.value;
      this.audio.setMusic(this.cfg.music/100);
      this._savePrefs();
    });
    sfx.addEventListener('input', ()=>{
      this.cfg.sfx = +sfx.value;
      $('#optSfxVal').textContent = sfx.value;
      this.audio.setSfx(this.cfg.sfx/100);
      this._savePrefs();
    });
    const sq = $('#segQuality');
    sq.querySelectorAll('button').forEach(b=>{
      b.classList.toggle('on', +b.dataset.v === this.cfg.quality);
      b.addEventListener('click', ()=>{
        this.cfg.quality = +b.dataset.v;
        sq.querySelectorAll('button').forEach(x=>x.classList.remove('on'));
        b.classList.add('on');
        this.onOption && this.onOption('quality', this.cfg.quality);
        this._savePrefs();
      });
    });
    const sh = $('#optShadows'), ed = $('#optEdge');
    sh.checked = this.cfg.shadows; ed.checked = this.cfg.edge;
    sh.addEventListener('change', ()=>{ this.cfg.shadows = sh.checked; this.onOption && this.onOption('shadows', sh.checked); this._savePrefs(); });
    ed.addEventListener('change', ()=>{ this.cfg.edge = ed.checked; this.onOption && this.onOption('edge', ed.checked); this._savePrefs(); });
  }

  /* -------------------------------------------------- globe */
  _buildGlobe(){
    const canvas = $('#globe');
    if(!canvas) return;
    try{
      this.globe = new Globe(canvas, REGION_LIST, r=>this.pickRegion(r.key));
      this.globe.setActive(this.cfg.region);
      this.globe.focus(REGIONS[this.cfg.region]);
      const r = REGIONS[this.cfg.region];
      $('#globeTitle').textContent = r.name.toUpperCase();
      $('#globeSub').textContent = r.desc;
    }catch(e){
      console.warn('Globe indisponible', e);
      canvas.style.display = 'none';
    }
  }
}
