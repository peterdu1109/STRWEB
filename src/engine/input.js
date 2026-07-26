/* ============================================================
   Entrées : souris, clavier, sélection rectangulaire, bords d'écran
   ============================================================ */
export class Input{
  constructor(el){
    this.el = el;
    this.mouse = {x:0, y:0, inside:false};
    this.keys = new Set();
    this.drag = null;             // {x0,y0,x1,y1,active}
    this.enabled = false;
    this.edgeScroll = true;
    this.handlers = {};           // onSelect, onCommand, onHover, onZoom…
    this._lastClick = 0; this._lastClickBtn = -1;
    this._orbit = null;
    this._bind();
  }
  on(name, fn){ this.handlers[name] = fn; return this; }
  _fire(name, ...a){ const f = this.handlers[name]; if(f) f(...a); }

  _bind(){
    const el = this.el;
    el.addEventListener('contextmenu', e=>e.preventDefault());

    el.addEventListener('pointerdown', e=>{
      if(!this.enabled) return;
      el.setPointerCapture?.(e.pointerId);
      if(e.button === 0){
        this.drag = {x0:e.clientX, y0:e.clientY, x1:e.clientX, y1:e.clientY, active:false, add:e.shiftKey};
      } else if(e.button === 2){
        this._rightDown = {x:e.clientX, y:e.clientY, t:performance.now()};
      } else if(e.button === 1){
        this._orbit = {x:e.clientX, y:e.clientY};
        e.preventDefault();
      }
    });

    window.addEventListener('pointermove', e=>{
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
      if(!this.enabled) return;
      if(this.drag){
        this.drag.x1 = e.clientX; this.drag.y1 = e.clientY;
        if(!this.drag.active && Math.hypot(this.drag.x1-this.drag.x0, this.drag.y1-this.drag.y0) > 7) this.drag.active = true;
      }
      if(this._orbit){
        const dx = e.clientX - this._orbit.x, dy = e.clientY - this._orbit.y;
        this._fire('orbit', dx * 0.006, dy * 0.004);
        this._orbit.x = e.clientX; this._orbit.y = e.clientY;
      }
      this._fire('move', e.clientX, e.clientY);
    });

    window.addEventListener('pointerup', e=>{
      if(!this.enabled){ this.drag = null; this._orbit = null; return; }
      if(e.button === 0 && this.drag){
        const d = this.drag; this.drag = null;
        if(d.active){
          this._fire('boxSelect', Math.min(d.x0,d.x1), Math.min(d.y0,d.y1), Math.max(d.x0,d.x1), Math.max(d.y0,d.y1), d.add);
        } else {
          const now = performance.now();
          const dbl = (now - this._lastClick < 300 && this._lastClickBtn === 0);
          this._lastClick = now; this._lastClickBtn = 0;
          this._fire('click', e.clientX, e.clientY, d.add, dbl);
        }
      }
      if(e.button === 2 && this._rightDown){
        this._fire('command', e.clientX, e.clientY, e.shiftKey);
        this._rightDown = null;
      }
      if(e.button === 1) this._orbit = null;
    });

    el.addEventListener('wheel', e=>{
      if(!this.enabled) return;
      e.preventDefault();
      this._fire('zoom', Math.sign(e.deltaY) * 0.12);
    }, {passive:false});

    window.addEventListener('keydown', e=>{
      const k = e.key.toLowerCase();
      if(e.repeat) { return; }
      this.keys.add(k);
      if(e.code === 'Space') this.keys.add('space');
      this._fire('key', k, e);
    });
    window.addEventListener('keyup', e=>{
      this.keys.delete(e.key.toLowerCase());
      if(e.code === 'Space') this.keys.delete('space');
    });
    window.addEventListener('blur', ()=>{ this.keys.clear(); this.drag = null; this._orbit = null; });
  }

  isDown(...k){ return k.some(x=>this.keys.has(x)); }

  /* vecteur de défilement caméra (clavier + bords d'écran) */
  scrollVector(){
    let x = 0, z = 0;
    if(this.isDown('z','w','arrowup')) z -= 1;
    if(this.isDown('s','arrowdown')) z += 1;
    if(this.isDown('q','a','arrowleft')) x -= 1;
    if(this.isDown('d','arrowright')) x += 1;
    if(this.edgeScroll && this.mouse.inside && !this.drag){
      const m = 12, w = window.innerWidth, h = window.innerHeight;
      if(this.mouse.x < m) x -= 1; else if(this.mouse.x > w - m) x += 1;
      if(this.mouse.y < m) z -= 1; else if(this.mouse.y > h - m - 190 && this.mouse.y < h - 188) {}
      if(this.mouse.y < m) z -= 1;
      else if(this.mouse.y > h - m) z += 1;
    }
    const l = Math.hypot(x, z) || 1;
    return {x:x/l*Math.min(1,Math.hypot(x,z)), z:z/l*Math.min(1,Math.hypot(x,z))};
  }
}
