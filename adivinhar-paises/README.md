# 🌍 Atlas Quiz — Jogo de Adivinhar Países no Mapa-Múndi e Bandeiras

Jogo web interativo com duas abas de desafio (**🗺️ Adivinhar Países no Mapa** e **🏳️ Adivinhar Bandeiras**), desenvolvido com **HTML5, CSS3, JavaScript (ES6+) e JSON/SVG Vetorial**.

## ✨ Funcionalidades Principais

- **Duas Abas de Jogo Completas (Todos os 197 Países Soberanos)**:
  - **🗺️ Aba 1 — Adivinhar Países no Mapa**: Mapa-múndi vetorial interativo onde cada país acertado fica **Verde (`#22c55e`)** e os países não adivinhados ao fim do tempo são destacados em **Vermelho (`#ef4444`)**.
  - **🏳️ Aba 2 — Adivinhar Bandeiras**: Painel completo com as bandeiras de todos os 197 países (ou filtrado por região/continente), barra de bandeira em destaque, navegação rápida (`⬅️ Anterior`, `➡️ Próxima (Tab)`, `🎲 Sortear`, `🔀 Embaralhar`), modo de resposta selecionável (**🎯 Bandeira Selecionada** ou **⚡ Digitação Livre**) e cronômetro. Quando o tempo acaba (ou ao encerrar a partida), todas as bandeiras não adivinhadas ficam em **Vermelho (`#ef4444`)** e têm os nomes de seus países **revelados**.
  - **Verde (`#22c55e`)**: Países acertados piscam e ficam imediatamente verdes no mapa.
  - **Vermelho (`#ef4444`)**: Quando o tempo acaba (ou ao encerrar a partida), todos os países que não foram adivinhados ficam destacados em vermelho.
  - **Amarelo-Ouro (`#eab308`)**: País clicado/selecionado no mapa para inspeção ou pedido de dica.
  - **Marcadores de Microestados e Ilhas**: Pequenas nações insulares e microestados (como Vaticano, Mônaco, Maldivas, Tuvalu, etc.) possuem marcadores circulares clicáveis para facilitar a visualização.
- **Início Automático ao Digitar**:
  - Não há botão de *Start*: o campo de texto já fica liberado e o cronômetro dispara automaticamente assim que o jogador começa a digitar o primeiro país.
- **Digitação Inteligente com Tempo de Folga Automático (`850ms`)**:
  - Reconhecimento automático assim que o nome é digitado, sem exigir acentos, cedilha ou letras maiúsculas.
  - Aceita variações e sinônimos comuns em português (ex.: *EUA / Estados Unidos*, *Holanda / Países Baixos*, *República Tcheca / Tchéquia*, *Mianmar / Birmânia*, *Essuatíni / Suazilândia*, *RD Congo*, *Reino Unido / Inglaterra*, etc.).
  - **Proteção automática contra prefixos ambíguos**: Ao digitar nomes como *Guiné*, *Níger*, *Sudão* ou *Dominica*, uma barra visual de `0,85s` aguarda uma breve pausa e confirma o país automaticamente caso você pare de digitar (sem precisar apertar `Enter` ou clicar em nada), ou cancela caso você continue digitando (*Guiné-Bissau*, *Nigéria*, *Sudão do Sul*, etc.).
- **Ferramentas de Navegação**:
  - **Zoom e Pan suaves com Animação**: Use a roda do mouse (`Scroll`) para dar zoom na posição do cursor e arraste para navegar pelo mapa.
  - **Atalhos de Continentes**: Botões rápidos na barra superior e no painel de progresso por continente.
  - **Exploração Pós-Jogo**: Ao acabar o tempo, feche o modal de resumo para explorar livremente os países e bandeiras verdes e vermelhos ou filtre pela lista lateral (**✅ Acertados** / **❌ Faltaram**).

- **Interface Moderna e Intuitiva**:
  - Campo de resposta em destaque no topo, com feedback logo abaixo, anel de progresso dos acertos e barra de tempo restante.
  - Tela **Como jogar** exibida na primeira visita (e sempre disponível no botão `?`), além de uma dica flutuante no mapa antes de começar.
  - Comece a digitar em qualquer lugar da página: o foco vai direto para o campo de resposta.
  - **Tema claro e escuro** (segue o sistema por padrão; alternável no botão de sol/lua e lembrado entre visitas).
  - Confirmação própria ao **Revelar** a partida, resumo final com aproveitamento em anel e botão **Reiniciar** destacado ao fim do jogo.
  - Layout responsivo para tablets e celulares, com arraste do mapa por toque.

## ▶️ Como Executar

Basta abrir o arquivo [`index.html`](./index.html) diretamente em qualquer navegador moderno (Chrome, Edge, Firefox, Safari) ou servir a pasta com um servidor local (ex.: *Live Server* do VS Code).

## 📁 Estrutura de Arquivos

- `index.html`: Estrutura principal da interface, cabeçalho de controle, viewport do mapa SVG, painel lateral e modal de resultado.
- `css/styles.css`: Estilização moderna com tokens de tema (claro/escuro), animações, layout responsivo e estados visuais do mapa.
- `js/app.js`: Motor do jogo, renderizador SVG vetorial, câmera interativa (zoom/pan animado), cronômetro e lógica de validação.
- `data/paises.json` e `js/dados-paises.js`: Dados geográficos (polígonos, capitais, continentes e sinônimos) dos 197 países soberanos.
