/* ============================================================
   Mise à jour automatique
   Le fichier version.json est réécrit à chaque release par la CI.
   Le client le surveille et se recharge sur la nouvelle version.
   ============================================================ */

const URL = './version.json';
const POLL_MS = 90_000;

export class Updater{
  constructor(){
    this.current = null;
    this.latest = null;
    this.pending = false;
    this.onUpdate = null;      // (info) => void
    this._timer = null;
  }

  async _fetch(){
    try{
      const r = await fetch(`${URL}?t=${Date.now()}`, { cache:'no-store' });
      if(!r.ok) return null;
      return await r.json();
    }catch(e){ return null; }
  }

  async init(){
    const v = await this._fetch();
    if(v){
      this.current = v;
      document.documentElement.dataset.version = v.version || 'dev';
    }
    this.start();
    return this.current;
  }

  start(){
    if(this._timer) return;
    this._timer = setInterval(()=>this.check(), POLL_MS);
    // vérifie aussi au retour d'onglet
    document.addEventListener('visibilitychange', ()=>{
      if(document.visibilityState === 'visible') this.check();
    });
  }

  async check(){
    if(this.pending) return;
    const v = await this._fetch();
    if(!v || !this.current) return;
    if(v.version && v.version !== this.current.version){
      this.latest = v;
      this.pending = true;
      if(this.onUpdate) this.onUpdate(v);
    }
  }

  /* recharge en contournant le cache */
  apply(){
    const u = new URL(window.location.href);
    u.searchParams.set('v', (this.latest && this.latest.version) || Date.now());
    window.location.replace(u.toString());
  }

  get versionLabel(){
    return this.current ? (this.current.version || 'dev') : 'dev';
  }
}

export const updater = new Updater();
