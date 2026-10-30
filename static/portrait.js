// The portrait avatar: a drawn character (static/portrait.png, cut out of its background) shown as dots and
// brought to life on top of the drawing: breathing, sway, rippling hair, blinks, lip sync, blush, nods on the beat,
// sound rings while listening, a thought cloud while thinking, and pictures appearing where she looks.
// Positions below are pixels of the original 808x854 drawing; the asset is its crop x 30..790, y 0..620.
function makePortrait({ N, getMode, getLevel, hasPicture, release }) {
  const M = 120, TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k, pick = a => a[Math.random() * a.length | 0];
  const src = document.createElement('canvas'); src.width = src.height = M;
  const g = src.getContext('2d', { willReadFrequently: true });
  const halo = document.createElement('canvas'); halo.width = halo.height = 32;
  const hg = halo.getContext('2d');
  const head = document.createElement('canvas');
  let bg = null, ready = false;

  // where the drawing sits on the 0..100 stage, and the features she animates
  const S = 88 / 760, X0 = 2 - 30 * S, Y0 = 28.2;
  const u = (px, py) => [X0 + px * S, Y0 + py * S];
  const EYES = [{ x: 478, y: 192, rx: 40, ry: 29 }, { x: 586, y: 234, rx: 25, ry: 31 }];
  const MOUTH = { x: 512, y: 330 }, CHIN = { x: 505, y: 405 }, FACE = u(520, 250);
  const SKIN = '#fac3ab', LASH = '#2a1610', SPARK = ['255,214,120', '255,255,255', '255,170,200', '140,210,255'];

  const img = new Image();
  img.onload = () => {                                 // a soft-edged copy of the head, so it can nod over the body
    head.width = img.width; head.height = img.height;
    const h = head.getContext('2d');
    h.drawImage(img, 0, 0);
    const cx = (520 - 30) / 760 * img.width, cy = 250 / 620 * img.height, r = img.width / 760;
    const m = h.createRadialGradient(cx, cy, 160 * r, cx, cy, 250 * r);
    m.addColorStop(0, '#000'); m.addColorStop(1, 'rgba(0,0,0,0)');
    h.globalCompositeOperation = 'destination-in'; h.fillStyle = m; h.fillRect(0, 0, head.width, head.height);
    ready = true;
  };
  img.src = '/static/portrait.png';

  const P = {};
  const def = (n, v, k = 120, c = 16) => (P[n] = { v, vel: 0, to: v, k, c });
  def('tilt', 0, 60, 11); def('nod', 0, 260, 15); def('zoom', 1, 80, 14); def('blush', .2, 40, 12);
  def('mOpen', 0, 900, 55); def('mWide', .5, 600, 45); def('mRound', 0, 600, 45);
  def('think', 0, 40, 12); def('listen', 0, 40, 12); def('hold', 0, 40, 12);
  def('objX', 81, 50, 14); def('objY', 17, 50, 14); def('objS', 30, 50, 14);
  const V = n => P[n].v;

  const VIS = { a: [1, .65, 0], e: [.7, .9, 0], i: [.55, 1, 0], y: [.5, .9, 0], o: [.85, .1, 1], u: [.55, 0, 1], w: [.35, 0, .9],
                m: [0, .45, 0], b: [0, .45, 0], p: [0, .45, 0], f: [.18, .7, 0], v: [.18, .7, 0] };
  function viseme(word, frac) {
    const s = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!s) return [0, .5, 0];
    return VIS[s[clamp(Math.floor(frac * s.length), 0, s.length - 1)]] || [.35, .6, 0];
  }

  let now = 0, last = 0, mode0 = '', modeT = 0, hasObj = false, mood = 'warm', lvlS = 0, quiet = true;
  let nextBlink = 0, blinkT0 = -1e9, giggleT = -1e9, nextIdle = 0, sparks = [];
  const speech = { i: -1, word: '', vis: [0, .5, 0] };
  const SPAWN = u(640, 120);                           // pictures appear up where her eyes are looking

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

  function update(t, dt) {
    const mode = getMode(), lvl = getLevel();
    lvlS += (lvl - lvlS) * .2;
    if (hasObj && !hasPicture()) hasObj = false;
    if (mode !== mode0) {
      if (mode === 'listening' || mode === 'thinking') dissolve();
      if (mode === 'idle') nextIdle = t + rnd(3000, 6000);
      mode0 = mode; modeT = t;
    }
    const T = { tilt: .018 * Math.sin(t / 2300), zoom: 1, blush: .2, mOpen: 0, mWide: .5, mRound: 0, think: 0, listen: 0, hold: 0 };
    if (mode === 'listening') {
      Object.assign(T, { listen: 1, zoom: 1.015 + lvlS * .02, blush: .3 }); T.tilt += .025;
      if (lvl > .3 && quiet) { P.nod.vel += 30; quiet = false; }   // little "mm-hm" nods as you talk
      if (lvl < .1) quiet = true;
    } else if (mode === 'thinking') {
      Object.assign(T, { think: 1, mOpen: .08, mRound: .8, mWide: .1 }); T.tilt -= .02;
    } else if (mode === 'speaking') {
      T.blush = { warm: .35, soft: .25, bright: .7 }[mood];
      T.zoom = 1 + lvlS * .012;
      const [o, w, r] = speech.vis;
      T.mOpen = lvl > .05 ? o * clamp(.3 + lvl, 0, 1.15) : 0; T.mWide = w; T.mRound = r;
    } else if (t > nextIdle) {                         // idle: now and then a little giggle and a nod
      giggleT = t; P.nod.vel += 25; P.tilt.vel += rnd(-.15, .15); nextIdle = t + rnd(5000, 9000);
    }
    const gk = (t - giggleT) / 1200;
    if (gk >= 0 && gk < 1) { T.blush = Math.max(T.blush, .9); T.zoom += Math.abs(Math.sin(gk * 14)) * .006 * (1 - gk); }
    if (hasObj && mode !== 'thinking' && mode !== 'listening') T.hold = 1;
    if (mode === 'idle' && hasObj && t - modeT > 6000) dissolve();
    for (const n in T) P[n].to = T[n];
    if (mode === 'thinking') { P.objX.to = 80; P.objY.to = 15; P.objS.to = 22; }
    else { P.objX.to = 81; P.objY.to = 17; P.objS.to = 30; }
    for (const s of Object.values(P)) { s.vel += (s.k * (s.to - s.v) - s.c * s.vel) * dt; s.v += s.vel * dt; }

    if (Math.random() < dt * 1.6)                      // a few sparkles drifting off her hair
      sparks.push({ x: rnd(10, 90), y: rnd(40, 95), vx: rnd(-1, 1), vy: rnd(-5, -2), life: 1, decay: rnd(.4, .8),
                    s: rnd(.3, .7), c: pick(SPARK), rot: 0, spin: rnd(-2, 2) });
    for (const s of sparks) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 1 - 1.8 * dt; s.vy = s.vy * (1 - 1.8 * dt) - 3 * dt;
      s.life -= dt * s.decay; s.rot += dt * s.spin;
    }
    sparks = sparks.filter(s => s.life > 0);
  }

  function blink(t) {
    if (t > nextBlink) { blinkT0 = t; nextBlink = t + (Math.random() < .2 ? 300 : rnd(2200, 5500)); }
    const k = (t - blinkT0) / 180;
    return k < 0 || k > 1 ? 0 : k < .4 ? k / .4 : 1 - (k - .4) / .6;
  }

  function figure(t) {
    const k = M / 100;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, 100, 100);
    g.lineCap = 'round';
    rings(t); bubble(t);
    if (!ready) return;
    // the whole bust: drawing pixels on the stage, breathing, floating, swaying from the waist
    g.save();
    g.translate(X0, Y0 + Math.sin(t / 1300) * .5); g.scale(S, S);
    const z = V('zoom') + Math.sin(t / 1700) * .004;
    g.translate(410, 620); g.rotate(V('tilt')); g.scale(z, z); g.translate(-410, -620);
    g.filter = 'brightness(1.18) saturate(1.1)';
    g.drawImage(img, 30, 0, 760, 620);
    g.filter = 'none';
    // the head nods on its own over the body
    g.translate(CHIN.x, CHIN.y); g.rotate(V('tilt') * .6); g.translate(-CHIN.x, -CHIN.y + V('nod') * 3);
    g.drawImage(head, 30, 0, 760, 620);
    g.fillStyle = `rgba(255,120,150,${.12 + .3 * V('blush')})`;
    g.beginPath(); g.ellipse(452, 258, 34, 15, 0, 0, TAU); g.ellipse(588, 292, 18, 11, 0, 0, TAU); g.fill();
    const b = blink(t);
    for (const e of EYES) {
      if (b < .02) continue;
      const lid = e.y - e.ry + 2 * e.ry * b;
      g.save(); g.beginPath(); g.ellipse(e.x, e.y, e.rx, e.ry, 0, 0, TAU); g.clip();
      g.fillStyle = SKIN; g.fillRect(e.x - e.rx - 2, e.y - e.ry - 2, e.rx * 2 + 4, lid - (e.y - e.ry) + 2);
      g.restore();
      g.strokeStyle = LASH; g.lineWidth = 6;
      g.beginPath(); g.moveTo(e.x - e.rx, lid - e.ry * .1 * (1 - b)); g.quadraticCurveTo(e.x, lid + e.ry * .25 * b, e.x + e.rx, lid - e.ry * .2); g.stroke();
    }
    mouth(V('mOpen'), V('mWide'), V('mRound'));
    g.restore();
    const fade = g.createLinearGradient(0, 86, 0, 100);       // dissolve the cut at the bottom of the bust
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, '#000');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 86, 100, 14);
    g.globalCompositeOperation = 'source-over';
    platform(t);
  }

  function mouth(o, w, r) {
    if (o < .06) return;                              // closed: the drawing's own lips
    const hw = 16 + w * 9 - r * 7, h = 3 + o * 15, { x, y } = MOUTH;
    g.fillStyle = '#c75f62'; g.beginPath(); g.ellipse(x, y, hw + 4, h + 3.5, -.08, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.ellipse(x, y, hw, h, -.08, 0, TAU); g.clip();
    g.fillStyle = '#3a1216'; g.fillRect(x - hw, y - h, hw * 2, h * 2);
    if (o > .35 && r < .6) { g.fillStyle = '#fff6f2'; g.fillRect(x - hw, y - h, hw * 2, h * .45); }
    g.fillStyle = '#e07a86'; g.beginPath(); g.ellipse(x, y + h * .8, hw * .6, h * .45, 0, 0, TAU); g.fill();
    g.restore();
  }

  function rings(t) {                                  // sound ripples while she listens
    const ls = V('listen');
    if (ls < .02) return;
    g.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      const ph = (t / 1200 + k / 3) % 1;
      g.strokeStyle = `rgba(124,196,255,${(.12 + lvlS * .9) * (1 - ph) * ls})`;
      g.beginPath(); g.arc(FACE[0], FACE[1], 24 + ph * 34, 0, TAU); g.stroke();
    }
  }

  function bubble(t) {                                 // thought cloud the brainstorm pictures float in
    const th = V('think');
    if (th < .02) return;
    const cx = V('objX'), cy = V('objY'), s = V('objS');
    g.fillStyle = `rgba(215,228,255,${.22 * th})`;
    g.beginPath();
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * TAU + t / 3000, x = cx + Math.cos(a) * s * .44, y = cy + Math.sin(a) * s * .36;
      g.moveTo(x + s * .2, y); g.arc(x, y, s * .2, 0, TAU);
    }
    g.moveTo(cx + s * .45, cy); g.arc(cx, cy, s * .45, 0, TAU);
    g.fill();
    g.fillStyle = `rgba(215,228,255,${.5 * th})`;
    for (let k = 0; k < 3; k++) {
      const f = .2 + k * .27;
      g.beginPath(); g.arc(lerp(SPAWN[0], cx - s * .4, f), lerp(SPAWN[1], cy + s * .3, f) + Math.sin(t / 300 + k) * .4, .8 + k * .5, 0, TAU); g.fill();
    }
  }

  function platform(t) {                               // dotted gold ring the picture hovers on
    const h = V('hold');
    if (h < .02) return;
    g.strokeStyle = `rgba(255,209,102,${.75 * h})`; g.lineWidth = .8;
    g.setLineDash([1.6, 1.5]); g.lineDashOffset = -t / 60;
    g.beginPath(); g.ellipse(V('objX'), V('objY') + V('objS') * .48, V('objS') * .34 * h, 1.7, 0, 0, TAU); g.stroke();
    g.setLineDash([]);
  }

  function makeBg(W) {
    bg = document.createElement('canvas'); bg.width = bg.height = W;
    const b = bg.getContext('2d'), cell = W / M;
    b.fillStyle = 'rgb(52,60,80)';
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
      b.beginPath(); b.arc((x + .5) * cell, (y + .5) * cell, cell * .07, 0, TAU); b.fill();
    }
  }

  return {
    render(ctx, t, W) {
      const dt = clamp((t - last) / 1000, 0, .05);
      last = now = t;
      update(t, dt); figure(t);
      if (!bg || bg.width !== W) makeBg(W);
      ctx.drawImage(bg, 0, 0);
      hg.clearRect(0, 0, 32, 32); hg.drawImage(src, 0, 0, 32, 32);
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = .16; ctx.drawImage(halo, 0, 0, W, W);
      ctx.restore();
      const ph = t / 520;
      halftone(ctx, g, M, W, t, (r, gr, b, x, y) =>        // golden hair ripples like it is underwater
        r > 160 && gr > 100 && b < 140 && r - b > 85 ? [Math.sin(ph + y * .21 + x * .05) * .32, Math.cos(ph * .8 + y * .17) * .12] : [0, 0]);
    },
    overlay(ctx, W) {
      const k = W / 100;
      ctx.globalCompositeOperation = 'lighter';
      for (const s of sparks) {
        const a = clamp(s.life, 0, 1), r = s.s * k * (.6 + .4 * a), x = s.x * k, y = s.y * k;
        ctx.fillStyle = `rgba(${s.c},${.16 * a})`; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(${s.c},${.95 * a})`; star(ctx, x, y, r * 1.6, r * .32, s.rot);
      }
      ctx.globalCompositeOperation = 'source-over';
    },
    view(W) {
      const k = W / 100, s = V('objS');
      return { x0: (V('objX') - s / 2) * k, y0: (V('objY') - s / 2) * k, cell: s * k / N };
    },
    palmGrid() {
      const s = V('objS');
      return [(SPAWN[0] - (V('objX') - s / 2)) / s * N, (SPAWN[1] - (V('objY') - s / 2)) / s * N];
    },
    onScene() { hasObj = true; burst(SPAWN[0], SPAWN[1], 18, 12, 6); P.nod.vel += 20; },
    adopt() { hasObj = hasPicture() && getMode() !== 'thinking'; },
    beginReply(text) {
      dissolve(); speech.i = -1;
      mood = /\b(sorry|sad|hard|tough|lonely|hurt|stress|anxious|tired|overwhelm|grie|lost|miss|afraid|scared|worr)/i.test(text) ? 'soft'
           : /\b(great|love|wonderful|fun|glad|happy|amazing|yay|awesome|excit|delight)/i.test(text) ? 'bright' : 'warm';
    },
    speech(i, word, frac) {
      speech.vis = viseme(word, frac);
      if (i === speech.i) return;
      if (word.replace(/\W/g, '').length >= 5 || /[!?]$/.test(word)) { P.nod.vel += rnd(18, 32); P.tilt.vel += rnd(-.08, .08); }
      speech.i = i; speech.word = word;
    },
    endReply() { speech.vis = [0, .5, 0]; P.nod.vel += 30; giggleT = performance.now() - 300; },
    greet() { giggleT = performance.now(); P.nod.vel += 30; burst(FACE[0], FACE[1] - 20, 20, 14, 6); },
  };
}
