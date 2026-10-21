# CubeScramble 3D — Simulador Visual de Embaralhamento (3x3 e 2x2)

Simulador visual interativo em 3D para embaralhamento de Cubos Mágicos **3x3x3** e **2x2x2**, seguindo os padrões de cores e notação oficial da **WCA (World Cube Association)**.

## 🚀 Tecnologias Utilizadas
- **Three.js (WebGL)**: Renderização 3D em tempo real com iluminação física (`MeshStandardMaterial`), animações suaves por interpolação cúbica e seta direcional 3D indicando o próximo movimento diretamente sobre a face ativa.
- **OrbitControls**: Controle livre de câmera em 360° (rotação orbital e zoom) para inspecionar todos os lados do cubo a qualquer momento.
- **HTML5 + CSS3 Moderno + JavaScript (ES6+)**: Arquitetura leve, sem necessidade de build complexo, funcionando imediatamente no navegador.

## ✨ Funcionalidades
- **Alternância entre Cubo 3x3x3 e 2x2x2**: Gere embaralhamentos oficiais de 20 movimentos (3x3) ou 11 movimentos (2x2).
- **Modelo 3D Interativo à Esquerda**:
  - Rotação livre da câmera com o mouse/toque.
  - Seta guia 3D curva sobre a face do próximo passo indicando o sentido exato do giro.
  - Rótulos 3D flutuantes (`U`, `D`, `F`, `B`, `R`, `L`) que acompanham as faces do cubo.
  - Barra de controle manual para testar giros (`U`, `U'`, `D`, `D'`, `R`, `R'`, `L`, `L'`, `F`, `F'`, `B`, `B'`).
- **Passo a Passo Detalhado à Direita**:
  - Algoritmo completo na notação da comunidade (`R`, `U'`, `F2`, etc.).
  - Lista passo a passo traduzindo cada símbolo para instruções claras (qual face/cor girar e em qual sentido).
  - Controles de reprodução automática (**Reproduzir/Pausar**), avanço/recuo passo a passo (`◀ Anterior` / `Próximo ▶`), salto direto clicando em qualquer passo e controle de velocidade da animação.

## ▶️ Como Executar
Basta abrir o arquivo [`index.html`](./index.html) diretamente em qualquer navegador moderno (Chrome, Edge, Firefox, Safari) ou servir a pasta com um servidor estático local (ex: `npx serve .` ou extensão *Live Server* do VS Code).
