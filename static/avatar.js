// Boo's genie: a little character drawn procedurally every frame, then shown as a grid of dots.
// The page tells her what is happening (listening, thinking, saying a word, showing a picture) and she acts
// it out: she blinks, lip-syncs, gestures on the beat, fidgets when idle, and conjures pictures from her palm.
// Shared by both avatars: turn a small drawing into coloured dots, bright parts big and dark parts small, with a
// sheen sweeping across and rare twinkles. wobble(r, g, b, x, y) may nudge a dot, e.g. to make hair ripple.
function halftone(ctx, g, M, W, t, wobble) {
  const TAU = Math.PI * 2, d = g.getImageData(0, 0, M, M).data, cell = W / M, groups = new Map();
  const sheen = (t / 14) % (2 * M + 130) - 100, tick = Math.floor(t / 110);
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    const i = (y * M + x) * 4, a = d[i + 3] / 255;
    if (a < .05) continue;
    let r = d[i], gr = d[i + 1], b = d[i + 2];
    const lum = (.3 * r + .59 * gr + .11 * b) / 255;
    const tw = (((x * 73856093) ^ (y * 19349663) ^ (tick * 83492791)) >>> 0) % 1000 < 3 ? 1 : 0;   // rare twinkles
    const lift = Math.max(Math.max(0, 1 - Math.abs(x + y - sheen) / 6) * .5, tw * .8);               // a sheen sweeps across
    const [dx, dy] = wobble ? wobble(r, gr, b, x, y) : [0, 0];
    r += (255 - r) * lift; gr += (255 - gr) * lift; b += (255 - b) * lift;
    const rad = cell * .48 * a * (.16 + .84 * Math.pow(lum, .85)) * (1 + tw * .3);
    const key = ((r >> 3) << 10) | ((gr >> 3) << 5) | (b >> 3);
    let p = groups.get(key);
    if (!p) groups.set(key, p = new Path2D());
    const cx = (x + .5 + dx) * cell, cy = (y + .5 + dy) * cell;
    p.moveTo(cx + rad, cy); p.arc(cx, cy, rad, 0, TAU);
  }
  for (const [k, p] of groups) {
    ctx.fillStyle = `rgb(${(k >> 10) << 3 | 4},${((k >> 5) & 31) << 3 | 4},${(k & 31) << 3 | 4})`;
    ctx.fill(p);
  }
}

function star(ctx, x, y, R, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = rot + i * Math.PI / 4, d = i % 2 ? r : R;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.fill();
}


function makeAvatar({ canvas, N, getMode, getLevel, hasPicture, release }) {
  const M = 96, TAU = Math.PI * 2;                     // dots per side of the avatar grid; drawing units are 0..100
  const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k, pick = a => a[Math.random() * a.length | 0];
  const src = document.createElement('canvas'); src.width = src.height = M;
  const g = src.getContext('2d', { willReadFrequently: true });
  const halo = document.createElement('canvas'); halo.width = halo.height = 32;
  const hg = halo.getContext('2d');
  let bg = null;

  const COL = {
    skin: '#a9b4f7', shade: '#7682dc', light: '#d3d9ff', hair: '#8a4bea', hairHi: '#f09cff', hairDark: '#4a2392',
    top: '#3fdcc4', topDark: '#1f9e93', vest: '#6a4ee0', gold: '#ffd166', lip: '#ff6fa3', mouth: '#2b0a26',
    iris: '#14b8a6', pupil: '#05030c', brow: '#1d0b40', eye: '#ffffff',
  };
  const RGB = { skin: [169, 180, 247], tail1: [124, 196, 255], tail2: [198, 168, 255] };
  const mix = (a, b, k) => a.map((v, i) => Math.round(lerp(v, b[i], k))).join(',');
  const SPARK = ['255,214,120', '255,255,255', '255,170,220', '140,230,255'];

  // ---------- animated parameters: damped springs, so every move eases in and overshoots a little ----------
  const P = {};
  const def = (n, v, k = 120, c = 16) => (P[n] = { v, vel: 0, to: v, k, c });
  def('bx', 50, 18, 9); def('lean', 0, 60, 12); def('tilt', 0, 90, 13); def('turn', 0, 70, 13); def('nod', 0, 260, 15);
  def('eyeX', 0, 500, 45); def('eyeY', 0, 500, 45);
  def('browL', 0, 160, 18); def('browR', 0, 160, 18); def('browTilt', 0, 100, 16);
  def('smile', .4, 90, 16); def('eyeSmile', 0, 120, 18); def('blush', .15, 40, 12);
  def('mOpen', 0, 900, 55); def('mWide', .5, 600, 45); def('mRound', 0, 600, 45);
  def('shUp', 0, 200, 16); def('think', 0, 40, 12); def('listen', 0, 40, 12); def('hold', 0, 40, 12);
  def('hLx', 3.5, 140, 14); def('hLy', 12.5, 140, 14); def('hRx', -3.5, 140, 14); def('hRy', 11, 140, 14);
  def('hLrot', 0, 200, 18); def('hRrot', 0, 200, 18);
  def('objX', 71, 50, 14); def('objY', 24, 50, 14); def('objS', 34, 50, 14);
  def('sway', 0, 30, 6);
  const V = n => P[n].v;
  const FACE = ['bx', 'lean', 'tilt', 'turn', 'eyeX', 'eyeY', 'browL', 'browR', 'browTilt', 'smile', 'eyeSmile', 'blush',
                'mOpen', 'mWide', 'mRound', 'shUp', 'think', 'listen', 'hold', 'hLrot', 'hRrot'];

  // Hand targets relative to the base of the neck: [x, y, hand shape, elbow tucked down].
  const POSE = {
    folded:  { L: [3.5, 12.5, 'fist'], R: [-3.5, 11, 'fist'] },
    hips:    { L: [-10, 18, 'fist'], R: [10, 18, 'fist'] },
    clasp:   { L: [-.6, 12, 'fist', 1], R: [.6, 12.4, 'fist', 1] },
    explain: { L: [-16, 6, 'palm'], R: [16, 6, 'palm'] },
    heart:   { L: [-2.5, 5, 'open', 1], R: [12, 15, 'open'] },
    chin:    { L: [1.2, -4.5, 'point', 1], R: [-2, 12.5, 'fist'] },
    ear:     { L: [-15.5, -14, 'cup', 1], R: [2, 12, 'fist'] },
  };
  const HOLD = [33, -2, 'palm'];                       // palm up under the picture she is showing

  // Acted moments layered over the base pose. k runs 0..1 over the action, el is seconds since it began.
  const ACT = {
    wave(k, el, T) { const w = Math.sin(el * 12); T.L = [-19 + w * 2.2, -16.5, 'open']; T.hLrot = w * .35;
      T.smile = .95; T.eyeSmile = .45; T.tilt += .1; T.blush = .7; T.browL = T.browR = .4; },
    conjure(k, el, T) { T.R = HOLD; T.smile = .75; T.browL = T.browR = .45;
      if (el < .8) { T.eyeX = .85; T.eyeY = -.55; T.turn = .35; } },
    look(k, el, T, a) { T.eyeX = a.x; T.eyeY = a.y; T.turn = a.x * .5; T.tilt += a.x * .05; },
    twirl(k, el, T) { T.R = [15, -11, 'point']; T.eyeX = .7; T.eyeY = -.7; T.turn = .3; T.smile = .7; },
    wink(k, el, T) { T.smile = 1; T.tilt -= .1; T.blush = .8; T.browL = .45; T.mWide = .9; },
    giggle(k, el, T) { T.smile = 1; T.eyeSmile = 1; T.blush = 1; T.shUp = Math.abs(Math.sin(el * 17)) * 1.3 * (1 - k);
      T.mOpen = .3; T.mWide = 1; T.tilt += .08; },
    hairflip(k, el, T) { T.tilt += k < .35 ? -.32 : .06; if (k < .55) T.L = [-14, -12, 'open']; T.smile = .75; T.eyeSmile = .35; },
    stretch(k, el, T) { const u = Math.sin(Math.PI * k), y = lerp(12, -30, u);
      T.L = [-6, y, 'open']; T.R = [6, y, 'open']; T.eyeSmile = .9 * u; T.mOpen = .7 * u; T.mRound = 1; T.mWide = 0; T.shUp = 1.5 * u; },
    ask(k, el, T) { T.browL = T.browR = .75; T.tilt += .12; },
    invite(k, el, T) { T.tilt += .14; T.browL = T.browR = .55; T.smile = .65; T.L = [-12, 6, 'palm']; },
    bow(k, el, T) { T.smile = .9; T.eyeSmile = .5; T.blush = .5; },
  };
  const IDLE = [['look', 1500], ['look', 1500], ['twirl', 2600], ['wink', 700], ['giggle', 1300], ['hairflip', 1100], ['stretch', 2200]];

  // Mouth shape per letter: [open, wide, round].
  const VIS = { a: [1, .65, 0], e: [.7, .9, 0], i: [.55, 1, 0], y: [.5, .9, 0], o: [.85, .1, 1], u: [.55, 0, 1], w: [.35, 0, .9],
                m: [0, .45, 0], b: [0, .45, 0], p: [0, .45, 0], f: [.18, .7, 0], v: [.18, .7, 0] };
  function viseme(word, frac) {
    const s = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!s) return [0, .5, 0];
    return VIS[s[clamp(Math.floor(frac * s.length), 0, s.length - 1)]] || [.35, .6, 0];
  }

  // ---------- state ----------
  let now = 0, last = 0, mode0 = '', modeT = 0, idlePose = 'folded', nextIdle = 0, hasObj = false, mood = 'warm';
  let gesture = 'explain', lvlS = 0, quiet = true, nextBlink = 0, blinkT0 = -1e9, acts = [], sparks = [], puffs = [];
  let shapes = { L: 'fist', R: 'fist' }, hints = { L: 0, R: 0 }, G = null, prevRoot = null, lastPuff = 0;
  const gaze = { x: 0, y: 0, next: 0 }, ptr = { x: 50, y: 50, t: -1e9 }, hist = new Array(40).fill(0);
  const speech = { i: -1, word: '', vis: [0, .5, 0] };

  function act(name, dur, data = {}) { acts = acts.filter(a => a.name !== name); acts.push({ name, t0: now, dur, ...data }); }
  const active = name => acts.find(a => a.name === name);
  function burst(x, y, n, speed = 14, up = 6) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = rnd(.3, 1) * speed;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, life: 1, decay: rnd(.7, 1.4),
                    s: rnd(.45, 1.15), c: pick(SPARK), rot: rnd(0, TAU), spin: rnd(-4, 4) });
    }
  }
  function dissolve() {
    if (!hasObj) return;
    hasObj = false; release();
    burst(V('objX'), V('objY'), 22, 12, 8);
  }

  addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    ptr.x = (e.clientX - r.left) / r.width * 100; ptr.y = (e.clientY - r.top) / r.height * 100; ptr.t = performance.now();
  });

  // ---------- behaviour: decide where everything wants to be, then let the springs get it there ----------
  function update(t, dt) {
    const mode = getMode(), lvl = getLevel();
    lvlS += (lvl - lvlS) * .2;
    if (hasObj && !hasPicture()) hasObj = false;
    if (mode !== mode0) {
      if (mode === 'idle') { idlePose = pick(['folded', 'hips', 'clasp']); nextIdle = t + rnd(2500, 5000); }
      if (mode === 'listening' || mode === 'thinking') dissolve();
      mode0 = mode; modeT = t;
    }
    const el = (t - modeT) / 1000;
    if (t > gaze.next) { gaze.x = rnd(-.35, .35); gaze.y = rnd(-.25, .2); gaze.next = t + rnd(700, 2800); }
    const T = { bx: 50, lean: .03 * Math.sin(t / 2900), tilt: .05 * Math.sin(t / 2300), turn: gaze.x * .25,
      eyeX: gaze.x, eyeY: gaze.y, browL: 0, browR: 0, browTilt: 0, smile: .4, eyeSmile: 0, blush: .15,
      mOpen: 0, mWide: .5, mRound: 0, shUp: 0, think: 0, listen: 0, hold: 0, hLrot: 0, hRrot: 0 };
    if (t - ptr.t < 2500 && (mode === 'idle' || mode === 'listening') && G) {   // glance at the pointer
      T.eyeX = clamp((ptr.x - G.head[0]) / 22, -1, 1); T.eyeY = clamp((ptr.y - G.head[1]) / 22, -1, 1);
      T.turn = T.eyeX * .35; T.tilt += T.eyeX * .04;
    }
    let pose = POSE[idlePose];
    if (mode === 'listening') {
      pose = POSE[el < 1.9 ? 'ear' : 'clasp'];
      Object.assign(T, { listen: 1, smile: .5, browL: .3, browR: .3 }); T.tilt += .1;
      if (lvl > .3 && quiet) { P.nod.vel += 22; quiet = false; }   // little "mm-hm" nods as you talk
      if (lvl < .1) quiet = true;
    } else if (mode === 'thinking') {
      pose = POSE.chin;
      Object.assign(T, { think: 1, bx: 44, eyeX: .55 + .15 * Math.sin(t / 900), eyeY: -.75, turn: .2,
                         browR: .8, browL: .1, mOpen: .07, mRound: .9, mWide: .1, smile: .1 });
      T.tilt -= .08;
    } else if (mode === 'speaking') {
      pose = POSE[gesture];
      T.smile = { warm: .55, soft: .3, bright: .85 }[mood];
      if (mood === 'soft') { T.browTilt = .5; T.blush = .3; }
      if (mood === 'bright') { T.eyeSmile = .25; T.blush = .5; }
      T.eyeX *= .5; T.eyeY *= .5;
      const [o, w, r] = speech.vis;
      T.mOpen = lvl > .05 ? o * clamp(.3 + lvl, 0, 1.15) : 0; T.mWide = w; T.mRound = r;
    }
    T.L = pose.L; T.R = pose.R;
    if (mode === 'thinking') {                         // finger taps on the chin now and then
      const tap = Math.sin(t / 1400) > 0 ? Math.max(0, Math.sin(t / 90)) : 0;
      T.L = [T.L[0], T.L[1] + tap * .9, T.L[2], 1];
    }
    if (hasObj && mode !== 'thinking' && mode !== 'listening') { T.R = HOLD; T.bx = 37; T.hold = 1; }
    if (mode === 'idle' && hasObj && t - modeT > 6000) dissolve();
    if (mode === 'idle' && !acts.length && t > nextIdle) {
      const [name, dur] = pick(IDLE);
      act(name, dur, { x: rnd(-.9, .9), y: rnd(-.6, .5) });
      if (name === 'hairflip') P.tilt.vel -= 2;
      nextIdle = t + dur + rnd(2500, 6500);
    }
    for (const a of acts) { const e = (t - a.t0) / 1000; ACT[a.name](clamp(e * 1000 / a.dur, 0, 1), e, T, a); }
    acts = acts.filter(a => t - a.t0 < a.dur);

    for (const n of FACE) P[n].to = T[n];
    [P.hLx.to, P.hLy.to, shapes.L, hints.L] = T.L; [P.hRx.to, P.hRy.to, shapes.R, hints.R] = T.R;
    if (mode === 'thinking') { P.objX.to = V('bx') + 28; P.objY.to = 11; P.objS.to = 20; }
    else { P.objX.to = 71; P.objY.to = 24; P.objS.to = 34; }
    for (const s of Object.values(P)) { s.vel += (s.k * (s.to - s.v) - s.c * s.vel) * dt; s.v += s.vel * dt; }

    // magic in the air
    const cj = active('conjure');
    if (cj && !cj.burst && t - cj.t0 > 250 && G) { cj.burst = true; burst(G.R.H[0], G.R.H[1] - 1.5, 26, 16, 8); }
    if (active('twirl') && G) {
      const a = t / 140, [x, y] = G.R.tip;
      if (Math.random() < .7) sparks.push({ x: x + Math.cos(a) * 2.4, y: y + Math.sin(a) * 1.2, vx: rnd(-1, 1), vy: rnd(-3, -1),
        life: 1, decay: rnd(1.6, 2.4), s: rnd(.4, .9), c: pick(SPARK), rot: 0, spin: 3 });
    }
    if (G && Math.random() < dt * 1.4)
      sparks.push({ x: G.bx + rnd(-16, 16), y: rnd(30, 92), vx: rnd(-1, 1), vy: rnd(-5, -2), life: 1, decay: rnd(.4, .8),
                    s: rnd(.3, .7), c: pick(SPARK), rot: 0, spin: rnd(-2, 2) });
    for (const s of sparks) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 1 - 1.8 * dt; s.vy = s.vy * (1 - 1.8 * dt) - 3 * dt;
      s.life -= dt * s.decay; s.rot += dt * s.spin;
    }
    sparks = sparks.filter(s => s.life > 0);
    if (G?.tip && t - lastPuff > 110) {
      lastPuff = t;
      puffs.push({ x: G.tip[0] + rnd(-1.5, 1.5), y: G.tip[1], vx: rnd(-3, 3), vy: rnd(1, 3.5), r: rnd(.8, 1.8), life: 1 });
    }
    for (const p of puffs) { p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 1.3; p.life -= dt * .8; }
    puffs = puffs.filter(p => p.life > 0);
  }

  function blinks(t) {
    if (t > nextBlink) { blinkT0 = t; nextBlink = t + (Math.random() < .2 ? 280 : rnd(2200, 5500)); }
    const k = (t - blinkT0) / 170;
    const b = k < 0 || k > 1 ? 0 : k < .4 ? k / .4 : 1 - (k - .4) / .6;
    const w = active('wink'), wk = w ? clamp((now - w.t0) / w.dur, 0, 1) : -1;
    const wink = wk < 0 ? 0 : wk < .2 ? wk / .2 : wk > .75 ? (1 - wk) / .25 : 1;
    return [b, Math.max(b, wink)];
  }

  // ---------- skeleton ----------
  function ik(S, T, l1, l2, hint) {                    // two-bone arm: shoulder, target -> elbow, hand
    let dx = T[0] - S[0], dy = T[1] - S[1], d = Math.hypot(dx, dy) || 1e-3;
    const max = l1 + l2 - .01;
    if (d > max) { dx *= max / d; dy *= max / d; d = max; }
    d = Math.max(d, Math.abs(l1 - l2) + .01);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const ux = dx / d, uy = dy / d;
    let px = -uy, py = ux;
    if (px * hint[0] + py * hint[1] < 0) { px = -px; py = -py; }
    return [[S[0] + ux * a + px * h, S[1] + uy * a + py * h], [S[0] + dx, S[1] + dy]];
  }

  function rig(t, dt) {
    const bx = V('bx'), by = 48 + Math.sin(t / 1300) * 1.3 + V('think') * Math.sin(t / 650) * .5;
    const sh = V('shUp') + Math.sin(t / 1700) * .35, lean = V('lean');
    const waist = [bx, by + 20], cl = Math.cos(lean), sl = Math.sin(lean);
    const tw = (x, y) => [waist[0] + x * cl - (y - 20) * sl, waist[1] + x * sl + (y - 20) * cl];
    const piv = tw(0, -4), A = lean + V('tilt'), ca = Math.cos(A), sa = Math.sin(A), nod = V('nod');
    const hw = (x, y) => [piv[0] + x * ca - y * sa, piv[1] + x * sa + y * ca];
    G = { bx, by, sh, lean, waist, piv, A, nod, tip: G?.tip, head: hw(0, -11 + nod), root: hw(0, -25.3 + nod) };
    for (const [k, s] of [['L', -1], ['R', 1]]) {
      const S = tw(s * 11.2, 3 - sh);
      const [E, H] = ik(S, [bx + V('h' + k + 'x'), by + V('h' + k + 'y')], 12.5, 12, hints[k] ? [s * .3, 1] : [s, .7]);
      const rot = V('h' + k + 'rot');
      G[k] = { S, E, H, s, shape: shapes[k], rot, tip: [H[0] + Math.cos(-Math.PI / 2 + rot) * 4.4, H[1] + Math.sin(-Math.PI / 2 + rot) * 4.4] };
    }
    // the hair trails behind head movement
    if (prevRoot && dt > 0) P.sway.to = clamp(-(G.root[0] - prevRoot[0]) / dt * .03, -.6, .6);
    prevRoot = G.root;
    hist.unshift(V('sway')); hist.length = 40;
  }

  // ---------- drawing (into the small source canvas) ----------
  const dot = (x, y, r) => { g.beginPath(); g.arc(x, y, Math.max(.01, r), 0, TAU); g.fill(); };
  const oval = (x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); };
  function seg(a, b, w, c) { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }

  function figure(t) {
    g.setTransform(M / 100, 0, 0, M / 100, 0, 0);
    g.clearRect(0, 0, 100, 100);
    g.lineCap = 'round'; g.lineJoin = 'round';
    rings(t); bubble(t); tail(t);
    g.fillStyle = 'rgb(198,168,255)';
    for (const p of puffs) { g.globalAlpha = .3 * p.life; dot(p.x, p.y, p.r); }
    g.globalAlpha = 1;
    ponytail(t); torso();
    g.save(); g.translate(G.piv[0], G.piv[1]); g.rotate(G.A); g.translate(0, -11 + G.nod); head(t); g.restore();
    arm(G.L); arm(G.R);
    platform(t);
  }

  function rings(t) {                                  // sound ripples while she listens
    const ls = V('listen');
    if (ls < .02) return;
    g.lineWidth = 1.1;
    for (let k = 0; k < 3; k++) {
      const ph = (t / 1200 + k / 3) % 1;
      g.strokeStyle = `rgba(124,196,255,${(.12 + lvlS * .9) * (1 - ph) * ls})`;
      g.beginPath(); g.arc(G.head[0], G.head[1], 15 + ph * 32, 0, TAU); g.stroke();
    }
  }

  function bubble(t) {                                 // thought cloud the brainstorm pictures float in
    const th = V('think');
    if (th < .02) return;
    const cx = V('objX'), cy = V('objY'), S = V('objS');
    g.fillStyle = `rgba(215,228,255,${.22 * th})`;
    g.beginPath();
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * TAU + t / 3000, x = cx + Math.cos(a) * S * .44, y = cy + Math.sin(a) * S * .36;
      g.moveTo(x + S * .2, y); g.arc(x, y, S * .2, 0, TAU);
    }
    g.moveTo(cx + S * .45, cy); g.arc(cx, cy, S * .45, 0, TAU);
    g.fill();
    g.fillStyle = `rgba(215,228,255,${.45 * th})`;
    for (let k = 0; k < 3; k++) {
      const f = .25 + k * .25;
      dot(lerp(G.head[0] + 8, cx - S * .45, f), lerp(G.head[1] - 9, cy + S * .3, f) + Math.sin(t / 300 + k) * .4, .8 + k * .5);
    }
  }

  function platform(t) {                               // dotted gold ring the picture hovers on
    const h = V('hold');
    if (h < .02) return;
    const cx = V('objX'), cy = V('objY') + V('objS') * .48;
    g.strokeStyle = `rgba(255,209,102,${.75 * h})`; g.lineWidth = .8;
    g.setLineDash([1.6, 1.5]); g.lineDashOffset = -t / 60;
    g.beginPath(); g.ellipse(cx, cy, V('objS') * .34 * h, 1.7, 0, 0, TAU); g.stroke();
    g.setLineDash([]);
  }

  function tail(t) {                                   // genie smoke instead of legs
    const [x0, y0] = G.waist, lag = clamp(-P.bx.vel * .35, -6, 6), n = 46;
    for (let j = 0; j <= n; j++) {
      const s = j / n, y = y0 + s * 31;
      const x = x0 + Math.sin(t / 650 + s * 3.4) * s * 4.2 + Math.sin(t / 380 + s * 7) * s * s * 1.6 + lag * s * s;
      const w = 6.3 * Math.pow(1 - s, .85) + .45;
      const c = s < .45 ? mix(RGB.skin, RGB.tail1, s / .45) : mix(RGB.tail1, RGB.tail2, (s - .45) / .55);
      g.fillStyle = `rgba(${c},${lerp(1, .4, s)})`; dot(x, y, w);
      g.fillStyle = `rgba(215,195,255,${.45 * (1 - s) + .15})`;
      for (const k of [-1, 1]) dot(x + k * w * .95 * Math.sin(t / 420 + s * 9 + k), y, .55);
      if (j === n) G.tip = [x, y];
    }
  }

  function ponytail(t) {
    const n = 14, len = 2.65, pts = [G.root];
    let [x, y] = G.root, th = G.A - .22;
    for (let i = 0; i < n; i++) {
      th += (i < 9 ? -.29 : 0) + hist[Math.min(39, i * 2)] * .11 + Math.sin(t / 820 - i * .5) * .02 * (i / n);
      x += Math.sin(th) * len; y -= Math.cos(th) * len;
      pts.push([x, y]);
    }
    for (const hi of [0, 1]) for (let i = 0; i < n; i++) for (let q = 0; q < 4; q++) {
      const s = (i + q / 4) / n, a = pts[i], b = pts[i + 1];
      const px = lerp(a[0], b[0], q / 4), py = lerp(a[1], b[1], q / 4);
      const r = .5 + 2.5 * Math.sin(Math.PI * (.2 + .74 * s)) * (1 - .3 * s);
      if (!hi) { g.fillStyle = s < .5 ? COL.hair : mixHex(COL.hair, COL.hairDark, (s - .5) * 1.4); dot(px, py, r); continue; }
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      g.fillStyle = 'rgba(240,156,255,.55)'; dot(px - dy / l * r * .4, py + dx / l * r * .4, r * .28);
    }
  }
  function mixHex(a, b, k) {
    const h = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    return `rgb(${mix(h(a), h(b), clamp(k, 0, 1))})`;
  }

  function torso() {
    const sh = G.sh;
    g.save(); g.translate(G.waist[0], G.waist[1]); g.rotate(G.lean); g.translate(0, -20);
    // neck
    const ng = g.createLinearGradient(0, -7, 0, 1); ng.addColorStop(0, COL.shade); ng.addColorStop(.45, COL.skin);
    g.fillStyle = ng; g.fillRect(-2.5, -7, 5, 8.5);
    // body
    const body = new Path2D();
    body.moveTo(-3, 0); body.quadraticCurveTo(-8, .5, -11, 2.2 - sh); body.quadraticCurveTo(-13.2, 3 - sh, -12.2, 6.5);
    body.quadraticCurveTo(-11, 11, -7, 15); body.lineTo(-6.2, 20.5); body.lineTo(6.2, 20.5); body.lineTo(7, 15);
    body.quadraticCurveTo(11, 11, 12.2, 6.5); body.quadraticCurveTo(13.2, 3 - sh, 11, 2.2 - sh); body.quadraticCurveTo(8, .5, 3, 0);
    body.closePath();
    const bgd = g.createLinearGradient(-12, 0, 12, 0);
    bgd.addColorStop(0, COL.light); bgd.addColorStop(.5, COL.skin); bgd.addColorStop(1, COL.shade);
    g.fillStyle = bgd; g.fill(body);
    g.save(); g.clip(body);
    // crop top
    const top = new Path2D();
    top.moveTo(-13, 4); top.quadraticCurveTo(-6, 2.6, -2, 5.2); top.quadraticCurveTo(0, 6.2, 2, 5.2);
    top.quadraticCurveTo(6, 2.6, 13, 4); top.lineTo(13, 10.5); top.quadraticCurveTo(0, 12.6, -13, 10.5); top.closePath();
    const tg = g.createLinearGradient(0, 3, 0, 12); tg.addColorStop(0, COL.top); tg.addColorStop(1, COL.topDark);
    g.fillStyle = tg; g.fill(top);
    g.strokeStyle = COL.gold; g.lineWidth = .7;
    g.beginPath(); g.moveTo(-13, 4); g.quadraticCurveTo(-6, 2.6, -2, 5.2); g.quadraticCurveTo(0, 6.2, 2, 5.2); g.quadraticCurveTo(6, 2.6, 13, 4); g.stroke();
    g.beginPath(); g.moveTo(13, 10.5); g.quadraticCurveTo(0, 12.6, -13, 10.5); g.stroke();
    // open vest
    for (const e of [-1, 1]) {
      g.beginPath(); g.moveTo(e * 11.8, 2.4 - sh); g.quadraticCurveTo(e * 6.5, 1.6, e * 4.5, 4.6);
      g.quadraticCurveTo(e * 5.2, 9.5, e * 7.2, 13.5); g.lineTo(e * 12.5, 10); g.closePath();
      g.fillStyle = COL.vest; g.fill();
      g.beginPath(); g.moveTo(e * 4.5, 4.6); g.quadraticCurveTo(e * 5.2, 9.5, e * 7.2, 13.5); g.stroke();
    }
    g.restore();
    // sash with a jewel and little coins
    const sg = g.createLinearGradient(0, 17, 0, 20.5); sg.addColorStop(0, '#ffe08a'); sg.addColorStop(1, '#d99a2b');
    g.fillStyle = sg; g.fillRect(-7, 17.2, 14, 3.2);
    g.fillStyle = COL.iris; dot(0, 18.8, 1.4);
    g.fillStyle = COL.gold; for (let x = -5; x <= 5; x += 2.5) dot(x, 21.2, .5);
    g.restore();
  }

  function head(t) {
    const turn = V('turn'), fx = turn * 2, sway = V('sway');
    const hgrad = g.createLinearGradient(0, -15, 0, 16);
    hgrad.addColorStop(0, COL.hair); hgrad.addColorStop(1, COL.hairDark);
    // hair behind the face, with side locks
    g.fillStyle = hgrad; dot(0, -2, 12.4);
    for (const e of [-1, 1]) {
      g.beginPath(); g.moveTo(e * 10.2, -4); g.bezierCurveTo(e * 13.8, 3, e * 13.4 + sway * 2, 11, e * 11.5 + sway * 2.5, 16);
      g.bezierCurveTo(e * 9.5, 15, e * 8.2, 10, e * 8.6, 0); g.closePath(); g.fill();
    }
    // ears and hoop earrings
    for (const e of [-1, 1]) {
      const ex = e * 10.3 + turn * .7;
      g.fillStyle = COL.shade; oval(ex, 1.6, 1.4, 2.3);
      g.strokeStyle = COL.gold; g.lineWidth = .65; g.beginPath(); g.arc(ex + sway * 1.5, 5.4, 1.45, 0, TAU); g.stroke();
    }
    // face
    const fg = g.createRadialGradient(-3 + fx, -4, 1, 0, 0, 14);
    fg.addColorStop(0, COL.light); fg.addColorStop(.55, COL.skin); fg.addColorStop(1, COL.shade);
    g.fillStyle = fg;
    g.beginPath(); g.moveTo(0, -12.8); g.bezierCurveTo(7.6, -12.8, 10.9, -7.4, 10.7, -1.2);
    g.bezierCurveTo(10.5, 5, 6.2, 10.6, 0, 11.3); g.bezierCurveTo(-6.2, 10.6, -10.5, 5, -10.7, -1.2);
    g.bezierCurveTo(-10.9, -7.4, -7.6, -12.8, 0, -12.8); g.fill();
    g.fillStyle = `rgba(255,140,200,${.2 + .35 * V('blush')})`;
    for (const e of [-1, 1]) oval(e * 6.4 + fx * .8, 3.9, 2.3, 1.3);
    // eyes and brows
    const [bL, bR] = blinks(t), es = V('eyeSmile');
    for (const e of [-1, 1]) {
      const cx = e * 4.4 + fx;
      eye(cx, 0, e, e < 0 ? bL : bR, es);
      const r = e < 0 ? V('browL') : V('browR'), bt = V('browTilt');
      g.strokeStyle = COL.brow; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(cx - e * 2.4, -4.4 - r * 1.3 - bt); g.quadraticCurveTo(cx + e * .6, -5.7 - r * 1.4, cx + e * 3.4, -4 - r + bt * .4); g.stroke();
    }
    g.strokeStyle = 'rgba(132,145,230,.8)'; g.lineWidth = .55;
    g.beginPath(); g.moveTo(fx * 1.3 - .3, 3.2); g.quadraticCurveTo(fx * 1.3 + .2, 3.8, fx * 1.3 + .6, 3.4); g.stroke();
    mouth(fx * 1.2, 6.5, V('mOpen'), V('mWide'), V('mRound'), V('smile'));
    // swept bangs and the gold band of the ponytail
    g.save(); g.translate(turn * .8, 0);
    g.fillStyle = hgrad;
    g.beginPath(); g.moveTo(-11.4, 0); g.bezierCurveTo(-12.4, -9, -7.5, -14.6, 0, -14.4); g.bezierCurveTo(7.5, -14.6, 12.4, -9, 11.4, 0);
    g.bezierCurveTo(10.8, -5.2, 8.4, -7.6, 5, -7.6); g.bezierCurveTo(2, -7.6, -.6, -8.4, -2.8, -9.8);
    g.bezierCurveTo(-6.5, -9.4, -10.4, -6, -11.4, 0); g.fill();
    g.strokeStyle = 'rgba(240,156,255,.6)'; g.lineWidth = .7;
    g.beginPath(); g.moveTo(-7, -11.5); g.quadraticCurveTo(-2, -14, 4, -13); g.stroke();
    g.fillStyle = COL.gold; oval(0, -13.8, 2.6, 1.3);
    g.restore();
  }

  function eye(cx, cy, e, blink, smileLid) {
    const ox = cx + e * 2.9, oy = cy - .35, ix = cx - e * 2.9, iy = cy + .15;
    const lidY = lerp(cy - 3.1, cy + 2.3, blink), lowY = lerp(cy + 2.4, cy - 1, smileLid);
    g.save();
    g.beginPath(); g.moveTo(ix, iy); g.quadraticCurveTo(cx, cy - 3.1, ox, oy); g.quadraticCurveTo(cx, cy + 2.4, ix, iy); g.clip();
    g.fillStyle = COL.eye; g.fillRect(cx - 4, cy - 4, 8, 8);
    const irx = cx + V('eyeX') * 1.1, iry = cy + V('eyeY') * .7 + .1;
    g.fillStyle = COL.iris; dot(irx, iry, 1.8);
    g.fillStyle = COL.pupil; dot(irx, iry, 1.05);
    g.fillStyle = '#fff'; dot(irx - .6, iry - .65, .6);
    g.fillStyle = COL.skin;
    g.beginPath(); g.moveTo(ix, iy); g.quadraticCurveTo(cx, lidY, ox, oy); g.lineTo(ox, cy - 5); g.lineTo(ix, cy - 5); g.fill();
    g.beginPath(); g.moveTo(ix, iy); g.quadraticCurveTo(cx, lowY, ox, oy); g.lineTo(ox, cy + 5); g.lineTo(ix, cy + 5); g.fill();
    g.restore();
    g.strokeStyle = COL.brow; g.lineWidth = 1.15;                     // lash line and a flick at the outer corner
    g.beginPath(); g.moveTo(ix, iy); g.quadraticCurveTo(cx, Math.max(lidY, cy - 3.1 + .2), ox, oy); g.lineTo(ox + e * 1.1, oy - .9); g.stroke();
  }

  function mouth(cx, cy, o, w, r, s) {
    const hw = Math.max(1.3, 2.4 + w * .9 - r * 1.1), cy0 = cy - s * .9, h = .2 + o * 3.1;
    if (o < .07) {
      g.strokeStyle = COL.lip; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(cx - hw, cy0); g.quadraticCurveTo(cx, cy + s * 1.3, cx + hw, cy0); g.stroke();
      return;
    }
    const top = cy - h * .42, bot = cy + h * .7 + s * .4;
    g.fillStyle = COL.lip;
    g.beginPath(); g.moveTo(cx - hw - .3, cy0); g.quadraticCurveTo(cx, top - .8, cx + hw + .3, cy0); g.quadraticCurveTo(cx, bot + .9, cx - hw - .3, cy0); g.fill();
    g.save();
    g.beginPath(); g.moveTo(cx - hw, cy0); g.quadraticCurveTo(cx, top, cx + hw, cy0); g.quadraticCurveTo(cx, bot, cx - hw, cy0); g.clip();
    g.fillStyle = COL.mouth; g.fillRect(cx - hw - 1, top - 2, hw * 2 + 2, bot - top + 4);
    if (o > .25 && r < .6) { g.fillStyle = '#f4f2ff'; g.fillRect(cx - hw, top - 1, hw * 2, 1.6); }
    g.fillStyle = '#ff7fae'; oval(cx, bot, hw * .55, h * .3);
    g.restore();
  }

  function arm({ S, E, H, s, shape, rot }) {
    seg(S, E, 5.9, COL.pupil); seg(E, H, 5.1, COL.pupil);              // dark rim so arms read over the body
    seg(S, E, 4.5, COL.shade); seg(E, H, 3.7, COL.shade);
    seg(S, E, 3.7, COL.skin); seg(E, H, 2.9, COL.skin);
    seg([lerp(S[0], E[0], .55), lerp(S[1], E[1], .55)], [lerp(S[0], E[0], .68), lerp(S[1], E[1], .68)], 4.1, COL.gold);
    const fx = H[0] - E[0], fy = H[1] - E[1], fl = Math.hypot(fx, fy) || 1, ux = fx / fl, uy = fy / fl;
    seg([H[0] - ux * 3, H[1] - uy * 3], [H[0] - ux * 2.4, H[1] - uy * 2.4], 3.5, COL.gold);
    seg([H[0] - ux * 1.9, H[1] - uy * 1.9], [H[0] - ux * 1.5, H[1] - uy * 1.5], 3.3, COL.gold);
    // hand
    const [x, y] = H;
    let dir = Math.atan2(uy, ux) + rot, spread = 1, fingers = [[-.48, 2], [-.16, 2.45], [.16, 2.35], [.48, 1.9]];
    if (shape === 'palm') { dir = Math.atan2(-.35, s) + rot; spread = .35; }
    else if (shape === 'point') { dir = -Math.PI / 2 + rot; fingers = [[0, 3.1]]; }
    else if (shape === 'cup') { dir = Math.atan2(-.6, -s) + rot; spread = .45; }
    else if (shape === 'fist') fingers = [];
    g.fillStyle = COL.pupil; dot(x, y, 2.8);
    g.fillStyle = COL.shade; dot(x, y, 2.25); g.fillStyle = COL.skin; dot(x, y, 1.85);
    const ray = (a, r0, r1, w) => seg([x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a) * r1, y + Math.sin(a) * r1], w, COL.skin);
    for (const [da, l] of fingers) ray(dir + da * spread, 1.3, 1.3 + l, .95);
    ray(dir - s * 1.25, 1.2, shape === 'fist' ? 2 : 2.6, 1);
  }

  // ---------- turning the drawing into dots ----------
  function makeBg(W) {
    bg = document.createElement('canvas'); bg.width = bg.height = W;
    const b = bg.getContext('2d'), cell = W / M;
    b.fillStyle = 'rgb(52,60,80)';
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
      b.beginPath(); b.arc((x + .5) * cell, (y + .5) * cell, cell * .08, 0, TAU); b.fill();
    }
  }

  rig(0, 0);

  return {
    render(ctx, t, W) {
      const dt = clamp((t - last) / 1000, 0, .05);
      last = now = t;
      update(t, dt); rig(t, dt); figure(t);
      if (!bg || bg.width !== W) makeBg(W);
      ctx.drawImage(bg, 0, 0);
      hg.clearRect(0, 0, 32, 32); hg.drawImage(src, 0, 0, 32, 32);
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = .2; ctx.drawImage(halo, 0, 0, W, W);      // soft magic glow around her
      ctx.globalAlpha = .08; ctx.drawImage(src, 0, 0, W, W);
      ctx.restore();
      halftone(ctx, g, M, W, t);
    },
    overlay(ctx, W) {                                  // sparkles drawn over everything, not snapped to the grid
      const k = W / 100;
      ctx.globalCompositeOperation = 'lighter';
      for (const s of sparks) {
        const a = clamp(s.life, 0, 1), r = s.s * k * (.6 + .4 * a), x = s.x * k, y = s.y * k;
        ctx.fillStyle = `rgba(${s.c},${.16 * a})`; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(${s.c},${.95 * a})`; star(ctx, x, y, r * 1.6, r * .32, s.rot);
      }
      ctx.globalCompositeOperation = 'source-over';
    },
    // Where the page should draw its picture particles: a box beside her (or her thought cloud).
    view(W) {
      const k = W / 100, S = V('objS');
      return { x0: (V('objX') - S / 2) * k, y0: (V('objY') - S / 2) * k, cell: S * k / N };
    },
    palmGrid() {
      const S = V('objS'), [x, y] = G.R.H;
      return [(x - (V('objX') - S / 2)) / S * N, (y - 1.5 - (V('objY') - S / 2)) / S * N];
    },
    onScene() { now = performance.now(); hasObj = true; act('conjure', 1400); },
    adopt() { hasObj = hasPicture() && getMode() !== 'thinking'; },
    beginReply(text) {
      now = performance.now(); dissolve(); speech.i = -1; gesture = 'explain';
      mood = /\b(sorry|sad|hard|tough|lonely|hurt|stress|anxious|tired|overwhelm|grie|lost|miss|afraid|scared|worr)/i.test(text) ? 'soft'
           : /\b(great|love|wonderful|fun|glad|happy|amazing|yay|awesome|excit|delight)/i.test(text) ? 'bright' : 'warm';
      if (/^\s*(hi|hello|hey)\b/i.test(text)) act('wave', 2000);
    },
    speech(i, word, frac) {
      speech.vis = viseme(word, frac);
      if (i === speech.i) return;
      now = performance.now();
      if (speech.i < 0 || /[.?!]["”']?$/.test(speech.word)) {
        const options = mood === 'soft' ? ['heart', 'clasp', 'explain'] : ['explain', 'explain', 'clasp', 'heart'];
        gesture = pick(options.filter(o => o !== gesture));
      }
      if (word.replace(/\W/g, '').length >= 5 || /!$/.test(word)) {   // a beat: nod, lift a hand, raise the brows
        P.nod.vel += rnd(16, 30);
        (hasObj || Math.random() < .5 ? P.hLy : P.hRy).vel -= rnd(25, 45);
        P.browL.vel += 5; P.browR.vel += 5;
      }
      if (/\?["”']?$/.test(word)) act('ask', 1100);
      speech.i = i; speech.word = word;
    },
    endReply(text) {
      now = performance.now(); speech.vis = [0, .5, 0]; P.nod.vel += 30;
      if (/\?["”']?\s*$/.test(text)) act('invite', 1800); else act('bow', 1300);
      if (mood === 'bright' && G) burst(G.head[0], G.head[1] - 6, 16, 12, 6);
    },
    greet() { now = performance.now(); act('wave', 2400); nextIdle = now + 5000; },
  };
}
