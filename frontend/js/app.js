// PyQuest SPA controller
(() => {
  const app = document.getElementById('app');
  const hud = document.getElementById('hud');
  const state = { user: null, role: 'student', display: '', curriculum: null, progress: null, lessonStart: 0 };

  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };

  // ── boot ──────────────────────────────────────────────────────────────────
  async function boot() {
    try { FX.start(); } catch {}
    state.curriculum = await API.curriculum();
    wireHud();
    if (API.token) {
      try { await refresh(); return showMap(); } catch { API.setToken(null); }
    }
    try { FX.intro(() => showLogin()); } catch { showLogin(); }
  }

  async function refresh() {
    const me = await API.me();
    state.user = me.player.username;
    state.role = me.player.role;
    state.display = me.player.display || me.player.username;
    state.progress = me.progress;
    updateHud();
  }

  function wireHud() {
    $('#btn-logout').onclick = () => { API.setToken(null); location.reload(); };
    $('#btn-a11y').onclick = () => {
      const on = document.body.dataset.dyslexia === 'on';
      document.body.dataset.dyslexia = on ? 'off' : 'on';
    };
    $('#btn-badges').onclick = showBadges;
  }

  function updateHud() {
    const p = state.progress; if (!p) return;
    hud.classList.remove('hidden');
    $('#hud-name').textContent = state.display;
    $('#hud-level').textContent = p.level;
    $('#hud-xp').textContent = p.total_xp;
    $('#hud-xpbar').style.width = Math.round((p.xp_into_level / p.xp_for_next) * 100) + '%';
  }

  // ── login ───────────────────────────────────────────────────────────────────
  function showLogin() {
    hud.classList.add('hidden');
    app.innerHTML = '';
    const card = el(`
      <div class="min-h-screen grid place-items-center p-4">
        <div class="pop-in w-full max-w-md bg-white rounded-3xl shadow-xl p-7 text-center">
          <div class="text-7xl floaty">🐍</div>
          <h1 class="text-4xl font-extrabold mt-2">Py<span class="text-emerald-500">Quest</span></h1>
          <p class="text-slate-500 mb-4 text-lg">Code your snake to the apple! 🍎</p>
          <button id="play" class="btn btn-primary w-full mb-3 text-2xl py-4">▶ JUST PLAY!</button>
          <details class="text-left">
            <summary class="text-sm text-slate-400 cursor-pointer text-center mb-2">I have an account</summary>
            <input id="u" placeholder="username or email" class="w-full mb-2 px-4 py-3 rounded-xl bg-slate-100 outline-none" />
            <input id="p" type="password" placeholder="password" class="w-full mb-2 px-4 py-3 rounded-xl bg-slate-100 outline-none" />
            <button id="go" class="btn btn-sky w-full mb-2">Log in</button>
            <button id="reg" class="text-sm text-sky-600 underline w-full">New here? Create a hero</button>
            <div class="text-xs text-slate-400 mt-2">Demo: <b>kid@pythonquest.ai</b> / <b>Kid123!</b></div>
          </details>
          <p id="err" class="text-rose-500 text-sm mt-2 h-5"></p>
        </div>
      </div>`);
    app.appendChild(card);
    const err = $('#err', card);
    const doLogin = async () => {
      err.textContent = '';
      try {
        const r = await API.login($('#u', card).value.trim(), $('#p', card).value);
        API.setToken(r.token); await refresh(); showMap();
      } catch (e) { err.textContent = '😿 ' + e.message; }
    };
    $('#play', card).onclick = async () => {
      err.textContent = '';
      const guest = 'hero' + Date.now().toString(36) + Math.floor(Math.random() * 999);
      try {
        const r = await API.register(guest, guest + 'pw', 'Hero');
        API.setToken(r.token); await refresh(); showMap();
      } catch (e) { err.textContent = '😿 ' + e.message; }
    };
    $('#go', card).onclick = doLogin;
    $('#p', card).addEventListener('keydown', (e) => e.key === 'Enter' && doLogin());
    $('#reg', card).onclick = async () => {
      err.textContent = '';
      const u = $('#u', card).value.trim(), p = $('#p', card).value;
      if (!u || !p) { err.textContent = 'Pick a username and password first!'; return; }
      try { const r = await API.register(u, p, u); API.setToken(r.token); await refresh(); showMap(); }
      catch (e) { err.textContent = '😿 ' + e.message; }
    };
  }

  // ── world map ─────────────────────────────────────────────────────────────
  function worldUnlocked(idx) {
    if (idx === 0) return true;
    const prev = state.curriculum.worlds[idx - 1];
    const ids = (prev.lessons || []).map((l) => l.id);
    if (!ids.length) return true;
    return ids.every((id) => state.progress.completed_lessons.includes(id));
  }

  function showMap() {
    updateHud();
    if (state.role !== 'student') return showDashboard();
    const worlds = state.curriculum.worlds;
    app.innerHTML = '';
    const wrap = el(`<div class="max-w-4xl mx-auto p-4 pt-20"></div>`);
    wrap.appendChild(el(`<h2 class="text-2xl font-extrabold mb-1">Choose your world, ${escapeHtml(state.display)}! 🗺️</h2>
      <p class="text-slate-500 mb-5">Finish a world to unlock the next one.</p>`));
    const grid = el(`<div class="grid sm:grid-cols-2 gap-4"></div>`);
    worlds.forEach((w, i) => {
      const unlocked = worldUnlocked(i);
      const done = (w.lessons || []).filter((l) => state.progress.completed_lessons.includes(l.id)).length;
      const total = (w.lessons || []).length;
      const node = el(`
        <button class="world-node ${unlocked ? '' : 'locked'} text-left rounded-3xl p-5 shadow-lg text-white relative overflow-hidden"
                style="background:linear-gradient(135deg, ${w.color}, ${shade(w.color,-25)})">
          <div class="text-4xl mb-1">${w.emoji}</div>
          <div class="text-xl font-extrabold">${escapeHtml(w.name)}</div>
          <div class="text-sm opacity-90 mb-2">${escapeHtml(w.blurb)}</div>
          <div class="text-xs bg-black/20 rounded-full inline-block px-2 py-0.5">${done}/${total} missions</div>
          ${unlocked ? '' : '<div class="absolute top-3 right-3 text-2xl">🔒</div>'}
        </button>`);
      if (unlocked) node.onclick = () => showWorld(w);
      else node.onclick = () => toast('Finish the previous world to unlock this! 🔒');
      grid.appendChild(node);
    });
    wrap.appendChild(grid);
    app.appendChild(wrap);
  }

  function showWorld(w) {
    app.innerHTML = '';
    const wrap = el(`<div class="max-w-2xl mx-auto p-4 pt-20"></div>`);
    wrap.appendChild(el(`<button class="text-sky-600 mb-3 font-bold">← Back to map</button>`));
    $('button', wrap).onclick = showMap;
    wrap.appendChild(el(`<div class="text-5xl">${w.emoji}</div><h2 class="text-2xl font-extrabold">${escapeHtml(w.name)}</h2>
      <p class="text-slate-500 mb-2">${escapeHtml(w.blurb)}</p>
      <div class="flex flex-wrap gap-1 mb-4">${(w.topics||[]).map(t=>`<span class="text-xs bg-white rounded-full px-2 py-1 shadow">${escapeHtml(t)}</span>`).join('')}</div>`));
    const list = el(`<div class="space-y-3"></div>`);
    (w.lessons || []).forEach((l, i) => {
      const done = state.progress.completed_lessons.includes(l.id);
      const prevDone = i === 0 || state.progress.completed_lessons.includes(w.lessons[i-1].id);
      const stars = state.progress.stars[l.id] || 0;
      const card = el(`
        <button class="w-full text-left bg-white rounded-2xl p-4 shadow flex items-center gap-3 ${prevDone?'':'opacity-60'}">
          <div class="step-pill ${done?'bg-emerald-400 text-white':'bg-slate-200'}">${l.boss?'🐉':(done?'✓':i+1)}</div>
          <div class="flex-1">
            <div class="font-bold">${escapeHtml(l.title)}</div>
            <div class="text-xs text-amber-500">${'⭐'.repeat(stars)}${'☆'.repeat(3-stars)} · ${l.xp} XP</div>
          </div>
          <div class="text-sky-500 font-extrabold">${done?'Replay':'Play ▶'}</div>
        </button>`);
      if (prevDone) card.onclick = () => showLesson(w, l);
      else card.onclick = () => toast('Finish the mission above first! ⬆️');
      list.appendChild(card);
    });
    wrap.appendChild(list);
    app.appendChild(wrap);
  }

  // ── lesson (the learning loop) ────────────────────────────────────────────
  function showLesson(w, l) {
    if (l.game) return showGameLesson(w, l);
    state.lessonStart = Date.now();
    let attempts = 0, quizDone = false, codeDone = !l.playground;
    app.innerHTML = '';
    const wrap = el(`<div class="max-w-2xl mx-auto p-4 pt-20 pb-24"></div>`);
    wrap.appendChild(el(`<button class="text-sky-600 mb-3 font-bold">← ${escapeHtml(w.name)}</button>`));
    $('button', wrap).onclick = () => showWorld(w);

    // 1) story  2) explain  3) example  4) playground  5) quiz  6) reward
    const storyText = (l.story || '').replace(/[*`]/g, '');
    const storyCard = el(`
      <div class="pop-in bg-white rounded-3xl p-5 shadow mb-4">
        <h2 class="text-xl font-extrabold mb-2 flex items-center gap-2">${l.boss?'🐉 ':'📖 '}${escapeHtml(l.title)}
          <button id="narrate" class="text-lg ml-auto">🔊</button></h2>
        <div class="bg-amber-50 border-l-4 border-amber-300 rounded-r-xl p-3 text-slate-700">${md(l.story)}</div>
        <div class="mt-3 space-y-1 text-slate-700">${(l.explain||[]).map(e=>`<div>• ${md(e)}</div>`).join('')}</div>
        ${l.example?`<div class="mt-3"><div class="text-xs font-bold text-slate-400 mb-1">EXAMPLE</div>
          <pre class="console"><code>${escapeHtml(l.example)}</code></pre></div>`:''}
      </div>`);
    wrap.appendChild(storyCard);
    $('#narrate', storyCard).onclick = () => SnakeGame.say(storyText);
    setTimeout(() => SnakeGame.say(storyText), 400);

    // playground
    if (l.playground) wrap.appendChild(buildPlayground(l, () => { codeDone = true; tryFinish(); }, (n)=>attempts=n));

    // quiz
    if (l.quiz && l.quiz.length) wrap.appendChild(buildQuiz(l, () => { quizDone = true; tryFinish(); }));
    else quizDone = true;

    const finishBar = el(`<div class="fixed bottom-0 inset-x-0 p-3 bg-white/90 backdrop-blur shadow-2xl">
      <button id="finish" class="btn btn-primary w-full max-w-2xl mx-auto block opacity-50" disabled>Complete mission 🎉</button></div>`);
    wrap.appendChild(finishBar);
    app.appendChild(wrap);

    function tryFinish() {
      const btn = $('#finish', finishBar);
      if (codeDone && quizDone) { btn.disabled = false; btn.classList.remove('opacity-50'); }
    }
    $('#finish', finishBar).onclick = async () => {
      const stars = attempts <= 1 ? 3 : attempts <= 3 ? 2 : 1;
      const secs = Math.round((Date.now() - state.lessonStart) / 1000);
      const before = state.progress.total_xp;
      state.progress = await API.complete(l.id, stars, secs);
      updateHud();
      celebrate(w, l, state.progress.total_xp - before, stars);
    };
  }

  // ── game lesson (Code Island: tap-to-code the snake) ───────────────────────
  function showGameLesson(w, l) {
    state.lessonStart = Date.now();
    app.innerHTML = '';
    const wrap = el(`<div class="max-w-5xl mx-auto p-3 pt-20 pb-6"></div>`);
    const back = el(`<button class="text-sky-600 mb-2 font-bold text-lg">← ${escapeHtml(w.name)}</button>`);
    back.onclick = () => showWorld(w);
    wrap.appendChild(back);
    wrap.appendChild(el(`<h2 class="text-2xl font-extrabold mb-2">${l.boss ? '🐉 ' : '🎮 '}${escapeHtml(l.title)}</h2>`));
    const host = el(`<div class="bg-white rounded-3xl p-3 sm:p-4 shadow"></div>`);
    wrap.appendChild(host);
    app.appendChild(wrap);

    let solved = false;
    SnakeGame.mount(host, JSON.parse(JSON.stringify(l.game)), {
      onWin: async () => {
        if (solved) return; solved = true;
        const secs = Math.round((Date.now() - state.lessonStart) / 1000);
        const before = state.progress.total_xp;
        state.progress = await API.complete(l.id, 3, secs);
        updateHud();
        celebrate(w, l, state.progress.total_xp - before, 3);
      },
    });
  }

  function buildPlayground(l, onSolved, setAttempts) {
    const pg = l.playground;
    const box = el(`
      <div class="bg-white rounded-3xl p-5 shadow mb-4">
        <div class="text-xs font-bold text-slate-400 mb-1">🎮 PLAYGROUND</div>
        <div class="font-semibold mb-2">${md(pg.prompt)}</div>
        <div class="editor rounded-xl overflow-hidden border-2 border-slate-200"></div>
        <div class="flex gap-2 mt-2">
          <button class="run btn btn-sky flex-1">▶ Run</button>
          <button class="hint btn bg-amber-200 text-amber-900 px-4">💡 Hint</button>
        </div>
        <div class="console mt-2 hidden"></div>
        <div class="status mt-2 font-bold text-sm"></div>
      </div>`);
    const cm = Playground.editor($('.editor', box), pg.starter || '');
    setTimeout(() => cm.refresh(), 50);
    let attempts = 0, lastError = null;
    const consoleEl = $('.console', box), status = $('.status', box);

    $('.run', box).onclick = async () => {
      status.textContent = '🐍 Warming up Python...';
      const code = cm.getValue();
      const res = await Playground.run(code);
      consoleEl.classList.remove('hidden');
      consoleEl.innerHTML = res.error
        ? `<span class="err">${escapeHtml(res.error)}</span>`
        : escapeHtml(res.stdout || '(no output)');
      lastError = res.error;
      const verdict = Playground.judge(res, pg);
      attempts++; setAttempts(attempts);
      if (verdict.pass) {
        status.innerHTML = '<span class="text-emerald-600">✅ Perfect! You solved it!</span>';
        onSolved();
      } else {
        status.innerHTML = '<span class="text-rose-500">Not quite — try again! Tap 💡 for a hint.</span>';
      }
    };
    $('.hint', box).onclick = async () => {
      status.textContent = '🐍 Py is thinking...';
      try {
        const h = await API.hint(l.id, cm.getValue(), lastError, attempts);
        status.innerHTML = `<span class="text-amber-700">${escapeHtml(h.text)}</span>`;
      } catch { status.textContent = '🐍 Keep trying — read the example above!'; }
    };
    return box;
  }

  function buildQuiz(l, onDone) {
    const box = el(`<div class="bg-white rounded-3xl p-5 shadow mb-4">
      <div class="text-xs font-bold text-slate-400 mb-1">🧠 QUIZ</div></div>`);
    let answered = 0;
    l.quiz.forEach((q, qi) => {
      const qEl = el(`<div class="mb-4"><div class="font-semibold mb-2">${qi+1}. ${escapeHtml(q.q)}</div>
        <div class="grid gap-2 opts"></div></div>`);
      const opts = $('.opts', qEl);
      q.options.forEach((opt, oi) => {
        const b = el(`<button class="btn bg-slate-100 text-left px-4 text-base font-semibold">${escapeHtml(opt)}</button>`);
        b.onclick = () => {
          if (qEl.dataset.done) return;
          if (oi === q.answer) {
            b.className = 'btn bg-emerald-200 text-emerald-900 text-left px-4 text-base font-bold';
            qEl.dataset.done = '1'; answered++;
            if (answered === l.quiz.length) onDone();
          } else {
            b.className = 'btn bg-rose-200 text-rose-900 text-left px-4 text-base font-semibold';
            if (q.hint) toast('💡 ' + q.hint);
          }
        };
        opts.appendChild(b);
      });
      box.appendChild(qEl);
    });
    return box;
  }

  // ── celebration / rewards ───────────────────────────────────────────────────
  function celebrate(w, l, gainedXp, stars) {
    confettiBurst();
    try { FX.fireworks(l.boss ? 7 : 4); } catch {}
    try { SnakeGame.say('Awesome! You earned a badge!'); } catch {}
    const r = l.reward || {};
    const learned = (l.game && l.game.concept) || (l.explain && l.explain[0]) || '';
    const lessons = w.lessons || [];
    const idx = lessons.findIndex((x) => x.id === l.id);
    const next = lessons[idx + 1];
    const modal = el(`<div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div class="pop-in bg-white rounded-3xl p-7 text-center max-w-sm w-full">
        <div class="text-7xl floaty">${r.emoji || '🎉'}</div>
        <h2 class="text-2xl font-extrabold mt-2">${l.boss ? 'Boss Defeated!' : 'You did it!'}</h2>
        <div class="text-amber-500 text-3xl my-1">${'⭐'.repeat(stars)}${'☆'.repeat(3-stars)}</div>
        <p class="text-slate-600 mb-1">+${gainedXp} XP${r.badge ? ` · 🏅 <b>${escapeHtml(r.badge)}</b>` : ''}</p>
        ${learned ? `<div class="bg-emerald-50 text-emerald-800 rounded-xl p-2 text-sm mt-2">🧠 You learned: ${md(learned)}</div>` : ''}
        <button id="next" class="btn btn-primary w-full mt-4 text-lg">${next ? 'Next mission ▶' : 'Back to map 🗺️'}</button>
      </div></div>`);
    $('#next', modal).onclick = () => { modal.remove(); next ? showLesson(w, next) : showMap(); };
    document.body.appendChild(modal);
  }

  function confettiBurst() {
    const c = document.getElementById('confetti');
    c.classList.remove('hidden'); c.innerHTML = '';
    const colors = ['#34d399','#60a5fa','#f59e0b','#ec4899','#a78bfa','#f43f5e'];
    for (let i = 0; i < 80; i++) {
      const bit = document.createElement('div');
      bit.className = 'confetti-bit';
      bit.style.left = Math.random() * 100 + 'vw';
      bit.style.background = colors[i % colors.length];
      bit.style.animationDelay = Math.random() * 0.5 + 's';
      c.appendChild(bit);
    }
    setTimeout(() => { c.classList.add('hidden'); c.innerHTML = ''; }, 2000);
  }

  function showBadges() {
    const b = state.progress?.badges || [];
    const modal = el(`<div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div class="pop-in bg-white rounded-3xl p-6 max-w-sm w-full text-center">
        <h2 class="text-xl font-extrabold mb-3">🏅 Your Badges</h2>
        <div class="grid grid-cols-3 gap-3">${b.length?b.map(x=>`<div class="bg-amber-50 rounded-2xl p-3"><div class="text-3xl">${x.emoji||'🏅'}</div><div class="text-xs font-bold mt-1">${escapeHtml(x.badge)}</div></div>`).join(''):'<p class="col-span-3 text-slate-400">No badges yet — go play! 🎮</p>'}</div>
        <button class="btn btn-sky w-full mt-4">Close</button>
      </div></div>`);
    $('button', modal).onclick = () => modal.remove();
    document.body.appendChild(modal);
  }

  // ── parent / teacher dashboard ──────────────────────────────────────────────
  async function showDashboard() {
    const child = (state.role === 'parent') ? 'kid@pythonquest.ai' : 'kid@pythonquest.ai';
    let data; try { data = await API.parent(child); } catch (e) { app.innerHTML = `<div class="p-20 text-center">${e.message}</div>`; return; }
    const sm = data.summary;
    app.innerHTML = '';
    const wrap = el(`<div class="max-w-2xl mx-auto p-4 pt-20">
      <h2 class="text-2xl font-extrabold mb-1">${state.role==='teacher'?'👩‍🏫 Teacher':'👨‍👩‍👧 Parent'} Dashboard</h2>
      <p class="text-slate-500 mb-4">Tracking: <b>${escapeHtml(child)}</b></p>
      <div class="grid grid-cols-3 gap-3 mb-4">
        <div class="bg-white rounded-2xl p-4 text-center shadow"><div class="text-2xl font-extrabold text-emerald-500">${sm.level}</div><div class="text-xs text-slate-500">Level</div></div>
        <div class="bg-white rounded-2xl p-4 text-center shadow"><div class="text-2xl font-extrabold text-amber-500">${sm.total_xp}</div><div class="text-xs text-slate-500">XP</div></div>
        <div class="bg-white rounded-2xl p-4 text-center shadow"><div class="text-2xl font-extrabold text-sky-500">${data.minutes_spent}</div><div class="text-xs text-slate-500">Minutes</div></div>
      </div>
      <div class="bg-white rounded-2xl p-4 shadow">
        <div class="font-bold mb-2">Skill map (missions completed per world)</div>
        ${Object.values(data.skill_map).map(s=>`
          <div class="mb-2"><div class="flex justify-between text-sm"><span>${escapeHtml(s.name)}</span><span>${s.done}/${s.total}</span></div>
          <div class="h-2 bg-slate-200 rounded-full overflow-hidden"><div class="h-full bg-emerald-400" style="width:${s.total?Math.round(s.done/s.total*100):0}%"></div></div></div>`).join('')}
      </div>
      <div class="bg-white rounded-2xl p-4 shadow mt-3"><div class="font-bold mb-1">Badges earned</div>
        <div>${sm.badges.length?sm.badges.map(x=>`${x.emoji||'🏅'} ${escapeHtml(x.badge)}`).join(' &nbsp; '):'<span class="text-slate-400">None yet</span>'}</div></div>
    </div>`);
    app.appendChild(wrap);
  }

  // ── utils ─────────────────────────────────────────────────────────────────
  function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function md(s) { return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`([^`]+)`/g, '<code class="bg-slate-100 px-1 rounded text-pink-600">$1</code>'); }
  function shade(hex, pct) { const n=parseInt(hex.slice(1),16); let r=(n>>16)+pct, g=((n>>8)&255)+pct, b=(n&255)+pct; r=Math.max(0,Math.min(255,r));g=Math.max(0,Math.min(255,g));b=Math.max(0,Math.min(255,b)); return '#'+((r<<16)|(g<<8)|b).toString(16).padStart(6,'0'); }
  function toast(msg) {
    const t = el(`<div class="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2 rounded-xl shadow-lg pop-in text-sm">${escapeHtml(msg)}</div>`);
    document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  }

  boot().catch((e) => { app.innerHTML = `<div class="p-20 text-center text-rose-500">Failed to start: ${e.message}</div>`; });
})();
