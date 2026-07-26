/* ============================================================
   Moteur de rendu : scène, caméra RTS, lumières, ciel, qualité
   ============================================================ */
import * as THREE from 'three';

export class Engine{
  constructor(canvas){
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias:true, powerPreference:'high-performance', stencil:false,
    });
    this.renderer.setClearColor(0x05070d, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.5, 900);

    // --- contrôle caméra RTS ---
    this.target = new THREE.Vector3(0, 0, 0);
    this.dist = 62;
    this.yaw = Math.PI * 0.25;
    this.pitch = 0.92;          // radians depuis l'horizontale
    this.minDist = 22; this.maxDist = 190;
    this.bounds = 120;
    this._shake = 0;

    this.quality = 1;
    this.shadowsOn = true;

    this._setupLights();
    this._setupSky();
    this.resize();
    window.addEventListener('resize', ()=>this.resize());
  }

  /* ------------------------------------------------ lumières */
  _setupLights(){
    this.hemi = new THREE.HemisphereLight(0xbcd8ff, 0x2a2418, 1.05);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2d5, 2.1);
    this.sun.position.set(60, 90, 40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = 120;
    this.sun.shadow.camera.left = -s; this.sun.shadow.camera.right = s;
    this.sun.shadow.camera.top = s;  this.sun.shadow.camera.bottom = -s;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 320;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.rim = new THREE.DirectionalLight(0x5aa0ff, 0.5);
    this.rim.position.set(-70, 40, -60);
    this.scene.add(this.rim);
  }

  /* ------------------------------------------------ ciel */
  _setupSky(){
    const geo = new THREE.SphereGeometry(520, 32, 20);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite:false,
      uniforms:{
        topColor:{ value:new THREE.Color(0x081426) },
        botColor:{ value:new THREE.Color(0x1d2c44) },
        hazeColor:{ value:new THREE.Color(0x3a5f8a) },
        offset:{ value:60 }, expo:{ value:0.7 }, uTime:{ value:0 },
      },
      vertexShader:`
        varying vec3 vW;
        void main(){ vW = (modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader:`
        uniform vec3 topColor, botColor, hazeColor; uniform float offset, expo, uTime;
        varying vec3 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){
          float h = normalize(vW + vec3(0.0, offset, 0.0)).y;
          float t = clamp(pow(max(h,0.0), expo), 0.0, 1.0);
          vec3 c = mix(botColor, topColor, t);
          c = mix(c, hazeColor, smoothstep(0.16, -0.06, h)*0.75);
          // étoiles discrètes en haute altitude
          vec2 sp = floor(normalize(vW).xz*260.0 + normalize(vW).y*90.0);
          float st = step(0.9975, hash(sp));
          c += st * t * (0.55 + 0.45*sin(uTime*2.0 + hash(sp)*30.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  setRegionMood(pal){
    this.scene.fog = new THREE.Fog(pal.fog, 130, 400);
    this.sky.material.uniforms.topColor.value.setHex(pal.sky);
    this.sky.material.uniforms.botColor.value.setHex(pal.fog);
    this.sky.material.uniforms.hazeColor.value.setHex(pal.mid);
    this.sun.color.setHex(pal.sun);
    this.hemi.color.setHex(pal.sun);
    this.hemi.groundColor.setHex(pal.low);
    this.renderer.setClearColor(pal.fog, 1);
  }

  setQuality(q){
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    const cap = q === 0 ? 1 : (q === 1 ? 1.5 : 2);
    this.renderer.setPixelRatio(Math.min(dpr, cap));
    this.sun.shadow.mapSize.set(q === 0 ? 1024 : (q === 1 ? 2048 : 4096), q === 0 ? 1024 : (q === 1 ? 2048 : 4096));
    if(this.sun.shadow.map){ this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.resize();
  }
  setShadows(on){ this.shadowsOn = on; this.renderer.shadowMap.enabled = on; this.scene.traverse(o=>{ if(o.isMesh) o.material && (o.material.needsUpdate = true); }); }

  resize(){
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ------------------------------------------------ caméra */
  clampTarget(){
    const b = this.bounds;
    this.target.x = Math.max(-b, Math.min(b, this.target.x));
    this.target.z = Math.max(-b, Math.min(b, this.target.z));
  }
  pan(dx, dz){
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    this.target.x += dx * c - dz * s;
    this.target.z += dx * s + dz * c;
    this.clampTarget();
  }
  zoom(d){ this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist * (1 + d))); }
  rotate(d){ this.yaw += d; }
  tilt(d){ this.pitch = Math.max(0.42, Math.min(1.38, this.pitch + d)); }
  lookAt(x, z){ this.target.set(x, this.target.y, z); this.clampTarget(); }
  shake(a){ this._shake = Math.min(2.2, this._shake + a); }

  updateCamera(dt){
    const ph = this.pitch;
    const h = Math.sin(ph) * this.dist;
    const r = Math.cos(ph) * this.dist;
    let ox = 0, oy = 0;
    if(this._shake > 0.001){
      ox = (Math.random()-0.5) * this._shake;
      oy = (Math.random()-0.5) * this._shake;
      this._shake *= Math.pow(0.02, dt);
    }
    this.camera.position.set(
      this.target.x - Math.sin(this.yaw) * r + ox,
      this.target.y + h + oy,
      this.target.z - Math.cos(this.yaw) * r
    );
    this.camera.lookAt(this.target.x, this.target.y + 1.5, this.target.z);

    // le soleil suit la caméra pour garder des ombres nettes
    this.sun.position.set(this.target.x + 70, 110, this.target.z + 55);
    this.sun.target.position.set(this.target.x, 0, this.target.z);
    this.sun.target.updateMatrixWorld();
  }

  render(t){
    this.sky.material.uniforms.uTime.value = t;
    this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene, this.camera);
  }

  /* projette une position monde en pixels écran */
  project(v, out){
    const p = out || {x:0, y:0, visible:false};
    _v.copy(v).project(this.camera);
    p.visible = p.z = _v.z < 1;
    p.x = (_v.x * 0.5 + 0.5) * window.innerWidth;
    p.y = (-_v.y * 0.5 + 0.5) * window.innerHeight;
    return p;
  }
}
const _v = new THREE.Vector3();
