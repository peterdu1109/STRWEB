/* ============================================================
   Audio 100 % procédural (WebAudio) : nappe ambiante + effets
   ============================================================ */
export class Audio{
  constructor(){
    this.ctx = null;
    this.musicGain = null; this.sfxGain = null;
    this.musicVol = 0.45; this.sfxVol = 0.7;
    this.started = false;
    this.tension = 0;          // 0 = calme, 1 = invasion
    this._last = {};
  }

  init(){
    if(this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.musicVol * 0.5; this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = this.sfxVol; this.sfxGain.connect(this.master);

    // réverbération courte (impulse générée)
    const len = this.ctx.sampleRate * 1.9;
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for(let c=0;c<2;c++){
      const d = buf.getChannelData(c);
      for(let i=0;i<len;i++) d[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 2.8);
    }
    this.verb = this.ctx.createConvolver(); this.verb.buffer = buf;
    this.verbGain = this.ctx.createGain(); this.verbGain.gain.value = 0.3;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);
  }

  resume(){ this.init(); if(this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setMusic(v){ this.musicVol = v; if(this.musicGain) this.musicGain.gain.value = v * 0.5; }
  setSfx(v){ this.sfxVol = v; if(this.sfxGain) this.sfxGain.gain.value = v; }

  /* -------------------------------------------------- musique */
  startMusic(){
    this.resume();
    if(!this.ctx || this.started) return;
    this.started = true;
    this.step = 0;
    this._schedule();
  }
  stopMusic(){ this.started = false; if(this._timer) clearTimeout(this._timer); }

  _schedule(){
    if(!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    const bpm = 74 + this.tension * 26;
    const beat = 60 / bpm;
    this._playStep(t, beat);
    this.step++;
    this._timer = setTimeout(()=>this._schedule(), beat * 1000);
  }

  _playStep(t, beat){
    const s = this.step % 32;
    const root = 55 * (this.tension > 0.5 ? 1.0 : 1.0);
    const scale = this.tension > 0.5 ? [0,3,5,6,7,10] : [0,2,3,5,7,10];   // mineur / mineur blues
    // nappe toutes les 8 mesures
    if(s % 8 === 0){
      const deg = scale[(this.step/8|0) % scale.length];
      const f = root * Math.pow(2, deg/12);
      this._pad(t, f, beat*8);
      this._pad(t, f*1.5, beat*8, 0.5);
    }
    // pulsation grave
    if(s % 4 === 0) this._kick(t);
    if(this.tension > 0.25 && s % 4 === 2) this._hat(t, 0.25);
    if(this.tension > 0.6 && s % 8 === 6) this._hat(t, 0.4);
    // arpège cristallin
    if(s % 2 === 0){
      const deg = scale[(this.step*3) % scale.length];
      const f = root * 4 * Math.pow(2, deg/12);
      this._blip(t, f, 0.09 + this.tension*0.05, beat*1.4);
    }
  }
  _pad(t, f, dur, amp=1){
    const c = this.ctx, g = c.createGain(), o1 = c.createOscillator(), o2 = c.createOscillator(), flt = c.createBiquadFilter();
    o1.type='sawtooth'; o2.type='sawtooth';
    o1.frequency.value=f; o2.frequency.value=f*1.006;
    flt.type='lowpass'; flt.frequency.value = 320 + this.tension*700; flt.Q.value=3;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09*amp, t+dur*0.28);
    g.gain.linearRampToValueAtTime(0, t+dur);
    o1.connect(flt); o2.connect(flt); flt.connect(g); g.connect(this.musicGain); g.connect(this.verb);
    o1.start(t); o2.start(t); o1.stop(t+dur+0.1); o2.stop(t+dur+0.1);
  }
  _blip(t, f, amp, dur){
    const c=this.ctx, o=c.createOscillator(), g=c.createGain();
    o.type='triangle'; o.frequency.value=f;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(amp,t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(this.musicGain); g.connect(this.verb);
    o.start(t); o.stop(t+dur+0.05);
  }
  _kick(t){
    const c=this.ctx, o=c.createOscillator(), g=c.createGain();
    o.frequency.setValueAtTime(110,t); o.frequency.exponentialRampToValueAtTime(38,t+0.16);
    g.gain.setValueAtTime(0.5,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.3);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t+0.32);
  }
  _hat(t, amp){
    const c=this.ctx, n=this._noise(0.06), g=c.createGain(), f=c.createBiquadFilter();
    f.type='highpass'; f.frequency.value=6500;
    g.gain.setValueAtTime(amp*0.16,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.06);
    n.connect(f); f.connect(g); g.connect(this.musicGain); n.start(t);
  }
  _noise(dur){
    const c=this.ctx, len=Math.max(1, (c.sampleRate*dur)|0), b=c.createBuffer(1,len,c.sampleRate), d=b.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    const s=c.createBufferSource(); s.buffer=b; return s;
  }

  /* -------------------------------------------------- effets */
  _throttle(k, ms){
    const n = performance.now();
    if(this._last[k] && n - this._last[k] < ms) return false;
    this._last[k] = n; return true;
  }

  play(name, vol=1){
    if(!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, t = c.currentTime;
    switch(name){
      case 'click':   this._tone(t, 880, 0.05, 'square', 0.06*vol); break;
      case 'select':  if(this._throttle('select',60)) { this._tone(t, 660, 0.07, 'triangle', 0.13*vol); this._tone(t+0.04, 990, 0.06, 'triangle', 0.09*vol); } break;
      case 'move':    if(this._throttle('move',90)) this._tone(t, 420, 0.06, 'sine', 0.10*vol); break;
      case 'deny':    this._tone(t, 160, 0.14, 'square', 0.10*vol); break;
      case 'place':   this._tone(t, 300, 0.1, 'sine', 0.16*vol); this._tone(t+0.06, 450, 0.1, 'sine', 0.12*vol); break;
      case 'ready':   this._tone(t, 700, 0.09, 'triangle', 0.14*vol); this._tone(t+0.08, 1050, 0.14, 'triangle', 0.12*vol); break;
      case 'age':     [0,0.13,0.26,0.42].forEach((d,i)=>this._tone(t+d, 440*Math.pow(2,i/4), 0.4, 'triangle', 0.17*vol)); break;
      case 'shoot':   if(this._throttle('shoot',45)) this._burst(t, 0.05, 2200, 0.10*vol); break;
      case 'hit':     if(this._throttle('hit',55)) this._burst(t, 0.07, 900, 0.10*vol); break;
      case 'boom':    if(this._throttle('boom',70)) this._boom(t, 0.5*vol); break;
      case 'build':   if(this._throttle('build',260)) this._burst(t, 0.05, 500, 0.06*vol); break;
      case 'alert':   this._tone(t, 520, 0.16, 'square', 0.12*vol); this._tone(t+0.2, 400, 0.24, 'square', 0.12*vol); break;
      case 'alien':   this._alien(t, vol); break;
      case 'win':     [0,0.16,0.32,0.5,0.72].forEach((d,i)=>this._tone(t+d, 392*Math.pow(2,[0,0.25,0.42,0.58,1][i]), 0.6, 'triangle', 0.18*vol)); break;
      case 'lose':    [0,0.2,0.42].forEach((d,i)=>this._tone(t+d, 300/Math.pow(1.28,i), 0.9, 'sawtooth', 0.14*vol)); break;
    }
  }
  _tone(t, f, dur, type, amp){
    const c=this.ctx, o=c.createOscillator(), g=c.createGain();
    o.type=type; o.frequency.value=f;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(amp,t+0.008);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t+dur+0.03);
  }
  _burst(t, dur, freq, amp){
    const c=this.ctx, n=this._noise(dur), g=c.createGain(), f=c.createBiquadFilter();
    f.type='bandpass'; f.frequency.setValueAtTime(freq,t); f.frequency.exponentialRampToValueAtTime(Math.max(120,freq*0.35),t+dur); f.Q.value=1.2;
    g.gain.setValueAtTime(amp,t); g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    n.connect(f); f.connect(g); g.connect(this.sfxGain); n.start(t);
  }
  _boom(t, amp){
    const c=this.ctx, n=this._noise(0.6), g=c.createGain(), f=c.createBiquadFilter(), o=c.createOscillator(), og=c.createGain();
    f.type='lowpass'; f.frequency.setValueAtTime(1600,t); f.frequency.exponentialRampToValueAtTime(90,t+0.5);
    g.gain.setValueAtTime(amp*0.5,t); g.gain.exponentialRampToValueAtTime(0.0001,t+0.6);
    n.connect(f); f.connect(g); g.connect(this.sfxGain); g.connect(this.verb); n.start(t);
    o.frequency.setValueAtTime(90,t); o.frequency.exponentialRampToValueAtTime(30,t+0.4);
    og.gain.setValueAtTime(amp*0.4,t); og.gain.exponentialRampToValueAtTime(0.0001,t+0.45);
    o.connect(og); og.connect(this.sfxGain); o.start(t); o.stop(t+0.5);
  }
  _alien(t, vol){
    const c=this.ctx, o=c.createOscillator(), g=c.createGain(), f=c.createBiquadFilter();
    o.type='sawtooth';
    o.frequency.setValueAtTime(80,t); o.frequency.exponentialRampToValueAtTime(620,t+0.7); o.frequency.exponentialRampToValueAtTime(120,t+1.6);
    f.type='bandpass'; f.frequency.value=700; f.Q.value=7;
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.22*vol,t+0.25); g.gain.exponentialRampToValueAtTime(0.0001,t+1.8);
    o.connect(f); f.connect(g); g.connect(this.sfxGain); g.connect(this.verb);
    o.start(t); o.stop(t+1.9);
  }
}
export const audio = new Audio();
