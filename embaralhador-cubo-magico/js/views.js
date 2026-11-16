// ============================================================================
// "Casca" do site: alterna entre as seções (Embaralhar / Timer), guarda o tipo
// de cubo escolhido e liga as duas seções por eventos no `document`:
//   cube:view           -> seção ativa mudou            (detail: 'scramble' | 'timer')
//   cube:size           -> tipo de cubo mudou           (detail: 2 | 3)
//   cube:new-scramble   -> botão "Novo embaralhamento"  (detail: seção ativa)
//   cube:load-scramble  -> abrir embaralhamento no passo a passo (detail: moves[])
//   cube:time-scramble  -> usar embaralhamento no timer           (detail: moves[])
// ============================================================================
(function () {
  const SIZE_KEY = 'cubescramble.size';
  const HASH_TO_VIEW = { embaralhar: 'scramble', timer: 'timer' };
  const TITLES = {
    scramble: 'CubeScramble 3D — Simulador de Embaralhamento',
    timer: 'Timer — CubeScramble 3D'
  };

  const shell = {
    view: 'scramble',
    size: 3,
    // embaralhamento pedido pelo timer antes de o 3D terminar de carregar
    pendingScramble: null,
    emit(name, detail) {
      document.dispatchEvent(new CustomEvent(name, { detail }));
    },
    go(view) {
      location.hash = view === 'timer' ? '#timer' : '#embaralhar';
    }
  };
  window.CubeShell = shell;

  try {
    const saved = parseInt(localStorage.getItem(SIZE_KEY), 10);
    if (saved === 2 || saved === 3) shell.size = saved;
  } catch (err) {
    /* sem armazenamento: usa 3×3 */
  }

  function applyView() {
    const view = HASH_TO_VIEW[location.hash.slice(1)] || 'scramble';
    shell.view = view;
    document.body.dataset.view = view;
    document.getElementById('view-scramble').hidden = view !== 'scramble';
    document.getElementById('view-timer').hidden = view !== 'timer';
    document.querySelectorAll('.view-tab').forEach((tab) => {
      if (tab.dataset.view === view) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    document.title = TITLES[view];
    shell.emit('cube:view', view);
  }

  const sizeButtons = document.querySelectorAll('.segmented-btn[data-size]');
  function renderSize() {
    sizeButtons.forEach((b) =>
      b.setAttribute('aria-pressed', String(parseInt(b.dataset.size, 10) === shell.size))
    );
  }

  sizeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const size = parseInt(btn.dataset.size, 10);
      if (size === shell.size) return;
      shell.size = size;
      renderSize();
      try {
        localStorage.setItem(SIZE_KEY, String(size));
      } catch (err) {
        /* ignora */
      }
      shell.emit('cube:size', size);
    });
  });

  document.getElementById('btn-new-scramble').addEventListener('click', () => {
    shell.emit('cube:new-scramble', shell.view);
  });

  window.addEventListener('hashchange', applyView);
  renderSize();
  applyView();
})();
