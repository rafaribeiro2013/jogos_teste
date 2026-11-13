/**
 * Atlas Quiz — Jogo de Adivinhar Países no Mapa-Múndi & Jogo de Adivinhar Bandeiras
 * Lógica principal, renderização SVG vetorial, painel de bandeiras, câmera interativa e sistema de jogo.
 */

(() => {
  'use strict';

  const FATOR_LAT = 1.22;
  const TEMPO_FOLGA_PREFIXO_MS = 850;
  const PLACEHOLDER_ENCERRADO = 'Partida encerrada — clique em Reiniciar para jogar de novo';
  const NS_SVG = 'http://www.w3.org/2000/svg';

  const ENQUADRAMENTOS_CONTINENTES = {
    'Mundo Inteiro': [-175.0, -56.0, 178.0, 78.0],
    'América do Sul': [-84.0, -56.0, -32.0, 14.0],
    'América do Norte e Central': [-168.0, 5.0, -52.0, 72.0],
    'Américas': [-168.0, -56.0, -32.0, 72.0],
    'Europa': [-25.0, 34.0, 48.0, 71.0],
    'África': [-26.0, -36.0, 54.0, 38.0],
    'Ásia': [25.0, -12.0, 150.0, 58.0],
    'Oceania': [110.0, -48.0, 180.0, 12.0],
  };

  const CONTINENTES_ORDEM = [
    'América do Sul',
    'América do Norte e Central',
    'Europa',
    'África',
    'Ásia',
    'Oceania',
  ];

  const MAPA_ISO2_CORRECAO = {
    FRA: 'fr',
    KOS: 'xk',
    NOR: 'no',
    TWN: 'tw',
  };

  // =========================================================================
  // FUNÇÕES DE NORMALIZAÇÃO DE TEXTO E UTILITÁRIOS DE BANDEIRA
  // =========================================================================
  function normalizarTexto(texto) {
    if (!texto) return '';
    return texto
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[-_.,'"/()]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .join(' ');
  }

  function normalizarSemPreposicoes(texto) {
    const norm = normalizarTexto(texto);
    if (!norm) return '';
    const ignorar = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'o', 'a', 'os', 'as']);
    const partes = norm.split(' ').filter((p) => !ignorar.has(p));
    return partes.length > 0 ? partes.join(' ') : norm;
  }

  function obterIso2Pais(codigo) {
    if (MAPA_ISO2_CORRECAO[codigo]) return MAPA_ISO2_CORRECAO[codigo];
    const dados = PAISES[codigo];
    if (dados && dados.iso2 && dados.iso2.length === 2 && /^[a-zA-Z]{2}$/.test(dados.iso2)) {
      return dados.iso2.toLowerCase();
    }
    return codigo.slice(0, 2).toLowerCase();
  }

  function obterUrlBandeira(codigo, altaRes = false) {
    const iso2 = obterIso2Pais(codigo);
    return `https://flagcdn.com/${altaRes ? 'w320' : 'w160'}/${iso2}.png`;
  }

  function gerarFallbackSvgBandeira(codigo) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="106" viewBox="0 0 160 106">
      <rect width="160" height="106" rx="6" fill="#1e293b" stroke="#475569" stroke-width="3"/>
      <text x="80" y="58" font-family="Segoe UI, sans-serif" font-size="22" font-weight="bold" fill="#94a3b8" text-anchor="middle">🏳️ ${codigo}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  function icone(nome) {
    return `<svg class="icon"><use href="#i-${nome}"/></svg>`;
  }

  function rotuloBotaoPausa(pausado) {
    return pausado
      ? `${icone('play')}<span>Continuar</span>`
      : `${icone('pause')}<span>Pausar</span>`;
  }

  function embaralharArray(lista) {
    const arr = [...lista];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // =========================================================================
  // ESTADO DA APLICAÇÃO
  // =========================================================================
  let PAISES = {};
  let TERRITORIOS_NEUTROS = [];

  const indiceNomes = new Map();
  const indiceSemPrep = new Map();

  let abaJogoAtual = 'mapa'; // 'mapa' | 'bandeiras'

  let modoAtual = 'Mundo Inteiro';
  let tempoTotalSeg = 900;
  let tempoRestanteSeg = 900;

  let jogoAtivo = false;
  let jogoPausado = false;
  let jogoEncerrado = false;

  let timerInterval = null;
  let ultimoTickMs = 0;
  let prefixoTimeout = null;

  let paisesEscopo = new Set();
  let paisesAcertados = new Set();
  let paisesPerdidos = new Set();
  let ordemAcertos = [];

  let paisSelecionado = null;
  let continenteFocado = null; // continente com zoom ativo pelos botões (aba Mapa)
  let filtroListaAtual = 'todos';

  // Estado específico da aba de Bandeiras
  let ordemBandeiras = [];
  let agruparBandeirasPorContinente = true;
  let filtroContinenteBandeira = 'Todos';
  let filtroStatusBandeiras = 'todas';
  let modoRespostaBandeira = 'destaque'; // 'destaque' | 'livre'
  const elementosCardsBandeiras = {}; // codigo -> cardEl

  // Estados independentes salvos por aba ('mapa' vs 'bandeiras')
  const estadosSalvosAbas = {
    mapa: null,
    bandeiras: null,
  };

  // Estado da câmera SVG
  let escala = 1.0;
  let offsetX = 0.0;
  let offsetY = 0.0;
  let animacaoCameraId = null;

  let arrastandoMapa = false;
  let moveuDuranteClique = false;
  let inicioArrastoX = 0;
  let inicioArrastoY = 0;

  // Referências de elementos SVG por código de país
  const elementosPoligonos = {}; // codigo -> [pathEl, ...]
  const elementosPinos = {}; // codigo -> circleEl
  const elementosRotulos = {}; // codigo -> textEl

  // =========================================================================
  // ELEMENTOS DO DOM
  // =========================================================================
  const el = {
    brandIcon: document.getElementById('brand-icon'),
    brandSubtitle: document.getElementById('brand-subtitle'),
    tabJogoMapa: document.getElementById('tab-jogo-mapa'),
    tabJogoBandeiras: document.getElementById('tab-jogo-bandeiras'),

    selectModo: document.getElementById('select-modo'),
    selectTempo: document.getElementById('select-tempo'),
    btnResetar: document.getElementById('btn-resetar'),
    btnPausar: document.getElementById('btn-pausar'),
    btnEncerrar: document.getElementById('btn-encerrar'),
    lblPlacar: document.getElementById('lbl-placar'),
    lblCronometro: document.getElementById('lbl-cronometro'),
    inputPais: document.getElementById('input-pais'),
    prefixGraceBar: document.getElementById('prefix-grace-bar'),
    lblFeedback: document.getElementById('lbl-feedback'),
    barraProgressoGeral: document.getElementById('barra-progresso-geral'),

    mapSection: document.getElementById('map-section'),
    mapViewport: document.getElementById('map-viewport'),
    worldSvg: document.getElementById('world-svg'),
    cameraGroup: document.getElementById('map-camera-group'),
    layerGrid: document.getElementById('layer-grid'),
    layerNeutral: document.getElementById('layer-neutral'),
    layerCountries: document.getElementById('layer-countries'),
    layerPins: document.getElementById('layer-pins'),
    layerLabels: document.getElementById('layer-labels'),
    mapTooltip: document.getElementById('map-tooltip'),
    pauseOverlay: document.getElementById('pause-overlay'),
    btnRetomarOverlay: document.getElementById('btn-retomar-overlay'),

    btnZoomIn: document.getElementById('btn-zoom-in'),
    btnZoomOut: document.getElementById('btn-zoom-out'),
    btnZoomReset: document.getElementById('btn-zoom-reset'),
    chkIlhas: document.getElementById('chk-ilhas'),
    chkNomes: document.getElementById('chk-nomes'),

    flagsSection: document.getElementById('flags-section'),
    btnEmbaralharBandeiras: document.getElementById('btn-embaralhar-bandeiras'),
    btnAgruparBandeiras: document.getElementById('btn-agrupar-bandeiras'),
    selectModoBandeira: document.getElementById('select-modo-bandeira'),
    selectFiltroBandeiras: document.getElementById('select-filtro-bandeiras'),
    flagSpotlightBar: document.getElementById('flag-spotlight-bar'),
    spotlightFlagImg: document.getElementById('spotlight-flag-img'),
    spotlightStatusBadge: document.getElementById('spotlight-status-badge'),
    spotlightCounter: document.getElementById('spotlight-counter'),
    spotlightTitle: document.getElementById('spotlight-title'),
    spotlightMeta: document.getElementById('spotlight-meta'),
    btnFlagPrev: document.getElementById('btn-flag-prev'),
    btnFlagNext: document.getElementById('btn-flag-next'),
    flagsViewport: document.getElementById('flags-viewport'),
    flagsGrid: document.getElementById('flags-grid'),
    flagsPauseOverlay: document.getElementById('flags-pause-overlay'),
    btnRetomarFlagsOverlay: document.getElementById('btn-retomar-flags-overlay'),

    continentsList: document.getElementById('continents-progress-list'),
    lblListaTitulo: document.getElementById('lbl-lista-titulo'),
    inputBuscaLista: document.getElementById('input-busca-lista'),
    ulListaPaises: document.getElementById('ul-lista-paises'),

    endgameModal: document.getElementById('endgame-modal'),
    modalIcon: document.getElementById('modal-icon'),
    modalTitle: document.getElementById('modal-title'),
    modalSubtitle: document.getElementById('modal-subtitle'),
    modalAcertos: document.getElementById('modal-acertos'),
    modalFaltaram: document.getElementById('modal-faltaram'),
    modalPrecisao: document.getElementById('modal-precisao'),
    modalTip: document.getElementById('modal-tip'),
    btnModalExplorar: document.getElementById('btn-modal-explorar'),
    btnModalJogarNovamente: document.getElementById('btn-modal-jogar-novamente'),
    modalRing: document.getElementById('modal-ring'),

    scoreRing: document.getElementById('score-ring'),
    scoreRingPct: document.getElementById('score-ring-pct'),
    timerBarFill: document.getElementById('timer-bar-fill'),
    mapStartHint: document.getElementById('map-start-hint'),

    btnAjuda: document.getElementById('btn-ajuda'),
    btnTema: document.getElementById('btn-tema'),
    helpModal: document.getElementById('help-modal'),
    btnFecharAjuda: document.getElementById('btn-fechar-ajuda'),
    btnComecarAjuda: document.getElementById('btn-comecar-ajuda'),

    confirmModal: document.getElementById('confirm-modal'),
    confirmText: document.getElementById('confirm-text'),
    btnConfirmCancelar: document.getElementById('btn-confirm-cancelar'),
    btnConfirmOk: document.getElementById('btn-confirm-ok'),
  };

  // =========================================================================
  // CARREGAMENTO DOS DADOS E INICIALIZAÇÃO
  // =========================================================================
  async function inicializarApp() {
    if (window.DADOS_MAPA && window.DADOS_MAPA.paises) {
      PAISES = window.DADOS_MAPA.paises;
      TERRITORIOS_NEUTROS = window.DADOS_MAPA.territoriosNeutros || [];
    } else {
      const resp = await fetch('data/paises.json');
      const json = await resp.json();
      PAISES = json.paises;
      TERRITORIOS_NEUTROS = json.territoriosNeutros || [];
    }

    construirIndicesNomes();
    construirMapaSvg();
    construirBarrasContinentes();
    vincularEventos();
    vincularEventosInterface();
    prepararPartida();
    abrirAjudaNaPrimeiraVisita();
  }

  function construirIndicesNomes() {
    indiceNomes.clear();
    indiceSemPrep.clear();

    for (const [codigo, dados] of Object.entries(PAISES)) {
      const candidatos = [dados.nome, ...(dados.aliases || [])];
      for (const nome of candidatos) {
        const n1 = normalizarTexto(nome);
        const n2 = normalizarSemPreposicoes(nome);
        if (n1) indiceNomes.set(n1, codigo);
        if (n2) indiceSemPrep.set(n2, codigo);
      }
    }
  }

  // =========================================================================
  // ALTERNÂNCIA DE ABAS: JOGO DO MAPA vs JOGO DE BANDEIRAS
  // =========================================================================
  function salvarEstadoAbaAtual() {
    estadosSalvosAbas[abaJogoAtual] = {
      modoAtual,
      tempoTotalSeg,
      tempoRestanteSeg,
      jogoAtivo,
      jogoPausado,
      jogoEncerrado,
      paisesEscopo: new Set(paisesEscopo),
      paisesAcertados: new Set(paisesAcertados),
      paisesPerdidos: new Set(paisesPerdidos),
      ordemAcertos: [...ordemAcertos],
      paisSelecionado,
      filtroListaAtual,
      ordemBandeiras: [...ordemBandeiras],
      feedbackHtml: el.lblFeedback.innerHTML,
      feedbackClass: el.lblFeedback.className,
    };
  }

  function restaurarEstadoAba(aba) {
    const salvo = estadosSalvosAbas[aba];
    if (!salvo) return false;

    modoAtual = salvo.modoAtual;
    tempoTotalSeg = salvo.tempoTotalSeg;
    tempoRestanteSeg = salvo.tempoRestanteSeg;
    jogoAtivo = salvo.jogoAtivo;
    jogoPausado = salvo.jogoPausado;
    jogoEncerrado = salvo.jogoEncerrado;
    paisesEscopo = new Set(salvo.paisesEscopo);
    paisesAcertados = new Set(salvo.paisesAcertados);
    paisesPerdidos = new Set(salvo.paisesPerdidos);
    ordemAcertos = [...salvo.ordemAcertos];
    paisSelecionado = salvo.paisSelecionado;
    filtroListaAtual = salvo.filtroListaAtual;
    ordemBandeiras = [...salvo.ordemBandeiras];

    el.selectModo.value = modoAtual;
    el.selectTempo.value = String(tempoTotalSeg);
    el.lblFeedback.className = salvo.feedbackClass;
    el.lblFeedback.innerHTML = salvo.feedbackHtml;
    return true;
  }

  function alternarAbaJogo(novaAba) {
    if (novaAba === abaJogoAtual) return;

    cancelarTimerPrefixo();

    if (jogoAtivo && !jogoEncerrado && !jogoPausado) {
      jogoPausado = true;
    }
    pararLoopCronometro();
    salvarEstadoAbaAtual();

    abaJogoAtual = novaAba;

    const ehBandeiras = abaJogoAtual === 'bandeiras';
    el.tabJogoMapa.classList.toggle('active', !ehBandeiras);
    el.tabJogoMapa.setAttribute('aria-selected', String(!ehBandeiras));
    el.tabJogoBandeiras.classList.toggle('active', ehBandeiras);
    el.tabJogoBandeiras.setAttribute('aria-selected', String(ehBandeiras));

    el.brandIcon.innerHTML = icone(ehBandeiras ? 'flag' : 'globe');
    el.brandSubtitle.textContent = ehBandeiras ? 'Bandeiras do mundo' : 'Mapa-Múndi';

    el.mapSection.classList.toggle('hidden', ehBandeiras);
    el.flagsSection.classList.toggle('hidden', !ehBandeiras);
    el.endgameModal.classList.add('hidden');
    el.confirmModal.classList.add('hidden');
    if (ehBandeiras) ajustarCamposSelecao();
    atualizarBotoesContinente();

    const salvo = estadosSalvosAbas[abaJogoAtual];
    if (salvo && (salvo.jogoAtivo || salvo.jogoEncerrado)) {
      restaurarEstadoAba(abaJogoAtual);
      sincronizarControlesAbaRestaurada();
    } else {
      prepararPartida();
    }
  }

  function sincronizarControlesAbaRestaurada() {
    const ehBandeiras = abaJogoAtual === 'bandeiras';

    if (jogoAtivo) {
      el.btnPausar.disabled = false;
      el.btnPausar.innerHTML = rotuloBotaoPausa(jogoPausado);
      el.btnEncerrar.disabled = false;
      el.inputPais.disabled = jogoPausado;
      el.inputPais.value = '';
      el.inputPais.placeholder = ehBandeiras
        ? 'De qual país é esta bandeira? (Tab para pular)'
        : 'Digite o nome de qualquer país…';
    } else if (jogoEncerrado) {
      el.btnPausar.disabled = true;
      el.btnPausar.innerHTML = rotuloBotaoPausa(false);
      el.btnEncerrar.disabled = true;
      el.inputPais.disabled = true;
      el.inputPais.value = '';
      el.inputPais.placeholder = PLACEHOLDER_ENCERRADO;
    } else {
      el.btnPausar.disabled = true;
      el.btnPausar.innerHTML = rotuloBotaoPausa(false);
      el.btnEncerrar.disabled = true;
      el.inputPais.disabled = false;
      el.inputPais.value = '';
      el.inputPais.placeholder = ehBandeiras
        ? 'De qual país é a bandeira em destaque?'
        : 'Digite o nome de um país para começar…';
    }

    el.pauseOverlay.classList.toggle('hidden', !(jogoPausado && !ehBandeiras));
    el.flagsPauseOverlay.classList.toggle('hidden', !(jogoPausado && ehBandeiras));

    if (ehBandeiras) {
      renderizarGradeBandeiras();
      atualizarSpotlightBandeira();
    } else {
      atualizarTodosEstilosMapa();
      atualizarVisibilidadePinos();
      atualizarVisibilidadeRotulos();
      enquadrarVisaoPadrao(false);
    }

    atualizarPlacarEProgresso();
    definirFiltroLista(filtroListaAtual);
    atualizarDisplayCronometro();
    atualizarDicaInicio();
    el.btnResetar.classList.toggle('is-highlight', jogoEncerrado);

    if (jogoAtivo && !jogoEncerrado) {
      ultimoTickMs = performance.now();
      timerInterval = setInterval(tickCronometro, 200);
    }
  }

  // =========================================================================
  // CONSTRUÇÃO DO MAPA VETORIAL SVG
  // =========================================================================
  function anelParaPathD(anel) {
    let d = '';
    for (let i = 0; i < anel.length; i++) {
      const x = anel[i][0];
      const y = -anel[i][1] * FATOR_LAT;
      d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2);
    }
    return d + 'Z';
  }

  function construirMapaSvg() {
    el.layerGrid.innerHTML = '';
    el.layerNeutral.innerHTML = '';
    el.layerCountries.innerHTML = '';
    el.layerPins.innerHTML = '';
    el.layerLabels.innerHTML = '';

    for (let lon = -180; lon <= 180; lon += 30) {
      const line = document.createElementNS(NS_SVG, 'line');
      line.setAttribute('x1', lon);
      line.setAttribute('y1', -83 * FATOR_LAT);
      line.setAttribute('x2', lon);
      line.setAttribute('y2', 58 * FATOR_LAT);
      line.setAttribute('class', 'grid-line');
      el.layerGrid.appendChild(line);
    }

    for (let lat = -45; lat <= 75; lat += 15) {
      const line = document.createElementNS(NS_SVG, 'line');
      const y = -lat * FATOR_LAT;
      line.setAttribute('x1', -180);
      line.setAttribute('y1', y);
      line.setAttribute('x2', 180);
      line.setAttribute('y2', y);
      line.setAttribute('class', lat === 0 ? 'grid-equator' : 'grid-line');
      el.layerGrid.appendChild(line);
    }

    for (const terr of TERRITORIOS_NEUTROS) {
      const d = terr.poligonos.map(anelParaPathD).join(' ');
      const path = document.createElementNS(NS_SVG, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'neutral-path');
      path.dataset.neutralName = terr.nome;
      el.layerNeutral.appendChild(path);
    }

    for (const [codigo, dados] of Object.entries(PAISES)) {
      const d = dados.poligonos.map(anelParaPathD).join(' ');
      const path = document.createElementNS(NS_SVG, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'country-path');
      path.dataset.code = codigo;
      el.layerCountries.appendChild(path);
      elementosPoligonos[codigo] = [path];

      if (dados.pequeno) {
        const [cx, cyLat] = dados.centro;
        const circle = document.createElementNS(NS_SVG, 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', -cyLat * FATOR_LAT);
        circle.setAttribute('r', 1.2);
        circle.setAttribute('class', 'island-pin');
        circle.dataset.code = codigo;
        el.layerPins.appendChild(circle);
        elementosPinos[codigo] = circle;
      }

      const [lx, lyLat] = dados.centro;
      const text = document.createElementNS(NS_SVG, 'text');
      text.setAttribute('x', lx);
      text.setAttribute('y', -lyLat * FATOR_LAT);
      text.setAttribute('class', 'map-country-label');
      text.textContent = dados.nome;
      el.layerLabels.appendChild(text);
      elementosRotulos[codigo] = text;
    }
  }

  // =========================================================================
  // CONSTRUÇÃO E ATUALIZAÇÃO DO PAINEL DE BANDEIRAS (197 PAÍSES)
  // =========================================================================
  function gerarOrdemBandeirasEscopo() {
    ordemBandeiras = embaralharArray([...paisesEscopo]);
  }

  function criarCardBandeiraDom(codigo) {
    const card = document.createElement('div');
    card.className = 'flag-card';
    card.dataset.code = codigo;

    const imgBox = document.createElement('div');
    imgBox.className = 'flag-img-box';

    const img = document.createElement('img');
    img.className = 'flag-card-img';
    img.src = obterUrlBandeira(codigo, false);
    img.alt = 'Bandeira';
    img.loading = 'lazy';
    img.onerror = () => {
      img.onerror = null;
      img.src = gerarFallbackSvgBandeira(codigo);
    };
    imgBox.appendChild(img);

    const nameEl = document.createElement('div');
    nameEl.className = 'flag-card-name';

    card.appendChild(imgBox);
    card.appendChild(nameEl);

    card.addEventListener('click', () => {
      selecionarPais(codigo, false);
    });

    elementosCardsBandeiras[codigo] = card;
    atualizarCardBandeiraIndividual(codigo, false);
    return card;
  }

  function atualizarCardBandeiraIndividual(codigo, pulsoRecemAcertado = false) {
    const card = elementosCardsBandeiras[codigo];
    if (!card) return;

    const dados = PAISES[codigo];
    const nameEl = card.querySelector('.flag-card-name');

    const acertado = paisesAcertados.has(codigo);
    const perdido = paisesPerdidos.has(codigo);
    const selecionado = codigo === paisSelecionado;

    card.classList.toggle('guessed', acertado);
    card.classList.toggle('missed', perdido);
    card.classList.toggle('selected', selecionado);
    if (pulsoRecemAcertado) {
      card.classList.add('just-guessed');
      setTimeout(() => card.classList.remove('just-guessed'), 550);
    }

    if (acertado || perdido) {
      nameEl.textContent = dados.nome;
    } else {
      nameEl.textContent = selecionado ? 'Selecionada' : '?';
    }
  }

  function bandeiraPassaNosFiltros(codigo) {
    if (!paisesEscopo.has(codigo)) return false;
    const dados = PAISES[codigo];
    if (
      filtroContinenteBandeira !== 'Todos' &&
      dados.continente !== filtroContinenteBandeira
    ) {
      return false;
    }

    if (filtroStatusBandeiras === 'faltantes') {
      return !paisesAcertados.has(codigo) && !paisesPerdidos.has(codigo);
    }
    if (filtroStatusBandeiras === 'acertadas') {
      return paisesAcertados.has(codigo);
    }
    if (filtroStatusBandeiras === 'perdidas') {
      return paisesPerdidos.has(codigo);
    }
    return true;
  }

  function renderizarGradeBandeiras() {
    el.flagsGrid.innerHTML = '';
    for (const k of Object.keys(elementosCardsBandeiras)) {
      delete elementosCardsBandeiras[k];
    }

    const codigosVisiveis = ordemBandeiras.filter(bandeiraPassaNosFiltros);

    if (!codigosVisiveis.length) {
      el.flagsGrid.classList.remove('flat-grid');
      const msg = document.createElement('div');
      msg.className = 'empty-list-msg';
      msg.textContent = 'Nenhuma bandeira encontrada para este filtro.';
      el.flagsGrid.appendChild(msg);
      return;
    }

    if (agruparBandeirasPorContinente) {
      el.flagsGrid.classList.remove('flat-grid');
      for (const cont of CONTINENTES_ORDEM) {
        const doContinente = codigosVisiveis.filter(
          (cod) => PAISES[cod].continente === cont
        );
        if (!doContinente.length) continue;

        let totalEscopoCont = 0;
        let acertosEscopoCont = 0;
        for (const cod of paisesEscopo) {
          if (PAISES[cod].continente === cont) {
            totalEscopoCont++;
            if (paisesAcertados.has(cod)) acertosEscopoCont++;
          }
        }

        const section = document.createElement('div');
        section.className = 'flag-continent-section';

        const header = document.createElement('div');
        header.className = 'flag-continent-header';
        header.innerHTML = `
          <span>${cont}</span>
          <small id="flag-hdr-cnt-${cont}">${acertosEscopoCont} / ${totalEscopoCont}</small>
        `;

        const cardsGrid = document.createElement('div');
        cardsGrid.className = 'flag-continent-cards';
        for (const cod of doContinente) {
          cardsGrid.appendChild(criarCardBandeiraDom(cod));
        }

        section.appendChild(header);
        section.appendChild(cardsGrid);
        el.flagsGrid.appendChild(section);
      }
    } else {
      el.flagsGrid.classList.add('flat-grid');
      for (const cod of codigosVisiveis) {
        el.flagsGrid.appendChild(criarCardBandeiraDom(cod));
      }
    }
  }

  function atualizarCabecalhosContinentesBandeiras() {
    for (const cont of CONTINENTES_ORDEM) {
      const hdr = document.getElementById(`flag-hdr-cnt-${cont}`);
      if (!hdr) continue;
      let tot = 0;
      let ac = 0;
      for (const cod of paisesEscopo) {
        if (PAISES[cod].continente === cont) {
          tot++;
          if (paisesAcertados.has(cod)) ac++;
        }
      }
      hdr.textContent = `${ac} / ${tot}`;
    }
  }

  function atualizarSpotlightBandeira() {
    const wrap = el.spotlightFlagImg.parentElement;
    wrap.classList.remove('guessed', 'missed');
    el.spotlightStatusBadge.classList.remove('guessed', 'missed');

    if (!paisSelecionado || !PAISES[paisSelecionado]) {
      const primeiro = ordemBandeiras[0];
      if (primeiro) {
        el.spotlightFlagImg.src = obterUrlBandeira(primeiro, true);
      }
      el.spotlightStatusBadge.textContent = 'Bandeiras';
      el.spotlightCounter.textContent = `${paisesAcertados.size} / ${paisesEscopo.size}`;
      el.spotlightTitle.textContent = 'Selecione uma bandeira e comece a digitar';
      el.spotlightMeta.textContent =
        'O tempo começará assim que você digitar o primeiro país.';
      return;
    }

    const dados = PAISES[paisSelecionado];
    el.spotlightFlagImg.src = obterUrlBandeira(paisSelecionado, true);
    el.spotlightFlagImg.onerror = () => {
      el.spotlightFlagImg.onerror = null;
      el.spotlightFlagImg.src = gerarFallbackSvgBandeira(paisSelecionado);
    };

    const idxNaOrdem = ordemBandeiras.indexOf(paisSelecionado) + 1;
    const faltam = Math.max(0, paisesEscopo.size - paisesAcertados.size);
    el.spotlightCounter.textContent = `#${idxNaOrdem || 1} de ${paisesEscopo.size} · faltam ${faltam}`;

    if (paisesAcertados.has(paisSelecionado)) {
      wrap.classList.add('guessed');
      el.spotlightStatusBadge.classList.add('guessed');
      el.spotlightStatusBadge.textContent = 'Acertada';
      el.spotlightTitle.textContent = dados.nome;
      el.spotlightMeta.textContent = `${dados.continente} · Capital: ${dados.capital}`;
    } else if (paisesPerdidos.has(paisSelecionado)) {
      wrap.classList.add('missed');
      el.spotlightStatusBadge.classList.add('missed');
      el.spotlightStatusBadge.textContent = 'Não adivinhada';
      el.spotlightTitle.textContent = dados.nome;
      el.spotlightMeta.textContent = `${dados.continente} · Capital: ${dados.capital}`;
    } else {
      el.spotlightStatusBadge.textContent = 'Sua vez';
      el.spotlightTitle.textContent = 'Qual é o país desta bandeira?';
      el.spotlightMeta.textContent = jogoAtivo
        ? `Dica: fica em ${dados.continente}. Não sabe? Aperte Tab para pular.`
        : `Dica: fica em ${dados.continente}. Digite o nome do país para começar.`;
    }
  }

  function rolarParaCardBandeira(codigo) {
    const card = elementosCardsBandeiras[codigo];
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function selecionarProximaBandeiraFaltante(passo = 1, aPartirDeCodigo = paisSelecionado) {
    const listaBase = ordemBandeiras.filter(
      (cod) => paisesEscopo.has(cod) && !paisesAcertados.has(cod) && !paisesPerdidos.has(cod)
    );
    if (!listaBase.length) return;

    const idxAtual = ordemBandeiras.indexOf(aPartirDeCodigo);
    if (idxAtual === -1) {
      selecionarPais(listaBase[0], true);
      return;
    }

    const n = ordemBandeiras.length;
    for (let i = 1; i <= n; i++) {
      const idxCandidato = (idxAtual + i * passo + n * 10) % n;
      const cod = ordemBandeiras[idxCandidato];
      if (!paisesAcertados.has(cod) && !paisesPerdidos.has(cod) && bandeiraPassaNosFiltros(cod)) {
        selecionarPais(cod, true);
        return;
      }
    }

    selecionarPais(listaBase[0], true);
  }

  // =========================================================================
  // CONTROLE DE CÂMERA DO MAPA (ZOOM, PAN E ENQUADRAMENTO ANIMADO)
  // =========================================================================
  function atualizarTransformacaoCamera() {
    el.cameraGroup.setAttribute(
      'transform',
      `translate(${offsetX.toFixed(2)}, ${offsetY.toFixed(2)}) scale(${escala.toFixed(4)})`
    );

    const raioMundo = Math.max(0.14, Math.min(1.4, 5.2 / escala));
    for (const circle of Object.values(elementosPinos)) {
      circle.setAttribute('r', raioMundo.toFixed(3));
    }

    const fontMundo = Math.max(0.22, Math.min(2.6, 10.5 / escala));
    const strokeMundo = (fontMundo * 0.22).toFixed(3);
    for (const txt of Object.values(elementosRotulos)) {
      txt.style.fontSize = `${fontMundo.toFixed(3)}px`;
      txt.style.strokeWidth = `${strokeMundo}px`;
    }
  }

  function calcularTransformacaoEnquadramento(lonMin, latMin, lonMax, latMax) {
    const rect = el.mapViewport.getBoundingClientRect();
    const largura = Math.max(200, rect.width);
    const altura = Math.max(160, rect.height);

    const wx1 = lonMin;
    const wx2 = lonMax;
    const wy1 = -latMax * FATOR_LAT;
    const wy2 = -latMin * FATOR_LAT;

    const spanX = Math.max(3.5, wx2 - wx1);
    const spanY = Math.max(3.5, wy2 - wy1);

    let novaEscala = Math.min((largura * 0.91) / spanX, (altura * 0.88) / spanY);
    novaEscala = Math.max(0.8, Math.min(110.0, novaEscala));

    const centroWx = (wx1 + wx2) / 2.0;
    const centroWy = (wy1 + wy2) / 2.0;

    const novoOffsetX = largura / 2.0 - centroWx * novaEscala;
    const novoOffsetY = altura / 2.0 - centroWy * novaEscala;

    return { novaEscala, novoOffsetX, novoOffsetY };
  }

  function animarCameraPara(novaEscala, novoOffsetX, novoOffsetY, duracaoMs = 340) {
    if (animacaoCameraId) {
      cancelAnimationFrame(animacaoCameraId);
      animacaoCameraId = null;
    }

    if (duracaoMs <= 0) {
      escala = novaEscala;
      offsetX = novoOffsetX;
      offsetY = novoOffsetY;
      atualizarTransformacaoCamera();
      return;
    }

    const escInicial = escala;
    const oxInicial = offsetX;
    const oyInicial = offsetY;
    const inicio = performance.now();

    function passo(agora) {
      const t = Math.min(1.0, (agora - inicio) / duracaoMs);
      const ease = 1 - Math.pow(1 - t, 3);

      escala = escInicial + (novaEscala - escInicial) * ease;
      offsetX = oxInicial + (novoOffsetX - oxInicial) * ease;
      offsetY = oyInicial + (novoOffsetY - oyInicial) * ease;
      atualizarTransformacaoCamera();

      if (t < 1.0) {
        animacaoCameraId = requestAnimationFrame(passo);
      } else {
        animacaoCameraId = null;
      }
    }

    animacaoCameraId = requestAnimationFrame(passo);
  }

  function enquadrarContinente(nomeContinente, animar = true) {
    if (abaJogoAtual === 'bandeiras') {
      definirFiltroContinenteBandeiras(
        nomeContinente === 'Mundo Inteiro' || nomeContinente === 'Américas'
          ? 'Todos'
          : nomeContinente
      );
      return;
    }
    const caixa =
      ENQUADRAMENTOS_CONTINENTES[nomeContinente] ||
      ENQUADRAMENTOS_CONTINENTES['Mundo Inteiro'];
    const { novaEscala, novoOffsetX, novoOffsetY } = calcularTransformacaoEnquadramento(...caixa);
    animarCameraPara(novaEscala, novoOffsetX, novoOffsetY, animar ? 360 : 0);
  }

  // Visão padrão = enquadramento da região escolhida (ex.: mundo inteiro)
  function enquadrarVisaoPadrao(animar = true) {
    continenteFocado = null;
    atualizarBotoesContinente();
    enquadrarContinente(modoAtual, animar);
  }

  // Botões de continente funcionam como liga/desliga
  function alternarFocoContinente(cont) {
    if (abaJogoAtual === 'bandeiras') {
      definirFiltroContinenteBandeiras(filtroContinenteBandeira === cont ? 'Todos' : cont);
      return;
    }
    if (continenteFocado === cont) {
      enquadrarVisaoPadrao(true);
      return;
    }
    continenteFocado = cont;
    atualizarBotoesContinente();
    enquadrarContinente(cont, true);
  }

  function atualizarBotoesContinente() {
    document.querySelectorAll('.pill-btn').forEach((btn) => {
      const ativo = btn.dataset.continent === continenteFocado;
      btn.classList.toggle('active', ativo);
      btn.setAttribute('aria-pressed', String(ativo));
    });
    document.querySelectorAll('.continent-row').forEach((row) => {
      row.classList.toggle('active', abaJogoAtual === 'mapa' && row.dataset.continent === continenteFocado);
    });
  }

  function focarNoPais(codigo) {
    if (abaJogoAtual === 'bandeiras') {
      rolarParaCardBandeira(codigo);
      return;
    }

    const dados = PAISES[codigo];
    if (!dados) return;

    let minLon = Infinity,
      maxLon = -Infinity,
      minLat = Infinity,
      maxLat = -Infinity;

    for (const anel of dados.poligonos) {
      for (const [lon, lat] of anel) {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }

    const [cx, cy] = dados.centro;
    let caixa;
    if (!isFinite(minLon) || maxLon - minLon > 80) {
      const m = dados.pequeno ? 4.5 : 14.0;
      caixa = [cx - m, cy - m, cx + m, cy + m];
    } else {
      const pad = Math.max(3.2, (maxLon - minLon) * 0.85, (maxLat - minLat) * 0.85);
      caixa = [minLon - pad, minLat - pad, maxLon + pad, maxLat + pad];
    }

    const { novaEscala, novoOffsetX, novoOffsetY } = calcularTransformacaoEnquadramento(...caixa);
    animarCameraPara(novaEscala, novoOffsetX, novoOffsetY, 380);
  }

  function aplicarZoomPonto(sx, sy, fator) {
    const novaEscala = Math.max(0.8, Math.min(130.0, escala * fator));
    const fatorReal = novaEscala / escala;
    offsetX = sx + (offsetX - sx) * fatorReal;
    offsetY = sy + (offsetY - sy) * fatorReal;
    escala = novaEscala;
    atualizarTransformacaoCamera();
  }

  function aplicarZoomCentro(fator) {
    const rect = el.mapViewport.getBoundingClientRect();
    aplicarZoomPonto(rect.width / 2, rect.height / 2, fator);
  }

  // =========================================================================
  // PREPARAÇÃO E CONTROLE DE PARTIDA
  // =========================================================================
  function obterEscopoModo(modo) {
    const escopo = new Set();
    for (const [codigo, dados] of Object.entries(PAISES)) {
      if (modo === 'Mundo Inteiro') {
        escopo.add(codigo);
      } else if (modo === 'Américas') {
        if (
          dados.continente === 'América do Sul' ||
          dados.continente === 'América do Norte e Central'
        ) {
          escopo.add(codigo);
        }
      } else if (dados.continente === modo) {
        escopo.add(codigo);
      }
    }
    return escopo;
  }

  function prepararPartida() {
    cancelarTimerPrefixo();
    pararLoopCronometro();

    modoAtual = el.selectModo.value;
    tempoTotalSeg = parseInt(el.selectTempo.value, 10) || 0;
    tempoRestanteSeg = tempoTotalSeg;

    paisesEscopo = obterEscopoModo(modoAtual);
    paisesAcertados.clear();
    paisesPerdidos.clear();
    ordemAcertos = [];

    gerarOrdemBandeirasEscopo();
    filtroContinenteBandeira = 'Todos';
    filtroStatusBandeiras = 'todas';
    el.selectFiltroBandeiras.value = 'todas';
    document.querySelectorAll('.flag-pill-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.flagContinent === 'Todos');
    });

    const ehBandeiras = abaJogoAtual === 'bandeiras';
    paisSelecionado = ehBandeiras ? ordemBandeiras[0] || null : null;

    jogoAtivo = false;
    jogoPausado = false;
    jogoEncerrado = false;

    el.pauseOverlay.classList.add('hidden');
    el.flagsPauseOverlay.classList.add('hidden');
    el.endgameModal.classList.add('hidden');

    el.btnPausar.disabled = true;
    el.btnPausar.innerHTML = rotuloBotaoPausa(false);
    el.btnEncerrar.disabled = true;

    el.inputPais.value = '';
    el.inputPais.disabled = false;
    el.btnResetar.classList.remove('is-highlight');
    el.inputPais.placeholder = ehBandeiras
      ? 'De qual país é a bandeira em destaque?'
      : 'Digite o nome de um país para começar…';

    if (ehBandeiras) {
      definirFeedback(
        `<strong>${modoAtual}</strong> · ${paisesEscopo.size} bandeiras. O cronômetro começa quando você digitar.`,
        'info'
      );
      renderizarGradeBandeiras();
      atualizarSpotlightBandeira();
    } else {
      definirFeedback(
        `<strong>${modoAtual}</strong> · ${paisesEscopo.size} países. O cronômetro começa quando você digitar.`,
        'info'
      );
      atualizarTodosEstilosMapa();
      atualizarVisibilidadePinos();
      atualizarVisibilidadeRotulos();
      enquadrarVisaoPadrao(false);
    }

    atualizarPlacarEProgresso();
    definirFiltroLista('todos');
    atualizarDisplayCronometro();
    atualizarDicaInicio();
    el.inputPais.focus();
    salvarEstadoAbaAtual();
  }

  function atualizarDicaInicio() {
    const mostrar = abaJogoAtual === 'mapa' && !jogoAtivo && !jogoEncerrado;
    el.mapStartHint.classList.toggle('hidden', !mostrar);
  }

  function iniciarPartidaAoDigitar() {
    if (jogoAtivo || jogoEncerrado) return;

    jogoAtivo = true;
    jogoPausado = false;
    jogoEncerrado = false;

    el.btnPausar.disabled = false;
    el.btnEncerrar.disabled = false;

    const ehBandeiras = abaJogoAtual === 'bandeiras';
    if (ehBandeiras && (!paisSelecionado || !paisesEscopo.has(paisSelecionado))) {
      paisSelecionado = ordemBandeiras[0] || null;
      if (paisSelecionado) atualizarCardBandeiraIndividual(paisSelecionado);
    }

    el.inputPais.placeholder = ehBandeiras
      ? 'De qual país é esta bandeira? (Tab para pular)'
      : 'Digite o nome de qualquer país…';

    definirFeedback(
      `Valendo! Cronômetro iniciado em <strong>${modoAtual}</strong>.`,
      'info'
    );
    atualizarDicaInicio();
    if (ehBandeiras) atualizarSpotlightBandeira();

    ultimoTickMs = performance.now();
    timerInterval = setInterval(tickCronometro, 200);
    salvarEstadoAbaAtual();
  }

  function pararLoopCronometro() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function tickCronometro() {
    if (!jogoAtivo || jogoEncerrado) return;

    const agora = performance.now();
    const deltaSeg = (agora - ultimoTickMs) / 1000.0;
    ultimoTickMs = agora;

    if (!jogoPausado && tempoTotalSeg > 0) {
      tempoRestanteSeg = Math.max(0.0, tempoRestanteSeg - deltaSeg);
      atualizarDisplayCronometro();

      if (tempoRestanteSeg <= 0.0) {
        finalizarPorTempoEsgotado(false);
      }
    }
  }

  function atualizarDisplayCronometro() {
    el.lblCronometro.classList.remove('warning', 'danger');
    el.timerBarFill.classList.remove('warning', 'danger');
    if (tempoTotalSeg === 0) {
      el.lblCronometro.textContent = '∞';
      el.timerBarFill.style.width = '100%';
      return;
    }

    const seg = Math.ceil(tempoRestanteSeg);
    const min = Math.floor(seg / 60);
    const remSeg = seg % 60;
    el.lblCronometro.textContent = `${String(min).padStart(2, '0')}:${String(remSeg).padStart(2, '0')}`;
    el.timerBarFill.style.width = `${Math.max(0, (tempoRestanteSeg / tempoTotalSeg) * 100)}%`;

    if (seg <= 30) {
      el.lblCronometro.classList.add('danger');
      el.timerBarFill.classList.add('danger');
    } else if (seg <= 120) {
      el.lblCronometro.classList.add('warning');
      el.timerBarFill.classList.add('warning');
    }
  }

  function alternarPausa() {
    if (!jogoAtivo || jogoEncerrado) return;
    jogoPausado = !jogoPausado;
    ultimoTickMs = performance.now();

    const ehBandeiras = abaJogoAtual === 'bandeiras';
    if (jogoPausado) {
      el.btnPausar.innerHTML = rotuloBotaoPausa(true);
      el.inputPais.disabled = true;
      if (ehBandeiras) {
        el.flagsPauseOverlay.classList.remove('hidden');
      } else {
        el.pauseOverlay.classList.remove('hidden');
      }
    } else {
      el.btnPausar.innerHTML = rotuloBotaoPausa(false);
      el.inputPais.disabled = false;
      el.pauseOverlay.classList.add('hidden');
      el.flagsPauseOverlay.classList.add('hidden');
      el.inputPais.focus();
    }
    salvarEstadoAbaAtual();
  }

  // =========================================================================
  // DIGITAÇÃO INTELIGENTE (MAPA E BANDEIRAS) COM PROTEÇÃO DE PREFIXOS
  // =========================================================================
  function buscarPaisPorTexto(texto) {
    const norm = normalizarTexto(texto);
    if (!norm) return null;
    if (indiceNomes.has(norm)) return indiceNomes.get(norm);

    const normSp = normalizarSemPreposicoes(texto);
    if (normSp && indiceSemPrep.has(normSp)) return indiceSemPrep.get(normSp);
    return null;
  }

  function textoCorrespondeAoPais(texto, codigoAlvo) {
    if (!codigoAlvo || !PAISES[codigoAlvo]) return false;
    const norm = normalizarTexto(texto);
    const normSp = normalizarSemPreposicoes(texto);
    if (!norm) return false;

    const dados = PAISES[codigoAlvo];
    const nomes = [dados.nome, ...(dados.aliases || [])];
    for (const n of nomes) {
      if (normalizarTexto(n) === norm) return true;
      const nSp = normalizarSemPreposicoes(n);
      if (nSp && normSp === nSp) return true;
    }
    return false;
  }

  function existeOutroPaisFaltanteComPrefixo(prefixoNorm, codigoAtual) {
    for (const [nomeNorm, cod] of indiceNomes.entries()) {
      if (cod !== codigoAtual && paisesEscopo.has(cod) && !paisesAcertados.has(cod)) {
        if (nomeNorm.startsWith(prefixoNorm) && nomeNorm.length > prefixoNorm.length) {
          return true;
        }
      }
    }
    return false;
  }

  function cancelarTimerPrefixo() {
    if (prefixoTimeout) {
      clearTimeout(prefixoTimeout);
      prefixoTimeout = null;
    }
    el.prefixGraceBar.classList.remove('animating');
  }

  function aoDigitarInput() {
    cancelarTimerPrefixo();
    if (jogoPausado || jogoEncerrado) return;

    const texto = el.inputPais.value;
    if (!jogoAtivo && texto.trim().length > 0) {
      iniciarPartidaAoDigitar();
    }
    if (!jogoAtivo) return;

    const norm = normalizarTexto(texto);
    if (!norm) return;

    const ehBandeiras = abaJogoAtual === 'bandeiras';

    if (ehBandeiras && modoRespostaBandeira === 'destaque') {
      if (
        paisSelecionado &&
        paisesEscopo.has(paisSelecionado) &&
        !paisesAcertados.has(paisSelecionado) &&
        textoCorrespondeAoPais(texto, paisSelecionado)
      ) {
        registrarAcerto(paisSelecionado);
      }
      return;
    }

    const codigo = buscarPaisPorTexto(texto);
    if (!codigo || !paisesEscopo.has(codigo)) return;

    if (paisesAcertados.has(codigo)) {
      definirFeedback(`<strong>${PAISES[codigo].nome}</strong> já foi acertado.`, 'info');
      return;
    }

    if (existeOutroPaisFaltanteComPrefixo(norm, codigo)) {
      const nomeOficial = PAISES[codigo].nome;
      definirFeedback(
        `<strong>${nomeOficial}</strong>? Confirmando em instantes… (continue digitando se for outro país)`,
        'warning'
      );

      void el.prefixGraceBar.offsetWidth;
      el.prefixGraceBar.classList.add('animating');

      prefixoTimeout = setTimeout(() => {
        prefixoTimeout = null;
        el.prefixGraceBar.classList.remove('animating');
        if (
          jogoAtivo &&
          !jogoPausado &&
          !jogoEncerrado &&
          !paisesAcertados.has(codigo) &&
          normalizarTexto(el.inputPais.value) === norm
        ) {
          registrarAcerto(codigo);
        }
      }, TEMPO_FOLGA_PREFIXO_MS);
      return;
    }

    registrarAcerto(codigo);
  }

  function aoPressionarEnterInput() {
    if (!jogoAtivo || jogoPausado || jogoEncerrado) return;

    const texto = el.inputPais.value.trim();
    if (!texto) return;

    const ehBandeiras = abaJogoAtual === 'bandeiras';

    if (ehBandeiras && modoRespostaBandeira === 'destaque') {
      if (
        paisSelecionado &&
        !paisesAcertados.has(paisSelecionado) &&
        textoCorrespondeAoPais(texto, paisSelecionado)
      ) {
        registrarAcerto(paisSelecionado);
        return;
      }

      const outroCodigo = buscarPaisPorTexto(texto);
      piscarInput('flash-error');
      if (outroCodigo) {
        definirFeedback(
          `Não é <strong>${PAISES[outroCodigo].nome}</strong>. Tente de novo ou aperte <strong>Tab</strong> para pular.`,
          'danger'
        );
      } else {
        definirFeedback(
          `"${texto}" não é o país desta bandeira. Tente de novo ou aperte <strong>Tab</strong> para pular.`,
          'danger'
        );
      }
      return;
    }

    const codigo = buscarPaisPorTexto(texto);
    if (!codigo) {
      definirFeedback(`"${texto}" não foi reconhecido como país. Confira a grafia.`, 'danger');
      piscarInput('flash-error');
      return;
    }

    if (!paisesEscopo.has(codigo)) {
      const d = PAISES[codigo];
      definirFeedback(
        `<strong>${d.nome}</strong> fica em <strong>${d.continente}</strong>, fora da região atual.`,
        'warning'
      );
      return;
    }

    if (paisesAcertados.has(codigo)) {
      definirFeedback(`Você já acertou <strong>${PAISES[codigo].nome}</strong>.`, 'info');
      el.inputPais.value = '';
      return;
    }

    registrarAcerto(codigo);
  }

  function registrarAcerto(codigo) {
    cancelarTimerPrefixo();
    paisesAcertados.add(codigo);
    ordemAcertos.push(codigo);

    el.inputPais.value = '';
    piscarInput('flash-success');

    const dados = PAISES[codigo];
    const restantes = paisesEscopo.size - paisesAcertados.size;
    const ehBandeiras = abaJogoAtual === 'bandeiras';

    definirFeedback(
      `<strong>${dados.nome}</strong> · ${dados.continente} — faltam ${restantes}`,
      'success'
    );

    if (ehBandeiras) {
      if (filtroStatusBandeiras === 'faltantes') {
        renderizarGradeBandeiras();
      } else {
        atualizarCardBandeiraIndividual(codigo, true);
        atualizarCabecalhosContinentesBandeiras();
      }
    } else {
      atualizarEstiloPais(codigo, true);
      atualizarVisibilidadeRotulos();
    }

    atualizarPlacarEProgresso();
    atualizarListaPaises();

    if (paisesAcertados.size === paisesEscopo.size) {
      if (ehBandeiras) atualizarSpotlightBandeira();
      finalizarVitoria();
      return;
    }

    if (ehBandeiras && paisSelecionado === codigo) {
      selecionarProximaBandeiraFaltante(1, codigo);
    } else if (ehBandeiras) {
      atualizarSpotlightBandeira();
    }

    salvarEstadoAbaAtual();
  }

  function piscarInput(classe) {
    el.inputPais.classList.remove('flash-success', 'flash-error');
    void el.inputPais.offsetWidth;
    el.inputPais.classList.add(classe);
    setTimeout(() => el.inputPais.classList.remove(classe), 380);
  }

  const ICONES_FEEDBACK = {
    info: 'info',
    success: 'check',
    warning: 'clock',
    danger: 'alert',
  };

  function definirFeedback(html, tipo = 'info') {
    el.lblFeedback.className = `feedback-banner ${tipo}`;
    el.lblFeedback.innerHTML = `${icone(ICONES_FEEDBACK[tipo] || 'info')}<span>${html}</span>`;
    void el.lblFeedback.offsetWidth;
    el.lblFeedback.classList.add('pop');
  }

  // =========================================================================
  // FIM DE JOGO (TEMPO ESGOTADO -> REVELA FALTANTES EM VERMELHO / VITÓRIA)
  // =========================================================================
  function finalizarPorTempoEsgotado(manual = false) {
    cancelarTimerPrefixo();
    pararLoopCronometro();

    jogoAtivo = false;
    jogoEncerrado = true;
    jogoPausado = false;
    el.pauseOverlay.classList.add('hidden');
    el.flagsPauseOverlay.classList.add('hidden');

    paisesPerdidos = new Set(
      [...paisesEscopo].filter((cod) => !paisesAcertados.has(cod))
    );

    el.inputPais.disabled = true;
    el.btnPausar.disabled = true;
    el.btnEncerrar.disabled = true;
    el.inputPais.value = '';
    el.inputPais.placeholder = PLACEHOLDER_ENCERRADO;
    el.btnResetar.classList.add('is-highlight');

    const ehBandeiras = abaJogoAtual === 'bandeiras';
    if (ehBandeiras) {
      if (filtroStatusBandeiras === 'faltantes') {
        filtroStatusBandeiras = 'todas';
        el.selectFiltroBandeiras.value = 'todas';
      }
      renderizarGradeBandeiras();
      atualizarSpotlightBandeira();
    } else {
      atualizarTodosEstilosMapa();
      atualizarVisibilidadeRotulos();
    }

    definirFiltroLista(paisesPerdidos.size > 0 ? 'vermelhos' : 'todos');

    const acertos = paisesAcertados.size;
    const total = paisesEscopo.size;
    const perc = total > 0 ? Math.round((acertos / total) * 100) : 0;
    const faltaram = paisesPerdidos.size;

    const motivo = manual ? 'Partida encerrada' : 'O tempo acabou!';
    definirFeedback(
      `${manual ? 'Partida encerrada.' : 'O tempo acabou!'} Você acertou <strong>${acertos} de ${total} (${perc}%)</strong> — os ${faltaram} que faltaram estão em vermelho.`,
      'danger'
    );

    exibirModalFimDeJogo({
      variante: manual ? 'manual' : 'tempo',
      titulo: motivo,
      subtitulo: `${ehBandeiras ? 'Jogo das Bandeiras' : 'Jogo do Mapa'} · ${modoAtual}`,
      acertos,
      faltaram,
      perc,
    });

    salvarEstadoAbaAtual();
  }

  function finalizarVitoria() {
    cancelarTimerPrefixo();
    pararLoopCronometro();

    jogoAtivo = false;
    jogoEncerrado = true;

    el.inputPais.disabled = true;
    el.btnPausar.disabled = true;
    el.btnEncerrar.disabled = true;
    el.inputPais.value = '';
    el.inputPais.placeholder = PLACEHOLDER_ENCERRADO;
    el.btnResetar.classList.add('is-highlight');

    const total = paisesEscopo.size;
    const ehBandeiras = abaJogoAtual === 'bandeiras';

    definirFeedback(
      `Parabéns! Você completou 100% de <strong>${modoAtual}</strong> (${total}/${total})!`,
      'success'
    );

    exibirModalFimDeJogo({
      variante: 'vitoria',
      titulo: 'Vitória completa!',
      subtitulo: `100% de ${modoAtual} (${ehBandeiras ? 'Bandeiras' : 'Mapa'})`,
      acertos: total,
      faltaram: 0,
      perc: 100,
    });

    salvarEstadoAbaAtual();
  }

  function exibirModalFimDeJogo({ variante, titulo, subtitulo, acertos, faltaram, perc }) {
    const ehBandeiras = abaJogoAtual === 'bandeiras';
    const visualModal = {
      vitoria: { icone: 'trophy', classe: 'variant-win' },
      tempo: { icone: 'clock', classe: 'variant-danger' },
      manual: { icone: 'eye', classe: 'variant-primary' },
    }[variante] || { icone: 'globe', classe: 'variant-primary' };
    el.modalIcon.className = `modal-icon ${visualModal.classe}`;
    el.modalIcon.innerHTML = icone(visualModal.icone);
    el.modalRing.style.setProperty('--p', perc);
    el.modalRing.style.setProperty(
      '--ring-color',
      perc >= 70 ? 'var(--green)' : perc >= 35 ? 'var(--gold)' : 'var(--red)'
    );
    el.modalTitle.textContent = titulo;
    el.modalSubtitle.textContent = subtitulo;
    el.modalAcertos.textContent = acertos;
    el.modalFaltaram.textContent = faltaram;
    el.modalPrecisao.textContent = `${perc}%`;

    el.modalTip.innerHTML =
      faltaram === 0
        ? 'Você não deixou nenhum país para trás. Incrível!'
        : ehBandeiras
          ? 'As bandeiras que faltaram foram reveladas em <strong>vermelho</strong>, com o nome do país.'
          : 'Os países que faltaram foram revelados em <strong>vermelho</strong> no mapa e na lista ao lado.';

    el.endgameModal.classList.remove('hidden');
  }

  // =========================================================================
  // ATUALIZAÇÃO DE CORES E ESTILOS DO MAPA
  // =========================================================================
  function atualizarEstiloPais(codigo, pulsoRecemAcertado = false) {
    const paths = elementosPoligonos[codigo] || [];
    const pin = elementosPinos[codigo];

    const classes = [];
    if (!paisesEscopo.has(codigo)) {
      classes.push('out-of-scope');
    } else if (paisesAcertados.has(codigo)) {
      classes.push('guessed');
      if (pulsoRecemAcertado) classes.push('just-guessed');
    } else if (paisesPerdidos.has(codigo)) {
      classes.push('missed');
    }

    if (codigo === paisSelecionado) {
      classes.push('selected');
    }

    for (const p of paths) {
      p.setAttribute('class', ['country-path', ...classes].join(' '));
    }

    if (pin) {
      const oculto = !el.chkIlhas.checked || !paisesEscopo.has(codigo);
      pin.setAttribute(
        'class',
        ['island-pin', ...classes, oculto ? 'hidden-pin' : ''].filter(Boolean).join(' ')
      );
    }

    if (pulsoRecemAcertado) {
      setTimeout(() => atualizarEstiloPais(codigo, false), 550);
    }
  }

  function atualizarTodosEstilosMapa() {
    for (const codigo of Object.keys(PAISES)) {
      atualizarEstiloPais(codigo, false);
    }
  }

  function atualizarVisibilidadePinos() {
    const mostrar = el.chkIlhas.checked;
    for (const [codigo, pin] of Object.entries(elementosPinos)) {
      const visivel = mostrar && paisesEscopo.has(codigo);
      pin.classList.toggle('hidden-pin', !visivel);
    }
  }

  function atualizarVisibilidadeRotulos() {
    const mostrar = el.chkNomes.checked;
    for (const [codigo, txt] of Object.entries(elementosRotulos)) {
      const revelado = paisesAcertados.has(codigo) || paisesPerdidos.has(codigo);
      const visivel = mostrar && revelado && paisesEscopo.has(codigo);
      txt.classList.toggle('visible', visivel);
      txt.classList.toggle('label-guessed', paisesAcertados.has(codigo));
      txt.classList.toggle('label-missed', paisesPerdidos.has(codigo));
    }
  }

  // =========================================================================
  // PLACAR, CONTINENTES E SELEÇÃO
  // =========================================================================
  function construirBarrasContinentes() {
    el.continentsList.innerHTML = '';
    for (const cont of CONTINENTES_ORDEM) {
      const row = document.createElement('div');
      row.className = 'continent-row';
      row.dataset.continent = cont;
      row.innerHTML = `
        <div class="continent-row-top">
          <span>${cont}</span>
          <span class="continent-count" id="cnt-${cont}">0/0</span>
        </div>
        <div class="continent-mini-bar">
          <div class="continent-mini-fill" id="bar-${cont}"></div>
        </div>
      `;
      row.addEventListener('click', () => alternarFocoContinente(cont));
      el.continentsList.appendChild(row);
    }
  }

  function atualizarPlacarEProgresso() {
    const acertos = paisesAcertados.size;
    const total = paisesEscopo.size;
    const perc = total > 0 ? Math.round((acertos / total) * 100) : 0;

    el.lblPlacar.innerHTML = `${acertos}<small>/${total}</small>`;
    el.barraProgressoGeral.style.width = `${perc}%`;
    el.scoreRing.style.setProperty('--p', perc);
    el.scoreRingPct.textContent = `${perc}%`;

    for (const cont of CONTINENTES_ORDEM) {
      let totC = 0;
      let acC = 0;
      for (const cod of paisesEscopo) {
        if (PAISES[cod].continente === cont) {
          totC++;
          if (paisesAcertados.has(cod)) acC++;
        }
      }
      const lbl = document.getElementById(`cnt-${cont}`);
      const bar = document.getElementById(`bar-${cont}`);
      if (!lbl || !bar) continue;

      const row = lbl.closest('.continent-row');
      if (row) row.classList.toggle('is-empty', totC === 0);

      if (totC === 0) {
        lbl.textContent = '—';
        lbl.classList.remove('done');
        bar.style.width = '0%';
      } else {
        lbl.textContent = acC === totC ? `✓ ${acC}/${totC}` : `${acC}/${totC}`;
        lbl.classList.toggle('done', acC === totC);
        bar.style.width = `${Math.round((acC / totC) * 100)}%`;
      }
    }
  }

  function selecionarPais(codigo, rolarPainelBandeiras = false) {
    const anterior = paisSelecionado;
    paisSelecionado = codigo;

    if (abaJogoAtual === 'bandeiras') {
      if (anterior) atualizarCardBandeiraIndividual(anterior, false);
      if (codigo) {
        atualizarCardBandeiraIndividual(codigo, false);
        if (rolarPainelBandeiras) rolarParaCardBandeira(codigo);
      }
      atualizarSpotlightBandeira();
    } else {
      if (anterior) atualizarEstiloPais(anterior);
      if (codigo) atualizarEstiloPais(codigo);
    }

    if (!jogoEncerrado && !jogoPausado) {
      el.inputPais.focus();
    }
  }

  // =========================================================================
  // LISTA LATERAL DE PAÍSES / BANDEIRAS
  // =========================================================================
  function definirFiltroLista(filtro) {
    filtroListaAtual = filtro;
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.filter === filtro);
    });
    atualizarListaPaises();
  }

  function atualizarListaPaises() {
    el.ulListaPaises.innerHTML = '';
    const busca = normalizarTexto(el.inputBuscaLista.value);
    const itens = [];

    if (filtroListaAtual === 'todos' || filtroListaAtual === 'verdes') {
      for (let i = ordemAcertos.length - 1; i >= 0; i--) {
        itens.push({ codigo: ordemAcertos[i], acertado: true });
      }
    }

    if ((filtroListaAtual === 'todos' || filtroListaAtual === 'vermelhos') && jogoEncerrado) {
      const perdidosOrdenados = [...paisesPerdidos].sort((a, b) =>
        PAISES[a].nome.localeCompare(PAISES[b].nome, 'pt-BR')
      );
      for (const cod of perdidosOrdenados) {
        itens.push({ codigo: cod, acertado: false });
      }
    }

    const filtrados = itens.filter(({ codigo }) => {
      if (!busca) return true;
      const d = PAISES[codigo];
      return (
        normalizarTexto(d.nome).includes(busca) ||
        normalizarTexto(d.continente).includes(busca)
      );
    });

    if (jogoEncerrado) {
      el.lblListaTitulo.innerHTML = `${icone('list')}Resultado · ${paisesAcertados.size} certos · ${paisesPerdidos.size} faltaram`;
    } else {
      el.lblListaTitulo.innerHTML = `${icone('check')}Acertados (${paisesAcertados.size})`;
    }

    if (!filtrados.length) {
      const li = document.createElement('li');
      li.className = 'empty-list-msg';
      li.textContent = jogoEncerrado
        ? 'Nenhum país encontrado.'
        : 'Os países que você acertar aparecem aqui.';
      el.ulListaPaises.appendChild(li);
      return;
    }

    for (const { codigo, acertado } of filtrados) {
      const d = PAISES[codigo];
      const li = document.createElement('li');
      li.className = `country-li ${acertado ? 'li-guessed' : 'li-missed'}`;
      li.innerHTML = `
        <span class="country-li-left">
          <img class="country-li-flag" src="${obterUrlBandeira(codigo, false)}" alt="" loading="lazy" />
          <i class="status-dot"></i>
          <span>${d.nome}</span>
        </span>
        <small>${d.continente}</small>
      `;
      li.addEventListener('click', () => {
        selecionarPais(codigo, true);
        focarNoPais(codigo);
      });
      el.ulListaPaises.appendChild(li);
    }
  }

  // =========================================================================
  // EVENTOS DO MOUSE NO MAPA E CONTROLES DE INTERFACE
  // =========================================================================
  function definirFiltroContinenteBandeiras(continente) {
    filtroContinenteBandeira = continente;
    document.querySelectorAll('.flag-pill-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.flagContinent === continente);
    });
    renderizarGradeBandeiras();
  }

  function atualizarTooltipMapa(e) {
    const target = e.target;
    const codigo = target.dataset ? target.dataset.code : null;
    const neutralName = target.dataset ? target.dataset.neutralName : null;

    if (!codigo && !neutralName) {
      el.mapTooltip.classList.add('hidden');
      return;
    }

    let html = '';

    if (neutralName) {
      html = `<span class="muted">${neutralName}</span>`;
    } else if (!paisesEscopo.has(codigo)) {
      html = `<span class="muted">Fora da região · ${PAISES[codigo].continente}</span>`;
    } else if (paisesAcertados.has(codigo)) {
      const d = PAISES[codigo];
      html = `<i class="dot green"></i><strong>${d.nome}</strong>`;
    } else if (paisesPerdidos.has(codigo)) {
      const d = PAISES[codigo];
      html = `<i class="dot red"></i><strong>${d.nome}</strong>`;
    } else {
      el.mapTooltip.classList.add('hidden');
      return;
    }

    el.mapTooltip.innerHTML = html;
    el.mapTooltip.classList.remove('hidden');

    const rect = el.mapViewport.getBoundingClientRect();
    let tx = e.clientX - rect.left + 14;
    let ty = e.clientY - rect.top + 14;

    const tipRect = el.mapTooltip.getBoundingClientRect();
    if (tx + tipRect.width + 12 > rect.width) {
      tx = Math.max(8, rect.width - tipRect.width - 12);
    }
    if (ty + tipRect.height + 12 > rect.height) {
      ty = Math.max(8, e.clientY - rect.top - tipRect.height - 12);
    }

    el.mapTooltip.style.left = `${tx}px`;
    el.mapTooltip.style.top = `${ty}px`;
  }

  function vincularEventos() {
    el.tabJogoMapa.addEventListener('click', () => alternarAbaJogo('mapa'));
    el.tabJogoBandeiras.addEventListener('click', () => alternarAbaJogo('bandeiras'));

    el.selectModo.addEventListener('change', prepararPartida);
    el.selectTempo.addEventListener('change', prepararPartida);

    el.btnResetar.addEventListener('click', prepararPartida);
    el.btnPausar.addEventListener('click', alternarPausa);
    el.btnRetomarOverlay.addEventListener('click', alternarPausa);
    el.btnRetomarFlagsOverlay.addEventListener('click', alternarPausa);

    el.btnEncerrar.addEventListener('click', () => {
      if (jogoEncerrado) return;
      const faltam = paisesEscopo.size - paisesAcertados.size;
      if (faltam === 0) {
        finalizarPorTempoEsgotado(true);
        return;
      }
      el.confirmText.innerHTML = `Ainda ${faltam === 1 ? 'falta' : 'faltam'} <strong>${faltam}</strong> ${
        faltam === 1 ? 'país' : 'países'
      }. A partida será encerrada e os que faltaram aparecerão em vermelho.`;
      abrirModal(el.confirmModal);
      el.btnConfirmCancelar.focus();
    });

    el.inputPais.addEventListener('input', aoDigitarInput);
    el.inputPais.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        aoPressionarEnterInput();
      } else if (e.key === 'Escape') {
        cancelarTimerPrefixo();
        el.inputPais.value = '';
      } else if (e.key === 'Tab' && abaJogoAtual === 'bandeiras') {
        e.preventDefault();
        selecionarProximaBandeiraFaltante(e.shiftKey ? -1 : 1);
      }
    });

    // Controles da aba de Bandeiras
    el.btnEmbaralharBandeiras.addEventListener('click', () => {
      ordemBandeiras = embaralharArray(ordemBandeiras);
      renderizarGradeBandeiras();
      if (!paisSelecionado || paisesAcertados.has(paisSelecionado)) {
        selecionarProximaBandeiraFaltante(1, null);
      } else {
        atualizarSpotlightBandeira();
      }
    });

    el.btnAgruparBandeiras.addEventListener('click', () => {
      agruparBandeirasPorContinente = !agruparBandeirasPorContinente;
      el.btnAgruparBandeiras.classList.toggle('active', agruparBandeirasPorContinente);
      renderizarGradeBandeiras();
    });

    document.querySelectorAll('.flag-pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cont = btn.dataset.flagContinent;
        definirFiltroContinenteBandeiras(
          cont !== 'Todos' && filtroContinenteBandeira === cont ? 'Todos' : cont
        );
      });
    });

    el.selectModoBandeira.addEventListener('change', () => {
      modoRespostaBandeira = el.selectModoBandeira.value;
      if (jogoAtivo && !jogoPausado) {
        el.inputPais.placeholder =
          modoRespostaBandeira === 'destaque'
            ? 'De qual país é esta bandeira? (Tab para pular)'
            : 'Digite o nome de qualquer país…';
        el.inputPais.focus();
      }
    });

    el.selectFiltroBandeiras.addEventListener('change', () => {
      filtroStatusBandeiras = el.selectFiltroBandeiras.value;
      renderizarGradeBandeiras();
    });

    el.btnFlagPrev.addEventListener('click', () => selecionarProximaBandeiraFaltante(-1));
    el.btnFlagNext.addEventListener('click', () => selecionarProximaBandeiraFaltante(1));

    // Controles de câmera do Mapa
    el.btnZoomIn.addEventListener('click', () => aplicarZoomCentro(1.35));
    el.btnZoomOut.addEventListener('click', () => aplicarZoomCentro(1 / 1.35));
    el.btnZoomReset.addEventListener('click', () => enquadrarVisaoPadrao(true));

    document.querySelectorAll('.pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => alternarFocoContinente(btn.dataset.continent));
    });

    el.chkIlhas.addEventListener('change', atualizarVisibilidadePinos);
    el.chkNomes.addEventListener('change', atualizarVisibilidadeRotulos);

    // Lista lateral
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => definirFiltroLista(btn.dataset.filter));
    });
    el.inputBuscaLista.addEventListener('input', atualizarListaPaises);

    // Modal de Fim de Jogo
    el.btnModalExplorar.addEventListener('click', () => {
      el.endgameModal.classList.add('hidden');
    });
    el.btnModalJogarNovamente.addEventListener('click', () => {
      el.endgameModal.classList.add('hidden');
      prepararPartida();
    });

    // Interações de Pan, Zoom e Clique no Mapa SVG
    // Eventos de ponteiro: funcionam com mouse, toque e caneta
    el.mapViewport.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.zoom-controls, .start-hint, .panel-overlay')) return;
      if (e.button !== 0 && e.button !== 2) return;
      if (animacaoCameraId) {
        cancelAnimationFrame(animacaoCameraId);
        animacaoCameraId = null;
      }
      arrastandoMapa = true;
      moveuDuranteClique = false;
      inicioArrastoX = e.clientX;
      inicioArrastoY = e.clientY;
      el.mapViewport.classList.add('dragging');
    });

    window.addEventListener('pointermove', (e) => {
      if (arrastandoMapa) {
        const dx = e.clientX - inicioArrastoX;
        const dy = e.clientY - inicioArrastoY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          moveuDuranteClique = true;
        }
        offsetX += dx;
        offsetY += dy;
        inicioArrastoX = e.clientX;
        inicioArrastoY = e.clientY;
        atualizarTransformacaoCamera();
      }
    });

    window.addEventListener('pointerup', (e) => {
      if (!arrastandoMapa) return;
      arrastandoMapa = false;
      el.mapViewport.classList.remove('dragging');

      if (!moveuDuranteClique) {
        const cod = e.target && e.target.dataset ? e.target.dataset.code : null;
        if (cod && paisesEscopo.has(cod)) {
          // Clicar de novo no país selecionado tira a seleção
          selecionarPais(cod === paisSelecionado ? null : cod, false);
        } else if (!cod && paisSelecionado && el.worldSvg.contains(e.target)) {
          // Clicar no oceano também tira a seleção
          selecionarPais(null, false);
        }
      }
    });

    el.mapViewport.addEventListener('mousemove', atualizarTooltipMapa);
    el.mapViewport.addEventListener('mouseleave', () => {
      el.mapTooltip.classList.add('hidden');
    });

    el.mapViewport.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (animacaoCameraId) {
          cancelAnimationFrame(animacaoCameraId);
          animacaoCameraId = null;
        }
        const rect = el.mapViewport.getBoundingClientRect();
        const sx = e.clientX - rect.left;
        const sy = e.clientY - rect.top;
        const fator = e.deltaY < 0 ? 1.24 : 1 / 1.24;
        aplicarZoomPonto(sx, sy, fator);
      },
      { passive: false }
    );

    window.addEventListener('resize', () => {
      if (abaJogoAtual === 'mapa') {
        enquadrarContinente(continenteFocado || modoAtual, false);
      }
    });
  }

  // =========================================================================
  // INTERFACE: MODAIS, AJUDA, TEMA E ATALHOS GLOBAIS
  // =========================================================================
  function abrirModal(modal) {
    modal.classList.remove('hidden');
  }

  function fecharModal(modal) {
    modal.classList.add('hidden');
    if (!el.inputPais.disabled) el.inputPais.focus();
  }

  function modalAberto() {
    return [el.helpModal, el.confirmModal, el.endgameModal].find(
      (m) => !m.classList.contains('hidden')
    );
  }

  function abrirAjuda() {
    abrirModal(el.helpModal);
    el.btnComecarAjuda.focus();
  }

  function abrirAjudaNaPrimeiraVisita() {
    let jaViu = false;
    try {
      jaViu = localStorage.getItem('atlas-ajuda-vista') === '1';
    } catch (e) {
      jaViu = false;
    }
    if (jaViu) return;
    abrirAjuda();
    try {
      localStorage.setItem('atlas-ajuda-vista', '1');
    } catch (e) {
      /* armazenamento indisponível: ignora */
    }
  }

  // Recuo do valor nas caixas de seleção compactas = largura do rótulo
  function ajustarCamposSelecao() {
    document.querySelectorAll('.select-field.select-sm').forEach((campo) => {
      const rotulo = campo.querySelector('.select-label');
      const largura = rotulo ? rotulo.getBoundingClientRect().width : 0;
      if (largura > 0) campo.style.setProperty('--label-w', `${Math.ceil(largura)}px`);
    });
  }

  function alternarTema() {
    const atual = document.documentElement.getAttribute('data-theme');
    const novo = atual === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', novo);
    try {
      localStorage.setItem('atlas-tema', novo);
    } catch (e) {
      /* armazenamento indisponível: ignora */
    }
  }

  function vincularEventosInterface() {
    el.btnAjuda.addEventListener('click', abrirAjuda);
    el.btnFecharAjuda.addEventListener('click', () => fecharModal(el.helpModal));
    el.btnComecarAjuda.addEventListener('click', () => fecharModal(el.helpModal));
    el.btnTema.addEventListener('click', alternarTema);

    el.btnConfirmCancelar.addEventListener('click', () => fecharModal(el.confirmModal));
    el.btnConfirmOk.addEventListener('click', () => {
      el.confirmModal.classList.add('hidden');
      if (!jogoEncerrado) finalizarPorTempoEsgotado(true);
    });

    // Clicar fora do cartão fecha a ajuda e a confirmação
    [el.helpModal, el.confirmModal].forEach((modal) => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) fecharModal(modal);
      });
    });

    el.mapStartHint.addEventListener('click', () => el.inputPais.focus());

    ajustarCamposSelecao();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(ajustarCamposSelecao);
    }

    document.addEventListener('keydown', (e) => {
      const aberto = modalAberto();
      if (aberto) {
        if (e.key === 'Escape') {
          e.preventDefault();
          fecharModal(aberto);
        }
        return;
      }

      // Começar a digitar em qualquer lugar da página leva ao campo de resposta
      const alvo = document.activeElement;
      const emCampo =
        alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'SELECT' || alvo.tagName === 'TEXTAREA');
      if (
        !emCampo &&
        !el.inputPais.disabled &&
        e.key.length === 1 &&
        e.key !== ' ' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        el.inputPais.focus();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', inicializarApp);
})();
