// FX — cinematic motion layer for PyQuest.
// Ambient particle world + parallax + a title-sequence intro + physics fireworks.
// Pure canvas/CSS; respects prefers-reduced-motion; pauses when tab hidden.
const FX = (() => {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let bg, ctx, W, H, dust = [], blobs = [], shots = [], parts = [], raf = 0, px = 0, py = 0;

  function resize() {
    if (!bg) return;
    W = bg.width = innerWidth * devicePixelRatio;
    H = bg.height = innerHeight * devicePixelRatio;
    bg.style.width = innerWidth + 'px'; bg.style.height = innerHeight + 'px';
  }

  function start() {
    if (bg) return;
    bg = document.createElement('canvas');
    bg.id = 'fx-bg';
    bg.style.cssText = 'position:fixed;inset:0;z-index:-1;pointer-events:none;';
    document.body.prepend(bg);
    ctx = bg.getContext('2d');
    resize(); addEventListener('resize', resize);
    // soft floating light-blobs (the "lighting") + sparkle dust (depth)
    const C = ['#fde68a', '#fca5fb', '#a5d8ff', '#bbf7d0', '#fdba74'];
    blobs = Array.from({ length: 6 }, (_, i) => ({
      x: Math.random(), y: Math.random(), r: (180 + Math.random() * 220),
      c: C[i % C.length], sx: (Math.random() - .5) * .00006, sy: (Math.random() - .5) * .00006,
    }));
    dust = Array.from({ length: reduce ? 0 : 70 }, () => spark());
    if (!reduce) {
      addEventListener('mousemove', (e) => { px = (e.clientX / innerWidth - .5); py = (e.clientY / innerHeight - .5); });
      addEventListener('deviceorientation', (e) => { if (e.gamma != null) { px = Math.max(-1, Math.min(1, e.gamma / 45)); py = Math.max(-1, Math.min(1, (e.beta - 45) / 45)); } });
    }
    document.addEventListener('visibilitychange', () => { document.hidden ? cancelAnimationFrame(raf) : (raf = requestAnimationFrame(loop)); });
    loop();
  }

  const dpr = () => devicePixelRatio || 1;
  function spark() {
    return { x: Math.random(), y: Math.random(), z: .3 + Math.random() * .7, r: 1 + Math.random() * 2.5,
             ph: Math.random() * 6.28, sp: .00002 + Math.random() * .00008 };
  }

  function loop(t = 0) {
    raf = requestAnimationFrame(loop);
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    // light blobs (additive glow)
    ctx.globalCompositeOperation = 'lighter';
    blobs.forEach((b) => {
      b.x += b.sx; b.y += b.sy;
      if (b.x < -.2 || b.x > 1.2) b.sx *= -1; if (b.y < -.2 || b.y > 1.2) b.sy *= -1;
      const cx = (b.x + px * .04) * W, cy = (b.y + py * .04) * H, r = b.r * dpr();
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, b.c + '66'); g.addColorStop(1, b.c + '00');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();
    });
    // sparkle dust (parallax by depth)
    dust.forEach((d) => {
      d.y -= d.sp * (1 + d.z); if (d.y < -.02) { d.y = 1.02; d.x = Math.random(); }
      const a = .25 + .55 * (0.5 + 0.5 * Math.sin(t * .003 + d.ph));
      const x = (d.x + px * .08 * d.z) * W, y = (d.y + py * .08 * d.z) * H;
      ctx.fillStyle = `rgba(255,255,255,${a * d.z})`;
      ctx.beginPath(); ctx.arc(x, y, d.r * d.z * dpr(), 0, 6.2832); ctx.fill();
    });
    // fireworks particles
    ctx.globalCompositeOperation = 'lighter';
    shots = shots.filter((s) => { s.t += 16; return s.t < s.life; });
    parts = parts.filter((p) => p.life > 0);
    parts.forEach((p) => {
      p.life -= 16; p.vy += 0.05 * dpr(); p.x += p.vx; p.y += p.vy; p.vx *= .985; p.vy *= .985;
      ctx.fillStyle = p.c + Math.max(0, Math.floor(p.life / p.max * 255)).toString(16).padStart(2, '0');
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.2832); ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  // physics fireworks burst at (sx,sy) in screen px (defaults: spread across top)
  function fireworks(rounds = 5) {
    if (reduce || !ctx) return;
    const C = ['#fde047', '#fb7185', '#60a5fa', '#34d399', '#c084fc', '#fb923c'];
    let n = 0;
    const fire = () => {
      const sx = (0.2 + Math.random() * 0.6) * W, sy = (0.18 + Math.random() * 0.3) * H;
      const col = C[Math.floor(Math.random() * C.length)];
      const count = 46;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * 6.2832, v = (2 + Math.random() * 3.4) * dpr();
        parts.push({ x: sx, y: sy, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          r: (1.5 + Math.random() * 2) * dpr(), c: col, life: 900 + Math.random() * 500, max: 1400 });
      }
      if (++n < rounds) setTimeout(fire, 220 + Math.random() * 260);
    };
    fire();
  }

  // cinematic title sequence; calls done() when finished (skippable on tap)
  function intro(done) {
    if (sessionStorage.getItem('pq_intro')) return done && done();
    sessionStorage.setItem('pq_intro', '1');
    const o = document.createElement('div');
    o.id = 'fx-intro';
    o.innerHTML = `
      <div class="intro-stage">
        <div class="intro-glow"></div>
        <div class="intro-snake">🐍</div>
        <div class="intro-title">
          ${'PyQuest'.split('').map((c, i) => `<span style="--i:${i}">${c}</span>`).join('')}
        </div>
        <div class="intro-sub">an adventure to learn Python</div>
        <div class="intro-skip">tap to start ▶</div>
      </div>`;
    document.body.appendChild(o);
    const finish = () => { if (!o.parentNode) return; o.classList.add('out'); setTimeout(() => { o.remove(); done && done(); }, 650); };
    o.addEventListener('click', finish);
    if (!reduce) setTimeout(() => fireworks(2), 1400);
    setTimeout(finish, reduce ? 200 : 3400);
  }

  // soft "camera" transition between views
  function transition(swap) {
    if (reduce) { swap(); return; }
    const app = document.getElementById('app');
    if (!app) { swap(); return; }
    app.classList.add('view-out');
    setTimeout(() => { swap(); app.classList.remove('view-out'); app.classList.add('view-in');
      setTimeout(() => app.classList.remove('view-in'), 420); }, 180);
  }

  // optional: drop in a Lottie/Rive character (the real studio pipeline) if asset present
  function lottie(container, path) {
    if (!window.lottie || !path) return null;
    try { return window.lottie.loadAnimation({ container, renderer: 'svg', loop: true, autoplay: true, path }); }
    catch { return null; }
  }

  return { start, fireworks, intro, transition, lottie };
})();
