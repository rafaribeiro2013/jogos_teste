// ============================================================================
// WCA FACE DEFINITIONS & METADATA
// ============================================================================
function initApp() {
  const THREE = window.THREE;
  const TrackballControls = window.TrackballControls;

  const FACES = {
    U: {
      axis: 'y',
      sign: 1,
      name: 'Topo',
      colorName: 'Branca',
      hex: '#ffffff',
      badgeText: '#090d16',
      normal: new THREE.Vector3(0, 1, 0)
    },
    D: {
      axis: 'y',
      sign: -1,
      name: 'Base',
      colorName: 'Amarela',
      hex: '#ffd500',
      badgeText: '#090d16',
      normal: new THREE.Vector3(0, -1, 0)
    },
    F: {
      axis: 'z',
      sign: 1,
      name: 'Frente',
      colorName: 'Verde',
      hex: '#009b48',
      badgeText: '#ffffff',
      normal: new THREE.Vector3(0, 0, 1)
    },
    B: {
      axis: 'z',
      sign: -1,
      name: 'Trás',
      colorName: 'Azul',
      hex: '#0046ad',
      badgeText: '#ffffff',
      normal: new THREE.Vector3(0, 0, -1)
    },
    R: {
      axis: 'x',
      sign: 1,
      name: 'Direita',
      colorName: 'Vermelha',
      hex: '#b71234',
      badgeText: '#ffffff',
      normal: new THREE.Vector3(1, 0, 0)
    },
    L: {
      axis: 'x',
      sign: -1,
      name: 'Esquerda',
      colorName: 'Laranja',
      hex: '#ff5800',
      badgeText: '#ffffff',
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
    let directionDesc = 'Giro de 90° no sentido horário';

    if (modifier === "'") {
      turns = -1;
      directionDesc = 'Giro de 90° no sentido anti-horário';
    } else if (modifier === '2') {
      turns = 2;
      directionDesc = 'Giro duplo de 180°';
    }

    const angleRad = -face.sign * turns * (Math.PI / 2);

    return {
      notation: `${faceKey}${modifier}`,
      faceKey,
      modifier,
      face,
      turns,
      angleRad,
      title: `Face ${face.name} (${face.colorName})`,
      description: directionDesc
    };
  }

  function invertMoveNotation(moveStr) {
    const clean = moveStr.trim();
    const faceKey = clean[0].toUpperCase();
    const mod = clean.slice(1);
    if (mod === "'") return faceKey;
    if (mod === '2') return `${faceKey}2`;
    return `${faceKey}'`;
  }

  function generateScramble(cubeSize) {
    const allowedFaces = cubeSize === 2 ? ['U', 'R', 'F'] : ['U', 'D', 'R', 'L', 'F', 'B'];
    const modifiers = ['', "'", '2'];
    const length = cubeSize === 2 ? 11 : 20;

    const moves = [];
    let lastFace = null;
    let secondLastFace = null;

    for (let i = 0; i < length; i++) {
      let candidate;
      do {
        candidate = allowedFaces[Math.floor(Math.random() * allowedFaces.length)];
      } while (
        candidate === lastFace ||
        (secondLastFace &&
          candidate === secondLastFace &&
          FACES[candidate].axis === FACES[lastFace].axis)
      );

      const mod = modifiers[Math.floor(Math.random() * modifiers.length)];
      moves.push(`${candidate}${mod}`);

      secondLastFace = lastFace;
      lastFace = candidate;
    }

    return moves;
  }

  // ==========================================================================
  // 3D RUBIK'S CUBE SIMULATOR
  // ==========================================================================
  class RubiksSimulator {
    constructor() {
      this.container = document.getElementById('canvas-container');
      this.cubeSize = 3;
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
      this.createNewScramble();
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

      const { face, angleRad, turns } = parsed;
      const axisVec = new THREE.Vector3(
        face.axis === 'x' ? 1 : 0,
        face.axis === 'y' ? 1 : 0,
        face.axis === 'z' ? 1 : 0
      );

      const radius = 1.05;
      const perpVec =
        face.axis === 'y'
          ? new THREE.Vector3(0, 0, radius)
          : new THREE.Vector3(0, radius, 0);

      const faceDist = 1.72;
      const totalSweep = Math.abs(turns) === 2 ? angleRad * 0.85 : angleRad * 1.15;
      const segments = 32;
      const curvePoints = [];

      for (let i = 0; i <= segments; i++) {
        const t = i / segments - 0.5;
        const p = perpVec
          .clone()
          .applyAxisAngle(axisVec, totalSweep * t)
          .addScaledVector(face.normal, faceDist);
        curvePoints.push(p);
      }

      const curve = new THREE.CatmullRomCurve3(curvePoints);
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.06, 12, false);
      const arrowColor = Math.abs(turns) === 2 ? 0xf59e0b : 0x38bdf8;
      const tubeMat = new THREE.MeshBasicMaterial({
        color: arrowColor,
        transparent: true,
        opacity: 0.9
      });
      this.arrowGroup.add(new THREE.Mesh(tubeGeo, tubeMat));

      const endPoint = curvePoints[curvePoints.length - 1];
      const prevPoint = curvePoints[curvePoints.length - 3];
      const tangent = new THREE.Vector3().subVectors(endPoint, prevPoint).normalize();

      const coneGeo = new THREE.ConeGeometry(0.16, 0.34, 16);
      const coneMat = new THREE.MeshBasicMaterial({
        color: arrowColor,
        transparent: true,
        opacity: 0.95
      });
      const coneMesh = new THREE.Mesh(coneGeo, coneMat);
      coneMesh.position.copy(endPoint).addScaledVector(tangent, 0.1);
      coneMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      this.arrowGroup.add(coneMesh);
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
        el.innerHTML = `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${FACES[spec.key].hex};margin-right:5px;vertical-align:middle;"></span>${spec.key}`;
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
      const targetPos = new THREE.Vector3(4.8, 3.9, 5.6);
      const targetUp = new THREE.Vector3(0, 1, 0);
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
        color: 0x0f172a,
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
      this.cubies.forEach((c) => this.cubeGroup.remove(c));
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

      const stepAnim = (now) => {
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
    createNewScramble(customMoves = null) {
      this.stopAutoPlay();
      this.resetCubeToSolved();
      this.scrambleMoves = customMoves || generateScramble(this.cubeSize);
      this.currentStepIndex = 0;
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
      const playBtn = document.getElementById('btn-play-pause');
      if (!playBtn) return;
      playBtn.innerHTML = this.isPlaying ? '⏸ Pausar' : '▶ Reproduzir';
    }

    renderScrambleUI() {
      const total = this.scrambleMoves.length;
      const current = this.currentStepIndex;

      this.update3DMoveIndicator();

      // 1. Spotlight Card
      const symbolEl = document.getElementById('active-move-symbol');
      const stepLabelEl = document.getElementById('active-move-step-label');
      const titleEl = document.getElementById('active-move-title');
      const descEl = document.getElementById('active-move-desc');

      if (current < total) {
        const nextMove = parseMove(this.scrambleMoves[current]);
        symbolEl.textContent = nextMove.notation;
        symbolEl.style.background = nextMove.face.hex;
        symbolEl.style.color = nextMove.face.badgeText;
        stepLabelEl.textContent = `PASSO ${current + 1} DE ${total}`;
        titleEl.textContent = nextMove.title;
        descEl.textContent = nextMove.description;
      } else {
        symbolEl.textContent = '✓';
        symbolEl.style.background = '#22c55e';
        symbolEl.style.color = '#052e16';
        stepLabelEl.textContent = `CONCLUÍDO (${total}/${total})`;
        titleEl.textContent = 'Cubo Embaralhado!';
        descEl.textContent = 'Todos os movimentos foram aplicados.';
      }

      // 2. Progress Bar
      const progressFill = document.getElementById('progress-fill');
      if (progressFill) {
        const pct = total > 0 ? (current / total) * 100 : 0;
        progressFill.style.width = `${pct}%`;
      }

      // 3. Unified Steps Grid
      const stepsGrid = document.getElementById('steps-grid');
      stepsGrid.innerHTML = '';

      this.scrambleMoves.forEach((mv, idx) => {
        const chip = document.createElement('div');
        chip.className = 'step-chip';

        if (idx < current) chip.classList.add('done');
        else if (idx === current) chip.classList.add('current');

        chip.innerHTML = `
          <span class="step-chip-num">${idx + 1}</span>
          <span class="step-chip-move">${mv}</span>
        `;

        chip.title = `Ir para o passo ${idx + 1} (${mv})`;
        chip.addEventListener('click', () => this.jumpToStep(idx + 1));
        stepsGrid.appendChild(chip);
      });

      // 4. Playback Buttons State
      document.getElementById('btn-step-start').disabled = current === 0;
      document.getElementById('btn-step-prev').disabled = current === 0;
      document.getElementById('btn-step-next').disabled = current >= total;
      document.getElementById('btn-step-end').disabled = current >= total;
    }

    bindUI() {
      document.querySelectorAll('.cube-type-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const size = parseInt(btn.dataset.size, 10);
          if (size === this.cubeSize) return;

          document.querySelectorAll('.cube-type-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');

          this.cubeSize = size;
          this.createNewScramble();
        });
      });

      document.getElementById('btn-new-scramble').addEventListener('click', () => {
        this.createNewScramble();
      });

      const copyBtn = document.getElementById('btn-copy-scramble');
      copyBtn.addEventListener('click', () => {
        const text = this.scrambleMoves.join(' ');
        navigator.clipboard.writeText(text).then(() => {
          const orig = copyBtn.textContent;
          copyBtn.textContent = 'Copiado!';
          setTimeout(() => {
            copyBtn.textContent = orig;
          }, 1500);
        });
      });

      document.getElementById('btn-step-start').addEventListener('click', () => this.jumpToStep(0));
      document.getElementById('btn-step-prev').addEventListener('click', () => this.stepBackward());
      document.getElementById('btn-play-pause').addEventListener('click', () => this.toggleAutoPlay());
      document.getElementById('btn-step-next').addEventListener('click', () => {
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
        speedValue.textContent = `${val.toFixed(1)}x`;
      });

      document.getElementById('btn-reset-camera').addEventListener('click', () => {
        this.resetCameraPosition(true);
      });

      const toggleLabelsBtn = document.getElementById('btn-toggle-labels');
      toggleLabelsBtn.addEventListener('click', () => {
        this.show3DLabels = !this.show3DLabels;
        toggleLabelsBtn.textContent = this.show3DLabels ? 'Rótulos: ON' : 'Rótulos: OFF';
      });

      window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
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

    animate() {
      requestAnimationFrame(() => this.animate());
      this.controls.update();
      this.updateFaceLabels();
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
