// Code Island — visual "program the snake" game.
// Kids tap big blocks → real Python is assembled → runs in Pyodide → Py animates
// across the board to the apple. Voice narration + sounds. No typing required.
const SnakeGame = (() => {

  // ── sound effects (WebAudio, no asset files) ──────────────────────────────
  let actx = null;
  function beep(freq, dur = 0.12, type = 'sine', vol = 0.18) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(vol, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.start(); o.stop(actx.currentTime + dur);
    } catch {}
  }
  const Sfx = {
    tap:  () => beep(520, 0.07, 'triangle'),
    step: () => beep(440, 0.09, 'sine'),
    gem:  () => beep(880, 0.12, 'triangle', 0.22),
    win:  () => [0,1,2,3].forEach((i) => setTimeout(() => beep([523,659,784,1047][i], 0.16, 'triangle', 0.22), i * 130)),
    crash:() => beep(120, 0.3, 'sawtooth', 0.25),
  };

  // ── voice narration ──────────────────────────────────────────────────────
  function say(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95; u.pitch = 1.35; // friendly, high, slow-ish for kids
      speechSynthesis.speak(u);
    } catch {}
  }

  const DIRS = { N: [-1, 0], E: [0, 1], S: [1, 0], W: [0, -1] };
  const ROT = { E: 0, S: 90, W: 180, N: 270 };
  const LEFT = { N: 'W', W: 'S', S: 'E', E: 'N' };
  const RIGHT = { N: 'E', E: 'S', S: 'W', W: 'N' };
  const ICON = { move_forward: '⬆️ Move', turn_left: '↩️ Left', turn_right: '↪️ Right', eat: '😋 Eat' };

  // ── build real Python from the block model ────────────────────────────────
  function toPython(model, indent = 0) {
    const pad = '    '.repeat(indent);
    if (!model.length) return pad + 'pass';
    return model.map((s) => {
      if (s.t === 'cmd') return pad + s.code + '()';
      // loop
      const body = s.body.length ? toPython(s.body, indent + 1) : '    '.repeat(indent + 1) + 'pass';
      return pad + `for i in range(${s.n}):\n` + body;
    }).join('\n');
  }

  // ── Pyodide world preamble so loops/ifs run as REAL python ────────────────
  function preamble(cfg) {
    const walls = (cfg.walls || []).map((w) => `(${w[0]},${w[1]})`).join(',');
    const gems = (cfg.gems || []).map((g) => `(${g[0]},${g[1]})`).join(',');
    return `
_frames=[]
_w={'r':${cfg.start[0]},'c':${cfg.start[1]},'d':'${cfg.dir || 'E'}','rows':${cfg.rows},'cols':${cfg.cols},
    'walls':set([${walls}]),'gems':set([${gems}]),'goal':(${cfg.goal[0]},${cfg.goal[1]}),'got':0,'crash':False}
_D={'N':(-1,0),'E':(0,1),'S':(1,0),'W':(0,-1)}
_L={'N':'W','W':'S','S':'E','E':'N'}; _R={'N':'E','E':'S','S':'W','W':'N'}
def _snap(a): _frames.append({'r':_w['r'],'c':_w['c'],'d':_w['d'],'got':_w['got'],'a':a})
def move_forward():
    if _w['crash']: return
    dr,dc=_D[_w['d']]; nr,nc=_w['r']+dr,_w['c']+dc
    if nr<0 or nc<0 or nr>=_w['rows'] or nc>=_w['cols'] or (nr,nc) in _w['walls']:
        _w['crash']=True; _snap('crash'); return
    _w['r'],_w['c']=nr,nc
    if (nr,nc) in _w['gems']: _w['gems'].discard((nr,nc)); _w['got']+=1; _snap('gem'); return
    _snap('move')
def turn_left(): _w['d']=_L[_w['d']]; _snap('turn')
def turn_right(): _w['d']=_R[_w['d']]; _snap('turn')
def eat(): _snap('eat')
def wall_ahead():
    dr,dc=_D[_w['d']]; nr,nc=_w['r']+dr,_w['c']+dc
    return nr<0 or nc<0 or nr>=_w['rows'] or nc>=_w['cols'] or (nr,nc) in _w['walls']
_snap('start')
`;
  }

  // ── mount the whole game into `host` ──────────────────────────────────────
  function mount(host, cfg, { onWin }) {
    const total_gems = (cfg.gems || []).length;
    const model = [];
    let selectedLoop = null; // loop currently receiving blocks (null = top level)

    host.innerHTML = `
      <div class="game-wrap">
        <div class="board-col">
          <div id="say" class="py-bubble">${cfg.teach || 'Get Py to the apple! 🍎'}</div>
          <div id="board" class="board"></div>
        </div>
        <div class="code-col">
          <div class="text-xs font-bold text-slate-400 mb-1 flex items-center justify-between">
            <span>🧩 YOUR CODE</span><button id="speak" class="text-base">🔊</button></div>
          <div id="stack" class="stack"></div>
          <pre id="pycode" class="pycode"></pre>
          <div class="palette" id="palette"></div>
          <div class="flex gap-2 mt-2">
            <button id="run" class="btn btn-primary flex-1 text-lg">▶ RUN</button>
            <button id="reset" class="btn bg-slate-200 px-4">↺</button>
          </div>
          <div id="status" class="text-center font-bold mt-2 min-h-[24px]"></div>
        </div>
      </div>`;

    const boardEl = host.querySelector('#board');
    const stackEl = host.querySelector('#stack');
    const pyEl = host.querySelector('#pycode');
    const statusEl = host.querySelector('#status');
    const sayEl = host.querySelector('#say');

    // board
    let cell = 56;
    function drawBoard(r, c, dir, got) {
      const W = boardEl.clientWidth || 320;
      cell = Math.max(44, Math.min(78, Math.floor((W - 8) / cfg.cols)));
      boardEl.style.height = cfg.rows * cell + 'px';
      let cells = '';
      for (let i = 0; i < cfg.rows; i++) for (let j = 0; j < cfg.cols; j++) {
        const isWall = (cfg.walls || []).some((w) => w[0] === i && w[1] === j);
        cells += `<div class="cell ${isWall ? 'wall' : ''}" style="left:${j*cell}px;top:${i*cell}px;width:${cell}px;height:${cell}px"></div>`;
      }
      // gems still present
      (cfg.gems || []).forEach((g, idx) => {
        if (idx >= (total_gems - got)) return;
      });
      const gemEls = (cfg._gemsLeft || cfg.gems || []).map((g) =>
        `<div class="tok" style="left:${g[1]*cell}px;top:${g[0]*cell}px;width:${cell}px;height:${cell}px">💎</div>`).join('');
      const goal = `<div class="tok" style="left:${cfg.goal[1]*cell}px;top:${cfg.goal[0]*cell}px;width:${cell}px;height:${cell}px">🍎</div>`;
      boardEl.innerHTML = cells + gemEls + goal +
        `<div id="py" class="tok py" style="left:${c*cell}px;top:${r*cell}px;width:${cell}px;height:${cell}px;transform:rotate(${ROT[dir]}deg)">🐍</div>`;
    }
    cfg._gemsLeft = (cfg.gems || []).slice();
    drawBoard(cfg.start[0], cfg.start[1], cfg.dir || 'E', 0);

    // palette — each block supports BOTH tap-to-add and drag-and-drop (touch friendly)
    const pal = host.querySelector('#palette');
    (cfg.blocks || ['move_forward']).forEach((b) => {
      const isLoop = b === 'loop';
      const btn = el(`<button class="block ${isLoop ? 'block-loop' : ''}">${isLoop ? '🔁 Repeat' : (ICON[b] || b)}</button>`);
      makeDraggable(btn, b, isLoop);
      pal.appendChild(btn);
    });

    function addBlock(kind, isLoop, body) {
      if (isLoop) { const loop = { t: 'loop', n: 3, body: [] }; model.push(loop); selectedLoop = loop; }
      else { (body || (selectedLoop ? selectedLoop.body : model)).push({ t: 'cmd', code: kind }); }
      render();
    }

    function dropBodyAt(x, y) {
      const e0 = document.elementFromPoint(x, y);
      const lb = e0 && e0.closest && e0.closest('.loopbody');
      if (lb) { const box = lb.closest('.loopbox'); const i = +box.dataset.loopI; if (model[i] && model[i].t === 'loop') return model[i].body; }
      return null; // → top-level model
    }

    function makeDraggable(btn, kind, isLoop) {
      let down = false, moved = false, sx = 0, sy = 0, ghost = null;
      btn.style.touchAction = 'none';
      btn.addEventListener('pointerdown', (e) => { down = true; moved = false; sx = e.clientX; sy = e.clientY; try { btn.setPointerCapture(e.pointerId); } catch {} });
      btn.addEventListener('pointermove', (e) => {
        if (!down) return;
        if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) {
          moved = true;
          ghost = btn.cloneNode(true); ghost.className += ' drag-ghost'; document.body.appendChild(ghost);
        }
        if (moved && ghost) {
          ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
          host.querySelectorAll('.dragover').forEach((n) => n.classList.remove('dragover'));
          const e0 = document.elementFromPoint(e.clientX, e.clientY);
          const zone = e0 && e0.closest && (e0.closest('.loopbody') || (e0.closest('#stack')));
          if (zone) zone.classList.add('dragover');
        }
      });
      const finish = (e) => {
        if (!down) return; down = false;
        host.querySelectorAll('.dragover').forEach((n) => n.classList.remove('dragover'));
        if (moved) {
          const body = (e ? dropBodyAt(e.clientX, e.clientY) : null);
          if (isLoop) addBlock(kind, true);          // loops stay top-level
          else addBlock(kind, false, body || model);
          if (ghost) { ghost.remove(); ghost = null; }
          Sfx.step();
        } else { addBlock(kind, isLoop); Sfx.tap(); }  // simple tap
      };
      btn.addEventListener('pointerup', finish);
      btn.addEventListener('pointercancel', () => { down = false; if (ghost) { ghost.remove(); ghost = null; } host.querySelectorAll('.dragover').forEach((n) => n.classList.remove('dragover')); });
    }

    function render() {
      stackEl.innerHTML = '';
      const renderList = (list, container, loopRef) => {
        list.forEach((s, i) => {
          if (s.t === 'cmd') {
            const chip = el(`<div class="chip">${ICON[s.code] || s.code}<button class="x">✕</button></div>`);
            chip.querySelector('.x').onclick = () => { list.splice(i, 1); render(); };
            container.appendChild(chip);
          } else {
            const active = s === selectedLoop;
            const box = el(`<div class="loopbox ${active ? 'active' : ''}">
              <div class="loophead">🔁 Repeat <button class="minus">−</button><b>${s.n}</b><button class="plus">+</button> times
                <button class="x">✕</button></div>
              <div class="loopbody"></div></div>`);
            box.dataset.loopI = i;
            box.querySelector('.plus').onclick = (e) => { e.stopPropagation(); s.n = Math.min(9, s.n + 1); render(); };
            box.querySelector('.minus').onclick = (e) => { e.stopPropagation(); s.n = Math.max(1, s.n - 1); render(); };
            box.querySelector('.x').onclick = (e) => { e.stopPropagation(); model.splice(i, 1); if (selectedLoop === s) selectedLoop = null; render(); };
            box.querySelector('.loophead').onclick = () => { selectedLoop = (selectedLoop === s) ? null : s; render(); };
            renderList(s.body, box.querySelector('.loopbody'), s);
            if (!s.body.length) box.querySelector('.loopbody').innerHTML = '<span class="hint">tap a block to add it here</span>';
            container.appendChild(box);
          }
        });
      };
      if (!model.length) stackEl.innerHTML = '<span class="hint">👇 Tap a block — or drag it up here — to build your code!</span>';
      else renderList(model, stackEl, null);
      pyEl.textContent = toPython(model);
    }
    render();

    // run
    host.querySelector('#speak').onclick = () => say(cfg.say || cfg.teach || 'Get me to the apple!');
    host.querySelector('#reset').onclick = () => { model.length = 0; selectedLoop = null; cfg._gemsLeft = (cfg.gems || []).slice(); drawBoard(cfg.start[0], cfg.start[1], cfg.dir || 'E', 0); statusEl.textContent = ''; render(); };

    let running = false;
    host.querySelector('#run').onclick = async () => {
      if (running) return; running = true;
      statusEl.textContent = '🐍 Py is getting ready...';
      const py = await Playground.ensure();
      try {
        py.runPython(preamble(cfg) + '\n' + toPython(model));
        const frames = py.globals.get('_frames').toJs({ dict_converter: Object.fromEntries });
        await animate(frames);
      } catch (e) {
        statusEl.innerHTML = '<span class="text-rose-500">Oops! ' + String(e.message || e).split('\n').pop() + '</span>';
      }
      running = false;
    };

    function animate(frames) {
      return new Promise((resolve) => {
        cfg._gemsLeft = (cfg.gems || []).slice();
        let i = 0;
        const tick = () => {
          if (i >= frames.length) return finish(frames[frames.length - 1]);
          const f = frames[i];
          if (f.a === 'gem') { cfg._gemsLeft = cfg._gemsLeft.filter((g) => !(g[0] === f.r && g[1] === f.c)); Sfx.gem(); }
          else if (f.a === 'move') Sfx.step();
          else if (f.a === 'crash') Sfx.crash();
          drawBoard(f.r, f.c, f.d, f.got);
          const pyTok = boardEl.querySelector('#py');
          if (pyTok && (f.a === 'move' || f.a === 'gem')) { pyTok.classList.add('hop'); setTimeout(() => pyTok.classList.remove('hop'), 300); }
          if (f.a === 'crash') { boardEl.classList.add('shake'); setTimeout(() => boardEl.classList.remove('shake'), 400); }
          i++; setTimeout(tick, 340);
        };
        const finish = (last) => {
          const won = last && last.r === cfg.goal[0] && last.c === cfg.goal[1] && last.got >= total_gems && !frames.some(f => f.a === 'crash');
          if (won) {
            Sfx.win(); say('Yaaay! You did it!');
            statusEl.innerHTML = '<span class="text-emerald-600 text-lg">🎉 You did it!</span>';
            setTimeout(() => onWin && onWin(), 700);
          } else {
            const crashed = frames.some(f => f.a === 'crash');
            const msg = crashed ? 'Ouch! Py bumped a wall. Try a different path! 💪' : 'So close! Get Py ALL the way to the 🍎' + (total_gems ? ' and grab every 💎!' : '!');
            say(crashed ? 'Oops, I bumped! Try again!' : 'Almost! Try again!');
            statusEl.innerHTML = '<span class="text-amber-600">' + msg + '</span>';
          }
          resolve();
        };
        tick();
      });
    }

    // first-load narration
    setTimeout(() => say(cfg.say || cfg.teach || 'Get me to the apple!'), 400);
    window.addEventListener('resize', () => drawBoard(cfg.start[0], cfg.start[1], cfg.dir || 'E', 0), { once: true });

    function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }
  }

  return { mount, say, Sfx };
})();
