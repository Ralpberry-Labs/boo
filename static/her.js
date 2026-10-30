// Boo's main avatar: a front-facing anime girl (static/her.png) with expression frames for her mouth and eyes
// (static/her-face.png), blended live and shown as dots. She is animated with the cues research on embodied
// conversational agents finds make a virtual human feel present: steady eye contact, glances away while thinking and
// when starting a sentence, blinks that cluster at phrase breaks, head motion driven by the voice's energy, lip sync
// from 15 visemes with coarticulation, an emotion per sentence, breathing with an inhale before speaking, idle
// micro-motion so she is never frozen, and listening backchannels (little nods, a mirrored smile).
function makeHer({ canvas, N, getMode, getLevel, hasPicture, release }) {
  const M = 150, TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a), clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k, pick = a => a[Math.random() * a.length | 0];
  const smooth = k => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
  const src = document.createElement('canvas'); src.width = src.height = M;
  const g = src.getContext('2d', { willReadFrequently: true });
  const halo = document.createElement('canvas'); halo.width = halo.height = 32;
  const hg = halo.getContext('2d');
  let bg = null, ready = 0;

  // Image layout: her.png is 512x512; the face frames are crops of the same picture.
  const S = 70 / 512, X0 = 15, Y0 = 30;                    // 70 units wide, standing at the bottom of the stage
  const MOUTHS = ['neutral', 'aa', 'ee', 'oh', 'oo', 'mm', 'happy', 'surprised'], EYES = ['neutral', 'blink', 'happy', 'surprised'];
  const MB = { x: 222.5, y: 192.5, w: 75, h: 60 }, EB = { x: 180, y: 100, w: 165, h: 90 };
  const NECK = [256, 300], HEAD = [262, 150];
  const BOX = { x: 50, y: 15, s: 24 }, SPAWN = [50, 31];
  const SPARK = ['255,214,120', '255,255,255', '255,170,200', '140,210,255'];

  const base = new Image(), face = new Image();
  const head = document.createElement('canvas'), sprites = { mouth: {}, eyes: {} };
  base.onload = face.onload = () => { if (++ready === 2) prepare(); };
  base.src = '/static/her.png'; face.src = '/static/her-face.png';
  function feathered(sx, sy, w, h, rx, ry) {               // a crop of the face frames with soft oval edges
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.drawImage(face, sx, sy, w, h, 0, 0, w, h);
    x.globalCompositeOperation = 'destination-in';
    x.translate(w / 2, h / 2); x.scale(rx, ry);
    const m = x.createRadialGradient(0, 0, .55, 0, 0, 1);
    m.addColorStop(0, '#000'); m.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = m; x.fillRect(-1, -1, 2, 2);
    return c;
  }
  function prepare() {
    MOUTHS.forEach((n, i) => (sprites.mouth[n] = feathered(i * MB.w, 0, MB.w, MB.h, MB.w * .48, MB.h * .46)));
    EYES.forEach((n, i) => (sprites.eyes[n] = feathered(i * EB.w, MB.h, EB.w, EB.h, EB.w * .5, EB.h * .5)));
    head.width = head.height = 512;                         // the head and upper hair, free to nod over the body
    const h = head.getContext('2d');
    h.drawImage(base, 0, 0);
    h.globalCompositeOperation = 'destination-in';
    h.translate(HEAD[0], HEAD[1] + 20); h.scale(175, 205);
    const m = h.createRadialGradient(0, 0, .72, 0, 0, 1);
    m.addColorStop(0, '#000'); m.addColorStop(1, 'rgba(0,0,0,0)');
    h.fillStyle = m; h.fillRect(-1, -1, 2, 2);
    ready = 3;
  }

  // ---------- animated parameters: damped springs ----------
  const P = {};
  const def = (n, v, k = 120, c = 16) => (P[n] = { v, vel: 0, to: v, k, c });
  def('yaw', 0, 60, 12); def('pitch', 0, 140, 13); def('roll', 0, 60, 11); def('bx', 0, 30, 10); def('bob', 0, 160, 12); def('shUp', 0, 90, 12);
  for (const n of MOUTHS) def('m_' + n, n === 'neutral' ? 1 : 0, 900, 55);
  for (const n of EYES) def('e_' + n, n === 'neutral' ? 1 : 0, 260, 30);
  def('think', 0, 40, 12); def('listen', 0, 40, 12); def('hold', 0, 40, 12);
  const V = n => P[n].v;

  // ---------- feelings: which eye and mouth frames each one leans on, and how lively the head is ----------
  const EXPR = {
    neutral:    { smile: .15, energy: 1 },
    happy:      { smile: .45, eyes: { happy: .25 }, energy: 1.1 },
    excited:    { smile: .7, eyes: { surprised: .3, happy: .15 }, energy: 1.8 },
    caring:     { smile: .05, roll: .05, pitch: .03, energy: .65 },
    curious:    { smile: .2, eyes: { surprised: .3 }, roll: .07, energy: 1 },
    surprised:  { smile: 0, eyes: { surprised: .85 }, mouth: { surprised: .4 }, energy: 1.3 },
    thoughtful: { smile: 0, eyes: { blink: .25 }, roll: -.04, energy: .7 },
  };
  function classify(s) {
    if (/\b(sorry|sad|hard|tough|lonely|hurt|stress|anxious|tired|overwhelm|grie|lost|miss|afraid|scared|worr|difficult|pain|heavy)/i.test(s)) return 'caring';
    if (/^\W*(oh|whoa|wow|really)\b/i.test(s)) return 'surprised';
    if (/!|\b(amazing|awesome|incredible|fantastic|yay|exciting|congrat|love that|so cool|so fun)/i.test(s)) return 'excited';
    if (/\?\W*$/.test(s)) return 'curious';
    if (/\b(glad|happy|nice|great|fun|enjoy|beautiful|lovely|laugh|wonderful|good)/i.test(s)) return 'happy';
    if (/\b(maybe|perhaps|wonder|consider|might|depends)/i.test(s)) return 'thoughtful';
    return 'neutral';
  }

  // ---------- lip sync: letters -> 15 visemes -> a mix of the mouth frames ----------
  const VIS = {
    sil: {}, PP: { mm: 1 }, FF: { ee: .4, mm: .6 }, TH: { ee: .5, aa: .2 }, DD: { ee: .5, aa: .25 }, kk: { aa: .45, ee: .3 },
    CH: { oo: .5, ee: .5 }, SS: { ee: .8, mm: .2 }, nn: { ee: .4, aa: .2 }, RR: { oo: .5, oh: .3 }, aa: { aa: 1 },
    E: { ee: .7, aa: .3 }, ih: { ee: 1 }, oh: { oh: 1 }, ou: { oo: 1 },
  };
  const DI = { th: 'TH', sh: 'CH', ch: 'CH', ph: 'FF', wh: 'ou', ng: 'nn', ck: 'kk', qu: 'kk', ee: 'ih', ea: 'ih', ie: 'ih',
               ey: 'ih', oo: 'ou', ew: 'ou', ue: 'ou', ou: 'oh', ow: 'oh', oa: 'oh', oi: 'oh', oy: 'oh', ai: 'E', ay: 'E',
               au: 'aa', aw: 'aa', ar: 'aa', er: 'RR', ir: 'RR', ur: 'RR', or: 'oh' };
  const MONO = { a: 'aa', e: 'E', i: 'ih', o: 'oh', u: 'aa', y: 'ih', b: 'PP', m: 'PP', p: 'PP', f: 'FF', v: 'FF', t: 'DD',
                 d: 'DD', k: 'kk', g: 'kk', c: 'kk', q: 'kk', x: 'kk', s: 'SS', z: 'SS', n: 'nn', l: 'nn', r: 'RR', w: 'ou', j: 'CH', h: 'kk' };
  const VOWEL = new Set(['aa', 'E', 'ih', 'oh', 'ou', 'RR']);
  function phonemes(word) {
    const w = word.toLowerCase().replace(/[^a-z]/g, ''), out = [];
    for (let i = 0; i < w.length;) {
      if (w[i] === 'e' && i === w.length - 1 && i > 1) break;          // silent final e
      let v, n = 1;
      if (w.startsWith('tch', i)) { v = 'CH'; n = 3; } else if (DI[w.slice(i, i + 2)]) { v = DI[w.slice(i, i + 2)]; n = 2; } else v = MONO[w[i]] || 'kk';
      if (out[out.length - 1] !== v) out.push(v);
      i += n;
    }
    return out.length ? out : ['sil'];
  }
  function visemeMix(frac, ph) {                          // the current sound, blending into the next one
    if (!(frac >= 0 && frac < 1)) return {};
    const wts = ph.map(p => (VOWEL.has(p) ? 2 : 1)), tot = wts.reduce((a, b) => a + b, 0);
    let acc = 0, k = 0;
    while (k < ph.length - 1 && (acc + wts[k]) / tot <= frac) acc += wts[k++];
    const blend = smooth(((frac * tot - acc) / wts[k] - .55) / .45) * .6, out = {};
    for (const [n, w] of Object.entries(VIS[ph[k]])) out[n] = (out[n] || 0) + w * (1 - blend);
    for (const [n, w] of Object.entries(VIS[ph[k + 1] || 'sil'])) out[n] = (out[n] || 0) + w * blend;
    return out;
  }

  // ---------- state ----------
  let now = 0, last = 0, mode0 = '', modeT = 0, hasObj = false, lvlS = 0, lvlPrev = 0, quiet = true, userTalked = 0;
  let nextBlink = 0, blinkT0 = -1e9, nextGlance = 0, sparks = [], G = null;
  let sentences = [], sent = 0, expr = 'neutral', avertUntil = 0, avertX = 0, avertY = 0, thinkSide = 1, inhaleT = -1e9;
  const sp = { i: -1, word: '', ph: ['sil'], frac: 2 }, ptr = { x: 50, y: 50, t: -1e9 };

  addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    ptr.x = (e.clientX - r.left) / r.width * 100; ptr.y = (e.clientY - r.top) / r.height * 100; ptr.t = performance.now();
  });
  function blinkNow(t) { if (t - blinkT0 > 500) blinkT0 = t; }
  function avert(t, ms, x, y) { avertUntil = t + ms; avertX = x; avertY = y; blinkNow(t); }
  function burst(x, y, n, speed = 14, up = 6) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU), v = rnd(.3, 1) * speed;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, life: 1, decay: rnd(.7, 1.4),
                    s: rnd(.45, 1.15), c: pick(SPARK), rot: rnd(0, TAU), spin: rnd(-4, 4) });
    }
  }
  function dissolve() { if (hasObj) { hasObj = false; release(); burst(BOX.x, BOX.y, 22, 12, 8); } }
  const noise = (t, s) => Math.sin(t * .00071 + s) * .5 + Math.sin(t * .00153 + s * 2.1) * .3 + Math.sin(t * .00319 + s * 3.7) * .2;
  const blinkAmt = t => { const k = (t - blinkT0) / 170; return k < 0 || k > 1 ? 0 : k < .38 ? k / .38 : 1 - (k - .38) / .62; };

  // ---------- behaviour ----------
  function update(t, dt) {
    const mode = getMode(), lvl = getLevel();
    lvlS += (lvl - lvlS) * .25;
    if (hasObj && !hasPicture()) hasObj = false;
    if (mode !== mode0) {
      if (mode === 'listening' || mode === 'thinking') dissolve();
      if (mode === 'thinking') { thinkSide = pick([-1, 1]); avert(t, 1e9, thinkSide, -1); P.pitch.vel -= 3; }
      if (mode0 === 'thinking') avertUntil = 0;
      if (mode === 'listening') { P.pitch.vel += 4; blinkNow(t); }   // a small "go ahead" nod
      mode0 = mode; modeT = t;
    }
    const e = mode === 'speaking' ? EXPR[expr] : mode === 'thinking' ? EXPR.thoughtful : mode === 'listening' ? EXPR.happy : EXPR.neutral;
    const T = { yaw: 0, pitch: e.pitch || 0, roll: e.roll || 0, bx: 0, shUp: 0, think: 0, listen: 0, hold: 0 };
    const eyes = { ...(e.eyes || {}) }, mouth = {};
    let smile = e.smile, energy = e.energy;

    // where she is looking: at you, at the pointer, or away while she thinks or starts a thought
    if ((mode === 'idle' || mode === 'listening') && t - ptr.t < 2500 && G) {
      T.yaw = clamp((ptr.x - 50) / 40, -1, 1) * .12; T.pitch += clamp((ptr.y - 60) / 40, -1, 1) * .04;
    } else if (mode === 'idle' && t > nextGlance) {
      avert(t, rnd(700, 1400), pick([-1, 1]) * rnd(.5, 1), rnd(-.6, .3)); nextGlance = t + rnd(4500, 9000);
    }
    if (t < avertUntil) { T.yaw += avertX * .13; T.pitch += avertY * .05; T.roll += avertX * .03; }

    if (mode === 'listening') {
      T.listen = 1; T.roll += .04; smile = .35 + lvlS * .3; energy = .55;
      if (lvl > .25) { userTalked = t; quiet = false; }
      if (!quiet && lvl < .08 && t - userTalked > 350) { quiet = true; P.pitch.vel += rnd(4, 6); }   // "mm-hm"
    } else if (mode === 'thinking') {
      T.think = 1; T.roll += thinkSide * .05; mouth.mm = .6; energy = .5;
    } else if (mode === 'speaking') {
      energy *= .55 + lvlS * 1.2;
      const gate = lvl < .035 ? .2 : clamp(.35 + lvl * 1.1, .2, 1);
      for (const [n, w] of Object.entries(visemeMix(sp.frac, sp.ph))) mouth[n] = (mouth[n] || 0) + w * gate;
      for (const [n, w] of Object.entries(e.mouth || {})) mouth[n] = (mouth[n] || 0) + w;
      if (lvl - lvlPrev > .12 && lvl > .3) { P.pitch.vel += rnd(2, 4) * (e.energy || 1); if (expr === 'excited') P.bob.vel -= 5; }
    }
    lvlPrev = lvlS;
    if (mode !== 'speaking' || sp.frac >= 1) mouth.happy = (mouth.happy || 0) + Math.max(0, smile - .2) * .8;   // smiling between words
    else mouth.happy = (mouth.happy || 0) + smile * .25;
    if (t - inhaleT < 450) { T.shUp = .9; mouth.oh = (mouth.oh || 0) + .15; }                                 // breath in before speaking
    const b = blinkAmt(t);
    eyes.blink = Math.max(eyes.blink || 0, b * 1.6);
    // idle micro-motion: she is never perfectly still
    T.yaw += noise(t, 1) * .05 * energy; T.pitch += noise(t, 2) * .04 * energy; T.roll += noise(t, 3) * .03 * energy;
    T.bx = noise(t, 5) * .6;
    if (hasObj && mode !== 'thinking' && mode !== 'listening') T.hold = 1;
    if (mode === 'idle' && hasObj && t - modeT > 7000) dissolve();

    const rest = o => { o.neutral = Math.max(.04, 1 - Object.values(o).reduce((a, w) => a + w, 0)); };
    rest(mouth); rest(eyes);
    for (const n in T) P[n].to = T[n];
    const norm = (o, pre) => { const s = Object.values(o).reduce((a, w) => a + w, 0) || 1; for (const n of Object.keys(P).filter(k => k.startsWith(pre))) P[n].to = (o[n.slice(pre.length)] || 0) / s; };
    norm(mouth, 'm_'); norm(eyes, 'e_');
    for (const s of Object.values(P)) { s.vel += (s.k * (s.to - s.v) - s.c * s.vel) * dt; s.v += s.vel * dt; }
    if (b > .5) P.e_blink.v = Math.max(P.e_blink.v, P.e_blink.to);   // blinks snap shut

    if (t > nextBlink) { blinkNow(t); nextBlink = t + (Math.random() < .15 ? 260 : mode === 'speaking' ? rnd(1800, 3800) : rnd(2600, 5200)); }
    if (Math.random() < dt * 1.2)
      sparks.push({ x: rnd(20, 80), y: rnd(40, 95), vx: rnd(-1, 1), vy: rnd(-5, -2), life: 1, decay: rnd(.4, .8),
                    s: rnd(.3, .7), c: pick(SPARK), rot: 0, spin: rnd(-2, 2) });
    for (const s of sparks) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 1 - 1.8 * dt; s.vy = s.vy * (1 - 1.8 * dt) - 3 * dt;
      s.life -= dt * s.decay; s.rot += dt * s.spin;
    }
    sparks = sparks.filter(s => s.life > 0);
  }

  // ---------- drawing ----------
  function blend(kind, box) {                              // mix the frames: each layer is drawn so the result is their weighted average
    const list = (kind === 'mouth' ? MOUTHS : EYES).map(n => [n, V((kind === 'mouth' ? 'm_' : 'e_') + n)]).filter(([, w]) => w > .01);
    let acc = 0;
    for (const [n, w] of list) {
      acc += w; g.globalAlpha = clamp(w / acc, 0, 1);
      g.drawImage(sprites[kind][n], box.x, box.y, box.w, box.h);
    }
    g.globalAlpha = 1;
  }

  function figure(t) {
    const k = M / 100;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, 100, 100);
    rings(t); bubble(t);
    if (ready === 3) {
      const breath = Math.sin(t / 1600) * .5 + .5;
      g.save();
      g.translate(X0 + V('bx'), Y0 + V('bob') - breath * .25 - V('shUp') * .3); g.scale(S, S);
      g.save(); g.translate(256, 512); g.scale(1 + breath * .004, 1 + breath * .008); g.translate(-256, -512);   // breathing chest
      g.filter = 'brightness(1.15) saturate(1.08)';
      g.drawImage(base, 0, 0);
      g.restore();
      // head: nods, tilts and turns around the neck, carrying the eyes and mouth with it
      g.translate(NECK[0], NECK[1]); g.rotate(V('roll')); g.translate(V('yaw') * 60, V('pitch') * 50); g.translate(-NECK[0], -NECK[1]);
      g.drawImage(head, 0, 0);
      blend('eyes', EB); blend('mouth', MB);
      g.filter = 'none';
      g.restore();
      const fade = g.createLinearGradient(0, 90, 0, 100);   // let the bust dissolve at the bottom
      fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, '#000');
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 90, 100, 10);
      g.globalCompositeOperation = 'source-over';
      G = { head: [X0 + HEAD[0] * S, Y0 + HEAD[1] * S] };
    }
    platform(t);
  }

  function rings(t) {
    const ls = V('listen');
    if (ls < .02 || !G) return;
    g.lineWidth = .7;
    for (let k = 0; k < 3; k++) {
      const ph = (t / 1200 + k / 3) % 1;
      g.strokeStyle = `rgba(124,196,255,${(.12 + lvlS * .9) * (1 - ph) * ls})`;
      g.beginPath(); g.arc(G.head[0], G.head[1], 22 + ph * 24, 0, TAU); g.stroke();
    }
  }
  function bubble(t) {
    const th = V('think');
    if (th < .02) return;
    const { x, y, s } = BOX;
    g.fillStyle = `rgba(215,228,255,${.2 * th})`;
    g.beginPath();
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * TAU + t / 3000, cx = x + Math.cos(a) * s * .44, cy = y + Math.sin(a) * s * .34;
      g.moveTo(cx + s * .2, cy); g.arc(cx, cy, s * .2, 0, TAU);
    }
    g.moveTo(x + s * .45, y); g.arc(x, y, s * .45, 0, TAU); g.fill();
    g.fillStyle = `rgba(215,228,255,${.5 * th})`;
    for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + thinkSide * (4 + k * 2.5) + Math.sin(t / 300 + k) * .3, SPAWN[1] - k * 2.4, .6 + k * .35, 0, TAU); g.fill(); }
  }
  function platform(t) {
    const h = V('hold');
    if (h < .02) return;
    g.strokeStyle = `rgba(255,209,102,${.75 * h})`; g.lineWidth = .7;
    g.setLineDash([1.4, 1.3]); g.lineDashOffset = -t / 60;
    g.beginPath(); g.ellipse(BOX.x, BOX.y + BOX.s * .48, BOX.s * .34 * h, 1.4, 0, 0, TAU); g.stroke();
    g.setLineDash([]);
  }

  function makeBg(W) {
    bg = document.createElement('canvas'); bg.width = bg.height = W;
    const b = bg.getContext('2d'), cell = W / M;
    b.fillStyle = 'rgb(52,60,80)';
    for (let y = 0; y < M; y += 2) for (let x = 0; x < M; x += 2) { b.beginPath(); b.arc((x + 1) * cell, (y + 1) * cell, cell * .12, 0, TAU); b.fill(); }
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
      ctx.globalAlpha = .14; ctx.drawImage(halo, 0, 0, W, W); ctx.restore();
      const ph = t / 520;
      halftone(ctx, g, M, W, t, (r, gr, b, x, y) =>        // golden hair shimmers
        r > 190 && gr > 140 && b < 110 && r - b > 120 ? [Math.sin(ph + y * .19 + x * .05) * .22, 0] : [0, 0]);
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
    view(W) { const k = W / 100; return { x0: (BOX.x - BOX.s / 2) * k, y0: (BOX.y - BOX.s / 2) * k, cell: BOX.s * k / N }; },
    palmGrid() { return [(SPAWN[0] - (BOX.x - BOX.s / 2)) / BOX.s * N, (SPAWN[1] - (BOX.y - BOX.s / 2)) / BOX.s * N]; },
    onScene() { hasObj = true; burst(SPAWN[0], SPAWN[1], 16, 12, 8); },
    adopt() { hasObj = hasPicture() && getMode() !== 'thinking'; },
    beginReply(text) {
      dissolve();
      sentences = (text.match(/[^.!?]+[.!?]*["”']?/g) || [text]).map(classify);
      sent = 0; expr = sentences[0] || 'neutral'; sp.i = -1; sp.word = ''; inhaleT = performance.now();
    },
    speech(i, word, frac) {
      sp.frac = frac;
      if (i === sp.i) return;
      const t = performance.now();
      if (sp.i >= 0 && /[.!?]["”']?$/.test(sp.word)) {                // a new sentence: new feeling, maybe glance away
        sent++; expr = sentences[sent] || expr; blinkNow(t);
        if (Math.random() < .4) avert(t, rnd(350, 700), pick([-1, 1]) * rnd(.5, .9), rnd(-.6, .1));
        if (expr === 'excited') burst(SPAWN[0], SPAWN[1] + 4, 10, 10, 6);
      }
      if (/,$/.test(sp.word) && Math.random() < .5) blinkNow(t);
      const bare = word.replace(/[^A-Za-z]/g, '');
      if (bare.length >= 6 || /!$/.test(word)) { P.pitch.vel += 2.8; P.e_surprised.vel += 1.5; }   // emphasis: nod, brows up
      if (/\?["”']?$/.test(word)) { P.roll.vel += .4; P.e_surprised.vel += 2; }
      sp.i = i; sp.word = word; sp.ph = phonemes(word);
    },
    endReply(text) { sp.frac = 2; P.pitch.vel += 4.5; if (/\?\W*$/.test(text)) P.roll.vel += .5; },
    greet() { P.pitch.vel += 6; burst(SPAWN[0], SPAWN[1], 18, 14, 6); },
  };
}
