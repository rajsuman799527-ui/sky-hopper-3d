/* Sky Hopper 3D
 * Three.js (r128) side-view bird jumper. Every 5 pipes = next level:
 * faster, tighter gaps, new sky theme, and from level 3 the pipes move.
 * No backend. Best score is kept in localStorage.
 */
(() => {
  'use strict';

  // ---------- tuning ----------
  const GRAVITY = -30;
  const JUMP_V = 10.2;
  const MAX_FALL = -18;
  const BIRD_X = 0;
  const BIRD_R = 0.42;
  const CEILING = 11.6;
  const PIPE_HALF_W = 0.8;
  const PIPE_SPACING = 7.6;
  const PIPES_PER_LEVEL = 5;

  function levelParams(level) {
    const gap = Math.max(3.1, 4.9 - (level - 1) * 0.28);
    const speed = Math.min(4.6 + (level - 1) * 0.7, 9.5);
    const moving = level >= 3;
    const amp = moving ? Math.min(0.6 + (level - 3) * 0.35, 2.1) : 0;
    return { gap, speed, moving, amp };
  }

  const THEMES = [
    { name: 'Morning', sky: 0x8fd3ff, pipe: 0x43a047, cap: 0x66bb6a, gA: 0x7cc84f, gB: 0x6bb842, hill: 0x6fb86f, cloud: 0xffffff, stars: 0 },
    { name: 'Sunset',  sky: 0xffa57a, pipe: 0x7cb342, cap: 0x9ccc65, gA: 0xc9a24a, gB: 0xb8923c, hill: 0xc2675a, cloud: 0xffe0c2, stars: 0 },
    { name: 'Night',   sky: 0x0e1f45, pipe: 0x2e9e6b, cap: 0x3fbf86, gA: 0x2f6b3c, gB: 0x285c34, hill: 0x1b3a5c, cloud: 0x5a6fa0, stars: 1 },
    { name: 'Neon',    sky: 0x2a0a4a, pipe: 0x00bcd4, cap: 0x40e0f0, gA: 0x8e24aa, gB: 0x7b1fa2, hill: 0x4a148c, cloud: 0xb388ff, stars: 1 },
  ];

  // ---------- DOM ----------
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const elScore = document.getElementById('score');
  const elLevel = document.getElementById('level');
  const elBanner = document.getElementById('banner');
  const elHint = document.getElementById('hint');
  const elPanel = document.getElementById('panel');
  const elFinalScore = document.getElementById('finalScore');
  const elFinalLevel = document.getElementById('finalLevel');
  const elBest = document.getElementById('bestScore');

  // ---------- storage ----------
  let best = 0;
  try { best = parseInt(localStorage.getItem('skyhopper3d.best') || '0', 10) || 0; } catch (e) { /* ignore */ }
  function saveBest() { try { localStorage.setItem('skyhopper3d.best', String(best)); } catch (e) { /* ignore */ } }

  // ---------- audio ----------
  let actx = null;
  function initAudio() {
    if (actx) return;
    try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
  }
  function beep(freq, dur, type, vol, slideTo) {
    if (!actx) return;
    try {
      const t = actx.currentTime;
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(vol || 0.08, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }
  const sfx = {
    flap: () => beep(420, 0.12, 'triangle', 0.09, 760),
    score: () => beep(880, 0.1, 'square', 0.06, 1320),
    level: () => { beep(520, 0.12, 'square', 0.07, 780); setTimeout(() => beep(780, 0.18, 'square', 0.07, 1170), 120); },
    hit: () => beep(220, 0.35, 'sawtooth', 0.1, 70),
  };

  // ---------- three.js setup ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(THEMES[0].sky);
  scene.fog = new THREE.Fog(THEMES[0].sky, 22, 60);

  const camera = new THREE.PerspectiveCamera(50, 9 / 16, 0.1, 200);
  const camLook = new THREE.Vector3(2.4, 6, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.8);
  sun.position.set(6, 12, 9);
  scene.add(sun);

  function resize() {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distForHeight = 13.5 / (2 * t);
    const distForWidth = 10.5 / (camera.aspect * 2 * t);
    camera.position.z = Math.max(distForHeight, distForWidth);
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  // ---------- materials (colors are lerped between themes) ----------
  const mats = {
    pipe: new THREE.MeshLambertMaterial({ color: THEMES[0].pipe }),
    cap: new THREE.MeshLambertMaterial({ color: THEMES[0].cap }),
    gA: new THREE.MeshLambertMaterial({ color: THEMES[0].gA }),
    gB: new THREE.MeshLambertMaterial({ color: THEMES[0].gB }),
    hill: new THREE.MeshLambertMaterial({ color: THEMES[0].hill, fog: true }),
    cloud: new THREE.MeshLambertMaterial({ color: THEMES[0].cloud }),
  };
  const cur = {
    sky: new THREE.Color(THEMES[0].sky),
    pipe: new THREE.Color(THEMES[0].pipe),
    cap: new THREE.Color(THEMES[0].cap),
    gA: new THREE.Color(THEMES[0].gA),
    gB: new THREE.Color(THEMES[0].gB),
    hill: new THREE.Color(THEMES[0].hill),
    cloud: new THREE.Color(THEMES[0].cloud),
    stars: 0,
  };
  const tgt = {
    sky: new THREE.Color(), pipe: new THREE.Color(), cap: new THREE.Color(), gA: new THREE.Color(),
    gB: new THREE.Color(), hill: new THREE.Color(), cloud: new THREE.Color(), stars: 0,
  };
  function setThemeTarget(index) {
    const th = THEMES[index % THEMES.length];
    tgt.sky.set(th.sky); tgt.pipe.set(th.pipe); tgt.cap.set(th.cap);
    tgt.gA.set(th.gA); tgt.gB.set(th.gB); tgt.hill.set(th.hill); tgt.cloud.set(th.cloud);
    tgt.stars = th.stars;
  }
  setThemeTarget(0);
  function updateTheme(dt) {
    const k = 1 - Math.exp(-2.2 * dt);
    for (const key of ['sky', 'pipe', 'cap', 'gA', 'gB', 'hill', 'cloud']) cur[key].lerp(tgt[key], k);
    cur.stars += (tgt.stars - cur.stars) * k;
    scene.background.copy(cur.sky);
    scene.fog.color.copy(cur.sky);
    mats.pipe.color.copy(cur.pipe);
    mats.cap.color.copy(cur.cap);
    mats.gA.color.copy(cur.gA);
    mats.gB.color.copy(cur.gB);
    mats.hill.color.copy(cur.hill);
    mats.cloud.color.copy(cur.cloud);
    starMat.opacity = cur.stars;
    stars.visible = cur.stars > 0.02;
  }

  // ---------- world: ground ----------
  const TILE_W = 2, TILE_COUNT = 40, TILE_SPAN = TILE_W * TILE_COUNT;
  const tileGeo = new THREE.BoxGeometry(TILE_W, 1.4, 14);
  const tiles = [];
  for (let i = 0; i < TILE_COUNT; i++) {
    const m = new THREE.Mesh(tileGeo, i % 2 ? mats.gA : mats.gB);
    m.position.set(-14 + i * TILE_W, -0.7, 0);
    scene.add(m);
    tiles.push(m);
  }

  // ---------- world: hills ----------
  const hills = [];
  const hillGeo = new THREE.ConeGeometry(1, 1, 6);
  for (let i = 0; i < 9; i++) {
    const h = 5 + (i * 37 % 5);
    const m = new THREE.Mesh(hillGeo, mats.hill);
    m.scale.set(6 + (i * 13 % 4), h, 6);
    m.position.set(-18 + i * 12, h / 2, -26);
    scene.add(m);
    hills.push(m);
  }
  const HILL_SPAN = 9 * 12;

  // ---------- world: clouds ----------
  const clouds = [];
  const puffGeo = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const p = new THREE.Mesh(puffGeo, mats.cloud);
      p.scale.set(1.3 - j * 0.2, 0.8, 0.8);
      p.position.set(j * 1.2 - 1.2, (j % 2) * 0.3, 0);
      g.add(p);
    }
    g.position.set(-14 + i * 6.2, 10 + (i * 7 % 8), -8 - (i * 5 % 14));
    scene.add(g);
    clouds.push(g);
  }
  const CLOUD_SPAN = 62;

  // ---------- world: stars ----------
  const starPos = new Float32Array(180 * 3);
  for (let i = 0; i < 180; i++) {
    starPos[i * 3] = -30 + Math.random() * 80;
    starPos[i * 3 + 1] = 8 + Math.random() * 22;
    starPos[i * 3 + 2] = -34;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, transparent: true, opacity: 0, fog: false });
  const stars = new THREE.Points(starGeo, starMat);
  stars.visible = false;
  scene.add(stars);

  // ---------- bird ----------
  const bird = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffd23f });
  const body = new THREE.Mesh(new THREE.SphereGeometry(BIRD_R, 18, 14), bodyMat);
  body.scale.set(1.12, 0.95, 1);
  bird.add(body);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(BIRD_R * 0.8, 14, 10), new THREE.MeshLambertMaterial({ color: 0xfff2b0 }));
  belly.position.set(0.05, -0.12, 0.12);
  belly.scale.set(1, 0.7, 0.9);
  bird.add(belly);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 10), new THREE.MeshLambertMaterial({ color: 0xff7a1a }));
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(BIRD_R * 1.12 + 0.12, -0.03, 0);
  bird.add(beak);

  const eyeWhite = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const eyeBlack = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (const side of [1, -1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), eyeWhite);
    e.position.set(0.2, 0.15, 0.3 * side);
    bird.add(e);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), eyeBlack);
    p.position.set(0.28, 0.15, 0.37 * side);
    bird.add(p);
  }

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.3), new THREE.MeshLambertMaterial({ color: 0xff9a2e }));
  tail.position.set(-BIRD_R * 1.1, 0.08, 0);
  tail.rotation.z = 0.4;
  bird.add(tail);

  const wingMat = new THREE.MeshLambertMaterial({ color: 0xf5a623 });
  const wings = [];
  for (const side of [1, -1]) {
    const pivot = new THREE.Group();
    pivot.position.set(-0.05, 0.02, 0.4 * side);
    const w = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), wingMat);
    w.scale.set(0.34, 0.1, 0.24);
    w.position.set(-0.2, 0, 0);
    pivot.add(w);
    bird.add(pivot);
    wings.push(pivot);
  }
  scene.add(bird);

  // ---------- pipes ----------
  const pipeBodyGeo = new THREE.CylinderGeometry(PIPE_HALF_W, PIPE_HALF_W, 1, 18);
  const pipeCapGeo = new THREE.CylinderGeometry(PIPE_HALF_W + 0.14, PIPE_HALF_W + 0.14, 0.5, 18);
  const pipes = [];
  const TOP_END = 40;

  function makePipe(x, gapY, gap, moving, amp) {
    const group = new THREE.Group();
    const bottom = new THREE.Mesh(pipeBodyGeo, mats.pipe);
    const bottomCap = new THREE.Mesh(pipeCapGeo, mats.cap);
    const top = new THREE.Mesh(pipeBodyGeo, mats.pipe);
    const topCap = new THREE.Mesh(pipeCapGeo, mats.cap);
    group.add(bottom, bottomCap, top, topCap);
    scene.add(group);
    const p = {
      group, bottom, bottomCap, top, topCap,
      x, baseY: gapY, gapY, gap, moving, amp,
      phase: Math.random() * Math.PI * 2, scored: false,
    };
    layoutPipe(p);
    return p;
  }

  function layoutPipe(p) {
    p.group.position.x = p.x;
    const gb = p.gapY - p.gap / 2;
    const gt = p.gapY + p.gap / 2;
    p.bottom.scale.y = gb - 0.25;
    p.bottom.position.y = (gb - 0.25) / 2;
    p.bottomCap.position.y = gb - 0.25;
    const topH = TOP_END - (gt + 0.25);
    p.top.scale.y = topH;
    p.top.position.y = gt + 0.25 + topH / 2;
    p.topCap.position.y = gt + 0.25;
  }

  function removePipe(p) { scene.remove(p.group); }

  // ---------- game state ----------
  let state = 'ready'; // ready | play | dead | over
  let score = 0;
  let level = 1;
  let vy = 0;
  let time = 0;
  let deadAt = 0;
  let shake = 0;
  let wingPhase = 0;

  function resetGame() {
    for (const p of pipes) removePipe(p);
    pipes.length = 0;
    score = 0; level = 1; vy = 0; shake = 0;
    bird.position.set(BIRD_X, 6, 0);
    bird.rotation.set(0, 0, 0);
    setThemeTarget(0);
    elScore.textContent = '0';
    elLevel.textContent = 'Level 1';
    elPanel.classList.add('hidden');
    elBanner.classList.add('hidden');
    elHint.classList.remove('hidden');
    state = 'ready';
  }

  function spawnPipe(x) {
    const lp = levelParams(level);
    const minY = 1.7 + lp.gap / 2 + lp.amp;
    const maxY = 10.6 - lp.gap / 2 - lp.amp;
    const gapY = minY + Math.random() * (maxY - minY);
    pipes.push(makePipe(x, gapY, lp.gap, lp.moving, lp.amp));
  }

  function showBanner(text) {
    elBanner.textContent = text;
    elBanner.classList.remove('hidden');
    // restart the CSS animation
    elBanner.style.animation = 'none';
    void elBanner.offsetWidth;
    elBanner.style.animation = '';
  }

  function flap() {
    vy = JUMP_V;
    sfx.flap();
  }

  function die() {
    if (state !== 'play') return;
    state = 'dead';
    deadAt = time;
    shake = 0.35;
    vy = Math.min(vy, 2);
    sfx.hit();
    finish();
  }

  function finish() {
    if (score > best) { best = score; saveBest(); }
    elFinalScore.textContent = String(score);
    elFinalLevel.textContent = String(level);
    elBest.textContent = String(best);
  }

  function onAction() {
    initAudio();
    if (actx && actx.state === 'suspended') actx.resume();
    if (state === 'ready') {
      state = 'play';
      elHint.classList.add('hidden');
      flap();
    } else if (state === 'play') {
      flap();
    } else if (state === 'over' && time - deadAt > 0.5) {
      resetGame();
    }
  }

  stage.addEventListener('pointerdown', (e) => { e.preventDefault(); onAction(); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (!e.repeat) onAction();
    }
  });

  // ---------- update ----------
  function scrollWorld(dt, speed) {
    for (const t of tiles) {
      t.position.x -= speed * dt;
      if (t.position.x < -14) t.position.x += TILE_SPAN;
    }
    for (const h of hills) {
      h.position.x -= speed * 0.12 * dt;
      if (h.position.x < -26) h.position.x += HILL_SPAN;
    }
    for (const c of clouds) {
      c.position.x -= speed * 0.22 * dt;
      if (c.position.x < -18) c.position.x += CLOUD_SPAN;
    }
  }

  function update(dt) {
    time += dt;
    const lp = levelParams(level);
    updateTheme(dt);

    if (state === 'ready') {
      scrollWorld(dt, 2.2);
      bird.position.y = 6 + Math.sin(time * 3) * 0.25;
      bird.rotation.z = 0;
      wingPhase += dt * 7;
    }

    if (state === 'play') {
      scrollWorld(dt, lp.speed);
      wingPhase += dt * (vy > 0 ? 22 : 9);

      vy = Math.max(vy + GRAVITY * dt, MAX_FALL);
      bird.position.y += vy * dt;
      bird.rotation.z = THREE.MathUtils.clamp(vy * 0.075, -1.0, 0.55);

      if (bird.position.y > CEILING) { bird.position.y = CEILING; vy = Math.min(vy, 0); }

      // spawn
      const last = pipes[pipes.length - 1];
      if (!last) spawnPipe(14);
      else if (last.x < 14 - PIPE_SPACING + 0) spawnPipe(last.x + PIPE_SPACING);

      // move pipes
      for (let i = pipes.length - 1; i >= 0; i--) {
        const p = pipes[i];
        p.x -= lp.speed * dt;
        if (p.moving) p.gapY = p.baseY + Math.sin(time * 1.3 + p.phase) * p.amp;
        layoutPipe(p);

        // score
        if (!p.scored && p.x < BIRD_X - PIPE_HALF_W - 0.1) {
          p.scored = true;
          score++;
          elScore.textContent = String(score);
          const newLevel = 1 + Math.floor(score / PIPES_PER_LEVEL);
          if (newLevel > level) {
            level = newLevel;
            elLevel.textContent = 'Level ' + level;
            setThemeTarget(level - 1);
            showBanner('Level ' + level + ' · ' + THEMES[(level - 1) % THEMES.length].name);
            sfx.level();
          } else {
            sfx.score();
          }
        }

        // collision
        if (Math.abs(p.x - BIRD_X) < PIPE_HALF_W + BIRD_R * 0.85) {
          const by = bird.position.y;
          if (by - BIRD_R * 0.85 < p.gapY - p.gap / 2 || by + BIRD_R * 0.85 > p.gapY + p.gap / 2) die();
        }

        if (p.x < -10) { removePipe(p); pipes.splice(i, 1); }
      }

      // ground
      if (bird.position.y - BIRD_R <= 0) {
        bird.position.y = BIRD_R;
        die();
      }
    }

    if (state === 'dead') {
      vy = Math.max(vy + GRAVITY * dt, MAX_FALL);
      bird.position.y += vy * dt;
      bird.rotation.z = Math.max(bird.rotation.z - dt * 7, -1.5);
      if (bird.position.y - BIRD_R <= 0) {
        bird.position.y = BIRD_R;
        vy = 0;
      }
      if (bird.position.y <= BIRD_R + 0.001 || time - deadAt > 1.3) {
        state = 'over';
        elPanel.classList.remove('hidden');
      }
    }

    // wings
    const flapAngle = Math.sin(wingPhase) * 0.85;
    for (const w of wings) w.rotation.z = flapAngle;

    // camera (slight angle + shake)
    shake = Math.max(0, shake - dt);
    const sx = shake > 0 ? (Math.random() - 0.5) * shake * 1.4 : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake * 1.4 : 0;
    camera.position.x = -1.6 + sx;
    camera.position.y = 7.4 + sy;
    camera.lookAt(camLook);
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    update(dt);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  resize();
  resetGame();
  elBest.textContent = String(best);
  requestAnimationFrame(frame);
})();
      
