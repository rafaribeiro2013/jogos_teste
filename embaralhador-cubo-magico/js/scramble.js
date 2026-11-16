// ============================================================================
// Gerador de embaralhamentos (compartilhado entre o embaralhador 3D e o timer).
// Não depende do Three.js, então o timer funciona mesmo se o 3D não carregar.
// ============================================================================
(function () {
  const AXIS = { U: 'y', D: 'y', F: 'z', B: 'z', R: 'x', L: 'x' };
  const MODIFIERS = ['', "'", '2'];

  function generate(cubeSize) {
    const faces = cubeSize === 2 ? ['U', 'R', 'F'] : ['U', 'D', 'R', 'L', 'F', 'B'];
    const length = cubeSize === 2 ? 11 : 20;

    const moves = [];
    let lastFace = null;
    let secondLastFace = null;

    for (let i = 0; i < length; i++) {
      let candidate;
      do {
        candidate = faces[Math.floor(Math.random() * faces.length)];
      } while (
        // nunca a mesma face duas vezes seguidas, nem R L R (mesmo eixo)
        candidate === lastFace ||
        (secondLastFace && candidate === secondLastFace && AXIS[candidate] === AXIS[lastFace])
      );

      moves.push(candidate + MODIFIERS[Math.floor(Math.random() * MODIFIERS.length)]);
      secondLastFace = lastFace;
      lastFace = candidate;
    }

    return moves;
  }

  window.CubeScramble = { generate };
})();
