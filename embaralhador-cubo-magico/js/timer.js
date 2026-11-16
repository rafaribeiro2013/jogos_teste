// ============================================================================
// TIMER DE RESOLUÇÃO
// Segue o padrão dos timers de speedcubing (csTimer, CubeDesk, Twisty Timer):
//  - segure a barra de espaço (ou toque e segure a tela): vermelho = segurando,
//    verde = pronto; solte para começar. Isso evita largadas acidentais;
//  - qualquer tecla (ou toque) para o tempo;
//  - inspeção opcional de 15 s da WCA: +2 entre 15 e 17 s, DNF depois de 17 s;
//  - single, ao5, ao12, ao100 (sem o melhor e o pior, como na WCA), +2/DNF,
//    histórico com o embaralhamento de cada tempo e sessões por tipo de cubo.
// ============================================================================
(function () {
  const shell = window.CubeShell;
  const STORE_KEY = 'cubescramble.timer.v1';
  const HOLD_MS = 300;
  const INSPECTION_MS = 15000;
  const INSPECTION_LIMIT_MS = 17000;
  const isTouch = window.matchMedia('(pointer: coarse)').matches;

  const $ = (id) => document.getElementById(id);
  const stage = $('timer-stage');
  const display = $('timer-display');
  const hint = $('timer-hint');
  const recordEl = $('timer-record');
  const scrambleEl = $('timer-scramble-text');
  const lastActions = $('timer-last-actions');
  const btnPlus2 = $('btn-last-plus2');
  const btnDnf = $('btn-last-dnf');
  const inspectionBtn = $('opt-inspection');
  const statsBody = $('timer-stats-body');
  const summaryEl = $('timer-summary');
  const listEl = $('timer-solves');
  const emptyEl = $('timer-empty');
  const clearBtn = $('btn-clear-session');
  const sessionTitle = $('session-title');
  const liveEl = $('timer-live');
  const dialog = $('solve-dialog');
  const toast = $('toast');

  const HINTS = {
    idle: isTouch
      ? 'Toque e segure a tela, solte para começar. Toque de novo para parar.'
      : 'Segure a barra de espaço e solte para começar. Aperte qualquer tecla para parar.',
    idleInspection: isTouch
      ? 'Toque para começar os 15 segundos de inspeção.'
      : 'Aperte a barra de espaço para começar os 15 segundos de inspeção.',
    arming: 'Solte para começar a inspeção',
    inspecting: isTouch
      ? 'Inspecione o cubo. Toque e segure quando estiver pronto.'
      : 'Inspecione o cubo. Segure a barra de espaço quando estiver pronto.',
    holding: 'Continue segurando…',
    ready: 'Solte para começar',
    running: ''
  };

  // ==========================================================================
  // Armazenamento (localStorage). Sem ele, a sessão vale até fechar a página.
  // ==========================================================================
  const store = { version: 1, sessions: { 2: [], 3: [] }, settings: { inspection: false } };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && saved.sessions) {
      [2, 3].forEach((size) => {
        if (Array.isArray(saved.sessions[size])) store.sessions[size] = saved.sessions[size];
      });
      Object.assign(store.settings, saved.settings || {});
    }
  } catch (err) {
    /* dados ilegíveis ou armazenamento bloqueado: começa vazio */
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(store));
    } catch (err) {
      /* ignora */
    }
  }

  const solves = () => store.sessions[shell.size];

  // ==========================================================================
  // Tempos e estatísticas
  // ==========================================================================
  const effective = (s) => (s.dnf ? Infinity : s.time + (s.plus2 ? 2000 : 0));

  // Formato dos timers de cubo: 9.87, 12.34, 1:05.20 (centésimos truncados)
  function fmt(ms) {
    if (ms === Infinity) return 'DNF';
    if (ms == null || Number.isNaN(ms)) return '–';
    const cs = Math.floor(ms / 10);
    const min = Math.floor(cs / 6000);
    const sec = Math.floor((cs % 6000) / 100);
    const cent = String(cs % 100).padStart(2, '0');
    return min > 0 ? `${min}:${String(sec).padStart(2, '0')}.${cent}` : `${sec}.${cent}`;
  }

  const fmtSolve = (s) => (s.dnf ? 'DNF' : `${fmt(effective(s))}${s.plus2 ? '+' : ''}`);

  function spoken(s) {
    if (s.dnf) return 'DNF';
    return `${fmt(effective(s)).replace('.', ',')} segundos${s.plus2 ? ', com +2' : ''}`;
  }

  // Média no estilo WCA: descarta 5% dos melhores e dos piores (1 de cada em
  // ao5 e ao12). Se sobrar algum DNF, a média é DNF. Arredonda ao centésimo.
  function averageOf(list) {
    const n = list.length;
    const trim = Math.ceil(n * 0.05);
    const kept = list.map(effective).sort((a, b) => a - b).slice(trim, n - trim);
    if (kept.includes(Infinity)) return Infinity;
    return Math.round(kept.reduce((a, b) => a + b, 0) / kept.length / 10) * 10;
  }

  function rolling(list, n) {
    return list.map((_, i) => (i >= n - 1 ? averageOf(list.slice(i - n + 1, i + 1)) : null));
  }

  function bestOf(values) {
    const present = values.filter((v) => v != null);
    return present.length ? Math.min(...present) : null;
  }

  function computeStats(list) {
    const singles = list.map(effective);
    const ao5 = rolling(list, 5);
    const ao12 = rolling(list, 12);
    const ao100 = rolling(list, 100);
    const valid = singles.filter(Number.isFinite);
    return {
      rows: [
        { label: 'Single', current: singles.at(-1), best: bestOf(singles) },
        { label: 'ao5', current: ao5.at(-1), best: bestOf(ao5) },
        { label: 'ao12', current: ao12.at(-1), best: bestOf(ao12) },
        { label: 'ao100', current: ao100.at(-1), best: bestOf(ao100) }
      ],
      ao5,
      bestSingle: bestOf(singles),
      mean: valid.length
        ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length / 10) * 10
        : null,
      dnfs: singles.length - valid.length
    };
  }

  // ==========================================================================
  // Estado do timer
  // ==========================================================================
  let phase = 'idle'; // idle | inspecting | running
  let pressMode = null; // null | 'arm' (soltar inicia a inspeção) | 'hold'
  let ready = false;
  let holdTimer = null;
  let awaitRelease = false; // depois de parar com espaço/toque, espera soltar
  let inspectionStart = 0;
  let runStart = 0;
  let runPenalty = null;
  let rafId = null;
  let scramble = [];

  function setState(state) {
    stage.dataset.state = state;
    if (phase !== 'inspecting') stage.dataset.warn = '';
    hint.textContent =
      state === 'idle' && store.settings.inspection ? HINTS.idleInspection : HINTS[state] || '';
    // Modo foco: só o tempo na tela enquanto você resolve
    document.body.classList.toggle('is-timing', phase !== 'idle' || state === 'ready');
    lastActions.hidden = state !== 'idle' || !solves().length;
    if (state !== 'idle') recordEl.hidden = true;
  }

  function startLoop() {
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    cancelAnimationFrame(rafId);
    rafId = null;
  }

  function tick() {
    const now = performance.now();
    if (phase === 'running') {
      display.textContent = fmt(now - runStart);
    } else if (phase === 'inspecting') {
      const used = now - inspectionStart;
      if (used >= INSPECTION_LIMIT_MS) {
        clearTimeout(holdTimer);
        pressMode = null;
        ready = false;
        phase = 'idle';
        stopLoop();
        addSolve({ time: 0, dnf: true }, 'A inspeção passou de 17 segundos: DNF.');
        return;
      }
      display.textContent =
        used < INSPECTION_MS ? String(Math.ceil((INSPECTION_MS - used) / 1000)) : '+2';
      stage.dataset.warn = used >= 12000 ? '12' : used >= 8000 ? '8' : '';
    }
    rafId = requestAnimationFrame(tick);
  }

  function press() {
    if (awaitRelease || pressMode || phase === 'running') return;
    recordEl.hidden = true;
    if (phase === 'idle' && store.settings.inspection) {
      pressMode = 'arm';
      setState('arming');
      return;
    }
    pressMode = 'hold';
    ready = false;
    setState('holding');
    holdTimer = setTimeout(() => {
      ready = true;
      setState('ready');
      if (phase === 'idle') display.textContent = '0.00';
    }, HOLD_MS);
  }

  function release() {
    if (awaitRelease) {
      awaitRelease = false;
      return;
    }
    if (!pressMode) return;
    const mode = pressMode;
    pressMode = null;
    clearTimeout(holdTimer);
    if (mode === 'arm') {
      startInspection();
    } else if (ready) {
      ready = false;
      startRun();
    } else {
      cancelPress();
    }
  }

  // Soltou antes de ficar verde: volta ao que estava, sem começar
  function cancelPress() {
    clearTimeout(holdTimer);
    pressMode = null;
    ready = false;
    setState(phase === 'inspecting' ? 'inspecting' : 'idle');
    if (phase === 'idle') renderIdle();
  }

  // Interrompe tudo sem registrar tempo (Esc, troca de seção ou de cubo)
  function abort() {
    clearTimeout(holdTimer);
    pressMode = null;
    ready = false;
    if (phase === 'idle') return;
    phase = 'idle';
    stopLoop();
    setState('idle');
    renderIdle();
  }

  function startInspection() {
    phase = 'inspecting';
    inspectionStart = performance.now();
    setState('inspecting');
    startLoop();
  }

  function startRun() {
    runPenalty = null;
    if (phase === 'inspecting') {
      const used = performance.now() - inspectionStart;
      if (used > INSPECTION_LIMIT_MS) runPenalty = 'dnf';
      else if (used > INSPECTION_MS) runPenalty = 'plus2';
    }
    phase = 'running';
    runStart = performance.now();
    setState('running');
    startLoop();
  }

  function stop(byHoldInput) {
    const elapsed = performance.now() - runStart;
    phase = 'idle';
    stopLoop();
    awaitRelease = byHoldInput;
    addSolve({
      time: Math.floor(elapsed / 10) * 10,
      plus2: runPenalty === 'plus2',
      dnf: runPenalty === 'dnf'
    });
  }

  // ==========================================================================
  // Registro de tempos
  // ==========================================================================
  function recordsBroken(before, after) {
    const broken = [];
    before.rows.slice(0, 3).forEach((row, i) => {
      const now = after.rows[i].current;
      if (row.best != null && Number.isFinite(now) && now < row.best) broken.push(row.label);
    });
    return broken.length ? `Novo recorde pessoal de ${broken.join(' e ')}!` : '';
  }

  function addSolve(partial, note) {
    const list = solves();
    const before = computeStats(list);
    const solve = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      time: partial.time,
      plus2: !!partial.plus2,
      dnf: !!partial.dnf,
      scramble: scramble.join(' '),
      date: new Date().toISOString()
    };
    list.push(solve);
    save();

    const record = recordsBroken(before, computeStats(list));
    newScramble();
    setState('idle');
    renderAll();
    recordEl.textContent = record;
    recordEl.hidden = !record;
    liveEl.textContent = `Tempo: ${spoken(solve)}.${record ? ` ${record}` : ''}`;
    if (note) showToast(note);
  }

  function setPenalty(solve, penalty) {
    solve.plus2 = penalty === 'plus2';
    solve.dnf = penalty === 'dnf';
    save();
    renderAll();
  }

  function deleteSolve(index) {
    const size = shell.size;
    const [removed] = store.sessions[size].splice(index, 1);
    if (!removed) return;
    save();
    renderAll();
    showToast(`Tempo ${fmtSolve(removed)} excluído.`, () => {
      store.sessions[size].splice(index, 0, removed);
      save();
      renderAll();
    });
  }

  function newScramble() {
    scramble = window.CubeScramble.generate(shell.size);
    scrambleEl.textContent = scramble.join(' ');
  }

  // ==========================================================================
  // Renderização
  // ==========================================================================
  function renderIdle() {
    if (phase !== 'idle' || pressMode) return;
    const last = solves().at(-1);
    display.textContent = last ? fmtSolve(last) : '0.00';
    lastActions.hidden = !last;
    if (last) {
      btnPlus2.setAttribute('aria-pressed', String(last.plus2));
      btnDnf.setAttribute('aria-pressed', String(last.dnf));
    }
  }

  function renderAll() {
    const list = solves();
    const stats = computeStats(list);

    sessionTitle.textContent = `Sessão ${shell.size}×${shell.size}`;

    statsBody.innerHTML = stats.rows
      .map(
        (row) => `<tr>
          <th scope="row">${row.label}</th>
          <td>${row.current == null ? '–' : fmt(row.current)}</td>
          <td>${row.best == null ? '–' : fmt(row.best)}</td>
        </tr>`
      )
      .join('');

    if (!list.length) {
      summaryEl.textContent = '';
    } else {
      const count = `${list.length} ${list.length === 1 ? 'resolução' : 'resoluções'}`;
      const dnfs = stats.dnfs ? ` (${stats.dnfs} DNF)` : '';
      summaryEl.textContent = `${count}${dnfs}. Média geral: ${stats.mean == null ? '–' : fmt(stats.mean)}`;
    }

    // Lista: mais recente primeiro
    const rows = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      const isBest = !s.dnf && effective(s) === stats.bestSingle;
      const classes = ['solve-row', s.dnf ? 'is-dnf' : '', isBest ? 'is-best' : ''].join(' ');
      const label = `Resolução ${i + 1}: ${spoken(s)}${isBest ? ', melhor tempo' : ''}. Abrir detalhes`;
      rows.push(`<li><button type="button" class="${classes}" data-index="${i}" aria-label="${label}">
        <span class="solve-n">${i + 1}</span>
        <span class="solve-time">${fmtSolve(s)}</span>
        <span class="solve-ao5">${stats.ao5[i] == null ? '–' : fmt(stats.ao5[i])}</span>
      </button></li>`);
    }
    listEl.innerHTML = rows.join('');
    emptyEl.hidden = list.length > 0;
    clearBtn.disabled = !list.length;

    renderIdle();
  }

  // ==========================================================================
  // Detalhes de um tempo (diálogo)
  // ==========================================================================
  let dialogIndex = -1;

  function fillDialog() {
    const list = solves();
    const s = list[dialogIndex];
    if (!s) return;
    $('dlg-time').textContent = fmtSolve(s);
    const when = new Date(s.date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    $('dlg-meta').textContent = `Resolução ${dialogIndex + 1} de ${list.length}, em ${when}`;
    $('dlg-scramble').textContent = s.scramble || 'Sem embaralhamento registrado';
    $('dlg-stepbystep').disabled = !s.scramble;
    dialog.querySelectorAll('[data-pen]').forEach((b) => {
      const pen = b.dataset.pen;
      const on = pen === 'plus2' ? s.plus2 : pen === 'dnf' ? s.dnf : !s.plus2 && !s.dnf;
      b.setAttribute('aria-pressed', String(on));
    });
  }

  function openDialog(index) {
    dialogIndex = index;
    fillDialog();
    dialog.showModal();
  }

  dialog.querySelectorAll('[data-pen]').forEach((b) => {
    b.addEventListener('click', () => {
      const s = solves()[dialogIndex];
      if (!s) return;
      setPenalty(s, b.dataset.pen === 'none' ? null : b.dataset.pen);
      fillDialog();
    });
  });

  $('dlg-delete').addEventListener('click', () => {
    dialog.close();
    deleteSolve(dialogIndex);
  });

  $('dlg-stepbystep').addEventListener('click', () => {
    const s = solves()[dialogIndex];
    dialog.close();
    if (s && s.scramble) openStepByStep(s.scramble.split(' '));
  });

  // Clicar no fundo escuro fecha o diálogo
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  // ==========================================================================
  // Aviso com "Desfazer"
  // ==========================================================================
  let toastTimer = null;
  let toastUndo = null;

  function showToast(message, undo) {
    $('toast-msg').textContent = message;
    toastUndo = undo || null;
    $('toast-undo').hidden = !undo;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undo ? 6000 : 4000);
  }

  function hideToast() {
    toast.hidden = true;
    toastUndo = null;
  }

  $('toast-undo').addEventListener('click', () => {
    if (toastUndo) toastUndo();
    hideToast();
  });

  // ==========================================================================
  // Ligação com o embaralhador passo a passo
  // ==========================================================================
  function openStepByStep(moves) {
    shell.pendingScramble = moves;
    shell.emit('cube:load-scramble', moves);
    shell.go('scramble');
  }

  $('btn-timer-stepbystep').addEventListener('click', () => openStepByStep(scramble.slice()));

  document.addEventListener('cube:time-scramble', (e) => {
    scramble = e.detail.slice();
    scrambleEl.textContent = scramble.join(' ');
  });

  document.addEventListener('cube:size', () => {
    abort();
    newScramble();
    renderAll();
  });

  document.addEventListener('cube:new-scramble', (e) => {
    if (e.detail === 'timer' && phase === 'idle') newScramble();
  });

  document.addEventListener('cube:view', (e) => {
    if (e.detail !== 'timer') abort();
  });

  // ==========================================================================
  // Controles da página
  // ==========================================================================
  btnPlus2.addEventListener('click', () => {
    const last = solves().at(-1);
    if (last) setPenalty(last, last.plus2 ? null : 'plus2');
  });

  btnDnf.addEventListener('click', () => {
    const last = solves().at(-1);
    if (last) setPenalty(last, last.dnf ? null : 'dnf');
  });

  $('btn-last-delete').addEventListener('click', () => {
    if (solves().length) deleteSolve(solves().length - 1);
  });

  listEl.addEventListener('click', (e) => {
    const row = e.target.closest('.solve-row');
    if (row) openDialog(parseInt(row.dataset.index, 10));
  });

  clearBtn.addEventListener('click', () => {
    const size = shell.size;
    const backup = store.sessions[size];
    if (!backup.length) return;
    store.sessions[size] = [];
    save();
    renderAll();
    showToast(`Sessão ${size}×${size} limpa: ${backup.length} tempos removidos.`, () => {
      store.sessions[size] = backup;
      save();
      renderAll();
    });
  });

  inspectionBtn.addEventListener('click', () => {
    store.settings.inspection = !store.settings.inspection;
    inspectionBtn.setAttribute('aria-pressed', String(store.settings.inspection));
    save();
    setState('idle');
  });

  // ==========================================================================
  // Entrada: teclado e toque
  // ==========================================================================
  const timerActive = () => shell.view === 'timer' && !dialog.open;
  const isTyping = (t) =>
    t && ((t.tagName === 'INPUT' && t.type !== 'checkbox') || t.tagName === 'TEXTAREA' || t.isContentEditable);

  window.addEventListener('keydown', (e) => {
    if (!timerActive() || isTyping(e.target)) return;
    if (phase === 'running') {
      // Qualquer tecla para o tempo, como nos timers de competição
      e.preventDefault();
      stop(e.code === 'Space');
      return;
    }
    if (e.code === 'Escape') {
      abort();
      return;
    }
    if (e.code !== 'Space') return;
    e.preventDefault(); // não rola a página nem aciona o botão focado
    if (!e.repeat) press();
  });

  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space' || shell.view !== 'timer' || dialog.open) return;
    e.preventDefault();
    release();
  });

  // Toque/mouse: segurar na área do timer funciona como a barra de espaço
  stage.addEventListener('pointerdown', (e) => {
    if (!timerActive() || e.button !== 0 || phase === 'running') return;
    if (e.target.closest('button, a, input, label, .timer-scramble')) return;
    e.preventDefault();
    press();
  });

  document.addEventListener('pointerup', () => {
    if (shell.view === 'timer') release();
  });

  document.addEventListener('pointercancel', () => {
    if (shell.view === 'timer' && pressMode) cancelPress();
  });

  // Com o tempo correndo, um toque em qualquer lugar para
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (phase === 'running' && timerActive()) {
        e.preventDefault();
        e.stopPropagation();
        stop(true);
      }
    },
    true
  );

  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  // ==========================================================================
  // Início
  // ==========================================================================
  inspectionBtn.setAttribute('aria-pressed', String(store.settings.inspection));
  newScramble();
  setState('idle');
  renderAll();
})();
