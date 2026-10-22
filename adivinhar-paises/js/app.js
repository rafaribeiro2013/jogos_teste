/**
 * Atlas Quiz — Jogo de Adivinhar Países no Mapa-Múndi
 * Lógica principal, renderização SVG vetorial, câmera interativa e sistema de jogo.
 */

(() => {
  'use strict';

  const FATOR_LAT = 1.22;
  const TEMPO_FOLGA_PREFIXO_MS = 850;
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

  // =========================================================================
  // FUNÇÕES DE NORMALIZAÇÃO DE TEXTO (SEM ACENTOS / CASE-INSENSITIVE)
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

  // =========================================================================
  // ESTADO DA APLICAÇÃO
  // =========================================================================
  let PAISES = {};
  let TERRITORIOS_NEUTROS = [];

  const indiceNomes = new Map();
  const indiceSemPrep = new Map();

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
  let revelacoesDica = {};      // codigo -> qtd letras reveladas
  let capitalRevelada = new Set();
  let filtroListaAtual = 'todos';

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
  const elementosPinos = {};     // codigo -> circleEl
  const elementosRotulos = {};   // codigo -> textEl

  // =========================================================================
  // ELEMENTOS DO DOM
  // =========================================================================
  const el = {
    selectModo: document.getElementById('select-modo'),
    selectTempo: document.getElementById('select-tempo'),
    btnIniciar: document.getElementById('btn-iniciar'),
    btnResetar: document.getElementById('btn-resetar'),
    btnPausar: document.getElementById('btn-pausar'),
    btnDica: document.getElementById('btn-dica'),
    btnEncerrar: document.getElementById('btn-encerrar'),
    lblPlacar: document.getElementById('lbl-placar'),
    lblCronometro: document.getElementById('lbl-cronometro'),
    inputPais: document.getElementById('input-pais'),
    prefixGraceBar: document.getElementById('prefix-grace-bar'),
    lblFeedback: document.getElementById('lbl-feedback'),
    barraProgressoGeral: document.getElementById('barra-progresso-geral'),

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

    inspectTitle: document.getElementById('inspect-title'),
    inspectDetails: document.getElementById('inspect-details'),
    btnDicaCapital: document.getElementById('btn-dica-capital'),
    btnDicaLetra: document.getElementById('btn-dica-letra'),
    btnZoomSelecionado: document.getElementById('btn-zoom-selecionado'),

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
    btnModalExplorar: document.getElementById('btn-modal-explorar'),
    btnModalJogarNovamente: document.getElementById('btn-modal-jogar-novamente'),
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
    prepararPartida();
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

    // 1. Grade geográfica (Meridianos e Paralelos)
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

    // 2. Territórios neutros de fundo (Groenlândia, Guiana Francesa, Saara Ocidental, etc.)
    for (const terr of TERRITORIOS_NEUTROS) {
      const d = terr.poligonos.map(anelParaPathD).join(' ');
      const path = document.createElementNS(NS_SVG, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'neutral-path');
      path.dataset.neutralName = terr.nome;
      el.layerNeutral.appendChild(path);
    }

    // 3. Polígonos dos 197 Países Soberanos
    for (const [codigo, dados] of Object.entries(PAISES)) {
      const d = dados.poligonos.map(anelParaPathD).join(' ');
      const path = document.createElementNS(NS_SVG, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'country-path');
      path.dataset.code = codigo;
      el.layerCountries.appendChild(path);
      elementosPoligonos[codigo] = [path];

      // 4. Marcadores circulares para microestados e ilhas pequenas
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

      // 5. Rótulo de nome no mapa
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
  // CONTROLE DE CÂMERA (ZOOM, PAN E ENQUADRAMENTO ANIMADO)
  // =========================================================================
  function atualizarTransformacaoCamera() {
    el.cameraGroup.setAttribute(
      'transform',
      `translate(${offsetX.toFixed(2)}, ${offsetY.toFixed(2)}) scale(${escala.toFixed(4)})`
    );

    // Mantém os marcadores de ilhas e os rótulos em tamanho legível na tela em qualquer nível de zoom
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
    const largura = Math.max(300, rect.width);
    const altura = Math.max(200, rect.height);

    const wx1 = lonMin;
    const wx2 = lonMax;
    const wy1 = -latMax * FATOR_LAT;
    const wy2 = -latMin * FATOR_LAT;

    const spanX = Math.max(3.5, wx2 - wx1);
    const spanY = Math.max(3.5, wy2 - wy1);

    let novaEscala = Math.min((largura * 0.91) / spanX, (altura * 0.88) / spanY);
    novaEscala = Math.max(1.8, Math.min(110.0, novaEscala));

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
      const ease = 1 - Math.pow(1 - t, 3); // Cubic ease-out

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
    const caixa =
      ENQUADRAMENTOS_CONTINENTES[nomeContinente] ||
      ENQUADRAMENTOS_CONTINENTES['Mundo Inteiro'];
    const { novaEscala, novoOffsetX, novoOffsetY } = calcularTransformacaoEnquadramento(...caixa);
    animarCameraPara(novaEscala, novoOffsetX, novoOffsetY, animar ? 360 : 0);
  }

  function focarNoPais(codigo) {
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
    const novaEscala = Math.max(1.6, Math.min(130.0, escala * fator));
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
  // PREPARAÇÃO E CONTROLE DE PARTIDA (INÍCIO MANUAL PELO USUÁRIO)
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
    revelacoesDica = {};
    capitalRevelada.clear();
    paisSelecionado = null;

    jogoAtivo = false;
    jogoPausado = false;
    jogoEncerrado = false;

    el.pauseOverlay.classList.add('hidden');
    el.endgameModal.classList.add('hidden');

    el.btnIniciar.disabled = false;
    el.btnIniciar.innerHTML = '▶️ Iniciar Jogo';
    el.btnPausar.disabled = true;
    el.btnPausar.innerHTML = '⏸️ Pausar';
    el.btnDica.disabled = true;
    el.btnEncerrar.disabled = true;

    el.inputPais.value = '';
    el.inputPais.disabled = true;
    el.inputPais.placeholder = "Clique em '▶️ Iniciar Jogo' quando quiser começar...";

    definirFeedback(
      `Pronto: <strong>${modoAtual}</strong> (${paisesEscopo.size} países). Clique em <strong>▶️ Iniciar Jogo</strong> quando quiser começar!`,
      'info'
    );

    atualizarTodosEstilosMapa();
    atualizarVisibilidadePinos();
    atualizarVisibilidadeRotulos();
    atualizarPlacarEProgresso();
    atualizarCardInspecao();
    definirFiltroLista('todos');
    atualizarDisplayCronometro();
    enquadrarContinente(modoAtual, false);
  }

  function iniciarNovoJogo() {
    if (!paisesEscopo.size || jogoEncerrado || jogoAtivo) {
      prepararPartida();
    }

    jogoAtivo = true;
    jogoPausado = false;
    jogoEncerrado = false;

    el.btnIniciar.disabled = true;
    el.btnIniciar.innerHTML = '▶️ Em Andamento';
    el.btnPausar.disabled = false;
    el.btnDica.disabled = false;
    el.btnEncerrar.disabled = false;

    el.inputPais.disabled = false;
    el.inputPais.value = '';
    el.inputPais.placeholder = 'Digite o nome de qualquer país (sem precisar de acentos)...';
    el.inputPais.focus();

    definirFeedback(
      `Partida iniciada em <strong>${modoAtual}</strong>! Digite os países para pintá-los de verde.`,
      'success'
    );

    ultimoTickMs = performance.now();
    timerInterval = setInterval(tickCronometro, 200);
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
    if (tempoTotalSeg === 0) {
      el.lblCronometro.textContent = '∞ LIVRE';
      return;
    }

    const seg = Math.ceil(tempoRestanteSeg);
    const min = Math.floor(seg / 60);
    const remSeg = seg % 60;
    el.lblCronometro.textContent = `${String(min).padStart(2, '0')}:${String(remSeg).padStart(2, '0')}`;

    if (seg <= 30) {
      el.lblCronometro.classList.add('danger');
    } else if (seg <= 120) {
      el.lblCronometro.classList.add('warning');
    }
  }

  function alternarPausa() {
    if (!jogoAtivo || jogoEncerrado) return;
    jogoPausado = !jogoPausado;
    ultimoTickMs = performance.now();

    if (jogoPausado) {
      el.btnPausar.innerHTML = '▶️ Continuar';
      el.inputPais.disabled = true;
      el.pauseOverlay.classList.remove('hidden');
    } else {
      el.btnPausar.innerHTML = '⏸️ Pausar';
      el.inputPais.disabled = false;
      el.pauseOverlay.classList.add('hidden');
      el.inputPais.focus();
    }
  }

  // =========================================================================
  // DIGITAÇÃO INTELIGENTE COM PROTEÇÃO AUTOMÁTICA DE PREFIXOS (TEMPO DE FOLGA)
  // =========================================================================
  function buscarPaisPorTexto(texto) {
    const norm = normalizarTexto(texto);
    if (!norm) return null;
    if (indiceNomes.has(norm)) return indiceNomes.get(norm);

    const normSp = normalizarSemPreposicoes(texto);
    if (normSp && indiceSemPrep.has(normSp)) return indiceSemPrep.get(normSp);
    return null;
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
    if (!jogoAtivo || jogoPausado || jogoEncerrado) return;

    const texto = el.inputPais.value;
    const norm = normalizarTexto(texto);
    if (!norm) return;

    const codigo = buscarPaisPorTexto(texto);
    if (!codigo || !paisesEscopo.has(codigo)) return;

    if (paisesAcertados.has(codigo)) {
      definirFeedback(
        `ℹ️ <strong>${PAISES[codigo].nome}</strong> já foi acertado!`,
        'info'
      );
      return;
    }

    // Proteção automática contra prefixos ambíguos (ex: Guiné vs Guiné-Bissau, Níger vs Nigéria)
    if (existeOutroPaisFaltanteComPrefixo(norm, codigo)) {
      const nomeOficial = PAISES[codigo].nome;
      definirFeedback(
        `⏳ <strong>${nomeOficial}</strong> reconhecido — confirmando automaticamente após breve pausa (ou continue digitando)...`,
        'warning'
      );

      // Reinicia animação da barrinha de tempo de folga
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

    const codigo = buscarPaisPorTexto(texto);
    if (!codigo) {
      definirFeedback(`❌ "${texto}" não foi reconhecido como um país válido.`, 'danger');
      piscarInput('flash-error');
      return;
    }

    if (!paisesEscopo.has(codigo)) {
      const d = PAISES[codigo];
      definirFeedback(
        `ℹ️ <strong>${d.nome}</strong> fica na região <strong>${d.continente}</strong> (fora do modo atual).`,
        'warning'
      );
      return;
    }

    if (paisesAcertados.has(codigo)) {
      definirFeedback(`ℹ️ Você já acertou <strong>${PAISES[codigo].nome}</strong>!`, 'info');
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

    definirFeedback(
      `✅ Acertou: <strong>${dados.nome}</strong> (${dados.continente}) — Faltam ${restantes}!`,
      'success'
    );

    atualizarEstiloPais(codigo, true);
    atualizarVisibilidadeRotulos();
    atualizarPlacarEProgresso();
    if (paisSelecionado === codigo) {
      atualizarCardInspecao();
    }
    atualizarListaPaises();

    if (paisesAcertados.size === paisesEscopo.size) {
      finalizarVitoria();
    }
  }

  function piscarInput(classe) {
    el.inputPais.classList.remove('flash-success', 'flash-error');
    void el.inputPais.offsetWidth;
    el.inputPais.classList.add(classe);
    setTimeout(() => el.inputPais.classList.remove(classe), 380);
  }

  function definirFeedback(html, tipo = 'info') {
    el.lblFeedback.className = `feedback-banner ${tipo}`;
    el.lblFeedback.innerHTML = html;
  }

  // =========================================================================
  // FIM DE JOGO (TEMPO ESGOTADO -> VERMELHO / VITÓRIA -> 100% VERDE)
  // =========================================================================
  function finalizarPorTempoEsgotado(manual = false) {
    cancelarTimerPrefixo();
    pararLoopCronometro();

    jogoAtivo = false;
    jogoEncerrado = true;
    jogoPausado = false;
    el.pauseOverlay.classList.add('hidden');

    // Todos os países do escopo que não foram adivinhados ficam VERMELHOS
    paisesPerdidos = new Set(
      [...paisesEscopo].filter((cod) => !paisesAcertados.has(cod))
    );

    el.inputPais.disabled = true;
    el.btnIniciar.disabled = false;
    el.btnIniciar.innerHTML = '▶️ Jogar Novamente';
    el.btnPausar.disabled = true;
    el.btnDica.disabled = true;
    el.btnEncerrar.disabled = true;

    atualizarTodosEstilosMapa();
    atualizarVisibilidadeRotulos();
    atualizarCardInspecao();
    definirFiltroLista(paisesPerdidos.size > 0 ? 'vermelhos' : 'todos');

    const acertos = paisesAcertados.size;
    const total = paisesEscopo.size;
    const perc = total > 0 ? Math.round((acertos / total) * 100) : 0;
    const faltaram = paisesPerdidos.size;

    const motivo = manual ? 'Partida encerrada!' : '⏰ O tempo acabou!';
    definirFeedback(
      `${motivo} Acertados: <strong>${acertos}/${total} (${perc}%)</strong> em VERDE | Não adivinhados: <strong>${faltaram}</strong> em VERMELHO. Clique neles para explorar!`,
      'danger'
    );

    exibirModalFimDeJogo({
      icone: manual ? '🏳️' : '⏰',
      titulo: motivo,
      subtitulo: `Região: ${modoAtual}`,
      acertos,
      faltaram,
      perc,
    });
  }

  function finalizarVitoria() {
    cancelarTimerPrefixo();
    pararLoopCronometro();

    jogoAtivo = false;
    jogoEncerrado = true;

    el.inputPais.disabled = true;
    el.btnIniciar.disabled = false;
    el.btnIniciar.innerHTML = '▶️ Jogar Novamente';
    el.btnPausar.disabled = true;
    el.btnDica.disabled = true;
    el.btnEncerrar.disabled = true;

    const total = paisesEscopo.size;
    definirFeedback(
      `🏆 PARABÉNS! Você acertou todos os <strong>${total}</strong> países de <strong>${modoAtual}</strong>!`,
      'success'
    );

    exibirModalFimDeJogo({
      icone: '🏆',
      titulo: 'Vitória Completa!',
      subtitulo: `Você dominou 100% de ${modoAtual}!`,
      acertos: total,
      faltaram: 0,
      perc: 100,
    });
  }

  function exibirModalFimDeJogo({ icone, titulo, subtitulo, acertos, faltaram, perc }) {
    el.modalIcon.textContent = icone;
    el.modalTitle.textContent = titulo;
    el.modalSubtitle.textContent = subtitulo;
    el.modalAcertos.textContent = acertos;
    el.modalFaltaram.textContent = faltaram;
    el.modalPrecisao.textContent = `${perc}%`;
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
  // PLACAR, CONTINENTES, INSPEÇÃO E DICAS
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
      row.addEventListener('click', () => enquadrarContinente(cont, true));
      el.continentsList.appendChild(row);
    }
  }

  function atualizarPlacarEProgresso() {
    const acertos = paisesAcertados.size;
    const total = paisesEscopo.size;
    const perc = total > 0 ? Math.round((acertos / total) * 100) : 0;

    el.lblPlacar.innerHTML = `${acertos} / ${total} <small>(${perc}%)</small>`;
    el.barraProgressoGeral.style.width = `${perc}%`;

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

      if (totC === 0) {
        lbl.textContent = '—';
        lbl.classList.remove('done');
        bar.style.width = '0%';
      } else {
        lbl.textContent = acC === totC ? `✅ ${acC}/${totC}` : `${acC}/${totC}`;
        lbl.classList.toggle('done', acC === totC);
        bar.style.width = `${Math.round((acC / totC) * 100)}%`;
      }
    }
  }

  function obterMascaraNome(codigo) {
    const nome = PAISES[codigo].nome;
    const qtdRevelada = revelacoesDica[codigo] || 0;
    const resultado = [];
    let totalLetras = 0;

    for (const ch of nome) {
      if (ch === ' ' || ch === '-') {
        resultado.push(ch);
      } else {
        totalLetras++;
        resultado.push(totalLetras <= qtdRevelada ? ch : '_');
      }
    }
    return { mascara: resultado.join(' '), totalLetras };
  }

  function selecionarPaisMapa(codigo) {
    const anterior = paisSelecionado;
    paisSelecionado = codigo;
    if (anterior) atualizarEstiloPais(anterior);
    if (codigo) atualizarEstiloPais(codigo);
    atualizarCardInspecao();
    if (jogoAtivo && !jogoPausado) {
      el.inputPais.focus();
    }
  }

  function atualizarCardInspecao() {
    if (!paisSelecionado || !PAISES[paisSelecionado]) {
      el.inspectTitle.textContent = 'Clique em qualquer país no mapa';
      el.inspectTitle.style.color = 'var(--text-main)';
      el.inspectDetails.textContent =
        'Clique num país misterioso para destacá-lo, ver quantas letras possui, consultar sua capital ou revelar letras!';
      return;
    }

    const dados = PAISES[paisSelecionado];
    if (paisesAcertados.has(paisSelecionado)) {
      el.inspectTitle.textContent = `✅ ${dados.nome}`;
      el.inspectTitle.style.color = 'var(--accent-green)';
      el.inspectDetails.textContent = `Continente: ${dados.continente}\nCapital: ${dados.capital}\nCódigo ISO: ${paisSelecionado}`;
    } else if (paisesPerdidos.has(paisSelecionado)) {
      el.inspectTitle.textContent = `❌ ${dados.nome} (Não adivinhado)`;
      el.inspectTitle.style.color = 'var(--accent-red)';
      el.inspectDetails.textContent = `Continente: ${dados.continente}\nCapital: ${dados.capital}\nCódigo ISO: ${paisSelecionado}`;
    } else {
      const { mascara, totalLetras } = obterMascaraNome(paisSelecionado);
      const capTxt = capitalRevelada.has(paisSelecionado)
        ? dados.capital
        : "Oculta (clique em 'Ver Capital')";
      el.inspectTitle.textContent = `❓ País Selecionado (${totalLetras} letras)`;
      el.inspectTitle.style.color = 'var(--accent-gold)';
      el.inspectDetails.textContent = `Continente: ${dados.continente}\nCapital: ${capTxt}\nNome:  ${mascara}`;
    }
  }

  function revelarCapitalSelecionado() {
    if (!jogoAtivo || jogoPausado || jogoEncerrado) {
      definirFeedback("ℹ️ Clique em '▶️ Iniciar Jogo' antes de pedir dicas!", 'warning');
      return;
    }
    if (!paisSelecionado || !paisesEscopo.has(paisSelecionado)) {
      pedirDicaGeral();
      return;
    }
    capitalRevelada.add(paisSelecionado);
    atualizarCardInspecao();
    el.inputPais.focus();
  }

  function revelarLetraSelecionado() {
    if (!jogoAtivo || jogoPausado || jogoEncerrado) {
      definirFeedback("ℹ️ Clique em '▶️ Iniciar Jogo' antes de pedir dicas!", 'warning');
      return;
    }
    if (!paisSelecionado || !paisesEscopo.has(paisSelecionado)) {
      pedirDicaGeral();
      return;
    }
    if (paisesAcertados.has(paisSelecionado) || paisesPerdidos.has(paisSelecionado)) return;
    revelacoesDica[paisSelecionado] = (revelacoesDica[paisSelecionado] || 0) + 1;
    atualizarCardInspecao();
    el.inputPais.focus();
  }

  function pedirDicaGeral() {
    if (!jogoAtivo || jogoPausado || jogoEncerrado) return;
    const faltantes = [...paisesEscopo].filter((c) => !paisesAcertados.has(c));
    if (!faltantes.length) return;

    if (!paisSelecionado || !faltantes.includes(paisSelecionado)) {
      const sorteado = faltantes[Math.floor(Math.random() * faltantes.length)];
      selecionarPaisMapa(sorteado);
      focarNoPais(sorteado);
    }

    const cod = paisSelecionado;
    capitalRevelada.add(cod);
    revelacoesDica[cod] = Math.max(1, (revelacoesDica[cod] || 0) + 1);
    atualizarCardInspecao();

    const dados = PAISES[cod];
    const { mascara } = obterMascaraNome(cod);
    definirFeedback(
      `💡 Dica (${dados.continente}): Capital = <strong>${dados.capital}</strong> &nbsp;|&nbsp; Letras: <strong>${mascara}</strong>`,
      'warning'
    );
    el.inputPais.focus();
  }

  // =========================================================================
  // LISTA LATERAL DE PAÍSES (FILTROS E BUSCA)
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
        normalizarTexto(d.continente).includes(busca) ||
        normalizarTexto(d.capital).includes(busca)
      );
    });

    if (jogoEncerrado) {
      el.lblListaTitulo.textContent = `📋 PAÍSES (${paisesAcertados.size} ✅ | ${paisesPerdidos.size} ❌)`;
    } else {
      el.lblListaTitulo.textContent = `✅ PAÍSES ACERTADOS (${paisesAcertados.size})`;
    }

    if (!filtrados.length) {
      const li = document.createElement('li');
      li.className = 'empty-list-msg';
      li.textContent = jogoEncerrado
        ? 'Nenhum país encontrado para este filtro.'
        : 'Os países acertados aparecerão aqui. Clique em qualquer um na lista para dar zoom nele no mapa!';
      el.ulListaPaises.appendChild(li);
      return;
    }

    for (const { codigo, acertado } of filtrados) {
      const d = PAISES[codigo];
      const li = document.createElement('li');
      li.className = `country-li ${acertado ? 'li-guessed' : 'li-missed'}`;
      li.innerHTML = `
        <span>${acertado ? '✅' : '❌'} ${d.nome}</span>
        <small>${d.continente}</small>
      `;
      li.addEventListener('click', () => {
        selecionarPaisMapa(codigo);
        focarNoPais(codigo);
      });
      el.ulListaPaises.appendChild(li);
    }
  }

  // =========================================================================
  // EVENTOS DO MOUSE NO MAPA E CONTROLES DE INTERFACE
  // =========================================================================
  function atualizarTooltipMapa(e) {
    const target = e.target;
    const codigo = target.dataset ? target.dataset.code : null;
    const neutralName = target.dataset ? target.dataset.neutralName : null;

    if (!codigo && !neutralName) {
      el.mapTooltip.classList.add('hidden');
      return;
    }

    let html = '';
    let borderColor = 'var(--accent-blue)';

    if (neutralName) {
      html = `🏳️ ${neutralName} <small>(Território não-soberano)</small>`;
      borderColor = '#64748b';
    } else if (!paisesEscopo.has(codigo)) {
      html = `Fora da região atual (${PAISES[codigo].continente})`;
      borderColor = '#475569';
    } else if (paisesAcertados.has(codigo)) {
      const d = PAISES[codigo];
      html = `✅ <strong>${d.nome}</strong> &nbsp;•&nbsp; Capital: ${d.capital}`;
      borderColor = 'var(--accent-green)';
    } else if (paisesPerdidos.has(codigo)) {
      const d = PAISES[codigo];
      html = `❌ <strong>${d.nome}</strong> &nbsp;•&nbsp; Capital: ${d.capital}`;
      borderColor = 'var(--accent-red)';
    } else {
      const d = PAISES[codigo];
      const { mascara, totalLetras } = obterMascaraNome(codigo);
      if ((revelacoesDica[codigo] || 0) > 0 || capitalRevelada.has(codigo)) {
        const capInfo = capitalRevelada.has(codigo) ? ` | Cap: ${d.capital}` : '';
        html = `❓ <strong>${mascara}</strong> (${totalLetras} letras${capInfo})`;
      } else {
        html = `❓ País misterioso (${d.continente}, ${totalLetras} letras) — Clique para inspecionar`;
      }
      borderColor = codigo === paisSelecionado ? 'var(--accent-gold)' : 'var(--accent-blue)';
    }

    el.mapTooltip.innerHTML = html;
    el.mapTooltip.style.borderColor = borderColor;
    el.mapTooltip.classList.remove('hidden');

    const rect = el.mapViewport.getBoundingClientRect();
    let tx = e.clientX - rect.left + 16;
    let ty = e.clientY - rect.top + 16;

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
    el.selectModo.addEventListener('change', prepararPartida);
    el.selectTempo.addEventListener('change', prepararPartida);

    el.btnIniciar.addEventListener('click', iniciarNovoJogo);
    el.btnResetar.addEventListener('click', prepararPartida);
    el.btnPausar.addEventListener('click', alternarPausa);
    el.btnRetomarOverlay.addEventListener('click', alternarPausa);
    el.btnDica.addEventListener('click', pedirDicaGeral);

    el.btnEncerrar.addEventListener('click', () => {
      if (jogoEncerrado) return;
      const faltam = paisesEscopo.size - paisesAcertados.size;
      if (
        faltam === 0 ||
        window.confirm(
          `Ainda faltam ${faltam} países.\n\nDeseja encerrar o tempo agora e destacar em VERMELHO todos os países que não foram adivinhados?`
        )
      ) {
        finalizarPorTempoEsgotado(true);
      }
    });

    el.inputPais.addEventListener('input', aoDigitarInput);
    el.inputPais.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        aoPressionarEnterInput();
      } else if (e.key === 'Escape') {
        cancelarTimerPrefixo();
        el.inputPais.value = '';
      }
    });

    // Atalho global F1 para dica e redirecionamento de digitação
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F1') {
        e.preventDefault();
        pedirDicaGeral();
      }
    });

    // Controles de câmera da barra do mapa
    el.btnZoomIn.addEventListener('click', () => aplicarZoomCentro(1.35));
    el.btnZoomOut.addEventListener('click', () => aplicarZoomCentro(1 / 1.35));
    el.btnZoomReset.addEventListener('click', () => enquadrarContinente(modoAtual, true));

    document.querySelectorAll('.pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => enquadrarContinente(btn.dataset.continent, true));
    });

    el.chkIlhas.addEventListener('change', atualizarVisibilidadePinos);
    el.chkNomes.addEventListener('change', atualizarVisibilidadeRotulos);

    // Botões do card de inspeção
    el.btnDicaCapital.addEventListener('click', revelarCapitalSelecionado);
    el.btnDicaLetra.addEventListener('click', revelarLetraSelecionado);
    el.btnZoomSelecionado.addEventListener('click', () => {
      if (paisSelecionado) focarNoPais(paisSelecionado);
    });

    // Abas e busca da lista lateral
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => definirFiltroLista(btn.dataset.filter));
    });
    el.inputBuscaLista.addEventListener('input', atualizarListaPaises);

    // Eventos do Modal de Fim de Jogo
    el.btnModalExplorar.addEventListener('click', () => {
      el.endgameModal.classList.add('hidden');
    });
    el.btnModalJogarNovamente.addEventListener('click', () => {
      el.endgameModal.classList.add('hidden');
      iniciarNovoJogo();
    });

    // Interações de Pan, Zoom e Clique no Mapa SVG
    el.mapViewport.addEventListener('mousedown', (e) => {
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

    window.addEventListener('mousemove', (e) => {
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

    window.addEventListener('mouseup', (e) => {
      if (!arrastandoMapa) return;
      arrastandoMapa = false;
      el.mapViewport.classList.remove('dragging');

      if (!moveuDuranteClique) {
        const cod = e.target && e.target.dataset ? e.target.dataset.code : null;
        if (cod) {
          if (paisesEscopo.has(cod)) {
            selecionarPaisMapa(cod);
          } else {
            definirFeedback(
              `ℹ️ Esse país pertence à região <strong>${PAISES[cod].continente}</strong> (fora do modo atual).`,
              'info'
            );
          }
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
      enquadrarContinente(modoAtual, false);
    });
  }

  document.addEventListener('DOMContentLoaded', inicializarApp);
})();

