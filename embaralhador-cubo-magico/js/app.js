// ============================================================================
// WCA FACE DEFINITIONS & METADATA
// ============================================================================
function initApp() {
  const THREE = window.THREE;
  const TrackballControls = window.TrackballControls;

  // Os movimentos são sempre descritos pela POSIÇÃO em relação a quem segura o
  // cubo (cima, frente, direita…), nunca pela cor: a cor de uma face muda quando
  // as peças se movem (no 2×2 nem existe centro fixo). `hex` serve só para pintar
  // o cubo resolvido no início.
  // `clockwise` / `counter` traduzem o giro para linguagem simples, olhando o
  // cubo de frente na posição de referência (ex.: R = camada da direita para cima).
  const FACES = {
    U: {
      axis: 'y',
      sign: 1,
      layer: 'de cima',
      hex: '#ffd500',
      clockwise: 'para a esquerda',
      counter: 'para a direita',
      normal: new THREE.Vector3(0, 1, 0)
    },
    D: {
      axis: 'y',
      sign: -1,
      layer: 'de baixo',
      hex: '#ffffff',
      clockwise: 'para a direita',
      counter: 'para a esquerda',
      normal: new THREE.Vector3(0, -1, 0)
    },
    F: {
      axis: 'z',
      sign: 1,
      layer: 'da frente',
      hex: '#0046ad',
      clockwise: 'no sentido horário',
      counter: 'no sentido anti-horário',
      normal: new THREE.Vector3(0, 0, 1)
    },
    B: {
      axis: 'z',
      sign: -1,
      layer: 'de trás',
      hex: '#009b48',
      clockwise: 'no sentido anti-horário',
      counter: 'no sentido horário',
      viewNote: ', olhando o cubo de frente',
      normal: new THREE.Vector3(0, 0, -1)
    },
    R: {
      axis: 'x',
      sign: 1,
      layer: 'da direita',
      hex: '#b71234',
      clockwise: 'para cima',
      counter: 'para baixo',
      normal: new THREE.Vector3(1, 0, 0)
    },
    L: {
      axis: 'x',
      sign: -1,
      layer: 'da esquerda',
      hex: '#ff5800',
      clockwise: 'para baixo',
      counter: 'para cima',
      normal: new THREE.Vector3(-1, 0, 0)
    }
  };

  function parseMove(moveStr) {
    if (!moveStr) return null;
    const clean = moveStr.trim();
    if (!clean) return null;
    const faceKey = clean[0].toUpperCase();
    const modifier = clean.slice(1);
    const face = FACES[faceKey];
    if (!face || !['', "'", '2'].includes(modifier)) return null;

    let turns = 1;
    let title = `Camada ${face.layer} ${face.clockwise}`;
    let description = `Um quarto de volta (90°)${face.viewNote || ''}.`;

    if (modifier === "'") {
      turns = -1;
      title = `Camada ${face.layer} ${face.counter}`;
    } else if (modifier === '2') {
      turns = 2;
      title = `Camada ${face.layer}, meia volta`;
      description = 'Meia volta (180°), para qualquer lado.';
    }

    const angleRad = -face.sign * turns * (Math.PI / 2);

    return {
      notation: `${faceKey}${modifier}`,
      faceKey,
      modifier,
      face,
      turns,
      angleRad,
      title,
      description
    };
  }

  // Posição de referência: a vista em que as letras correspondem a quem segura o
  // cubo (cima = U, frente = F, direita = R). A vista 3D pode ser girada à vontade,
  // mas as letras nunca mudam; o botão "Voltar à referência" restaura esta vista.
  const REFERENCE_DIR = new THREE.Vector3(4.8, 3.9, 5.6).normalize();
  const REFERENCE_DISTANCE = Math.hypot(4.8, 3.9, 5.6);
  const WORLD_UP = new THREE.Vector3(0, 1, 0);

  // Faces que ficam escondidas na posição de referência: a seta delas é tracejada.
  const HIDDEN_FACES = ['L', 'D', 'B'];

  // Pontos do arco da seta de um movimento, usados pela seta 3D e pelo diagrama.
  // O arco é centrado no lado da camada voltado para a vista de referência, para
  // a seta aparecer de lado (legível) em vez de apontar para longe de quem olha.
  function arrowArcPoints(parsed, radius, dist, segments) {
    const { face, angleRad, turns } = parsed;
    const axisVec = new THREE.Vector3(
      face.axis === 'x' ? 1 : 0,
      face.axis === 'y' ? 1 : 0,
      face.axis === 'z' ? 1 : 0
    );
    const perp = REFERENCE_DIR.clone().projectOnPlane(axisVec).normalize().multiplyScalar(radius);
    const sweep = Math.abs(turns) === 2 ? angleRad * 0.85 : angleRad * 1.15;
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments - 0.5;
      points.push(
        perp.clone().applyAxisAngle(axisVec, sweep * t).addScaledVector(face.normal, dist)
      );
    }
    return points;
  }

  // Desenho isométrico do cubo sempre na posição de referência (cima, frente e
  // direita visíveis), com a camada que gira destacada e a seta da direção.
  // Não usa as cores dos adesivos de propósito: só a posição importa.
  function buildMoveDiagram(parsed, n) {
    // Projeção isométrica de coordenadas normalizadas (-1..1) para o viewBox 40×40
    const P = (x, y, z) => [20 + 7 * (x - z), 20 + 4 * (x + z) - 8 * y];
    const fmt = ([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`;
    const poly = (pts) => pts.map((p) => fmt(P(...p))).join(' ');

    const cell = 2 / n;
    const gap = cell * 0.09;
    const inLayer = (c) => !!parsed && c[parsed.face.axis] * parsed.face.sign > 1 - cell;
    const sticker = (pts, center) =>
      `<polygon class="sticker${inLayer(center) ? ' on' : ''}" points="${poly(pts)}"/>`;

    let svg = '';
    svg += `<polygon class="body" points="${poly([[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]])}"/>`;
    svg += `<polygon class="body" points="${poly([[-1, 1, 1], [1, 1, 1], [1, -1, 1], [-1, -1, 1]])}"/>`;
    svg += `<polygon class="body" points="${poly([[1, 1, 1], [1, 1, -1], [1, -1, -1], [1, -1, 1]])}"/>`;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const a0 = -1 + i * cell + gap;
        const a1 = -1 + (i + 1) * cell - gap;
        const b0 = -1 + j * cell + gap;
        const b1 = -1 + (j + 1) * cell - gap;
        const am = (a0 + a1) / 2;
        const bm = (b0 + b1) / 2;
        // cima (y = 1)
        svg += sticker([[a0, 1, b0], [a1, 1, b0], [a1, 1, b1], [a0, 1, b1]], { x: am, y: 1, z: bm });
        // frente (z = 1)
        svg += sticker([[a0, b0, 1], [a1, b0, 1], [a1, b1, 1], [a0, b1, 1]], { x: am, y: bm, z: 1 });
        // direita (x = 1)
        svg += sticker([[1, b0, a0], [1, b0, a1], [1, b1, a1], [1, b1, a0]], { x: 1, y: bm, z: am });
      }
    }

    if (parsed) {
      // Mesmo arco da seta 3D, projetado no desenho
      const pts = arrowArcPoints(parsed, 0.78, 1.22, 24).map((v) => P(v.x, v.y, v.z));

      const d = pts.map((p, idx) => `${idx ? 'L' : 'M'}${fmt(p)}`).join(' ');
      const end = pts[pts.length - 1];
      const prev = pts[pts.length - 3];
      const len = Math.hypot(end[0] - prev[0], end[1] - prev[1]) || 1;
      const ux = (end[0] - prev[0]) / len;
      const uy = (end[1] - prev[1]) / len;
      const tip = [end[0] + ux * 3.2, end[1] + uy * 3.2];
      const left = [end[0] - ux * 0.8 - uy * 2.7, end[1] - uy * 0.8 + ux * 2.7];
      const right = [end[0] - ux * 0.8 + uy * 2.7, end[1] - uy * 0.8 - ux * 2.7];
      const hidden = HIDDEN_FACES.includes(parsed.faceKey) ? ' hidden-side' : '';

      svg += `<path class="arrow-halo" d="${d}"/>`;
      svg += `<path class="arrow${hidden}" d="${d}"/>`;
      svg += `<polygon class="arrow-head" points="${[tip, left, right].map(fmt).join(' ')}"/>`;
    }

    return `<svg viewBox="1 1 38 38" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`;
  }

  function invertMoveNotation(moveStr) {
    const clean = moveStr.trim();
    const faceKey = clean[0].toUpperCase();
    const mod = clean.slice(1);
    if (mod === "'") return faceKey;
    if (mod === '2') return `${faceKey}2`;
    return `${faceKey}'`;
  }

  const shell = window.CubeShell;

  // ==========================================================================
  // 3D RUBIK'S CUBE SIMULATOR
  // ==========================================================================
  class RubiksSimulator {
    constructor() {
      this.container = document.getElementById('canvas-container');
      this.cubeSize = shell.size;
      this.cubies = [];
      this.isAnimating = false;
      this.animationQueue = [];
      this.animationDuration = 340;

      this.scrambleMoves = [];
      this.currentStepIndex = 0;
      this.isPlaying = false;
      this.show3DLabels = true;

      this.initThree();
      this.initFaceLabels();
      this.buildCube(this.cubeSize);
      this.bindUI();
      this.createNewScramble(shell.scramble.slice());
      this.animate();
    }

    initThree() {
      this.scene = new THREE.Scene();

      const width = this.container.clientWidth || 800;
      const height = this.container.clientHeight || 600;

      this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
      this.resetCameraPosition(false);

      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.container.appendChild(this.renderer.domElement);

      // TrackballControls allows unrestricted 360° rotation in all axes
      this.controls = new TrackballControls(this.camera, this.renderer.domElement);
      this.controls.rotateSpeed = 3.2;
      this.controls.zoomSpeed = 1.2;
      this.controls.noPan = true;
      this.controls.staticMoving = false;
      this.controls.dynamicDampingFactor = 0.12;
      this.controls.minDistance = 4.2;
      this.controls.maxDistance = 14;

      // Balanced 360° lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.55);
      this.scene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
      keyLight.position.set(8, 12, 10);
      this.scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xffffff, 1.1);
      fillLight.position.set(-10, -12, -10);
      this.scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.65);
      rimLight.position.set(0, -10, 8);
      this.scene.add(rimLight);

      this.cubeGroup = new THREE.Group();
      this.scene.add(this.cubeGroup);

      this.pivotGroup = new THREE.Group();
      this.cubeGroup.add(this.pivotGroup);

      this.arrowGroup = new THREE.Group();
      this.scene.add(this.arrowGroup);

      window.addEventListener('resize', () => this.onResize());
    }

    update3DMoveIndicator() {
      while (this.arrowGroup.children.length > 0) {
        const child = this.arrowGroup.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
        this.arrowGroup.remove(child);
      }

      if (this.currentStepIndex >= this.scrambleMoves.length) return;

      const parsed = parseMove(this.scrambleMoves[this.currentStepIndex]);
      if (!parsed) return;

      const curvePoints = arrowArcPoints(parsed, 1.05, 1.72, 32);

      const curve = new THREE.CatmullRomCurve3(curvePoints);
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.06, 12, false);
      // Magenta: não existe em nenhum adesivo, então a seta nunca se confunde com uma face
      const arrowColor = 0xe0187a;
      // A seta é desenhada por cima do cubo para continuar visível quando a
      // camada está do lado escondido (L, B, D na vista inicial).
      const tubeMat = new THREE.MeshBasicMaterial({
        color: arrowColor,
        transparent: true,
        opacity: 0.9,
        depthTest: false
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      tubeMesh.renderOrder = 10;
      this.arrowGroup.add(tubeMesh);

      const endPoint = curvePoints[curvePoints.length - 1];
      const prevPoint = curvePoints[curvePoints.length - 3];
      const tangent = new THREE.Vector3().subVectors(endPoint, prevPoint).normalize();

      // Ponta plana, deitada no plano da camada: continua legível mesmo quando a
      // camada é vista em ângulo baixo (um cone viraria um círculo).
      const planeCenter = parsed.face.normal.clone().multiplyScalar(1.72);
      const radial = new THREE.Vector3().subVectors(endPoint, planeCenter).normalize();
      const tip = endPoint.clone().addScaledVector(tangent, 0.42);
      const baseA = endPoint.clone().addScaledVector(tangent, -0.04).addScaledVector(radial, 0.26);
      const baseB = endPoint.clone().addScaledVector(tangent, -0.04).addScaledVector(radial, -0.26);
      const headGeo = new THREE.BufferGeometry().setFromPoints([tip, baseA, baseB]);
      const headMat = new THREE.MeshBasicMaterial({
        color: arrowColor,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
        side: THREE.DoubleSide
      });
      const headMesh = new THREE.Mesh(headGeo, headMat);
      headMesh.renderOrder = 10;
      this.arrowGroup.add(headMesh);
    }

    initFaceLabels() {
      this.labelElements = {};
      const dist = 2.15;
      const labelSpecs = [
        { key: 'U', pos: new THREE.Vector3(0, dist, 0) },
        { key: 'D', pos: new THREE.Vector3(0, -dist, 0) },
        { key: 'F', pos: new THREE.Vector3(0, 0, dist) },
        { key: 'B', pos: new THREE.Vector3(0, 0, -dist) },
        { key: 'R', pos: new THREE.Vector3(dist, 0, 0) },
        { key: 'L', pos: new THREE.Vector3(-dist, 0, 0) }
      ];

      labelSpecs.forEach((spec) => {
        const el = document.createElement('div');
        el.className = 'face-3d-label';
        el.textContent = spec.key;
        this.container.appendChild(el);
        this.labelElements[spec.key] = { el, worldPos: spec.pos };
      });
    }

    updateFaceLabels() {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      const camDir = new THREE.Vector3();

      Object.entries(this.labelElements).forEach(([key, item]) => {
        if (!this.show3DLabels) {
          item.el.style.opacity = '0';
          return;
        }

        const projected = item.worldPos.clone().project(this.camera);
        const x = (projected.x * 0.5 + 0.5) * width;
        const y = (-projected.y * 0.5 + 0.5) * height;

        camDir.subVectors(this.camera.position, item.worldPos).normalize();
        const dot = FACES[key].normal.dot(camDir);
        const opacity = dot > 0 ? '0.88' : '0.18';

        item.el.style.left = `${x}px`;
        item.el.style.top = `${y}px`;
        item.el.style.opacity = opacity;
      });
    }

    resetCameraPosition(smooth = true) {
      // Em telas estreitas (celular em pé) a câmera se afasta para o cubo caber inteiro
      const fit = Math.max(1, 1.2 / (this.camera.aspect || 1));
      const targetPos = REFERENCE_DIR.clone().multiplyScalar(REFERENCE_DISTANCE * fit);
      const targetUp = WORLD_UP.clone();
      if (!smooth) {
        this.camera.position.copy(targetPos);
        this.camera.up.copy(targetUp);
        this.camera.lookAt(0, 0, 0);
        if (this.controls) this.controls.update();
        return;
      }

      const startPos = this.camera.position.clone();
      const startUp = this.camera.up.clone();
      const startTime = performance.now();
      const duration = 420;

      const tick = (now) => {
        const t = Math.min(1, (now - startTime) / duration);
        const ease = 1 - Math.pow(1 - t, 3);
        this.camera.position.lerpVectors(startPos, targetPos, ease);
        this.camera.up.lerpVectors(startUp, targetUp, ease).normalize();
        this.controls.target.set(0, 0, 0);
        this.controls.update();
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    createCubie(logicalX, logicalY, logicalZ, maxCoord, spacing) {
      const cubieGroup = new THREE.Group();

      const bodySize = spacing * 0.96;
      const bodyGeo = new THREE.BoxGeometry(bodySize, bodySize, bodySize);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x16181c,
        roughness: 0.32,
        metalness: 0.15
      });
      cubieGroup.add(new THREE.Mesh(bodyGeo, bodyMat));

      const stickerSize = bodySize * 0.85;
      const stickerThickness = 0.026;
      const offset = bodySize / 2 + stickerThickness / 2 - 0.004;

      const addSticker = (faceKey) => {
        const face = FACES[faceKey];
        const stickerGeo = new THREE.BoxGeometry(
          face.axis === 'x' ? stickerThickness : stickerSize,
          face.axis === 'y' ? stickerThickness : stickerSize,
          face.axis === 'z' ? stickerThickness : stickerSize
        );
        const stickerMat = new THREE.MeshStandardMaterial({
          color: face.hex,
          roughness: 0.16,
          metalness: 0.04
        });
        const sticker = new THREE.Mesh(stickerGeo, stickerMat);
        sticker.position.set(
          face.normal.x * offset,
          face.normal.y * offset,
          face.normal.z * offset
        );
        cubieGroup.add(sticker);
      };

      const eps = 0.01;
      if (Math.abs(logicalY - maxCoord) < eps) addSticker('U');
      if (Math.abs(logicalY + maxCoord) < eps) addSticker('D');
      if (Math.abs(logicalZ - maxCoord) < eps) addSticker('F');
      if (Math.abs(logicalZ + maxCoord) < eps) addSticker('B');
      if (Math.abs(logicalX - maxCoord) < eps) addSticker('R');
      if (Math.abs(logicalX + maxCoord) < eps) addSticker('L');

      cubieGroup.position.set(
        logicalX * spacing,
        logicalY * spacing,
        logicalZ * spacing
      );

      cubieGroup.userData = {
        logicalPos: new THREE.Vector3(logicalX, logicalY, logicalZ)
      };

      return cubieGroup;
    }

    buildCube(size) {
      this.cubeSize = size;
      // Remove as peças de onde estiverem (inclusive do pivô, se uma animação foi interrompida)
      this.cubies.forEach((c) => c.parent && c.parent.remove(c));
      this.pivotGroup.rotation.set(0, 0, 0);
      this.cubies = [];

      this.spacing = size === 3 ? 1.02 : 1.42;
      const coords = size === 3 ? [-1, 0, 1] : [-0.5, 0.5];
      const maxCoord = size === 3 ? 1 : 0.5;

      for (const x of coords) {
        for (const y of coords) {
          for (const z of coords) {
            const cubie = this.createCubie(x, y, z, maxCoord, this.spacing);
            this.cubeGroup.add(cubie);
            this.cubies.push(cubie);
          }
        }
      }
    }

    resetCubeToSolved() {
      this.animationQueue = [];
      this.isAnimating = false;
      this.animToken = (this.animToken || 0) + 1; // cancela animações em andamento
      this.buildCube(this.cubeSize);
    }

    applyMoveInstant(moveStr) {
      const parsed = parseMove(moveStr);
      if (!parsed) return;

      const { face, angleRad } = parsed;
      const axisVec = new THREE.Vector3(
        face.axis === 'x' ? 1 : 0,
        face.axis === 'y' ? 1 : 0,
        face.axis === 'z' ? 1 : 0
      );
      const rotQuat = new THREE.Quaternion().setFromAxisAngle(axisVec, angleRad);

      this.cubies.forEach((cubie) => {
        const lp = cubie.userData.logicalPos;
        if (lp[face.axis] * face.sign > 0.1) {
          lp.applyAxisAngle(axisVec, angleRad);
          lp.x = Math.round(lp.x * 2) / 2;
          lp.y = Math.round(lp.y * 2) / 2;
          lp.z = Math.round(lp.z * 2) / 2;

          cubie.position.set(
            lp.x * this.spacing,
            lp.y * this.spacing,
            lp.z * this.spacing
          );
          cubie.quaternion.premultiply(rotQuat);
        }
      });
    }

    animateMove(moveStr, duration = this.animationDuration, onComplete = null) {
      const parsed = parseMove(moveStr);
      if (!parsed) {
        if (onComplete) onComplete();
        return;
      }

      if (this.isAnimating) {
        this.animationQueue.push({ moveStr, duration, onComplete });
        return;
      }

      this.isAnimating = true;
      const { face, angleRad } = parsed;
      const axisVec = new THREE.Vector3(
        face.axis === 'x' ? 1 : 0,
        face.axis === 'y' ? 1 : 0,
        face.axis === 'z' ? 1 : 0
      );

      const activeCubies = this.cubies.filter(
        (c) => c.userData.logicalPos[face.axis] * face.sign > 0.1
      );

      this.pivotGroup.rotation.set(0, 0, 0);
      this.pivotGroup.position.set(0, 0, 0);
      activeCubies.forEach((c) => this.pivotGroup.attach(c));

      const startTime = performance.now();
      const token = this.animToken;

      const stepAnim = (now) => {
        if (token !== this.animToken) return;
        const t = Math.min(1, (now - startTime) / duration);
        const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        this.pivotGroup.rotation[face.axis] = angleRad * ease;

        if (t < 1) {
          requestAnimationFrame(stepAnim);
        } else {
          this.pivotGroup.rotation[face.axis] = angleRad;
          this.pivotGroup.updateMatrixWorld();

          activeCubies.forEach((cubie) => {
            this.cubeGroup.attach(cubie);
            const lp = cubie.userData.logicalPos;
            lp.applyAxisAngle(axisVec, angleRad);
            lp.x = Math.round(lp.x * 2) / 2;
            lp.y = Math.round(lp.y * 2) / 2;
            lp.z = Math.round(lp.z * 2) / 2;

            cubie.position.set(
              lp.x * this.spacing,
              lp.y * this.spacing,
              lp.z * this.spacing
            );
          });

          this.pivotGroup.rotation.set(0, 0, 0);
          this.isAnimating = false;

          if (onComplete) onComplete();

          if (this.animationQueue.length > 0) {
            const next = this.animationQueue.shift();
            this.animateMove(next.moveStr, next.duration, next.onComplete);
          }
        }
      };

      requestAnimationFrame(stepAnim);
    }

    // ========================================================================
    // SCRAMBLE & PLAYBACK
    // ========================================================================
    // Recebe sempre o embaralhamento compartilhado (shell.scramble)
    createNewScramble(moves) {
      this.stopAutoPlay();
      this.resetCubeToSolved();
      this.scrambleMoves = moves;
      this.currentStepIndex = 0;
      this.buildSequenceUI();
      this.renderScrambleUI();
    }

    stepForward() {
      if (this.isAnimating) return;
      if (this.currentStepIndex >= this.scrambleMoves.length) {
        this.stopAutoPlay();
        return;
      }

      const move = this.scrambleMoves[this.currentStepIndex];
      this.currentStepIndex++;
      this.renderScrambleUI();

      this.animateMove(move, this.animationDuration, () => {
        if (this.isPlaying) {
          if (this.currentStepIndex < this.scrambleMoves.length) {
            this.playTimer = setTimeout(() => this.stepForward(), 140);
          } else {
            this.stopAutoPlay();
          }
        }
      });
    }

    stepBackward() {
      if (this.isAnimating || this.currentStepIndex <= 0) return;
      this.stopAutoPlay();

      this.currentStepIndex--;
      const moveToUndo = this.scrambleMoves[this.currentStepIndex];
      const inverseMove = invertMoveNotation(moveToUndo);
      this.renderScrambleUI();

      this.animateMove(inverseMove, this.animationDuration);
    }

    jumpToStep(targetIndex) {
      this.stopAutoPlay();
      this.resetCubeToSolved();
      for (let i = 0; i < targetIndex; i++) {
        this.applyMoveInstant(this.scrambleMoves[i]);
      }
      this.currentStepIndex = targetIndex;
      this.renderScrambleUI();
    }

    toggleAutoPlay() {
      if (this.isPlaying) {
        this.stopAutoPlay();
        return;
      }

      if (this.currentStepIndex >= this.scrambleMoves.length) {
        this.jumpToStep(0);
      }

      this.isPlaying = true;
      this.updatePlayButtonUI();
      this.stepForward();
    }

    stopAutoPlay() {
      this.isPlaying = false;
      if (this.playTimer) {
        clearTimeout(this.playTimer);
        this.playTimer = null;
      }
      this.updatePlayButtonUI();
    }

    updatePlayButtonUI() {
      const label = document.getElementById('btn-play-label');
      if (!label) return;
      label.textContent = this.isPlaying ? 'Pausar' : 'Reproduzir tudo';
      document.getElementById('icon-play').hidden = this.isPlaying;
      document.getElementById('icon-pause').hidden = !this.isPlaying;
    }

    // Cria os botões da sequência uma vez por embaralhamento; depois só os estados mudam.
    buildSequenceUI() {
      const stepsGrid = document.getElementById('steps-grid');
      stepsGrid.innerHTML = '';
      this.stepChips = this.scrambleMoves.map((mv, idx) => {
        const parsed = parseMove(mv);
        const li = document.createElement('li');
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'step-chip';
        chip.setAttribute('aria-label', `Movimento ${idx + 1}: ${mv}, ${parsed.title.toLowerCase()}`);
        chip.innerHTML = `
          <span class="step-chip-meta" aria-hidden="true">${idx + 1}</span>
          <span class="step-chip-move" aria-hidden="true">${mv}</span>
        `;
        chip.addEventListener('click', () => this.jumpToStep(idx));
        li.appendChild(chip);
        stepsGrid.appendChild(li);
        return chip;
      });
    }

    renderScrambleUI() {
      const total = this.scrambleMoves.length;
      const current = this.currentStepIndex;
      const finished = current >= total;

      this.update3DMoveIndicator();

      // 1. Movimento atual
      const heroEl = document.querySelector('.move-hero');
      const diagramEl = document.getElementById('move-diagram');
      const notationEl = document.getElementById('move-notation');
      const stepEl = document.getElementById('move-step');
      const titleEl = document.getElementById('move-title');
      const descEl = document.getElementById('move-desc');

      if (!finished) {
        const nextMove = parseMove(this.scrambleMoves[current]);
        diagramEl.innerHTML = buildMoveDiagram(nextMove, this.cubeSize);
        notationEl.textContent = nextMove.notation;
        stepEl.textContent = `Passo ${current + 1} de ${total}`;
        titleEl.textContent = nextMove.title;
        descEl.textContent = nextMove.description;
      } else {
        diagramEl.innerHTML = buildMoveDiagram(null, this.cubeSize);
        notationEl.textContent = '✓';
        stepEl.textContent = `${total} de ${total} movimentos feitos`;
        titleEl.textContent = 'Pronto, cubo embaralhado';
        descEl.textContent = 'Confira se o seu cubo está igual ao da tela e cronometre a resolução.';
      }

      if (this.lastRenderedStep !== current) {
        heroEl.classList.remove('pop');
        void heroEl.offsetWidth; // reinicia a animação
        heroEl.classList.add('pop');
        this.lastRenderedStep = current;
      }

      // 2. Sequência
      (this.stepChips || []).forEach((chip, idx) => {
        chip.classList.toggle('done', idx < current);
        chip.classList.toggle('current', idx === current);
        if (idx === current) chip.setAttribute('aria-current', 'step');
        else chip.removeAttribute('aria-current');
      });

      // 3. Controles: no fim, o botão principal leva ao timer com o mesmo embaralhamento
      document.getElementById('btn-step-start').disabled = current === 0;
      document.getElementById('btn-step-prev').disabled = current === 0;
      document.getElementById('btn-step-end').disabled = finished;
      document.getElementById('btn-step-next-label').textContent = finished
        ? 'Resolver com o timer'
        : 'Próximo';
      document.getElementById('btn-step-next').classList.toggle('is-restart', finished);
    }

    bindUI() {
      // Cabeçalho e navegação ficam em js/views.js; aqui só reagimos aos eventos
      // A troca de tamanho vem seguida de um cube:scramble com o novo embaralhamento
      document.addEventListener('cube:size', (e) => {
        this.cubeSize = e.detail;
      });

      document.addEventListener('cube:scramble', (e) => {
        this.createNewScramble(e.detail);
      });

      document.addEventListener('cube:view', (e) => {
        if (e.detail === 'scramble') this.onResize();
        else this.stopAutoPlay();
      });

      // Pop-up "Como ler as letras": os mini cubos usam o mesmo desenho do
      // movimento atual, sempre 3×3 e na posição de referência.
      const notationDialog = document.getElementById('notation-dialog');
      document.getElementById('btn-notation-help').addEventListener('click', () => {
        if (!notationDialog.dataset.drawn) {
          notationDialog.querySelectorAll('[data-diagram]').forEach((el) => {
            el.innerHTML = buildMoveDiagram(parseMove(el.dataset.diagram), 3);
          });
          notationDialog.dataset.drawn = 'true';
        }
        this.stopAutoPlay();
        notationDialog.showModal();
      });
      // Clicar no fundo escuro fecha
      notationDialog.addEventListener('click', (e) => {
        if (e.target === notationDialog) notationDialog.close();
      });

      const copyBtn = document.getElementById('btn-copy-scramble');
      const copyLabel = copyBtn.querySelector('span');
      copyBtn.addEventListener('click', () => {
        const text = this.scrambleMoves.join(' ');
        const showResult = (msg, ok) => {
          copyLabel.textContent = msg;
          copyBtn.classList.toggle('is-confirmed', ok);
          clearTimeout(this.copyTimer);
          this.copyTimer = setTimeout(() => {
            copyLabel.textContent = 'Copiar notação';
            copyBtn.classList.remove('is-confirmed');
          }, 1600);
        };
        if (!navigator.clipboard) {
          showResult('Copie manualmente', false);
          return;
        }
        navigator.clipboard
          .writeText(text)
          .then(() => showResult('Notação copiada', true))
          .catch(() => showResult('Não foi possível copiar', false));
      });

      document.getElementById('btn-step-start').addEventListener('click', () => this.jumpToStep(0));
      document.getElementById('btn-step-prev').addEventListener('click', () => this.stepBackward());
      document.getElementById('btn-play-pause').addEventListener('click', () => this.toggleAutoPlay());
      document.getElementById('btn-step-next').addEventListener('click', () => {
        if (this.currentStepIndex >= this.scrambleMoves.length) {
          shell.go('timer'); // o timer já mostra este mesmo embaralhamento
          return;
        }
        this.stopAutoPlay();
        this.stepForward();
      });
      document.getElementById('btn-step-end').addEventListener('click', () => {
        this.jumpToStep(this.scrambleMoves.length);
      });

      const speedSlider = document.getElementById('speed-slider');
      const speedValue = document.getElementById('speed-value');
      speedSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.animationDuration = Math.round(350 / val);
        speedValue.textContent = `${val.toFixed(1).replace('.', ',')}×`;
      });

      document.getElementById('btn-reset-camera').addEventListener('click', () => {
        this.resetCameraPosition(true);
      });

      const toggleLabelsBtn = document.getElementById('btn-toggle-labels');
      toggleLabelsBtn.addEventListener('click', () => {
        this.show3DLabels = !this.show3DLabels;
        toggleLabelsBtn.setAttribute('aria-pressed', String(this.show3DLabels));
      });

      // Depois de um clique com o mouse, tira o foco do botão para que a barra de
      // espaço continue controlando a reprodução.
      document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (btn && e.detail > 0) btn.blur();
      });

      if (window.matchMedia('(pointer: coarse)').matches) {
        document.getElementById('viewport-hint').textContent =
          'Arraste para girar o cubo. Use dois dedos para aproximar.';
      }

      window.addEventListener('keydown', (e) => {
        if (shell.view !== 'scramble') return; // o timer usa o teclado do seu jeito
        if (document.querySelector('dialog[open]')) return; // pop-up aberto
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        // Espaço num botão focado deve acionar aquele botão, não o "Reproduzir"
        if (e.code === 'Space' && (tag === 'BUTTON' || tag === 'SUMMARY')) return;
        if (e.code === 'ArrowRight') {
          e.preventDefault();
          this.stopAutoPlay();
          this.stepForward();
        } else if (e.code === 'ArrowLeft') {
          e.preventDefault();
          this.stepBackward();
        } else if (e.code === 'Space') {
          e.preventDefault();
          this.toggleAutoPlay();
        }
      });
    }

    onResize() {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      if (!width || !height) return;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      if (this.controls && this.controls.handleResize) {
        this.controls.handleResize();
      }
    }

    // Avisa quando a vista 3D saiu da posição de referência (direção ou rolagem).
    // O zoom não importa: aproximar não muda qual face é qual.
    updateReferenceStatus() {
      const dirOff = this.camera.position.clone().normalize().angleTo(REFERENCE_DIR) > 0.14;
      const rollOff = this.camera.up.angleTo(WORLD_UP) > 0.2;
      const off = dirOff || rollOff;
      if (off === this.viewOffReference) return;
      this.viewOffReference = off;
      document.getElementById('view-status').hidden = !off;
      document.getElementById('btn-reset-camera').classList.toggle('is-alert', off);
    }

    animate() {
      requestAnimationFrame(() => this.animate());
      if (shell.view !== 'scramble') return; // seção escondida: economiza bateria
      this.controls.update();
      this.updateFaceLabels();
      this.updateReferenceStatus();
      this.renderer.render(this.scene, this.camera);
    }
  }

  window.simulator = new RubiksSimulator();
}

if (window.THREE && window.TrackballControls) {
  initApp();
} else {
  window.addEventListener('three-ready', initApp, { once: true });
}
