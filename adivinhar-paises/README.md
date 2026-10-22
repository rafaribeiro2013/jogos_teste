# 🌍 Atlas Quiz — Jogo de Adivinhar Países no Mapa-Múndi

Aplicativo desktop local desenvolvido em **Python nativo (`tkinter`)**, sem qualquer uso de HTML, CSS ou JSON.

## ✨ Funcionalidades Principais

- **Mapa-Múndi Vetorial Interativo (197 Países Soberanos)**:
  - **Verde (`#22c55e`)**: Países acertados ficam imediatamente verdes no mapa.
  - **Vermelho (`#ef4444`)**: Quando o tempo acaba (ou ao encerrar a partida), todos os países que não foram adivinhados ficam destacados em vermelho.
  - **Amarelo-Ouro (`#eab308`)**: País clicado/selecionado no mapa para inspeção ou pedido de dica.
  - **Marcadores de Microestados e Ilhas**: Pequenas nações insulares e microestados (como Vaticano, Mônaco, Maldivas, Tuvalu, etc.) possuem marcadores circulares clicáveis para facilitar a visualização.
- **Digitação Inteligente e Sem Atrito**:
  - Reconhecimento automático assim que o nome é digitado (estilo JetPunk/Sporcle), sem exigir acentos, cedilha ou letras maiúsculas.
  - Aceita variações e sinônimos comuns em português (ex.: *EUA / Estados Unidos*, *Holanda / Países Baixos*, *República Tcheca / Tchéquia*, *Mianmar / Birmânia*, *Essuatíni / Suazilândia*, *RD Congo*, *Reino Unido / Inglaterra*, etc.).
  - Proteção automática contra prefixos ambíguos com tempo de folga (ex.: ao digitar *Guiné*, *Níger*, *Sudão* ou *Dominica*, o jogo aguarda uma breve pausa de `0,85s` para confirmar automaticamente caso você não continue digitando *Guiné-Bissau*, *Nigéria*, *Sudão do Sul*, etc. — sem precisar apertar Enter ou clicar em nada).
- **Ferramentas que Facilitam a Vida do Jogador**:
  - **Zoom e Pan a 60 FPS**: Use a roda do mouse (`Scroll`) para dar zoom exatamente onde o cursor está e arraste para navegar pelo mapa.
  - **Atalhos de Continentes**: Botões rápidos na barra do mapa e no painel de progresso para enquadrar qualquer continente com um clique.
  - **Inspeção e Dicas no Mapa (`F1`)**: Clique em qualquer país misterioso no mapa para saber quantas letras ele tem, revelar sua **Capital** ou revelar letras do nome.
  - **Exploração Pós-Jogo**: Ao acabar o tempo, filtre a lista lateral entre **✅ Acertados (Verdes)** e **❌ Faltaram (Vermelhos)** e clique em qualquer país para centralizar a câmera nele no mapa.

## ▶️ Como Executar

No terminal (ou dando duplo clique em `iniciar_jogo.bat`):

```powershell
cd adivinhar-paises
python main.py
```

## 📁 Estrutura de Arquivos

- `main.py`: Interface gráfica, renderizador vetorial do mapa-múndi, controles de câmera (zoom/pan), cronômetro e lógica do jogo.
- `dados_paises.py`: Módulo Python puro contendo os polígonos geográficos, coordenadas centrais, capitais, continentes e sinônimos dos 197 países.
- `iniciar_jogo.bat`: Atalho executável para iniciar o jogo rapidamente no Windows.

