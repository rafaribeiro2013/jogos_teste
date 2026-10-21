// ============================================================================
// WCA FACE DEFINITIONS & METADATA
// ============================================================================
function initApp() {
  const THREE = window.THREE;
  const OrbitControls = window.OrbitControls;

  const FACES = {
    U: {
      axis: 'y',
      sign: 1,
      name: 'Topo (Up)',
      colorName: 'Branco',
      hex: '#ffffff',
      badgeText: '#0f172a',
      normal: new THREE.Vector3(0, 1, 0)
    },
    D: {
      axis: 'y',
      sign: -1,
      name: 'Base (Down)',
      colorName: 'Amarelo',
      hex: '#ffd500',
      badgeText: '#0f172a',
      normal: new THREE.Vector3(0, -1, 0)
    },
    F: {
      axis: 'z',
      sign: 1,
      name: 'Frente (Front)',
      colorName: 'Verde',
      hex: '#009b48',
      badgeText: '#ffffff',
      normal: new THREE.Vector3(0, 0, 1)
    },
    B: {
      axis: 'z',
      sign: -1,
      name: 'Trás (Back)',
      colorName: 'Azul',
      hex: '#0046ad',
      badgeText: '#ffffff',
      normal: new THREE.Vector3(0, 0, -1)
    },
    R: {
      axis: 'x',
      sign: 1,
      name: 'Direita (Right)',
      colorName: 'Vermelho',
      hex: '#b71234',
      badgeText: '#ffffff',
      normal: new THREE.Vector3(1, 0, 0)
    },
    L: {
      axis: 'x',
      sign: -1,
      name: 'Esquerda (Left)',
      colorName: 'Laranja',
      hex: '#ff5800',
      badgeText: '#ffffff',
      normal: new THREE.Vector3(-1, 0, 0)
    }
  };

  // Parse move notation like "R", "U'", "F2"
  function parseMove(moveStr) {
    if (!moveStr) return null;
    const clean = moveStr.trim();
    if (!clean) return null;
    const faceKey = clean[0].toUpperCase();
    const modifier = clean.slice(1); // "", "'", or "2"
    const face = FACES[faceKey];
    if (!face || !['', "'", '2'].includes(modifier)) return null;

    let turns = 1; // +1 = 90° clockwise, -1 = 90° counter-clockwise, 2 = 180°
    let directionDesc = '90° no sentido horário';
    let shortDir = 'Horário (90°)';

    if (modifier === "'") {
      turns = -1;
      directionDesc = '90° no sentido anti-horário';
      shortDir = 'Anti-horário (90°)';
    } else if (modifier === '2') {
      turns = 2;
      directionDesc = 'Giro duplo de 180°';
      shortDir = 'Duplo (180°)';
    }

    // Angle in radians around the positive coordinate axis
    const angleRad = -face.sign * turns * (Math.PI / 2);

    return {
      notation: `${faceKey}${modifier}`,
      faceKey,
      modifier,
      face,
      turns,
      angleRad,
      title: `Face ${face.name} — ${face.colorName}`,
      description: `Gire a face ${face.name.toLowerCase()} (${face.colorName.toLowerCase()}) ${directionDesc}`,
      shortDir
    };
  }

  // Return the inverse move notation (e.g. R -> R', U' -> U, F2 -> F2)
  function invertMoveNotation(moveStr) {
    const clean = moveStr.trim();
    const faceKey = clean[0].toUpperCase();
    const mod = clean.slice(1);
    if (mod === "'") return faceKey;
    if (mod === '2') return `${faceKey}2`;
    return `${faceKey}'`;
  }

  // Generate WCA-style scramble
  function generateScramble(cubeSize) {
    // Official WCA 2x2 scrambles use U, R, F (11 moves) and 3x3 uses U, D, R, L, F, B (20 moves)
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
  // 3D RUBIK'S CUBE SIMULATOR CLASS
  // ==========================================================================
  class RubiksSimulator {
    constructor() {
      this.container = document.getElementById('canvas-container');
      this.cubeSize = 3; // 3 for 3x3, 2 for 2x2
      this.cubies = [];
      this.isAnimating = false;
      this.animationQueue = [];
      this.animationDuration = 340; // ms per move

      // Scramble state
      this.scrambleMoves = [];
      this.currentStepIndex = 0; // 0 = solved, scrambleMoves.length = fully scrambled
      this.isPlaying = false;
      this.show3DLabels = true;
      this.show3DArrow = true;

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

      // OrbitControls so the user can freely rotate and inspect the 3D cube
      this.controls = new OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.07;
      this.controls.enablePan = false;
      this.controls.minDistance = 4.2;
      this.controls.maxDistance = 14;

      // Studio Lighting for realistic glossy stickers & dark core plastic
      const ambientLight = new THREE.AmbientLight(0xffffff, 1.45);
      this.scene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
      keyLight.position.set(8, 12, 10);
      this.scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.8);
      fillLight.position.set(-10, -8, -8);
      this.scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0xffffff, 0.55);
      rimLight.position.set(0, -10, 8);
      this.scene.add(rimLight);

      // Root group for the cube
      this.cubeGroup = new THREE.Group();
      this.scene.add(this.cubeGroup);

      // Pivot group used during active face rotation
      this.pivotGroup = new THREE.Group();
      this.cubeGroup.add(this.pivotGroup);

      // 3D Directional Arrow Group for indicating the next move directly on the cube
      this.arrowGroup = new THREE.Group();
      this.scene.add(this.arrowGroup);

      // Subtle 3D floor shadow / ring
      const ringGeo = new THREE.RingGeometry(1.8, 2.6, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.08
      });
      this.floorRing = new THREE.Mesh(ringGeo, ringMat);
      this.floorRing.rotation.x = Math.PI / 2;
      this.floorRing.position.y = -2.55;
      this.scene.add(this.floorRing);

      window.addEventListener('resize', () => this.onResize());
    }

    // Build a 3D curved arrow hovering on the face of the next move
    update3DMoveIndicator() {
      // Clear previous children
      while (this.arrowGroup.children.length > 0) {
        const child = this.arrowGroup.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
        this.arrowGroup.remove(child);
      }

      if (!this.show3DArrow || this.currentStepIndex >= this.scrambleMoves.length) {
        return;
      }

      const parsed = parseMove(this.scrambleMoves[this.currentStepIndex]);
      if (!parsed) return;

      const { face, angleRad, turns } = parsed;
      const axisVec = new THREE.Vector3(
        face.axis === 'x' ? 1 : 0,
        face.axis === 'y' ? 1 : 0,
        face.axis === 'z' ? 1 : 0
      );

      // Pick a perpendicular radius vector on the face plane
      const radius = 1.05;
      let perpVec;
      if (face.axis === 'y') {
        perpVec = new THREE.Vector3(0, 0, radius);
      } else if (face.axis === 'x') {
        perpVec = new THREE.Vector3(0, radius, 0);
      } else {
        perpVec = new THREE.Vector3(0, radius, 0);
      }

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
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.065, 12, false);
      const arrowColor = Math.abs(turns) === 2 ? 0xf59e0b : 0x38bdf8;
      const tubeMat = new THREE.MeshBasicMaterial({
        color: arrowColor,
        transparent: true,
        opacity: 0.92
      });
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      this.arrowGroup.add(tubeMesh);

      // Cone arrowhead at the end of the curve
      const endPoint = curvePoints[curvePoints.length - 1];
      const prevPoint = curvePoints[curvePoints.length - 3];
      const tangent = new THREE.Vector3().subVectors(endPoint, prevPoint).normalize();

      const coneGeo = new THREE.ConeGeometry(0.17, 0.36, 16);
      const coneMat = new THREE.MeshBasicMaterial({
        color: arrowColor,
        transparent: true,
        opacity: 0.96
      });
      const coneMesh = new THREE.Mesh(coneGeo, coneMat);
      coneMesh.position.copy(endPoint).addScaledVector(tangent, 0.1);
      coneMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      this.arrowGroup.add(coneMesh);
    }

    initFaceLabels() {
      this.labelElements = {};
      const labelSpecs = [
        { key: 'U', text: 'U • Topo', pos: new THREE.Vector3(0, 2.25, 0) },
        { key: 'D', text: 'D • Base', pos: new THREE.Vector3(0, -2.25, 0) },
        { key: 'F', text: 'F • Frente', pos: new THREE.Vector3(0, 0, 2.25) },
        { key: 'B', text: 'B • Trás', pos: new THREE.Vector3(0, 0, -2.25) },
        { key: 'R', text: 'R • Direita', pos: new THREE.Vector3(2.25, 0, 0) },
        { key: 'L', text: 'L • Esquerda', pos: new THREE.Vector3(-2.25, 0, 0) }
      ];

      labelSpecs.forEach((spec) => {
        const el = document.createElement('div');
        el.className = 'face-3d-label';
        el.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${FACES[spec.key].hex};margin-right:5px;vertical-align:middle;"></span>${spec.text}`;
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

        // Fade slightly if the face is pointing away from the camera
        camDir.subVectors(this.camera.position, item.worldPos).normalize();
        const dot = FACES[key].normal.dot(camDir);
        const opacity = dot > -0.15 ? '0.92' : '0.25';

        item.el.style.left = `${x}px`;
        item.el.style.top = `${y}px`;
        item.el.style.opacity = opacity;
      });
    }

    resetCameraPosition(smooth = true) {
      // Standard ergonomic speedcubing view: Front (Green) + Up (White) + Right (Red) clearly visible
      const targetPos = new THREE.Vector3(4.8, 3.9, 5.6);
      if (!smooth) {
        this.camera.position.copy(targetPos);
        this.camera.lookAt(0, 0, 0);
        if (this.controls) this.controls.update();
        return;
      }

      const startPos = this.camera.position.clone();
      const startTime = performance.now();
      const duration = 420;

      const tick = (now) => {
        const t = Math.min(1, (now - startTime) / duration);
        const ease = 1 - Math.pow(1 - t, 3);
        this.camera.position.lerpVectors(startPos, targetPos, ease);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    // Create a single cubie mesh with dark plastic body + colored stickers
    createCubie(logicalX, logicalY, logicalZ, maxCoord, spacing) {
      const cubieGroup = new THREE.Group();

      const bodySize = spacing * 0.96;
      const bodyGeo = new THREE.BoxGeometry(bodySize, bodySize, bodySize);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.32,
        metalness: 0.15
      });
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      cubieGroup.add(bodyMesh);

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
        logicalPos: new THREE.Vector3(logicalX, logicalY, logicalZ),
        initialLogicalPos: new THREE.Vector3(logicalX, logicalY, logicalZ)
      };

      return cubieGroup;
    }

    buildCube(size) {
      this.cubeSize = size;
      // Clear existing cubies
      this.cubies.forEach((c) => this.cubeGroup.remove(c));
      this.cubies = [];

      // Keep total visual size consistent between 2x2 and 3x3
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

    // Reset cube immediately to solved state
    resetCubeToSolved() {
      this.animationQueue = [];
      this.isAnimating = false;
      this.buildCube(this.cubeSize);
    }

    // Apply a move immediately without animation (used for instant jumping to a step)
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

    // Animate a single move smoothly in 3D
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

      // Select cubies belonging to the active layer
      const activeCubies = this.cubies.filter(
        (c) => c.userData.logicalPos[face.axis] * face.sign > 0.1
      );

      this.pivotGroup.rotation.set(0, 0, 0);
      this.pivotGroup.position.set(0, 0, 0);
      activeCubies.forEach((c) => this.pivotGroup.attach(c));

      const startTime = performance.now();

      const stepAnim = (now) => {
        const t = Math.min(1, (now - startTime) / duration);
        // Cubic ease-in-out
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
    // SCRAMBLE & PLAYBACK LOGIC
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

    // ========================================================================
    // DOM & UI RENDERING
    // ========================================================================
    renderScrambleUI() {
      const total = this.scrambleMoves.length;
      const current = this.currentStepIndex;

      // Update 3D arrow indicator on the cube
      this.update3DMoveIndicator();

      // 1. Update Scramble Count Badge
      const countBadge = document.getElementById('scramble-count-badge');
      if (countBadge) {
        countBadge.textContent = `Cubo ${this.cubeSize}x${this.cubeSize} • ${total} Movimentos WCA`;
      }

      // 2. Render Top Scramble String Tokens
      const stringBox = document.getElementById('scramble-string-box');
      stringBox.innerHTML = '';
      this.scrambleMoves.forEach((mv, idx) => {
        const span = document.createElement('span');
        span.className = 'scramble-token';
        if (idx < current) {
          span.classList.add('done');
        } else if (idx === current) {
          span.classList.add('current');
        }
        span.textContent = mv;
        span.title = `Clique para ir até o passo ${idx + 1} (${mv})`;
        span.addEventListener('click', () => this.jumpToStep(idx + 1));
        stringBox.appendChild(span);
      });

      // 3. Progress bar & counter
      const progressText = document.getElementById('progress-text');
      const progressFill = document.getElementById('progress-fill');
      if (progressText) {
        progressText.textContent = `Progresso: ${current} / ${total} passos concluídos`;
      }
      if (progressFill) {
        const pct = total > 0 ? (current / total) * 100 : 0;
        progressFill.style.width = `${pct}%`;
      }

      // 4. Update Floating 3D Viewport Banner for Current/Next Move
      const bannerSymbol = document.getElementById('active-move-symbol');
      const bannerLabel = document.getElementById('active-move-step-label');
      const bannerDesc = document.getElementById('active-move-desc');

      if (current < total) {
        const nextMove = parseMove(this.scrambleMoves[current]);
        bannerSymbol.textContent = nextMove.notation;
        bannerSymbol.style.background = FACES[nextMove.faceKey].hex;
        bannerSymbol.style.color = FACES[nextMove.faceKey].badgeText;
        bannerSymbol.style.borderColor = 'rgba(255,255,255,0.35)';
        bannerLabel.textContent = `PRÓXIMO MOVIMENTO (PASSO ${current + 1} DE ${total})`;
        bannerDesc.textContent = nextMove.description;
      } else {
        bannerSymbol.textContent = '✓';
        bannerSymbol.style.background = '#22c55e';
        bannerSymbol.style.color = '#052e16';
        bannerLabel.textContent = `EMBARALHAMENTO CONCLUÍDO (${total}/${total})`;
        bannerDesc.textContent = 'O cubo 3D está 100% embaralhado conforme a sequência!';
      }

      // 5. Render Detailed Step-by-Step Cards
      const stepsContainer = document.getElementById('steps-list-container');
      stepsContainer.innerHTML = '';

      this.scrambleMoves.forEach((mv, idx) => {
        const parsed = parseMove(mv);
        const item = document.createElement('div');
        item.className = 'step-item';

        const isCompleted = idx < current;
        const isCurrent = idx === current;

        if (isCompleted) item.classList.add('completed');
        if (isCurrent) item.classList.add('active');

        item.innerHTML = `
          <span class="step-num">#${String(idx + 1).padStart(2, '0')}</span>
          <div class="step-notation-badge" style="background:${parsed.face.hex};color:${parsed.face.badgeText}">
            ${parsed.notation}
          </div>
          <div class="step-info">
            <div class="step-title">${parsed.title}</div>
            <div class="step-subtitle">${parsed.description}</div>
          </div>
          <div class="step-status-icon">
            ${isCompleted ? '✓ Feito' : isCurrent ? '▶ Agora' : 'Pendente'}
          </div>
        `;

        item.addEventListener('click', () => this.jumpToStep(idx + 1));
        stepsContainer.appendChild(item);

        if (isCurrent) {
          item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });

      // Enable/disable navigation buttons appropriately
      document.getElementById('btn-step-start').disabled = current === 0;
      document.getElementById('btn-step-prev').disabled = current === 0;
      document.getElementById('btn-step-next').disabled = current >= total;
      document.getElementById('btn-step-end').disabled = current >= total;
    }

    bindUI() {
      // Cube Type Selector (3x3 vs 2x2)
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

      // Generate New Scramble Button
      document.getElementById('btn-new-scramble').addEventListener('click', () => {
        this.createNewScramble();
      });

      // Copy Scramble to Clipboard
      const copyBtn = document.getElementById('btn-copy-scramble');
      copyBtn.addEventListener('click', () => {
        const text = this.scrambleMoves.join(' ');
        navigator.clipboard.writeText(text).then(() => {
          const orig = copyBtn.innerHTML;
          copyBtn.innerHTML = '✓ Copiado!';
          setTimeout(() => {
            copyBtn.innerHTML = orig;
          }, 1600);
        });
      });

      // Playback Buttons
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

      // Animation Speed Slider
      const speedSlider = document.getElementById('speed-slider');
      const speedValue = document.getElementById('speed-value');
      speedSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.animationDuration = Math.round(350 / val);
        speedValue.textContent = `${val.toFixed(1)}x`;
      });

      // Viewport Camera Reset & Label/Arrow Toggles
      document.getElementById('btn-reset-camera').addEventListener('click', () => {
        this.resetCameraPosition(true);
      });

      const toggleLabelsBtn = document.getElementById('btn-toggle-labels');
      toggleLabelsBtn.addEventListener('click', () => {
        this.show3DLabels = !this.show3DLabels;
        toggleLabelsBtn.textContent = this.show3DLabels
          ? '🏷️ Rótulos 3D: ON'
          : '🏷️ Rótulos 3D: OFF';
      });

      const toggleArrowBtn = document.getElementById('btn-toggle-arrow');
      if (toggleArrowBtn) {
        toggleArrowBtn.addEventListener('click', () => {
          this.show3DArrow = !this.show3DArrow;
          toggleArrowBtn.textContent = this.show3DArrow
            ? '🧭 Seta Guia 3D: ON'
            : '🧭 Seta Guia 3D: OFF';
          this.update3DMoveIndicator();
        });
      }

      // Manual Face Move Buttons in Viewport
      document.querySelectorAll('.move-key-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.stopAutoPlay();
          const move = btn.dataset.move;
          this.animateMove(move, this.animationDuration);
        });
      });

      // Keyboard Shortcuts (ArrowRight = Next Step, ArrowLeft = Prev Step, Space = Play/Pause)
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

if (window.THREE && window.OrbitControls) {
  initApp();
} else {
  window.addEventListener('three-ready', initApp, { once: true });
}

