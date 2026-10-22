# 🌍 Atlas Quiz — Jogo de Adivinhar Países no Mapa-Múndi

Jogo web interativo de adivinhar países no mapa-múndi, desenvolvido com **HTML5, CSS3, JavaScript (ES6+) e JSON/SVG Vetorial**.

## ✨ Funcionalidades Principais

- **Mapa-Múndi Vetorial Interativo em Alta Definição (197 Países Soberanos)**:
  - **Verde (`#22c55e`)**: Países acertados piscam e ficam imediatamente verdes no mapa.
  - **Vermelho (`#ef4444`)**: Quando o tempo acaba (ou ao encerrar a partida), todos os países que não foram adivinhados ficam destacados em vermelho.
  - **Amarelo-Ouro (`#eab308`)**: País clicado/selecionado no mapa para inspeção ou pedido de dica.
  - **Marcadores de Microestados e Ilhas**: Pequenas nações insulares e microestados (como Vaticano, Mônaco, Maldivas, Tuvalu, etc.) possuem marcadores circulares clicáveis para facilitar a visualização.
- **Início Manual pelo Jogador**:
  - O cronômetro **não inicia automaticamente** ao abrir a página ou trocar de região/tempo.
  - Escolha tranquilamente a região e o tempo desejados e clique em **`▶️ Iniciar Jogo`** quando quiser começar.
- **Digitação Inteligente com Tempo de Folga Automático (`850ms`)**:
  - Reconhecimento automático assim que o nome é digitado, sem exigir acentos, cedilha ou letras maiúsculas.
  - Aceita variações e sinônimos comuns em português (ex.: *EUA / Estados Unidos*, *Holanda / Países Baixos*, *República Tcheca / Tchéquia*, *Mianmar / Birmânia*, *Essuatíni / Suazilândia*, *RD Congo*, *Reino Unido / Inglaterra*, etc.).
  - **Proteção automática contra prefixos ambíguos**: Ao digitar nomes como *Guiné*, *Níger*, *Sudão* ou *Dominica*, uma barra visual de `0,85s` aguarda uma breve pausa e confirma o país automaticamente caso você pare de digitar (sem precisar apertar `Enter` ou clicar em nada), ou cancela caso você continue digitando (*Guiné-Bissau*, *Nigéria*, *Sudão do Sul*, etc.).
- **Ferramentas de Navegação e Ajuda**:
  - **Zoom e Pan suaves com Animação**: Use a roda do mouse (`Scroll`) para dar zoom na posição do cursor e arraste para navegar pelo mapa.
  - **Atalhos de Continentes**: Botões rápidos na barra do mapa e no painel de progresso por continente com transição suave de câmera.
  - **Inspeção e Dicas no Mapa (`F1`)**: Clique em qualquer país misterioso no mapa para saber quantas letras ele tem, revelar sua **Capital** (`🏛️ Ver Capital`) ou revelar letras do nome (`🔤 Revelar Letra`).
  - **Exploração Pós-Jogo**: Ao acabar o tempo, feche o modal de resumo para explorar livremente os países verdes e vermelhos no mapa ou filtre pela lista lateral (**✅ Acertados** / **❌ Faltaram**).

## ▶️ Como Executar

Basta abrir o arquivo [`index.html`](./index.html) diretamente em qualquer navegador moderno (Chrome, Edge, Firefox, Safari) ou servir a pasta com um servidor local (ex.: *Live Server* do VS Code).

## 📁 Estrutura de Arquivos

- `index.html`: Estrutura principal da interface, cabeçalho de controle, viewport do mapa SVG, painel lateral e modal de resultado.
- `css/styles.css`: Estilização moderna em modo escuro, animações e estados visuais do mapa.
- `js/app.js`: Motor do jogo, renderizador SVG vetorial, câmera interativa (zoom/pan animado), cronômetro e lógica de validação.
- `data/paises.json` e `js/dados-paises.js`: Dados geográficos (polígonos, capitais, continentes e sinônimos) dos 197 países soberanos.
