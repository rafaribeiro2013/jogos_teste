"""
Jogo de Adivinhar Países — Mapa-Múndi Interativo (Desktop Local)
Desenvolvido em Python nativo com Tkinter (sem uso de HTML, CSS ou JSON).
"""

import math
import random
import time
import unicodedata
import tkinter as tk
from tkinter import ttk, messagebox

from dados_paises import PAISES, TERRITORIOS_NEUTROS


# ============================================================================
# PALETA DE CORES E ESTILO VISUAL
# ============================================================================
COR_FUNDO_JANELA = "#0b1120"
COR_PAINEL = "#111827"
COR_CARD = "#1e293b"
COR_BORDA_PAINEL = "#334155"

COR_OCEANO = "#081426"
COR_GRADE = "#10233f"

# Estados dos países no mapa
COR_PAIS_PADRAO = "#334155"
COR_PAIS_HOVER = "#475569"
COR_PAIS_FORA_ESCOPO = "#162032"
COR_PAIS_NEUTRO = "#1e293b"
COR_PAIS_SELECIONADO = "#eab308"      # Amarelo ouro ao clicar para inspecionar/dica
COR_PAIS_ACERTADO = "#22c55e"          # Verde vibrante quando acertado
COR_PAIS_ACERTADO_HOVER = "#4ade80"
COR_PAIS_ACERTADO_PULSO = "#86efac"
COR_PAIS_PERDIDO = "#ef4444"           # Vermelho vibrante quando o tempo acaba
COR_PAIS_PERDIDO_HOVER = "#f87171"

COR_BORDA_PAIS = "#0f172a"
COR_BORDA_ACERTADO = "#052e16"
COR_BORDA_PERDIDO = "#450a0a"
COR_BORDA_SELECIONADO = "#fef08a"

COR_TEXTO = "#f8fafc"
COR_TEXTO_SEC = "#94a3b8"
COR_DESTAQUE_AZUL = "#38bdf8"
COR_AVISO = "#f59e0b"

# Regiões de câmera (lon_min, lat_min, lon_max, lat_max) para enquadramento rápido
ENQUADRAMENTOS_CONTINENTES = {
    "Mundo Inteiro": (-175.0, -56.0, 178.0, 78.0),
    "América do Sul": (-84.0, -56.0, -32.0, 14.0),
    "América do Norte e Central": (-168.0, 5.0, -52.0, 72.0),
    "Américas": (-168.0, -56.0, -32.0, 72.0),
    "Europa": (-25.0, 34.0, 48.0, 71.0),
    "África": (-26.0, -36.0, 54.0, 38.0),
    "Ásia": (25.0, -12.0, 150.0, 58.0),
    "Oceania": (110.0, -48.0, 180.0, 12.0),
}

OPCOES_MODO = [
    "Mundo Inteiro (197)",
    "América do Sul (12)",
    "América do Norte e Central (23)",
    "Américas (35)",
    "Europa (45)",
    "África (54)",
    "Ásia (49)",
    "Oceania (14)",
]

OPCOES_TEMPO = [
    ("15 min (Padrão)", 15 * 60),
    ("20 min (Tranquilo)", 20 * 60),
    ("10 min (Desafio)", 10 * 60),
    ("5 min (Rápido)", 5 * 60),
    ("3 min (Relâmpago)", 3 * 60),
    ("1 min (Teste Rápido)", 60),
    ("Sem Limite (Treino)", 0),
]


def normalizar_texto(texto: str) -> str:
    """Remove acentos, pontuação e espaços extras para comparação amigável."""
    if not texto:
        return ""
    s = unicodedata.normalize("NFD", texto.strip().lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    for ch in ("-", "_", ".", ",", "'", '"', "/", "(", ")"):
        s = s.replace(ch, " ")
    partes = [p for p in s.split() if p]
    return " ".join(partes)


def normalizar_sem_preposicoes(texto: str) -> str:
    """Versão sem preposições ('de', 'da', 'do', 'dos', 'das', 'e') para tolerância extra."""
    norm = normalizar_texto(texto)
    ignorar = {"de", "da", "do", "dos", "das", "e", "o", "a", "os", "as"}
    partes = [p for p in norm.split() if p not in ignorar]
    return " ".join(partes) if partes else norm


class JogoAdivinharPaises:
    """Aplicação principal do jogo de adivinhar países no Mapa-Múndi."""

    # Fator vertical para projeção geográfica agradável
    FATOR_LAT = 1.22
    # Tempo de folga (ms) para confirmar automaticamente países cujo nome é prefixo de outro (ex: Guiné -> Guiné-Bissau)
    TEMPO_FOLGA_PREFIXO_MS = 850

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.title("🌍 Atlas Quiz — Adivinhe os Países no Mapa-Múndi")
        self.root.geometry("1420x860")
        self.root.minsize(1100, 680)
        self.root.configure(bg=COR_FUNDO_JANELA)

        # Estado do jogo
        self.modo_atual = "Mundo Inteiro"
        self.tempo_total_seg = 15 * 60
        self.tempo_restante_seg = 15 * 60
        self.jogo_ativo = False
        self.jogo_pausado = False
        self.jogo_encerrado = False
        self.timer_job = None
        self.prefixo_timer_job = None
        self.ultimo_tick = 0.0

        self.paises_escopo = set()       # Códigos ISO3 no modo atual
        self.paises_acertados = set()    # Códigos ISO3 já acertados (verdes)
        self.paises_perdidos = set()     # Códigos ISO3 não adivinhados após o tempo (vermelhos)
        self.ordem_acertos = []          # Histórico de acertos

        self.pais_selecionado = None     # Código ISO3 clicado no mapa
        self.pais_hover = None           # Código ISO3 sob o cursor
        self.revelacoes_dica = {}        # codigo -> qtd de letras reveladas
        self.capital_revelada = set()    # codigos com capital revelada na dica
        self.mostrar_marcadores_ilhas = tk.BooleanVar(value=True)
        self.mostrar_nomes_mapa = tk.BooleanVar(value=False)

        # Índice de busca de nomes -> código do país
        self.indice_nomes = {}
        self.indice_sem_prep = {}
        self._construir_indices_nomes()

        # Estruturas do Canvas Vetorial
        self.escala_mapa = 1.0
        self.offset_x = 0.0
        self.offset_y = 0.0
        self.arrastando = False
        self.clique_inicial_xy = (0, 0)
        self.ultimo_mouse_xy = (0, 0)

        self.itens_poligonos = {}        # codigo -> [canvas_item_id, ...]
        self.itens_marcadores = {}       # codigo -> canvas_oval_id
        self.itens_rotulos_mapa = {}     # codigo -> canvas_text_id
        self.item_Para_codigo = {}       # canvas_item_id -> codigo

        self._configurar_estilos_ttk()
        self._construir_interface()
        self._vincular_atalhos()

        # Inicializa o mapa e começa a primeira partida após renderizar a janela
        self.root.after(80, self._inicializar_mapa_e_jogo)

    # ========================================================================
    # INDEXAÇÃO INTELIGENTE DE NOMES EM PORTUGUÊS E SINÔNIMOS
    # ========================================================================
    def _construir_indices_nomes(self):
        self.indice_nomes.clear()
        self.indice_sem_prep.clear()

        for codigo, dados in PAISES.items():
            candidatos = [dados["nome"]] + list(dados.get("aliases", []))
            for nome in candidatos:
                n1 = normalizar_texto(nome)
                n2 = normalizar_sem_preposicoes(nome)
                if n1:
                    self.indice_nomes[n1] = codigo
                if n2:
                    self.indice_sem_prep[n2] = codigo

    # ========================================================================
    # CONFIGURAÇÃO VISUAL E CONSTRUÇÃO DA INTERFACE
    # ========================================================================
    def _configurar_estilos_ttk(self):
        style = ttk.Style()
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        style.configure(
            "TCombobox",
            fieldbackground=COR_CARD,
            background=COR_CARD,
            foreground=COR_TEXTO,
            arrowcolor=COR_TEXTO,
            bordercolor=COR_BORDA_PAINEL,
            lightcolor=COR_CARD,
            darkcolor=COR_CARD,
            padding=5,
        )
        style.map(
            "TCombobox",
            fieldbackground=[("readonly", COR_CARD)],
            selectbackground=[("readonly", COR_CARD)],
            selectforeground=[("readonly", COR_TEXTO)],
        )

        style.configure(
            "Verde.Horizontal.TProgressbar",
            troughcolor=COR_FUNDO_JANELA,
            background=COR_PAIS_ACERTADO,
            bordercolor=COR_BORDA_PAINEL,
            lightcolor=COR_PAIS_ACERTADO,
            darkcolor=COR_PAIS_ACERTADO,
            thickness=12,
        )

    def _construir_interface(self):
        # 1. BARRA SUPERIOR (Configurações de Partida, Digitação, Cronômetro e Placar)
        self.frame_topo = tk.Frame(
            self.root, bg=COR_PAINEL, highlightbackground=COR_BORDA_PAINEL, highlightthickness=1
        )
        self.frame_topo.pack(side=tk.TOP, fill=tk.X, padx=10, pady=(10, 6))

        self._construir_barra_superior()

        # 2. ÁREA CENTRAL DIVIDIDA (Mapa-Múndi à esquerda + Painel Auxiliar à direita)
        self.frame_central = tk.Frame(self.root, bg=COR_FUNDO_JANELA)
        self.frame_central.pack(side=tk.TOP, fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))

        # Painel Lateral Direito (fixo em 355px para facilitar leitura e listas)
        self.frame_direita = tk.Frame(
            self.frame_central,
            bg=COR_PAINEL,
            width=360,
            highlightbackground=COR_BORDA_PAINEL,
            highlightthickness=1,
        )
        self.frame_direita.pack(side=tk.RIGHT, fill=tk.Y, padx=(8, 0))
        self.frame_direita.pack_propagate(False)

        # Container do Mapa à Esquerda
        self.frame_mapa_container = tk.Frame(
            self.frame_central,
            bg=COR_OCEANO,
            highlightbackground=COR_BORDA_PAINEL,
            highlightthickness=1,
        )
        self.frame_mapa_container.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)

        self._construir_area_mapa()
        self._construir_painel_direito()

    def _construir_barra_superior(self):
        # Linha 1 da barra superior: Seleção de Região, Tempo e Botões de Partida
        linha_cfg = tk.Frame(self.frame_topo, bg=COR_PAINEL)
        linha_cfg.pack(fill=tk.X, padx=14, pady=(10, 6))

        tk.Label(
            linha_cfg,
            text="🌍 REGIÃO:",
            bg=COR_PAINEL,
            fg=COR_TEXTO_SEC,
            font=("Segoe UI", 9, "bold"),
        ).pack(side=tk.LEFT, padx=(0, 6))

        self.combo_modo = ttk.Combobox(
            linha_cfg, values=OPCOES_MODO, state="readonly", width=25, font=("Segoe UI", 10)
        )
        self.combo_modo.current(0)
        self.combo_modo.pack(side=tk.LEFT, padx=(0, 16))
        self.combo_modo.bind("<<ComboboxSelected>>", self._ao_mudar_configuracao)

        tk.Label(
            linha_cfg,
            text="⏱️ TEMPO:",
            bg=COR_PAINEL,
            fg=COR_TEXTO_SEC,
            font=("Segoe UI", 9, "bold"),
        ).pack(side=tk.LEFT, padx=(0, 6))

        self.combo_tempo = ttk.Combobox(
            linha_cfg,
            values=[t[0] for t in OPCOES_TEMPO],
            state="readonly",
            width=18,
            font=("Segoe UI", 10),
        )
        self.combo_tempo.current(0)
        self.combo_tempo.pack(side=tk.LEFT, padx=(0, 16))
        self.combo_tempo.bind("<<ComboboxSelected>>", self._ao_mudar_configuracao)

        # Botões de controle da partida
        self.btn_iniciar = self._criar_botao(
            linha_cfg, "▶️ Iniciar Jogo", self.iniciar_novo_jogo, bg="#16a34a", hover="#22c55e"
        )
        self.btn_iniciar.pack(side=tk.LEFT, padx=(0, 8))

        self.btn_resetar = self._criar_botao(
            linha_cfg, "🔄 Resetar", self.preparar_partida, bg="#2563eb", hover="#3b82f6"
        )
        self.btn_resetar.pack(side=tk.LEFT, padx=(0, 8))

        self.btn_pausar = self._criar_botao(
            linha_cfg, "⏸️ Pausar", self.alternar_pausa, bg="#334155", hover="#475569"
        )
        self.btn_pausar.pack(side=tk.LEFT, padx=(0, 8))

        self.btn_dica_topo = self._criar_botao(
            linha_cfg, "💡 Dica (F1)", self.pedir_dica_geral, bg="#d97706", hover="#f59e0b"
        )
        self.btn_dica_topo.pack(side=tk.LEFT, padx=(0, 8))

        self.btn_desistir = self._criar_botao(
            linha_cfg,
            "🏳️ Encerrar e Ver Faltantes",
            self.encerrar_partida_manual,
            bg="#991b1b",
            hover="#dc2626",
        )
        self.btn_desistir.pack(side=tk.LEFT)

        # Placar e Cronômetro à direita na linha superior
        frame_status_dir = tk.Frame(linha_cfg, bg=COR_PAINEL)
        frame_status_dir.pack(side=tk.RIGHT)

        self.lbl_cronometro = tk.Label(
            frame_status_dir,
            text="15:00",
            bg="#0f172a",
            fg="#38bdf8",
            font=("Consolas", 20, "bold"),
            padx=14,
            pady=2,
            highlightbackground=COR_BORDA_PAINEL,
            highlightthickness=1,
        )
        self.lbl_cronometro.pack(side=tk.RIGHT, padx=(12, 0))

        self.lbl_placar = tk.Label(
            frame_status_dir,
            text="0 / 197 (0%)",
            bg="#0f172a",
            fg=COR_PAIS_ACERTADO,
            font=("Segoe UI", 15, "bold"),
            padx=14,
            pady=4,
            highlightbackground=COR_BORDA_PAINEL,
            highlightthickness=1,
        )
        self.lbl_placar.pack(side=tk.RIGHT)

        # Linha 2 da barra superior: Caixa de Digitação Grande + Feedback Instantâneo + Barra de Progresso
        linha_input = tk.Frame(self.frame_topo, bg=COR_PAINEL)
        linha_input.pack(fill=tk.X, padx=14, pady=(4, 10))

        tk.Label(
            linha_input,
            text="✍️ DIGITE O PAÍS:",
            bg=COR_PAINEL,
            fg=COR_TEXTO,
            font=("Segoe UI", 11, "bold"),
        ).pack(side=tk.LEFT, padx=(0, 10))

        self.var_entrada = tk.StringVar()
        self.var_entrada.trace_add("write", self._ao_digitar_texto)

        self.entry_pais = tk.Entry(
            linha_input,
            textvariable=self.var_entrada,
            bg="#0f172a",
            fg="#ffffff",
            insertbackground="#38bdf8",
            font=("Segoe UI", 14, "bold"),
            width=30,
            relief=tk.FLAT,
            highlightbackground="#38bdf8",
            highlightcolor="#22c55e",
            highlightthickness=2,
        )
        self.entry_pais.pack(side=tk.LEFT, ipady=5, padx=(0, 8))
        self.entry_pais.bind("<Return>", self._ao_pressionar_enter)
        self.entry_pais.bind("<Escape>", lambda e: self.var_entrada.set(""))

        self.btn_confirmar = self._criar_botao(
            linha_input, "Confirmar (Enter)", self._ao_pressionar_enter, bg="#16a34a", hover="#22c55e"
        )
        self.btn_confirmar.pack(side=tk.LEFT, padx=(0, 14))

        # Mensagem de feedback instantâneo (último país acertado, aviso de prefixo, etc.)
        self.lbl_feedback = tk.Label(
            linha_input,
            text="Digite qualquer país! Acentos e maiúsculas são opcionais.",
            bg=COR_PAINEL,
            fg=COR_TEXTO_SEC,
            font=("Segoe UI", 10, "italic"),
            anchor="w",
        )
        self.lbl_feedback.pack(side=tk.LEFT, fill=tk.X, expand=True)

        # Barra de progresso geral
        self.progresso_geral = ttk.Progressbar(
            linha_input,
            style="Verde.Horizontal.TProgressbar",
            orient=tk.HORIZONTAL,
            length=180,
            mode="determinate",
        )
        self.progresso_geral.pack(side=tk.RIGHT, padx=(10, 0))

    def _construir_area_mapa(self):
        # Barra de ferramentas de navegação do mapa (no topo do mapa)
        barra_mapa = tk.Frame(self.frame_mapa_container, bg="#0f172a", pady=5, padx=8)
        barra_mapa.pack(side=tk.TOP, fill=tk.X)

        tk.Label(
            barra_mapa,
            text="🗺️ NAVEGAÇÃO:",
            bg="#0f172a",
            fg=COR_TEXTO_SEC,
            font=("Segoe UI", 9, "bold"),
        ).pack(side=tk.LEFT, padx=(0, 6))

        self._criar_botao(
            barra_mapa, "➕ Zoom", lambda: self.aplicar_zoom_centro(1.3), bg="#1e293b", hover="#334155", pad=(8, 2)
        ).pack(side=tk.LEFT, padx=2)

        self._criar_botao(
            barra_mapa, "➖ Zoom", lambda: self.aplicar_zoom_centro(1 / 1.3), bg="#1e293b", hover="#334155", pad=(8, 2)
        ).pack(side=tk.LEFT, padx=2)

        self._criar_botao(
            barra_mapa, "🌍 Visão Padrão", self.enquadrar_regiao_atual, bg="#1e293b", hover="#334155", pad=(8, 2)
        ).pack(side=tk.LEFT, padx=(2, 10))

        # Botões rápidos de zoom por continente
        tk.Label(
            barra_mapa,
            text="Ir para:",
            bg="#0f172a",
            fg=COR_TEXTO_SEC,
            font=("Segoe UI", 9),
        ).pack(side=tk.LEFT, padx=(4, 4))

        atalhos_cont = [
            ("Am. Sul", "América do Sul"),
            ("Am. Norte", "América do Norte e Central"),
            ("Europa", "Europa"),
            ("África", "África"),
            ("Ásia", "Ásia"),
            ("Oceania", "Oceania"),
        ]
        for rotulo, chave in atalhos_cont:
            self._criar_botao(
                barra_mapa,
                rotulo,
                lambda c=chave: self.enquadrar_continente(c),
                bg="#172554",
                hover="#1e40af",
                pad=(6, 2),
                fonte=("Segoe UI", 8, "bold"),
            ).pack(side=tk.LEFT, padx=2)

        # Checkboxes úteis à direita da barra do mapa
        chk_nomes = tk.Checkbutton(
            barra_mapa,
            text="Mostrar nomes revelados",
            variable=self.mostrar_nomes_mapa,
            command=self._atualizar_visibilidade_rotulos,
            bg="#0f172a",
            fg=COR_TEXTO_SEC,
            selectcolor="#1e293b",
            activebackground="#0f172a",
            activeforeground=COR_TEXTO,
            font=("Segoe UI", 9),
        )
        chk_nomes.pack(side=tk.RIGHT, padx=6)

        chk_ilhas = tk.Checkbutton(
            barra_mapa,
            text="Marcadores de microestados/ilhas",
            variable=self.mostrar_marcadores_ilhas,
            command=self._atualizar_visibilidade_marcadores,
            bg="#0f172a",
            fg=COR_TEXTO_SEC,
            selectcolor="#1e293b",
            activebackground="#0f172a",
            activeforeground=COR_TEXTO,
            font=("Segoe UI", 9),
        )
        chk_ilhas.pack(side=tk.RIGHT, padx=6)

        # Canvas principal do Mapa-Múndi
        self.canvas = tk.Canvas(
            self.frame_mapa_container,
            bg=COR_OCEANO,
            highlightthickness=0,
            cursor="hand2",
        )
        self.canvas.pack(side=tk.TOP, fill=tk.BOTH, expand=True)

        # Rodapé de legenda e instruções rápidas do mapa
        rodape_mapa = tk.Frame(self.frame_mapa_container, bg="#0f172a", pady=4, padx=10)
        rodape_mapa.pack(side=tk.BOTTOM, fill=tk.X)

        self._criar_item_legenda(rodape_mapa, COR_PAIS_ACERTADO, "Acertado (Verde)")
        self._criar_item_legenda(rodape_mapa, COR_PAIS_PERDIDO, "Não adivinhado ao fim do tempo (Vermelho)")
        self._criar_item_legenda(rodape_mapa, COR_PAIS_SELECIONADO, "Selecionado para Dica")
        self._criar_item_legenda(rodape_mapa, COR_PAIS_PADRAO, "Falta adivinhar")

        tk.Label(
            rodape_mapa,
            text="🖱️ Roda do mouse: Zoom  |  Arrastar: Mover mapa  |  Clique num país: Selecionar / Ver Dica",
            bg="#0f172a",
            fg=COR_TEXTO_SEC,
            font=("Segoe UI", 8),
        ).pack(side=tk.RIGHT)

        # Eventos de mouse no Canvas
        self.canvas.bind("<ButtonPress-1>", self._ao_clicar_mapa)
        self.canvas.bind("<B1-Motion>", self._ao_arrastar_mapa)
        self.canvas.bind("<ButtonRelease-1>", self._ao_soltar_mapa)
        self.canvas.bind("<ButtonPress-3>", self._ao_clicar_mapa)
        self.canvas.bind("<B3-Motion>", self._ao_arrastar_mapa)
        self.canvas.bind("<Motion>", self._ao_mover_mouse_mapa)
        self.canvas.bind("<MouseWheel>", self._ao_rolar_zoom)
        self.canvas.bind("<Configure>", self._ao_redimensionar_canvas)

    def _criar_item_legenda(self, parent, cor, texto):
        f = tk.Frame(parent, bg="#0f172a")
        f.pack(side=tk.LEFT, padx=(0, 14))
        quad = tk.Frame(f, bg=cor, width=12, height=12, highlightbackground="#ffffff", highlightthickness=1)
        quad.pack(side=tk.LEFT, padx=(0, 5))
        tk.Label(f, text=texto, bg="#0f172a", fg=COR_TEXTO_SEC, font=("Segoe UI", 8, "bold")).pack(side=tk.LEFT)

    def _construir_painel_direito(self):
        # 1. CARD DE INSPEÇÃO / PAÍS SELECIONADO NO MAPA (Ajuda interativa)
        self.card_inspecao = tk.Frame(
            self.frame_direita,
            bg=COR_CARD,
            padx=12,
            pady=10,
            highlightbackground=COR_BORDA_PAINEL,
            highlightthickness=1,
        )
        self.card_inspecao.pack(fill=tk.X, padx=10, pady=(10, 8))

        tk.Label(
            self.card_inspecao,
            text="🎯 PAÍS SELECIONADO NO MAPA",
            bg=COR_CARD,
            fg=COR_DESTAQUE_AZUL,
            font=("Segoe UI", 9, "bold"),
        ).pack(anchor="w")

        self.lbl_inspecao_titulo = tk.Label(
            self.card_inspecao,
            text="Clique em qualquer país no mapa",
            bg=COR_CARD,
            fg=COR_TEXTO,
            font=("Segoe UI", 12, "bold"),
            anchor="w",
            justify=tk.LEFT,
            wraplength=310,
        )
        self.lbl_inspecao_titulo.pack(fill=tk.X, pady=(4, 2))

        self.lbl_inspecao_detalhe = tk.Label(
            self.card_inspecao,
            text="Você pode clicar num país misterioso para ver quantas letras ele tem, sua capital ou revelar letras!",
            bg=COR_CARD,
            fg=COR_TEXTO_SEC,
            font=("Segoe UI", 9),
            anchor="w",
            justify=tk.LEFT,
            wraplength=310,
        )
        self.lbl_inspecao_detalhe.pack(fill=tk.X, pady=(0, 8))

        frame_btns_dica = tk.Frame(self.card_inspecao, bg=COR_CARD)
        frame_btns_dica.pack(fill=tk.X)

        self.btn_dica_capital = self._criar_botao(
            frame_btns_dica,
            "🏛️ Ver Capital",
            self.revelar_capital_selecionado,
            bg="#334155",
            hover="#475569",
            pad=(8, 4),
            fonte=("Segoe UI", 9, "bold"),
        )
        self.btn_dica_capital.pack(side=tk.LEFT, padx=(0, 6))

        self.btn_dica_letra = self._criar_botao(
            frame_btns_dica,
            "🔤 Revelar Letra",
            self.revelar_letra_selecionado,
            bg="#334155",
            hover="#475569",
            pad=(8, 4),
            fonte=("Segoe UI", 9, "bold"),
        )
        self.btn_dica_letra.pack(side=tk.LEFT, padx=(0, 6))

        self.btn_focar_selecionado = self._criar_botao(
            frame_btns_dica,
            "🔍 Zoom Nele",
            self.focar_no_pais_selecionado,
            bg="#1e3a8a",
            hover="#2563eb",
            pad=(8, 4),
            fonte=("Segoe UI", 9, "bold"),
        )
        self.btn_focar_selecionado.pack(side=tk.LEFT)

        # 2. PROGRESSO POR CONTINENTE (Clicável para focar)
        card_cont = tk.Frame(
            self.frame_direita,
            bg=COR_CARD,
            padx=12,
            pady=8,
            highlightbackground=COR_BORDA_PAINEL,
            highlightthickness=1,
        )
        card_cont.pack(fill=tk.X, padx=10, pady=(0, 8))

        tk.Label(
            card_cont,
            text="📊 PROGRESSO POR CONTINENTE",
            bg=COR_CARD,
            fg=COR_DESTAQUE_AZUL,
            font=("Segoe UI", 9, "bold"),
        ).pack(anchor="w", pady=(0, 4))

        self.labels_continentes = {}
        continentes_ordem = [
            "América do Sul",
            "América do Norte e Central",
            "Europa",
            "África",
            "Ásia",
            "Oceania",
        ]
        for cont in continentes_ordem:
            linha = tk.Frame(card_cont, bg=COR_CARD, cursor="hand2")
            linha.pack(fill=tk.X, pady=1)
            lbl_nome = tk.Label(
                linha,
                text=cont,
                bg=COR_CARD,
                fg=COR_TEXTO,
                font=("Segoe UI", 9),
                anchor="w",
            )
            lbl_nome.pack(side=tk.LEFT)
            lbl_val = tk.Label(
                linha,
                text="0/0",
                bg=COR_CARD,
                fg=COR_TEXTO_SEC,
                font=("Consolas", 9, "bold"),
                anchor="e",
            )
            lbl_val.pack(side=tk.RIGHT)
            self.labels_continentes[cont] = lbl_val

            # Clicar na linha do continente enquadra o mapa nele
            for w in (linha, lbl_nome, lbl_val):
                w.bind("<Button-1>", lambda e, c=cont: self.enquadrar_continente(c))

        # 3. LISTA INTERATIVA DE PAÍSES (Acertados em verde e Faltantes em vermelho no pós-jogo)
        card_lista = tk.Frame(
            self.frame_direita,
            bg=COR_CARD,
            padx=10,
            pady=8,
            highlightbackground=COR_BORDA_PAINEL,
            highlightthickness=1,
        )
        card_lista.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))

        topo_lista = tk.Frame(card_lista, bg=COR_CARD)
        topo_lista.pack(fill=tk.X, pady=(0, 6))

        self.lbl_titulo_lista = tk.Label(
            topo_lista,
            text="✅ PAÍSES ACERTADOS (0)",
            bg=COR_CARD,
            fg=COR_PAIS_ACERTADO,
            font=("Segoe UI", 9, "bold"),
        )
        self.lbl_titulo_lista.pack(side=tk.LEFT)

        # Filtro de lista (útil especialmente quando o tempo acaba para ver os vermelhos vs verdes)
        self.filtro_lista = tk.StringVar(value="todos")
        frame_filtros = tk.Frame(card_lista, bg=COR_CARD)
        frame_filtros.pack(fill=tk.X, pady=(0, 6))

        self.btn_filtro_todos = self._criar_botao(
            frame_filtros,
            "Todos revelados",
            lambda: self._definir_filtro_lista("todos"),
            bg="#334155",
            hover="#475569",
            pad=(6, 2),
            fonte=("Segoe UI", 8, "bold"),
        )
        self.btn_filtro_todos.pack(side=tk.LEFT, padx=(0, 4))

        self.btn_filtro_verdes = self._criar_botao(
            frame_filtros,
            "✅ Acertados",
            lambda: self._definir_filtro_lista("verdes"),
            bg="#14532d",
            hover="#166534",
            pad=(6, 2),
            fonte=("Segoe UI", 8, "bold"),
        )
        self.btn_filtro_verdes.pack(side=tk.LEFT, padx=(0, 4))

        self.btn_filtro_vermelhos = self._criar_botao(
            frame_filtros,
            "❌ Faltaram",
            lambda: self._definir_filtro_lista("vermelhos"),
            bg="#7f1d1d",
            hover="#991b1b",
            pad=(6, 2),
            fonte=("Segoe UI", 8, "bold"),
        )
        self.btn_filtro_vermelhos.pack(side=tk.LEFT)

        # Caixa de busca rápida na lista
        frame_busca = tk.Frame(card_lista, bg=COR_CARD)
        frame_busca.pack(fill=tk.X, pady=(0, 6))
        tk.Label(frame_busca, text="🔎", bg=COR_CARD, fg=COR_TEXTO_SEC, font=("Segoe UI", 9)).pack(
            side=tk.LEFT, padx=(0, 4)
        )
        self.var_busca_lista = tk.StringVar()
        self.var_busca_lista.trace_add("write", lambda *a: self._atualizar_lista_paises())
        entry_busca = tk.Entry(
            frame_busca,
            textvariable=self.var_busca_lista,
            bg="#0f172a",
            fg=COR_TEXTO,
            insertbackground=COR_TEXTO,
            relief=tk.FLAT,
            font=("Segoe UI", 9),
        )
        entry_busca.pack(side=tk.LEFT, fill=tk.X, expand=True, ipady=3)

        # Listbox estilizada com Scrollbar (clicar num país dá zoom nele no mapa!)
        frame_scroll = tk.Frame(card_lista, bg="#0f172a")
        frame_scroll.pack(fill=tk.BOTH, expand=True)

        scrollbar = tk.Scrollbar(frame_scroll, orient=tk.VERTICAL)
        self.listbox_paises = tk.Listbox(
            frame_scroll,
            bg="#0f172a",
            fg=COR_TEXTO,
            selectbackground="#2563eb",
            selectforeground="#ffffff",
            font=("Segoe UI", 10),
            relief=tk.FLAT,
            highlightthickness=0,
            activestyle="none",
            yscrollcommand=scrollbar.set,
        )
        scrollbar.config(command=self.listbox_paises.yview)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.listbox_paises.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        self.listbox_paises.bind("<<ListboxSelect>>", self._ao_selecionar_item_lista)

        self.codigos_na_listbox = []

    def _criar_botao(
        self, parent, texto, comando, bg="#334155", hover="#475569", pad=(10, 5), fonte=("Segoe UI", 9, "bold")
    ):
        btn = tk.Button(
            parent,
            text=texto,
            command=comando,
            bg=bg,
            fg="#ffffff",
            activebackground=hover,
            activeforeground="#ffffff",
            font=fonte,
            relief=tk.FLAT,
            cursor="hand2",
            padx=pad[0],
            pady=pad[1],
            bd=0,
        )
        btn.bind("<Enter>", lambda e: btn.configure(bg=hover))
        btn.bind("<Leave>", lambda e: btn.configure(bg=bg))
        return btn

    def _vincular_atalhos(self):
        self.root.bind("<F1>", lambda e: self.pedir_dica_geral())
        # Qualquer tecla de letra quando o foco não está num Entry foca na caixa de digitação principal
        self.root.bind("<KeyPress>", self._redirecionar_digitacao_para_entry)

    def _redirecionar_digitacao_para_entry(self, event):
        foco = self.root.focus_get()
        if isinstance(foco, tk.Entry):
            return
        if event.char and event.char.isprintable() and not event.state & 0x4:
            self.entry_pais.focus_set()

    # ========================================================================
    # DESENHO E GEOMETRIA DO MAPA-MÚNDI NO CANVAS
    # ========================================================================
    def _inicializar_mapa_e_jogo(self):
        self._desenhar_mapa_base()
        self.preparar_partida()

    def _desenhar_mapa_base(self):
        """Cria todos os itens vetoriais do mapa uma única vez para zoom/pan instantâneo."""
        self.canvas.delete("all")
        self.itens_poligonos.clear()
        self.itens_marcadores.clear()
        self.itens_rotulos_mapa.clear()
        self.item_Para_codigo.clear()

        self.escala_mapa = 1.0
        self.offset_x = 0.0
        self.offset_y = 0.0

        # 1. Grade de meridianos e paralelos (tag 'mapa')
        for lon in range(-180, 181, 30):
            x = float(lon)
            y1 = -83.0 * self.FATOR_LAT
            y2 = 58.0 * self.FATOR_LAT
            self.canvas.create_line(x, y1, x, y2, fill=COR_GRADE, width=1, tags=("mapa", "grade"))

        for lat in range(-45, 76, 15):
            y = -float(lat) * self.FATOR_LAT
            self.canvas.create_line(
                -180.0, y, 180.0, y,
                fill="#17325c" if lat == 0 else COR_GRADE,
                width=1.5 if lat == 0 else 1,
                tags=("mapa", "grade"),
            )

        # 2. Territórios neutros de fundo (Groenlândia, Saara Ocidental, Porto Rico, etc.)
        for terr in TERRITORIOS_NEUTROS:
            tcode = f"NEUTRO_{terr['codigo']}"
            for anel in terr["poligonos"]:
                coords = []
                for lon, lat in anel:
                    coords.append(float(lon))
                    coords.append(-float(lat) * self.FATOR_LAT)
                item_id = self.canvas.create_polygon(
                    *coords,
                    fill=COR_PAIS_NEUTRO,
                    outline=COR_BORDA_PAIS,
                    width=0.6,
                    tags=("mapa", "neutro", tcode),
                )
                self.item_Para_codigo[item_id] = tcode

        # 3. Polígonos dos 197 Países Soberanos
        for codigo, dados in PAISES.items():
            ids_pais = []
            for anel in dados["poligonos"]:
                coords = []
                for lon, lat in anel:
                    coords.append(float(lon))
                    coords.append(-float(lat) * self.FATOR_LAT)
                item_id = self.canvas.create_polygon(
                    *coords,
                    fill=COR_PAIS_PADRAO,
                    outline=COR_BORDA_PAIS,
                    width=0.8,
                    tags=("mapa", "pais", f"pais_{codigo}"),
                )
                ids_pais.append(item_id)
                self.item_Para_codigo[item_id] = codigo
            self.itens_poligonos[codigo] = ids_pais

        # 4. Marcadores circulares para microestados e pequenas nações insulares
        for codigo, dados in PAISES.items():
            if dados.get("pequeno"):
                cx, cy_lat = dados["centro"]
                x = float(cx)
                y = -float(cy_lat) * self.FATOR_LAT
                r = 0.8
                oval_id = self.canvas.create_oval(
                    x - r,
                    y - r,
                    x + r,
                    y + r,
                    fill=COR_PAIS_PADRAO,
                    outline="#94a3b8",
                    width=1.0,
                    tags=("mapa", "marcador", f"marcador_{codigo}"),
                )
                self.itens_marcadores[codigo] = oval_id
                self.item_Para_codigo[oval_id] = codigo

        # 5. Rótulos de nomes no mapa (ocultos inicialmente até acertar/encerrar)
        for codigo, dados in PAISES.items():
            cx, cy_lat = dados["centro"]
            x = float(cx)
            y = -float(cy_lat) * self.FATOR_LAT
            txt_id = self.canvas.create_text(
                x,
                y,
                text=dados["nome"],
                fill="#ffffff",
                font=("Segoe UI", 8, "bold"),
                state=tk.HIDDEN,
                tags=("mapa", "rotulo", f"rotulo_{codigo}"),
            )
            self.itens_rotulos_mapa[codigo] = txt_id

        # 6. Tooltip flutuante sobre o mapa (fora da tag 'mapa' para manter tamanho fixo em pixels)
        self.bg_tooltip = self.canvas.create_rectangle(
            0, 0, 10, 10, fill="#0f172a", outline="#38bdf8", width=1.5, state=tk.HIDDEN, tags=("ui_overlay",)
        )
        self.txt_tooltip = self.canvas.create_text(
            0, 0, text="", fill="#f8fafc", font=("Segoe UI", 9, "bold"), anchor="nw", state=tk.HIDDEN, tags=("ui_overlay",)
        )

        # 7. Overlay de Jogo Pausado
        self.bg_pausa = self.canvas.create_rectangle(
            0, 0, 2000, 2000, fill="#081426", outline="", state=tk.HIDDEN, tags=("ui_pausa",)
        )
        self.txt_pausa = self.canvas.create_text(
            500,
            300,
            text="⏸️ JOGO PAUSADO\n\nClique em 'Continuar' para voltar ao mapa",
            fill="#f8fafc",
            font=("Segoe UI", 20, "bold"),
            justify=tk.CENTER,
            state=tk.HIDDEN,
            tags=("ui_pausa",),
        )

    def _mundo_para_tela(self, lon: float, lat: float):
        wx = float(lon)
        wy = -float(lat) * self.FATOR_LAT
        sx = wx * self.escala_mapa + self.offset_x
        sy = wy * self.escala_mapa + self.offset_y
        return sx, sy

    def _atualizar_raios_marcadores(self):
        """Mantém os marcadores de microestados com tamanho legível independentemente do nível de zoom."""
        raio_px = max(4.2, min(7.5, 2.2 * math.sqrt(max(1.0, self.escala_mapa / 2.5))))
        for codigo, oval_id in self.itens_marcadores.items():
            cx, cy_lat = PAISES[codigo]["centro"]
            sx, sy = self._mundo_para_tela(cx, cy_lat)
            self.canvas.coords(oval_id, sx - raio_px, sy - raio_px, sx + raio_px, sy + raio_px)

    def enquadrar_caixa_geografica(self, lon_min, lat_min, lon_max, lat_max):
        """Ajusta zoom e posição do mapa para enquadrar perfeitamente a caixa de coordenadas."""
        self.root.update_idletasks()
        largura = max(300, self.canvas.winfo_width())
        altura = max(200, self.canvas.winfo_height())

        wx1 = float(lon_min)
        wx2 = float(lon_max)
        wy1 = -float(lat_max) * self.FATOR_LAT
        wy2 = -float(lat_min) * self.FATOR_LAT

        span_x = max(4.0, wx2 - wx1)
        span_y = max(4.0, wy2 - wy1)

        nova_escala = min((largura * 0.92) / span_x, (altura * 0.90) / span_y)
        nova_escala = max(1.8, min(95.0, nova_escala))

        fator = nova_escala / self.escala_mapa
        self.canvas.scale("mapa", 0.0, 0.0, fator, fator)
        self.offset_x *= fator
        self.offset_y *= fator
        self.escala_mapa = nova_escala

        centro_wx = (wx1 + wx2) / 2.0
        centro_wy = (wy1 + wy2) / 2.0
        atual_sx = centro_wx * self.escala_mapa + self.offset_x
        atual_sy = centro_wy * self.escala_mapa + self.offset_y

        dx = (largura / 2.0) - atual_sx
        dy = (altura / 2.0) - atual_sy

        self.canvas.move("mapa", dx, dy)
        self.offset_x += dx
        self.offset_y += dy

        self._atualizar_raios_marcadores()
        self.canvas.tag_raise("marcador")
        self.canvas.tag_raise("rotulo")
        self.canvas.tag_raise("ui_overlay")

    def enquadrar_regiao_atual(self):
        caixa = ENQUADRAMENTOS_CONTINENTES.get(self.modo_atual, ENQUADRAMENTOS_CONTINENTES["Mundo Inteiro"])
        self.enquadrar_caixa_geografica(*caixa)

    def enquadrar_continente(self, continente: str):
        caixa = ENQUADRAMENTOS_CONTINENTES.get(continente, ENQUADRAMENTOS_CONTINENTES["Mundo Inteiro"])
        self.enquadrar_caixa_geografica(*caixa)

    def focar_no_pais(self, codigo: str):
        if codigo not in PAISES:
            return
        dados = PAISES[codigo]
        lons = []
        lats = []
        for anel in dados["poligonos"]:
            for lon, lat in anel:
                lons.append(lon)
                lats.append(lat)
        cx, cy = dados["centro"]
        if not lons or (max(lons) - min(lons) > 80.0):
            # Países que cruzam o antimeridiano ou têm ilhas distantes (ex: Rússia, EUA, Kiribati)
            margem = 15.0 if not dados["pequeno"] else 5.0
            self.enquadrar_caixa_geografica(cx - margem, cy - margem, cx + margem, cy + margem)
        else:
            pad = max(3.5, (max(lons) - min(lons)) * 0.8, (max(lats) - min(lats)) * 0.8)
            self.enquadrar_caixa_geografica(min(lons) - pad, min(lats) - pad, max(lons) + pad, max(lats) + pad)

    def aplicar_zoom_ponto(self, sx: float, sy: float, fator: float):
        nova_escala = self.escala_mapa * fator
        if nova_escala < 1.6 or nova_escala > 120.0:
            return
        self.canvas.scale("mapa", sx, sy, fator, fator)
        self.offset_x = sx + (self.offset_x - sx) * fator
        self.offset_y = sy + (self.offset_y - sy) * fator
        self.escala_mapa = nova_escala
        self._atualizar_raios_marcadores()

    def aplicar_zoom_centro(self, fator: float):
        w = max(200, self.canvas.winfo_width())
        h = max(200, self.canvas.winfo_height())
        self.aplicar_zoom_ponto(w / 2.0, h / 2.0, fator)

    # ========================================================================
    # LÓGICA DE JOGO, CORES E PARTIDA
    # ========================================================================
    def _obter_escopo_modo(self, nome_modo: str):
        escopo = set()
        for codigo, dados in PAISES.items():
            cont = dados["continente"]
            if nome_modo == "Mundo Inteiro":
                escopo.add(codigo)
            elif nome_modo == "Américas":
                if cont in ("América do Sul", "América do Norte e Central"):
                    escopo.add(codigo)
            elif cont == nome_modo:
                escopo.add(codigo)
        return escopo

    def preparar_partida(self):
        """Prepara o mapa e o cronômetro na configuração escolhida, aguardando o usuário iniciar."""
        self._cancelar_timer_prefixo()
        if self.timer_job:
            self.root.after_cancel(self.timer_job)
            self.timer_job = None

        # Lê modo selecionado
        texto_modo = self.combo_modo.get()
        self.modo_atual = texto_modo.split(" (")[0].strip()

        # Lê tempo selecionado
        idx_tempo = max(0, self.combo_tempo.current())
        self.tempo_total_seg = OPCOES_TEMPO[idx_tempo][1]
        self.tempo_restante_seg = self.tempo_total_seg

        self.paises_escopo = self._obter_escopo_modo(self.modo_atual)
        self.paises_acertados.clear()
        self.paises_perdidos.clear()
        self.ordem_acertos.clear()
        self.revelacoes_dica.clear()
        self.capital_revelada.clear()
        self.pais_selecionado = None

        self.jogo_ativo = False
        self.jogo_pausado = False
        self.jogo_encerrado = False
        self._ocultar_overlay_pausa()

        self.btn_iniciar.configure(text="▶️ Iniciar Jogo", state=tk.NORMAL)
        self.btn_pausar.configure(text="⏸️ Pausar", state=tk.DISABLED)
        self.btn_dica_topo.configure(state=tk.DISABLED)
        self.btn_desistir.configure(state=tk.DISABLED)
        self.btn_confirmar.configure(state=tk.DISABLED)

        self.var_entrada.set("")
        self.entry_pais.configure(state=tk.DISABLED)

        self.lbl_feedback.configure(
            text=f"Pronto: {self.modo_atual} ({len(self.paises_escopo)} países). Clique em '▶️ Iniciar Jogo' quando quiser começar!",
            fg=COR_DESTAQUE_AZUL,
        )

        self._atualizar_todas_cores_mapa()
        self._atualizar_visibilidade_marcadores()
        self._atualizar_visibilidade_rotulos()
        self._atualizar_placar_e_progresso()
        self._atualizar_card_inspecao()
        self._atualizar_lista_paises()
        self.enquadrar_regiao_atual()
        self._atualizar_display_cronometro()

    def iniciar_novo_jogo(self):
        """Inicia efetivamente a partida e dispara a contagem do cronômetro."""
        if not self.paises_escopo or self.jogo_encerrado or self.jogo_ativo:
            self.preparar_partida()

        self.jogo_ativo = True
        self.jogo_pausado = False
        self.jogo_encerrado = False
        self._ocultar_overlay_pausa()

        self.btn_iniciar.configure(text="▶️ Em Andamento", state=tk.DISABLED)
        self.btn_pausar.configure(text="⏸️ Pausar", state=tk.NORMAL)
        self.btn_dica_topo.configure(state=tk.NORMAL)
        self.btn_desistir.configure(state=tk.NORMAL)
        self.btn_confirmar.configure(state=tk.NORMAL)

        self.entry_pais.configure(state=tk.NORMAL)
        self.var_entrada.set("")
        self.entry_pais.focus_set()

        self.lbl_feedback.configure(
            text=f"Partida iniciada: {self.modo_atual} ({len(self.paises_escopo)} países). Boa sorte!",
            fg=COR_PAIS_ACERTADO,
        )

        # Inicia o cronômetro agora!
        self._atualizar_display_cronometro()
        self.ultimo_tick = time.monotonic()
        self._tick_cronometro()

    def _ao_mudar_configuracao(self, event=None):
        self.preparar_partida()

    def _tick_cronometro(self):
        if not self.jogo_ativo or self.jogo_encerrado:
            return

        agora = time.monotonic()
        decorrido = agora - self.ultimo_tick
        self.ultimo_tick = agora

        if not self.jogo_pausado and self.tempo_total_seg > 0:
            self.tempo_restante_seg = max(0.0, self.tempo_restante_seg - decorrido)
            self._atualizar_display_cronometro()

            if self.tempo_restante_seg <= 0.0:
                self._finalizar_por_tempo_esgotado()
                return

        self.timer_job = self.root.after(200, self._tick_cronometro)

    def _atualizar_display_cronometro(self):
        if self.tempo_total_seg == 0:
            self.lbl_cronometro.configure(text="∞ LIVRE", fg="#38bdf8")
            return

        seg = int(math.ceil(self.tempo_restante_seg))
        minutos = seg // 60
        segundos = seg % 60
        self.lbl_cronometro.configure(text=f"{minutos:02d}:{segundos:02d}")

        if seg <= 30:
            self.lbl_cronometro.configure(fg=COR_PAIS_PERDIDO)
        elif seg <= 120:
            self.lbl_cronometro.configure(fg=COR_AVISO)
        else:
            self.lbl_cronometro.configure(fg="#38bdf8")

    def alternar_pausa(self):
        if not self.jogo_ativo or self.jogo_encerrado:
            return
        self.jogo_pausado = not self.jogo_pausado
        self.ultimo_tick = time.monotonic()
        if self.jogo_pausado:
            self.btn_pausar.configure(text="▶️ Continuar")
            self.entry_pais.configure(state=tk.DISABLED)
            w = max(800, self.canvas.winfo_width())
            h = max(600, self.canvas.winfo_height())
            self.canvas.coords(self.bg_pausa, 0, 0, w, h)
            self.canvas.coords(self.txt_pausa, w / 2, h / 2)
            self.canvas.itemconfigure(self.bg_pausa, state=tk.NORMAL)
            self.canvas.itemconfigure(self.txt_pausa, state=tk.NORMAL)
            self.canvas.tag_raise("ui_pausa")
        else:
            self.btn_pausar.configure(text="⏸️ Pausar")
            self.entry_pais.configure(state=tk.NORMAL)
            self.entry_pais.focus_set()
            self._ocultar_overlay_pausa()

    def _ocultar_overlay_pausa(self):
        self.canvas.itemconfigure(self.bg_pausa, state=tk.HIDDEN)
        self.canvas.itemconfigure(self.txt_pausa, state=tk.HIDDEN)

    # ========================================================================
    # VERIFICAÇÃO DE PALPITES E AUTO-MATCH INTELIGENTE
    # ========================================================================
    def _buscar_pais_por_texto(self, texto: str):
        norm = normalizar_texto(texto)
        if not norm:
            return None
        if norm in self.indice_nomes:
            return self.indice_nomes[norm]
        norm_sp = normalizar_sem_preposicoes(texto)
        if norm_sp and norm_sp in self.indice_sem_prep:
            return self.indice_sem_prep[norm_sp]
        return None

    def _existe_outro_pais_faltante_com_prefixo(self, prefixo_norm: str, codigo_atual: str) -> bool:
        """
        Verifica se o texto digitado é prefixo do nome de outro país que ainda falta adivinhar.
        Exemplo: 'guine' é prefixo de 'guine bissau' e 'guine equatorial'; 'niger' é prefixo de 'nigeria'.
        """
        faltantes = self.paises_escopo - self.paises_acertados
        for nome_norm, cod in self.indice_nomes.items():
            if cod != codigo_atual and cod in faltantes:
                if nome_norm.startswith(prefixo_norm) and len(nome_norm) > len(prefixo_norm):
                    return True
        return False

    def _cancelar_timer_prefixo(self):
        if self.prefixo_timer_job:
            self.root.after_cancel(self.prefixo_timer_job)
            self.prefixo_timer_job = None

    def _ao_digitar_texto(self, *args):
        self._cancelar_timer_prefixo()

        if not self.jogo_ativo or self.jogo_pausado or self.jogo_encerrado:
            return

        texto = self.var_entrada.get()
        norm = normalizar_texto(texto)
        if not norm:
            return

        codigo = self._buscar_pais_por_texto(texto)
        if not codigo or codigo not in self.paises_escopo:
            return

        if codigo in self.paises_acertados:
            nome_oficial = PAISES[codigo]["nome"]
            self.lbl_feedback.configure(
                text=f"ℹ️ {nome_oficial} já foi acertado!", fg=COR_DESTAQUE_AZUL
            )
            return

        # Se existe outro país faltante cujo nome começa com o que foi digitado,
        # aguarda um breve tempo de folga antes de confirmar automaticamente
        if self._existe_outro_pais_faltante_com_prefixo(norm, codigo):
            nome_oficial = PAISES[codigo]["nome"]
            self.lbl_feedback.configure(
                text=f"⏳ '{nome_oficial}' reconhecido — aguardando breve pausa para confirmar automaticamente...",
                fg=COR_AVISO,
            )
            self.prefixo_timer_job = self.root.after(
                self.TEMPO_FOLGA_PREFIXO_MS,
                lambda c=codigo, n=norm: self._confirmar_prefixo_apos_folga(c, n),
            )
            return

        # Acerto imediato!
        self._registrar_acerto(codigo)

    def _confirmar_prefixo_apos_folga(self, codigo: str, norm_esperado: str):
        self.prefixo_timer_job = None
        if not self.jogo_ativo or self.jogo_pausado or self.jogo_encerrado:
            return
        if codigo in self.paises_acertados or codigo not in self.paises_escopo:
            return
        if normalizar_texto(self.var_entrada.get()) == norm_esperado:
            self._registrar_acerto(codigo)

    def _ao_pressionar_enter(self, event=None):
        if not self.jogo_ativo or self.jogo_pausado or self.jogo_encerrado:
            return

        texto = self.var_entrada.get().strip()
        if not texto:
            return

        codigo = self._buscar_pais_por_texto(texto)
        if not codigo:
            self.lbl_feedback.configure(
                text=f"❌ '{texto}' não foi reconhecido como um país válido.", fg=COR_PAIS_PERDIDO
            )
            self._piscar_entry("#ef4444")
            return

        if codigo not in self.paises_escopo:
            nome_oficial = PAISES[codigo]["nome"]
            cont = PAISES[codigo]["continente"]
            self.lbl_feedback.configure(
                text=f"ℹ️ {nome_oficial} fica na {cont} (fora da região atual: {self.modo_atual}).",
                fg=COR_AVISO,
            )
            return

        if codigo in self.paises_acertados:
            nome_oficial = PAISES[codigo]["nome"]
            self.lbl_feedback.configure(
                text=f"ℹ️ Você já acertou {nome_oficial}!", fg=COR_DESTAQUE_AZUL
            )
            self.var_entrada.set("")
            return

        self._registrar_acerto(codigo)

    def _registrar_acerto(self, codigo: str):
        """Marca o país como acertado (Verde), atualiza placar, mapa e lista."""
        self._cancelar_timer_prefixo()
        self.paises_acertados.add(codigo)
        self.ordem_acertos.append(codigo)

        # Limpa caixa de texto sem disparar recursão
        self.var_entrada.set("")
        self._piscar_entry(COR_PAIS_ACERTADO)

        dados = PAISES[codigo]
        restantes = len(self.paises_escopo) - len(self.paises_acertados)
        self.lbl_feedback.configure(
            text=f"✅ Acertou: {dados['nome']} ({dados['continente']}) — Faltam {restantes}!",
            fg=COR_PAIS_ACERTADO,
        )

        # Se estava selecionado como dica, mantém selecionado para mostrar os dados completos ou limpa
        if self.pais_selecionado == codigo:
            self._atualizar_card_inspecao()

        # Efeito visual de pulso verde claro e depois verde oficial
        self._pintar_pais(codigo, COR_PAIS_ACERTADO_PULSO, COR_BORDA_SELECIONADO, largura=1.8)
        self.root.after(450, lambda c=codigo: self._atualizar_cor_pais(c))

        self._atualizar_visibilidade_rotulos()
        self._atualizar_placar_e_progresso()
        self._atualizar_lista_paises()

        # Verifica vitória total!
        if len(self.paises_acertados) == len(self.paises_escopo):
            self._finalizar_vitoria()

    def _piscar_entry(self, cor_borda: str):
        self.entry_pais.configure(highlightbackground=cor_borda, highlightcolor=cor_borda)
        self.root.after(
            350,
            lambda: self.entry_pais.configure(highlightbackground="#38bdf8", highlightcolor="#22c55e"),
        )

    # ========================================================================
    # FIM DE JOGO (TEMPO ESGOTADO -> PAÍSES FALTANTES EM VERMELHO / VITÓRIA)
    # ========================================================================
    def encerrar_partida_manual(self):
        if self.jogo_encerrado:
            return
        faltam = len(self.paises_escopo) - len(self.paises_acertados)
        if faltam > 0:
            confirmar = messagebox.askyesno(
                "Encerrar Partida",
                f"Ainda faltam {faltam} países.\n\nDeseja encerrar o tempo agora e destacar em VERMELHO todos os países que não foram adivinhados?",
            )
            if not confirmar:
                return
        self._finalizar_por_tempo_esgotado(manual=True)

    def _finalizar_por_tempo_esgotado(self, manual=False):
        """
        Quando o tempo acaba (ou o jogador encerra), todos os países não adivinhados
        ficam imediatamente em VERMELHO no mapa, e os acertados permanecem em VERDE.
        """
        self.jogo_ativo = False
        self.jogo_encerrado = True
        self.jogo_pausado = False
        self._ocultar_overlay_pausa()

        self._cancelar_timer_prefixo()
        if self.timer_job:
            self.root.after_cancel(self.timer_job)
            self.timer_job = None

        # Todos os países do escopo que não foram adivinhados ficam vermelhos
        self.paises_perdidos = self.paises_escopo - self.paises_acertados

        self.entry_pais.configure(state=tk.DISABLED)
        self.btn_iniciar.configure(text="▶️ Iniciar Novo Jogo", state=tk.NORMAL)
        self.btn_pausar.configure(state=tk.DISABLED)
        self.btn_dica_topo.configure(state=tk.DISABLED)
        self.btn_desistir.configure(state=tk.DISABLED)
        self.btn_confirmar.configure(state=tk.DISABLED)

        # Ativa os nomes no mapa automaticamente ou atualiza as cores para verde/vermelho
        self._atualizar_todas_cores_mapa()
        self._atualizar_visibilidade_rotulos()
        self._atualizar_card_inspecao()
        self._definir_filtro_lista("vermelhos" if self.paises_perdidos else "todos")
        self.root.update_idletasks()

        acertos = len(self.paises_acertados)
        total = len(self.paises_escopo)
        perc = int(round((acertos / total) * 100)) if total else 0
        faltaram = len(self.paises_perdidos)

        motivo = "Partida encerrada!" if manual else "⏰ O tempo acabou!"
        self.lbl_feedback.configure(
            text=f"{motivo} Acertados: {acertos}/{total} ({perc}%) em VERDE | Não adivinhados: {faltaram} em VERMELHO. Clique neles para explorar!",
            fg=COR_PAIS_PERDIDO,
        )

        messagebox.showinfo(
            "Fim de Jogo — Resultado",
            f"{motivo}\n\n"
            f"🌍 Região: {self.modo_atual}\n"
            f"✅ Países acertados (Verde): {acertos} de {total} ({perc}%)\n"
            f"❌ Países não adivinhados (Vermelho): {faltaram}\n\n"
            f"Dica: Você pode passar o mouse ou clicar nos países em VERMELHO no mapa (ou na lista à direita) para ver onde cada um fica!",
        )

    def _finalizar_vitoria(self):
        self.jogo_ativo = False
        self.jogo_encerrado = True
        if self.timer_job:
            self.root.after_cancel(self.timer_job)
            self.timer_job = None

        self.entry_pais.configure(state=tk.DISABLED)
        self.btn_iniciar.configure(text="▶️ Iniciar Novo Jogo", state=tk.NORMAL)
        self.btn_pausar.configure(state=tk.DISABLED)
        self.btn_dica_topo.configure(state=tk.DISABLED)
        self.btn_desistir.configure(state=tk.DISABLED)
        self.btn_confirmar.configure(state=tk.DISABLED)

        total = len(self.paises_escopo)
        self.lbl_feedback.configure(
            text=f"🏆 PARABÉNS! Você acertou todos os {total} países de {self.modo_atual}!",
            fg=COR_PAIS_ACERTADO,
        )
        messagebox.showinfo(
            "🏆 Vitória Completa!",
            f"Incrível! Você acertou todos os {total} países de {self.modo_atual}!",
        )

    # ========================================================================
    # ATUALIZAÇÃO DE CORES DO MAPA E PAINEL LATERAL
    # ========================================================================
    def _obter_cor_estado_pais(self, codigo: str):
        """Retorna (cor_preenchimento, cor_borda, espessura) conforme o estado atual do país."""
        eh_hover = (codigo == self.pais_hover)
        eh_selecionado = (codigo == self.pais_selecionado)

        if codigo not in self.paises_escopo:
            return COR_PAIS_FORA_ESCOPO, COR_BORDA_PAIS, 0.6

        if codigo in self.paises_acertados:
            fill = COR_PAIS_ACERTADO_HOVER if eh_hover else COR_PAIS_ACERTADO
            outline = COR_BORDA_SELECIONADO if eh_selecionado else COR_BORDA_ACERTADO
            width = 1.6 if (eh_selecionado or eh_hover) else 0.9
            return fill, outline, width

        if codigo in self.paises_perdidos:
            fill = COR_PAIS_PERDIDO_HOVER if eh_hover else COR_PAIS_PERDIDO
            outline = COR_BORDA_SELECIONADO if eh_selecionado else COR_BORDA_PERDIDO
            width = 1.6 if (eh_selecionado or eh_hover) else 0.9
            return fill, outline, width

        if eh_selecionado:
            return COR_PAIS_SELECIONADO, COR_BORDA_SELECIONADO, 1.8

        if eh_hover:
            return COR_PAIS_HOVER, "#94a3b8", 1.2

        return COR_PAIS_PADRAO, COR_BORDA_PAIS, 0.8

    def _pintar_pais(self, codigo: str, fill: str, outline: str, largura: float = 0.8):
        for item_id in self.itens_poligonos.get(codigo, []):
            self.canvas.itemconfigure(item_id, fill=fill, outline=outline, width=largura)
        oval_id = self.itens_marcadores.get(codigo)
        if oval_id:
            borda_pino = "#ffffff" if codigo in (self.pais_selecionado, self.pais_hover) else "#cbd5e1"
            self.canvas.itemconfigure(oval_id, fill=fill, outline=borda_pino, width=1.2)

    def _atualizar_cor_pais(self, codigo: str):
        if codigo not in PAISES:
            return
        fill, outline, width = self._obter_cor_estado_pais(codigo)
        self._pintar_pais(codigo, fill, outline, width)

    def _atualizar_todas_cores_mapa(self):
        for codigo in PAISES:
            self._atualizar_cor_pais(codigo)

    def _atualizar_visibilidade_marcadores(self):
        mostrar = self.mostrar_marcadores_ilhas.get()
        for codigo, oval_id in self.itens_marcadores.items():
            visivel = mostrar and (codigo in self.paises_escopo)
            self.canvas.itemconfigure(oval_id, state=tk.NORMAL if visivel else tk.HIDDEN)

    def _atualizar_visibilidade_rotulos(self):
        mostrar = self.mostrar_nomes_mapa.get()
        for codigo, txt_id in self.itens_rotulos_mapa.items():
            revelado = (codigo in self.paises_acertados) or (codigo in self.paises_perdidos)
            if mostrar and revelado and (codigo in self.paises_escopo):
                cor_txt = "#bbf7d0" if codigo in self.paises_acertados else "#fecaca"
                self.canvas.itemconfigure(txt_id, state=tk.NORMAL, fill=cor_txt)
            else:
                self.canvas.itemconfigure(txt_id, state=tk.HIDDEN)

    def _atualizar_placar_e_progresso(self):
        acertos = len(self.paises_acertados)
        total = len(self.paises_escopo)
        perc = int(round((acertos / total) * 100)) if total else 0

        self.lbl_placar.configure(text=f"{acertos} / {total} ({perc}%)")
        self.progresso_geral["maximum"] = max(1, total)
        self.progresso_geral["value"] = acertos

        # Atualiza contadores por continente
        for cont, lbl in self.labels_continentes.items():
            tot_c = sum(1 for c in self.paises_escopo if PAISES[c]["continente"] == cont)
            ac_c = sum(1 for c in self.paises_acertados if PAISES[c]["continente"] == cont)
            if tot_c == 0:
                lbl.configure(text="—", fg="#475569")
            elif ac_c == tot_c:
                lbl.configure(text=f"✅ {ac_c}/{tot_c}", fg=COR_PAIS_ACERTADO)
            else:
                lbl.configure(text=f"{ac_c}/{tot_c}", fg=COR_TEXTO)

    # ========================================================================
    # DICAS E INSPEÇÃO DE PAÍS SELECIONADO
    # ========================================================================
    def selecionar_pais_mapa(self, codigo: str):
        anterior = self.pais_selecionado
        self.pais_selecionado = codigo
        if anterior:
            self._atualizar_cor_pais(anterior)
        if codigo:
            self._atualizar_cor_pais(codigo)
        self._atualizar_card_inspecao()
        if self.jogo_ativo and not self.jogo_pausado:
            self.entry_pais.focus_set()

    def _obter_mascara_nome(self, codigo: str) -> str:
        nome = PAISES[codigo]["nome"]
        qtd_revelada = self.revelacoes_dica.get(codigo, 0)
        resultado = []
        contador_letras = 0
        for ch in nome:
            if ch in (" ", "-"):
                resultado.append(ch)
            else:
                contador_letras += 1
                if contador_letras <= qtd_revelada:
                    resultado.append(ch)
                else:
                    resultado.append("_")
        return " ".join(resultado), contador_letras

    def _atualizar_card_inspecao(self):
        codigo = self.pais_selecionado
        if not codigo or codigo not in PAISES:
            self.lbl_inspecao_titulo.configure(
                text="Clique em qualquer país no mapa", fg=COR_TEXTO
            )
            self.lbl_inspecao_detalhe.configure(
                text="Ao clicar num país, ele fica destacado em dourado e você pode pedir dicas de capital ou letras!"
            )
            return

        dados = PAISES[codigo]
        if codigo in self.paises_acertados:
            self.lbl_inspecao_titulo.configure(
                text=f"✅ {dados['nome']}", fg=COR_PAIS_ACERTADO
            )
            self.lbl_inspecao_detalhe.configure(
                text=f"Continente: {dados['continente']}\nCapital: {dados['capital']}\nCódigo ISO: {codigo}"
            )
        elif codigo in self.paises_perdidos:
            self.lbl_inspecao_titulo.configure(
                text=f"❌ {dados['nome']} (Não adivinhado)", fg=COR_PAIS_PERDIDO
            )
            self.lbl_inspecao_detalhe.configure(
                text=f"Continente: {dados['continente']}\nCapital: {dados['capital']}\nCódigo ISO: {codigo}"
            )
        else:
            mascara, total_letras = self._obter_mascara_nome(codigo)
            cap_txt = dados["capital"] if codigo in self.capital_revelada else "Oculta (clique em 'Ver Capital')"
            self.lbl_inspecao_titulo.configure(
                text=f"❓ País Selecionado ({total_letras} letras)", fg=COR_PAIS_SELECIONADO
            )
            self.lbl_inspecao_detalhe.configure(
                text=f"Continente: {dados['continente']}\nCapital: {cap_txt}\nNome:  {mascara}"
            )

    def revelar_capital_selecionado(self):
        if not self.jogo_ativo or self.jogo_pausado or self.jogo_encerrado:
            self.lbl_feedback.configure(
                text="ℹ️ Clique em '▶️ Iniciar Jogo' antes de pedir dicas!", fg=COR_AVISO
            )
            return
        if not self.pais_selecionado or self.pais_selecionado not in self.paises_escopo:
            self.pedir_dica_geral()
            return
        self.capital_revelada.add(self.pais_selecionado)
        self._atualizar_card_inspecao()
        self.entry_pais.focus_set()

    def revelar_letra_selecionado(self):
        if not self.jogo_ativo or self.jogo_pausado or self.jogo_encerrado:
            self.lbl_feedback.configure(
                text="ℹ️ Clique em '▶️ Iniciar Jogo' antes de pedir dicas!", fg=COR_AVISO
            )
            return
        if not self.pais_selecionado or self.pais_selecionado not in self.paises_escopo:
            self.pedir_dica_geral()
            return
        cod = self.pais_selecionado
        if cod in self.paises_acertados or cod in self.paises_perdidos:
            return
        atual = self.revelacoes_dica.get(cod, 0)
        self.revelacoes_dica[cod] = atual + 1
        self._atualizar_card_inspecao()
        self.entry_pais.focus_set()

    def focar_no_pais_selecionado(self):
        if self.pais_selecionado:
            self.focar_no_pais(self.pais_selecionado)
        self.entry_pais.focus_set()

    def pedir_dica_geral(self):
        """Se não houver país faltante selecionado, sorteia um país faltante, dá zoom nele e mostra a inicial + capital."""
        if not self.jogo_ativo or self.jogo_pausado or self.jogo_encerrado:
            return
        faltantes = list(self.paises_escopo - self.paises_acertados)
        if not faltantes:
            return

        if not self.pais_selecionado or self.pais_selecionado not in faltantes:
            escolhido = random.choice(faltantes)
            self.selecionar_pais_mapa(escolhido)
            self.focar_no_pais(escolhido)

        cod = self.pais_selecionado
        self.capital_revelada.add(cod)
        self.revelacoes_dica[cod] = max(1, self.revelacoes_dica.get(cod, 0) + 1)
        self._atualizar_card_inspecao()

        dados = PAISES[cod]
        mascara, _ = self._obter_mascara_nome(cod)
        self.lbl_feedback.configure(
            text=f"💡 Dica ({dados['continente']}): Capital = {dados['capital']}  |   Letras: {mascara}",
            fg=COR_AVISO,
        )
        self.entry_pais.focus_set()

    # ========================================================================
    # LISTA INTERATIVA LATERAL
    # ========================================================================
    def _definir_filtro_lista(self, modo_filtro: str):
        self.filtro_lista.set(modo_filtro)
        self._atualizar_lista_paises()

    def _atualizar_lista_paises(self):
        self.listbox_paises.delete(0, tk.END)
        self.codigos_na_listbox.clear()

        filtro = self.filtro_lista.get()
        busca = normalizar_texto(self.var_busca_lista.get())

        itens = []
        if filtro in ("todos", "verdes"):
            for cod in reversed(self.ordem_acertos):
                itens.append((cod, True))
        if filtro in ("todos", "vermelhos") and self.jogo_encerrado:
            perdidos_ordenados = sorted(
                self.paises_perdidos, key=lambda c: normalizar_texto(PAISES[c]["nome"])
            )
            for cod in perdidos_ordenados:
                itens.append((cod, False))

        for idx, (cod, acertado) in enumerate(itens):
            dados = PAISES[cod]
            if busca and busca not in normalizar_texto(dados["nome"]) and busca not in normalizar_texto(dados["continente"]):
                continue
            prefixo = "✅" if acertado else "❌"
            texto_item = f" {prefixo}  {dados['nome']}  ({dados['continente']})"
            self.listbox_paises.insert(tk.END, texto_item)
            pos = self.listbox_paises.size() - 1
            self.listbox_paises.itemconfig(
                pos, fg="#86efac" if acertado else "#fca5a5"
            )
            self.codigos_na_listbox.append(cod)

        if self.jogo_encerrado:
            self.lbl_titulo_lista.configure(
                text=f"📋 PAÍSES ({len(self.paises_acertados)} ✅ | {len(self.paises_perdidos)} ❌)",
                fg=COR_TEXTO,
            )
        else:
            self.lbl_titulo_lista.configure(
                text=f"✅ PAÍSES ACERTADOS ({len(self.paises_acertados)})",
                fg=COR_PAIS_ACERTADO,
            )

    def _ao_selecionar_item_lista(self, event=None):
        sel = self.listbox_paises.curselection()
        if not sel:
            return
        idx = sel[0]
        if 0 <= idx < len(self.codigos_na_listbox):
            codigo = self.codigos_na_listbox[idx]
            self.selecionar_pais_mapa(codigo)
            self.focar_no_pais(codigo)

    # ========================================================================
    # EVENTOS DE MOUSE NO MAPA (CLIQUE, DRAG, HOVER, SCROLL ZOOM)
    # ========================================================================
    def _identificar_pais_em_xy(self, x: int, y: int):
        # Procura itens próximos ao ponto clicado/apontado, priorizando marcadores de ilhas
        itens_proximos = self.canvas.find_overlapping(x - 3, y - 3, x + 3, y + 3)
        for item_id in reversed(itens_proximos):
            cod = self.item_Para_codigo.get(item_id)
            if cod and not cod.startswith("NEUTRO_"):
                return cod
        for item_id in reversed(itens_proximos):
            cod = self.item_Para_codigo.get(item_id)
            if cod:
                return cod
        return None

    def _ao_clicar_mapa(self, event):
        if self.jogo_pausado:
            return
        self.arrastando = False
        self.clique_inicial_xy = (event.x, event.y)
        self.ultimo_mouse_xy = (event.x, event.y)

    def _ao_arrastar_mapa(self, event):
        if self.jogo_pausado:
            return
        dx = event.x - self.ultimo_mouse_xy[0]
        dy = event.y - self.ultimo_mouse_xy[1]
        if abs(event.x - self.clique_inicial_xy[0]) > 4 or abs(event.y - self.clique_inicial_xy[1]) > 4:
            self.arrastando = True

        self.canvas.move("mapa", dx, dy)
        self.offset_x += dx
        self.offset_y += dy
        self.ultimo_mouse_xy = (event.x, event.y)

    def _ao_soltar_mapa(self, event):
        if self.jogo_pausado:
            return
        if not self.arrastando:
            cod = self._identificar_pais_em_xy(event.x, event.y)
            if cod and not cod.startswith("NEUTRO_"):
                if cod in self.paises_escopo:
                    self.selecionar_pais_mapa(cod)
                else:
                    dados = PAISES[cod]
                    self.lbl_feedback.configure(
                        text=f"ℹ️ Esse país pertence à região '{dados['continente']}' (fora do filtro atual).",
                        fg=COR_TEXTO_SEC,
                    )
        self.arrastando = False

    def _ao_mover_mouse_mapa(self, event):
        if self.jogo_pausado:
            return
        cod = self._identificar_pais_em_xy(event.x, event.y)

        if cod != self.pais_hover:
            antigo = self.pais_hover
            self.pais_hover = cod
            if antigo and not antigo.startswith("NEUTRO_"):
                self._atualizar_cor_pais(antigo)
            if cod and not cod.startswith("NEUTRO_"):
                self._atualizar_cor_pais(cod)

        if not cod:
            self.canvas.itemconfigure(self.bg_tooltip, state=tk.HIDDEN)
            self.canvas.itemconfigure(self.txt_tooltip, state=tk.HIDDEN)
            return

        # Define o texto do tooltip flutuante
        if cod.startswith("NEUTRO_"):
            tcode = cod.replace("NEUTRO_", "")
            nome_t = next((t["nome"] for t in TERRITORIOS_NEUTROS if t["codigo"] == tcode), "Território")
            texto_tip = f"🏳️ {nome_t} (Território não-soberano)"
            cor_borda = "#64748b"
        elif cod not in self.paises_escopo:
            texto_tip = f"Fora da região atual ({PAISES[cod]['continente']})"
            cor_borda = "#475569"
        elif cod in self.paises_acertados:
            d = PAISES[cod]
            texto_tip = f"✅ {d['nome']}  •  Capital: {d['capital']}"
            cor_borda = COR_PAIS_ACERTADO
        elif cod in self.paises_perdidos:
            d = PAISES[cod]
            texto_tip = f"❌ {d['nome']}  •  Capital: {d['capital']}"
            cor_borda = COR_PAIS_PERDIDO
        else:
            d = PAISES[cod]
            mascara, n_letras = self._obter_mascara_nome(cod)
            if self.revelacoes_dica.get(cod, 0) > 0 or cod in self.capital_revelada:
                cap_info = f" | Cap: {d['capital']}" if cod in self.capital_revelada else ""
                texto_tip = f"❓ {mascara} ({n_letras} letras{cap_info})"
            else:
                texto_tip = f"❓ País misterioso ({d['continente']}, {n_letras} letras) — Clique para dica"
            cor_borda = COR_PAIS_SELECIONADO if cod == self.pais_selecionado else "#38bdf8"

        # Posiciona tooltip próximo ao cursor
        tx = event.x + 14
        ty = event.y + 14
        self.canvas.coords(self.txt_tooltip, tx + 8, ty + 5)
        self.canvas.itemconfigure(self.txt_tooltip, text=texto_tip, state=tk.NORMAL)

        bbox = self.canvas.bbox(self.txt_tooltip)
        if bbox:
            larg_canvas = self.canvas.winfo_width()
            if bbox[2] + 12 > larg_canvas:
                desloc = (bbox[2] + 16) - larg_canvas
                self.canvas.move(self.txt_tooltip, -desloc, 0)
                bbox = self.canvas.bbox(self.txt_tooltip)
            self.canvas.coords(self.bg_tooltip, bbox[0] - 8, bbox[1] - 5, bbox[2] + 8, bbox[3] + 5)
            self.canvas.itemconfigure(self.bg_tooltip, outline=cor_borda, state=tk.NORMAL)
            self.canvas.tag_raise("ui_overlay")

    def _ao_rolar_zoom(self, event):
        if self.jogo_pausado:
            return
        fator = 1.22 if event.delta > 0 else (1.0 / 1.22)
        self.aplicar_zoom_ponto(event.x, event.y, fator)

    def _ao_redimensionar_canvas(self, event):
        if self.escala_mapa == 1.0 and self.offset_x == 0.0:
            self.enquadrar_regiao_atual()


def main():
    root = tk.Tk()
    JogoAdivinharPaises(root)
    root.mainloop()


if __name__ == "__main__":
    main()
