"use strict";
/* Wiki: o manual do sistema dentro do próprio sistema.
   Cada aba explica uma área, com passo a passo e um desenho da tela (SVG, desenhado aqui mesmo: não depende de imagem externa).
   O que a pessoa vê depende do perfil dela: só aparecem as abas das telas que ela realmente usa. */
(() => {
  const { esc } = S;

  /* ===================== peças dos desenhos ===================== */
  const fig = (w, h, dentro, legenda) =>
    `<figure class="wk-fig"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(legenda || "Ilustração da tela")}" preserveAspectRatio="xMidYMid meet">${dentro}</svg>${legenda ? `<figcaption>${esc(legenda)}</figcaption>` : ""}</figure>`;
  const cx = (x, y, w, h, c = "w-pap", r = 8) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" class="${c}"/>`;
  const tx = (x, y, s, c = "w-t2", tam = 11, anc = "start") => `<text x="${x}" y="${y}" class="${c}" font-size="${tam}" text-anchor="${anc}">${esc(s)}</text>`;
  const ln = (x1, y1, x2, y2, c = "w-lin") => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${c}"/>`;
  /** linha "fantasma" de texto (um tracinho cinza, como num rascunho de tela) */
  const fan = (x, y, w, h = 6, c = "w-ph") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" class="${c}"/>`;
  /** cartão de indicador: rótulo em cima, número grande embaixo */
  const kpi = (x, y, w, rot, val, cor = "w-n1") =>
    cx(x, y, w, 56) + tx(x + 12, y + 21, rot, "w-t2", 10) + tx(x + 12, y + 43, val, cor, 19);
  const seta = (x1, y1, x2, y2) => `<path d="M${x1} ${y1} L${x2} ${y2}" class="w-seta" marker-end="url(#wk-pt)"/>`;
  const DEFS = `<defs><marker id="wk-pt" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" class="w-setaP"/></marker></defs>`;
  const colunas = (x, y, alt, vals, larg = 16, gap = 10, cor = "w-b1") =>
    vals.map((v, i) => {
      const h = Math.max(3, alt * v);
      return `<rect x="${x + i * (larg + gap)}" y="${y + alt - h}" width="${larg}" height="${h}" rx="4" class="${cor}"/>`;
    }).join("");

  /* ===================== desenhos de cada tela ===================== */
  const FIG = {
    mapa: () => {
      const tela =
        cx(0, 0, 620, 300, "w-fundo", 10) +
        /* menu lateral escuro */
        cx(0, 0, 146, 300, "w-menu", 0) +
        tx(15, 28, "NORTE LINK", "w-menuT", 12.5) + tx(15, 39, "NORTE LINK", "w-menuI", 5) +
        [["PAINEL", ["Visão geral", "Visão das equipes"]], ["VENDAS", ["Lista de vendas", "Nova venda"]], ["OPERAÇÃO", ["Fechamento do dia"]]]
          .reduce((a, [g, its]) => { a.s += tx(15, a.y, g, "w-menuG", 7); a.y += 14;
            its.forEach((n) => { const on = n === "Fechamento do dia";
              a.s += (on ? cx(7, a.y - 11, 132, 22, "w-menuOn", 7) : "") + `<rect x="17" y="${a.y - 8}" width="9" height="9" rx="2" class="${on ? "w-menuPi" : "w-menuPo"}"/>` + tx(32, a.y, n, on ? "w-menuA" : "w-menuI", 8.5); a.y += 21; });
            a.y += 7; return a; }, { s: "", y: 60 }).s +
        cx(7, 252, 132, 24, "w-menuWk", 7) + `<rect x="17" y="260" width="9" height="9" rx="2" class="w-menuPi"/>` + tx(32, 268, "Wiki · como usar", "w-menuA", 8.5) +
        /* topo */
        cx(146, 0, 474, 44, "w-topo", 0) + cx(158, 10, 23, 23, "w-btnS", 6) + tx(169.5, 25, "☰", "w-t2", 10, "middle") +
        tx(192, 17, "Operação", "w-t3", 7.5) + tx(192, 31, "Fechamento do dia", "w-n1", 11.5) +
        `<circle cx="470" cy="22" r="12" class="w-av"/>` + tx(470, 26, "VR", "w-avT", 8.5, "middle") +
        tx(488, 19, "VINICIUS RIBEIRO", "w-n1", 8) + tx(488, 30, "Gerente", "w-t2", 7.5) +
        cx(588, 10, 23, 23, "w-btnS", 6) +
        /* cabeçalho da tela */
        tx(164, 70, "OPERAÇÃO", "w-mig", 7.5) + tx(164, 90, "Fechamento do dia", "w-n1", 15) +
        tx(164, 106, "sábado, 10 de outubro de 2026 · dia útil 8 de 23,5", "w-t2", 8.5) +
        cx(452, 74, 54, 21, "w-btnS", 7) + tx(479, 88, "Ajuda", "w-t2", 8.5, "middle") +
        cx(512, 74, 90, 21, "w-btn", 7) + tx(557, 88, "Exportar PDF", "w-btnT", 8.5, "middle") +
        /* faixa de previsão */
        cx(160, 118, 442, 52, "w-dest", 10) +
        [["Previsão de BL", "364 BL"], ["Realizado", "124"], ["Dias úteis", "8 de 23,5"], ["Ritmo", "23/dia"]].map(([r, v], i) =>
          tx(178 + i * 110, 137, r, "w-destT", 8) + tx(178 + i * 110, 158, v, "w-destN", 12.5)).join("") +
        /* tabela */
        cx(160, 180, 442, 104) +
        ["Equipe / vendedor", "Vendas", "Inst.", "BL × meta"].map((c, i) => tx(176 + i * 108, 199, c, "w-th", 7.5)).join("") + ln(160, 207, 602, 207) +
        [0, 1, 2].map((r) => (r === 0 ? cx(160, 213 + r * 24, 442, 22, "w-linhaG", 0) : "") +
          (r === 0 ? `<path d="M174 ${220 + r * 24} l4 4 -4 4" class="w-chev"/>` : "") +
          fan(r === 0 ? 184 : 190, 222 + r * 24, r === 0 ? 82 : 66, r === 0 ? 7 : 6, r === 0 ? "w-phF" : "w-ph") +
          [1, 2, 3].map((i) => fan(176 + i * 108, 222 + r * 24, 34, r === 0 ? 7 : 6, r === 0 ? "w-phF" : "w-ph")).join("")).join("");
      const bolha = (n, x, y, x2, y2) =>
        seta(x, y, x2, y2) + `<circle cx="${x}" cy="${y}" r="12" class="w-num"/>` + tx(x, y + 4.5, String(n), "w-numT", 12, "middle");
      return fig(800, 348, DEFS +
        `<g transform="translate(70 34)">${tela}</g>` +
        bolha(1, 36, 120, 56, 120) +
        bolha(2, 300, 14, 300, 32) +
        bolha(3, 762, 110, 742, 110) +
        bolha(4, 762, 260, 742, 260),
        "As quatro partes de qualquer tela: 1 o menu, 2 onde você está, 3 o título com os botões, 4 o conteúdo");
    },

    login: () => fig(420, 250,
      cx(0, 0, 420, 250, "w-fundo", 12) +
      cx(90, 24, 240, 202, "w-pap", 14) +
      cx(104, 40, 34, 34, "w-marca", 10) +
      tx(104, 98, "Entrar", "w-n1", 17) + tx(104, 116, "Use o e-mail e a senha do seu acesso.", "w-t2", 9.5) +
      tx(104, 140, "E-mail", "w-t3", 9) + cx(104, 146, 212, 24, "w-campo", 7) +
      tx(104, 186, "Senha", "w-t3", 9) + cx(104, 192, 212, 24, "w-campo", 7) +
      cx(104, 228, 212, 26, "w-btn", 7) + tx(210, 245, "Entrar", "w-btnT", 11, "middle") +
      tx(210, 272, "Esqueci a senha", "w-mig", 10, "middle"),
      "Tela de entrada: e-mail, senha e o link “Esqueci a senha”"),

    painel: () => fig(620, 250,
      cx(0, 0, 620, 250, "w-fundo", 12) +
      tx(16, 26, "Visão geral", "w-n1", 15) + tx(16, 44, "outubro de 2026 · dia útil 8 de 23,5 (escala 6x1)", "w-t2", 10) +
      cx(16, 58, 588, 58, "w-dest", 10) + tx(32, 82, "Previsão de BL do mês", "w-destT", 10) + tx(32, 104, "364 BL", "w-destN", 20) +
      tx(180, 82, "Realizado", "w-destT", 10) + tx(180, 104, "124", "w-destN", 18) +
      tx(300, 82, "Dias úteis", "w-destT", 10) + tx(300, 104, "8 de 23,5", "w-destN", 18) +
      tx(440, 82, "Ritmo necessário", "w-destT", 10) + tx(440, 104, "21/dia", "w-destN", 18) +
      cx(16, 128, 288, 106) + tx(32, 150, "Vendas por mês", "w-n1", 11) + colunas(34, 166, 52, [0.45, 0.6, 0.5, 0.75, 0.62, 0.95], 26, 16) +
      cx(316, 128, 288, 106) + tx(332, 150, "Situação das vendas", "w-n1", 11) +
      `<circle cx="398" cy="190" r="30" class="w-rosca"/><path d="M398 160 A30 30 0 0 1 424 205" class="w-roscaA"/><path d="M424 205 A30 30 0 0 1 372 207" class="w-roscaB"/>` +
      [["Instaladas", "w-b1", 0], ["Pendentes", "w-b2", 18], ["Canceladas", "w-b3", 36]].map(([s, c, dy]) =>
        `<circle cx="452" cy="${174 + dy}" r="4" class="${c}"/>` + tx(464, 178 + dy, s, "w-t2", 10)).join(""),
      "Visão geral: a previsão do mês em destaque e os gráficos logo abaixo"),

    previsao: () => fig(620, 150,
      cx(0, 0, 620, 150, "w-fundo", 12) +
      cx(16, 16, 588, 118, "w-dest", 12) +
      tx(36, 44, "Previsão de BL do mês", "w-destT", 11) + tx(36, 76, "364 BL", "w-destN", 26) + tx(36, 98, "78% da meta de 468", "w-destT", 10) +
      ln(230, 32, 230, 118, "w-destL") +
      tx(254, 44, "Como o sistema calcula", "w-destT", 11) +
      tx(254, 68, "realizado ÷ dias úteis já passados", "w-destN", 12) +
      tx(254, 88, "× total de dias úteis do mês", "w-destN", 12) +
      tx(254, 112, "Escala 6x1: sábado vale 0,5 e feriado da cidade não conta", "w-destT", 9.5),
      "A previsão usa os dias úteis 6x1 da cidade de cada equipe"),

    vendas: () => fig(620, 250,
      cx(0, 0, 620, 250, "w-fundo", 12) +
      tx(16, 26, "Lista de vendas", "w-n1", 15) +
      cx(16, 40, 588, 44, "w-pap") + tx(30, 58, "Buscar (nome, CPF/CNPJ ou contrato)", "w-t3", 9) + cx(30, 62, 180, 16, "w-campo", 5) +
      tx(224, 58, "Situação", "w-t3", 9) + cx(224, 62, 90, 16, "w-campo", 5) + tx(328, 58, "Período", "w-t3", 9) + cx(328, 62, 120, 16, "w-campo", 5) +
      cx(462, 60, 60, 20, "w-btn", 6) + tx(492, 74, "Filtrar", "w-btnT", 9.5, "middle") +
      cx(530, 60, 70, 20, "w-btnS", 6) + tx(565, 74, "Excel", "w-t2", 9.5, "middle") +
      cx(16, 94, 588, 140) +
      ["Contrato", "Data", "Cliente", "Vendedor", "Situação", "Pacote"].map((s, i) => tx(32 + i * 95, 116, s, "w-th", 9)).join("") +
      ln(16, 124, 604, 124) +
      [0, 1, 2, 3].map((r) => [0, 1, 2, 3, 5].map((i) => fan(32 + i * 95, 138 + r * 24, i === 2 ? 76 : 50)).join("") +
        cx(32 + 4 * 95, 133 + r * 24, 54, 14, r === 3 ? "w-tagR" : "w-tagOk", 7) + ln(16, 152 + r * 24, 604, 152 + r * 24)).join(""),
      "Lista de vendas: filtre por situação e período e exporte o resultado"),

    viabilidade: () => fig(620, 200, DEFS +
      cx(0, 0, 620, 200, "w-fundo", 12) +
      cx(16, 40, 172, 120) + tx(32, 68, "1. Vendedor", "w-n1", 12) + tx(32, 90, "Informa o CEP e o", "w-t2", 10) + tx(32, 106, "número da casa e", "w-t2", 10) + tx(32, 122, "envia o pedido.", "w-t2", 10) +
      cx(224, 40, 172, 120) + tx(240, 68, "2. Backoffice", "w-n1", 12) + tx(240, 90, "Consulta no portal", "w-t2", 10) + tx(240, 106, "da operadora e responde", "w-t2", 10) + tx(240, 122, "atende / não atende.", "w-t2", 10) +
      cx(432, 40, 172, 120) + tx(448, 68, "3. Vendedor", "w-n1", 12) + tx(448, 90, "Recebe o aviso na", "w-t2", 10) + tx(448, 106, "hora e vê a resposta", "w-t2", 10) + tx(448, 122, "com as observações.", "w-t2", 10) +
      seta(192, 100, 220, 100) + seta(400, 100, 428, 100),
      "Viabilidade: o pedido vai e volta dentro do sistema, sem WhatsApp"),

    fechamento: () => fig(620, 270,
      cx(0, 0, 620, 270, "w-fundo", 12) +
      tx(16, 26, "Fechamento do dia", "w-n1", 15) +
      cx(352, 12, 76, 22, "w-btnS", 7) + tx(390, 27, "Excel", "w-t2", 9.5, "middle") +
      cx(436, 12, 92, 22, "w-btn", 7) + tx(482, 27, "Exportar PDF", "w-btnT", 9.5, "middle") +
      cx(536, 12, 68, 22, "w-btnS", 7) + tx(570, 27, "Separados", "w-t2", 9.5, "middle") +
      cx(404, 42, 200, 118, "w-pop", 10) +
      tx(418, 62, "Um arquivo por equipe", "w-n1", 10) +
      cx(418, 70, 172, 18, "w-btn", 6) + tx(504, 83, "Baixar todos (9)", "w-btnT", 9, "middle") +
      [0, 1, 2].map((i) => fan(418, 100 + i * 20, 92, 7) + cx(520, 95 + i * 20, 32, 14, "w-btnS", 5) + cx(556, 95 + i * 20, 32, 14, "w-btnS", 5)).join("") +
      cx(16, 42, 376, 212) +
      ["Equipe / vendedor", "Vendas", "Inst.", "BL × meta"].map((s, i) => tx(32 + i * 92, 64, s, "w-th", 9)).join("") + ln(16, 72, 392, 72) +
      [0, 1, 2, 3, 4].map((r) => {
        const g = r === 0 || r === 3;
        return (g ? cx(16, 78 + r * 30, 376, 28, "w-linhaG", 0) : "") +
          (g ? `<path d="M30 ${88 + r * 30} l5 4 -5 4" class="w-chev"/>` : "") +
          fan(g ? 40 : 46, 89 + r * 30, g ? 84 : 66, g ? 8 : 6, g ? "w-phF" : "w-ph") +
          [1, 2, 3].map((i) => fan(32 + i * 92, 89 + r * 30, 34, g ? 8 : 6, g ? "w-phF" : "w-ph")).join("");
      }).join(""),
      "Fechamento do dia: grupos recolhidos e o menu “Separados”, com um arquivo por equipe"),

    fpd: () => fig(620, 220,
      cx(0, 0, 620, 220, "w-fundo", 12) +
      tx(16, 26, "FPD não pago por safra", "w-n1", 14) + tx(16, 44, "FPD = cliente que não pagou a primeira fatura", "w-t2", 10) +
      cx(16, 58, 588, 146) +
      `<line x1="60" y1="120" x2="580" y2="120" class="w-ref"/>` + tx(584, 124, "25%", "w-refT", 9) +
      ["jul/26", "ago/26", "set/26"].map((m, i) => tx(110 + i * 150, 190, m, "w-t2", 10, "middle")).join("") +
      [[0.42, "w-b1"], [0.75, "w-b3"], [0.55, "w-b1"]].map(([v, c], i) => {
        const h = 110 * v;
        return `<rect x="${86 + i * 150}" y="${176 - h}" width="48" height="${h}" rx="5" class="${c}"/>`;
      }).join("") +
      ln(60, 176, 580, 176, "w-eixo"),
      "Qualidade (FPD): barras vermelhas passaram da referência de 25%"),

    premiacao: () => fig(620, 210,
      cx(0, 0, 620, 210, "w-fundo", 12) +
      tx(16, 26, "Premiação do mês", "w-n1", 15) +
      cx(16, 40, 184, 72) + tx(32, 64, "Faixa 1", "w-n1", 12) + tx(32, 86, "valor menor por BL", "w-t2", 10) + tx(32, 102, "FPD alto ou sem apuração", "w-t2", 9.5) +
      cx(216, 40, 184, 72, "w-papOk") + tx(232, 64, "Faixa 2", "w-okT", 12) + tx(232, 86, "valor maior por BL", "w-t2", 10) + tx(232, 102, "FPD dentro do limite", "w-t2", 9.5) +
      cx(416, 40, 188, 72) + tx(432, 64, "Bônus", "w-n1", 12) + tx(432, 86, "DCC, metas e FPD baixo", "w-t2", 10) + tx(432, 102, "somados ao valor base", "w-t2", 9.5) +
      cx(16, 126, 588, 68, "w-dest", 10) +
      tx(36, 152, "Base (BL × valor da faixa)", "w-destT", 10) + tx(36, 176, "+ bônus", "w-destT", 10) +
      tx(300, 152, "− ajustes do gerente", "w-destT", 10) + tx(300, 176, "= total do mês", "w-destN", 14) +
      tx(560, 170, "R$", "w-destN", 18, "end"),
      "Premiação: a faixa depende do FPD; os bônus entram por cima da base"),

    extrato: () => fig(620, 170, DEFS +
      cx(0, 0, 620, 170, "w-fundo", 12) +
      [["1", "Baixe o extrato", "no portal da operadora"], ["2", "Envie o arquivo", "arraste o .csv aqui"], ["3", "Confira a prévia", "nada é gravado antes"], ["4", "Importe", "só entram linhas novas"]]
        .map(([n, t, d], i) => {
          const x = 16 + i * 148;
          return cx(x, 40, 132, 96) + `<circle cx="${x + 30}" cy="${68}" r="12" class="w-num"/>` + tx(x + 30, 72, n, "w-numT", 11, "middle") +
            tx(x + 50, 72, t, "w-n1", 10.5) + tx(x + 16, 102, d, "w-t2", 9.5) + (i < 3 ? seta(x + 134, 88, x + 146, 88) : "");
        }).join(""),
      "Extrato da operadora: quatro passos, com prévia antes de gravar qualquer coisa"),

    usuarios: () => fig(620, 200,
      cx(0, 0, 620, 200, "w-fundo", 12) +
      tx(16, 26, "Usuários e acessos", "w-n1", 15) +
      cx(16, 40, 588, 40, "w-papAl") + tx(32, 58, "1 pessoa pediu nova senha na tela de login", "w-n1", 10.5) +
      tx(32, 72, "FLAVIO LIMA · flavio@empresa.com", "w-t2", 9.5) +
      cx(468, 50, 120, 20, "w-btn", 6) + tx(528, 64, "Gerar senha", "w-btnT", 9.5, "middle") +
      cx(16, 92, 588, 92) +
      ["Agente", "Equipe", "E-mail de acesso", "Perfil"].map((s, i) => tx(32 + i * 130, 114, s, "w-th", 9)).join("") + ln(16, 122, 604, 122) +
      [0, 1].map((r) => [0, 1, 2, 3].map((i) => fan(32 + i * 130, 138 + r * 26, i === 2 ? 96 : 68)).join("") +
        cx(520, 132 + r * 26, 36, 16, "w-btnS", 5) + cx(560, 132 + r * 26, 36, 16, "w-btnS", 5)).join(""),
      "Usuários e acessos: pedidos de senha aparecem no topo, prontos para resolver"),

    app: () => fig(620, 300,
      cx(0, 0, 620, 300, "w-fundo", 12) +
      [[60, "Início"], [240, "Vendas"], [420, "Premiação"]].map(([x, nome], k) => {
        let dentro = cx(x, 20, 140, 260, "w-celular", 18) + cx(x + 8, 28, 124, 244, "w-pap", 12) +
          cx(x + 8, 28, 124, 26, "w-topoApp", 12) + tx(x + 20, 45, nome, "w-n1", 9) +
          cx(x + 8, 250, 124, 22, "w-tabbar", 0) +
          [0, 1, 2, 3].map((i) => `<circle cx="${x + 24 + i * 32}" cy="261" r="3.5" class="${i === k ? "w-menuPi" : "w-menuPo"}"/>`).join("");
        if (k === 0) dentro += cx(x + 16, 62, 108, 70, "w-dest", 10) + tx(x + 26, 80, "MINHAS BL", "w-destT", 6.5) + tx(x + 26, 104, "2", "w-destN", 20) + tx(x + 44, 104, "de 13", "w-destT", 8) +
          cx(x + 26, 114, 88, 6, "w-destBar", 3) + cx(x + 26, 114, 24, 6, "w-destBarOn", 3) +
          [0, 1].map((i) => cx(x + 16 + i * 56, 142, 52, 44, "w-papB", 8) + tx(x + 24 + i * 56, 158, i ? "No mês" : "Hoje", "w-t2", 7) + tx(x + 24 + i * 56, 178, i ? "2" : "0", "w-n1", 14)).join("") +
          [0, 1, 2].map((i) => cx(x + 16 + i * 37, 196, 33, 40, "w-papB", 8)).join("");
        if (k === 1) dentro += [0, 1, 2].map((i) => cx(x + 16, 64 + i * 56, 108, 48, "w-papB", 10) + fan(x + 26, 80 + i * 56, 56, 7, "w-phF") + cx(x + 86, 74 + i * 56, 30, 12, "w-tagOk", 6) + fan(x + 26, 96 + i * 56, 40)).join("");
        if (k === 2) dentro += cx(x + 16, 62, 108, 76, "w-dest", 10) + tx(x + 26, 82, "PREMIAÇÃO", "w-destT", 6.5) + tx(x + 26, 106, "R$ 90", "w-destN", 17) +
          cx(x + 26, 118, 40, 5, "w-destBar", 3) + cx(x + 72, 118, 40, 5, "w-destBar", 3) +
          [0, 1].map((i) => cx(x + 16 + i * 56, 148, 52, 44, "w-papB", 8)).join("");
        return dentro;
      }).join(""),
      "App do vendedor: início com a meta, vendas em cartões e a premiação em destaque"),
  };

  /* ===================== conteúdo ===================== */
  const P = (...t) => ({ t: "p", v: t });
  const PASSOS = (...t) => ({ t: "passos", v: t });
  const ITENS = (...t) => ({ t: "itens", v: t });
  const H = (t) => ({ t: "h", v: t });
  const DICA = (t) => ({ t: "dica", v: t });
  const ATEN = (t) => ({ t: "aten", v: t });
  const IMG = (k) => ({ t: "fig", v: k });
  const TAB = (cols, linhas) => ({ t: "tab", cols, linhas });
  const CHECK = (titulo, ...itens) => ({ t: "check", titulo, v: itens });

  const SECOES = [
    {
      k: "inicio", nome: "Começar aqui", icone: "rocket", sempre: true,
      resumo: "O que é o sistema, como entrar e como se virar na tela.",
      blocos: [
        P("O Norte Link é o sistema do canal Operadora da Norte Link. Ele guarda as vendas, acompanha a instalação, calcula a premiação e mostra os indicadores da operação. Tudo o que está aqui vem do mesmo banco de dados, então o número que o vendedor vê é o mesmo que o gerente vê."),
        IMG("mapa"),
        H("Entrar no sistema"),
        PASSOS(
          "Abra o endereço do sistema no navegador (ou o aplicativo, se você for vendedor).",
          "Digite o e-mail do seu acesso e a senha.",
          "No primeiro acesso o sistema pede para você trocar a senha temporária por uma sua."),
        IMG("login"),
        H("Esqueci a senha"),
        P("Na tela de entrada existe o link <b>Esqueci a senha</b>. Informe o e-mail e confirme: o pedido chega ao gerente, que gera uma senha temporária e passa para você. Não é enviado e-mail automático, justamente para ninguém conseguir pedir senha no seu lugar."),
        H("A senha precisa ser forte"),
        ITENS("No mínimo 10 caracteres, com letras e números.",
          "Nada de senha óbvia (12345678, senha123, o nome da empresa).",
          "A senha não pode conter o seu e-mail.",
          "Depois de 5 tentativas erradas a conta fica bloqueada por 15 minutos."),
        DICA("Em <b>Meu perfil</b> (seu nome, no canto do topo) você troca a senha quando quiser e pode usar o botão <b>Sair de todos os aparelhos</b> se esquecer o sistema aberto em algum lugar."),
        H("O que cada perfil enxerga"),
        TAB(["Perfil", "O que vê"], [
          ["Vendedor", "Só as próprias vendas, a própria premiação e a viabilidade que pediu."],
          ["Supervisor", "A equipe em que ele é supervisor: vendas, indicadores e premiação da equipe."],
          ["Coordenador", "As equipes sob a coordenação dele."],
          ["Backoffice · Cadastro", "Lança e edita vendas, responde viabilidade, faz confirmações e rota. Não vê FPD nem valores somados."],
          ["Backoffice · Qualidade", "Indicadores e qualidade. Vendas só para consulta."],
          ["Gerente / Administrador", "Tudo, inclusive valores em R$, FPD, Extrato da operadora e administração."],
        ]),
        ATEN("Quem decide isso é o <b>perfil</b> cadastrado em Usuários e acessos. A proteção é feita no servidor e no banco de dados: mesmo quem souber o endereço de uma tela não consegue ver dados que o perfil dele não permite."),
      ],
    },
    {
      k: "primeiros", nome: "Primeiros passos", icone: "flag", sempre: true,
      resumo: "Um roteiro de treinamento para quem está chegando agora.",
      blocos: [
        P("Esta aba é o roteiro de treinamento. Marque cada item conforme for fazendo: o sistema guarda as marcações neste aparelho, para você continuar de onde parou."),
        H("Vale para todo mundo"),
        CHECK("Primeiro dia",
          "Entrei no sistema e troquei a senha temporária por uma minha.",
          "Achei o meu nome no topo e entrei em <b>Meu perfil</b>.",
          "Percorri o menu da esquerda e vi quais telas o meu perfil tem.",
          "Li a aba <b>Começar aqui</b> desta Wiki.",
          "Sei que, se eu esquecer a senha, uso o link <b>Esqueci a senha</b> e o gerente libera uma nova."),
        H("Se você é vendedor"),
        CHECK("Vendedor",
          "Instalei o aplicativo no celular pela tela inicial do navegador.",
          "Vi a minha meta do mês e quantas BL faltam por dia útil.",
          "Pedi uma consulta de <b>viabilidade</b> de teste e acompanhei a resposta.",
          "Abri <b>Minhas vendas</b> e entendi as situações: conectada, pendente e cancelada.",
          "Abri <b>Minha premiação</b> e vi o que falta para a meta mínima."),
        H("Se você é backoffice de Cadastro"),
        CHECK("Backoffice · Cadastro",
          "Lancei uma venda nova do começo ao fim, com produtos e endereço.",
          "Usei o <b>Lançamento em lote</b> e li a prévia antes de gravar.",
          "Respondi uma viabilidade com observação clara para o vendedor.",
          "Trabalhei a lista de <b>Confirmação D+1 / D+15</b> do dia.",
          "Conferi a <b>Rota de instalação</b> e o <b>Fechamento do dia</b>."),
        H("Se você é backoffice de Qualidade"),
        CHECK("Backoffice · Qualidade",
          "Entendi o que é FPD e o que é safra.",
          "Li o gráfico de FPD por safra e a referência de 25%.",
          "Vi os motivos de cancelamento e a conectividade por mês.",
          "Sei que valores em R$ e FPD somado ficam com o gerente."),
        H("Se você é supervisor ou coordenador"),
        CHECK("Supervisor / Coordenador",
          "Abri a <b>Visão da equipe</b> e abri um grupo para ver os vendedores.",
          "Ordenei a tabela por uma coluna clicando no título dela.",
          "Entendi a previsão por dia útil e o ritmo necessário.",
          "Exportei o fechamento do dia só da minha equipe, pelo botão <b>Separados</b>.",
          "Acompanhei a premiação da equipe e sei o que muda a faixa."),
        H("Se você é gerente ou administrador"),
        CHECK("Gerente / Administrador",
          "Criei um colaborador novo com acesso ao site.",
          "Gerei uma senha temporária e entendi que ela aparece uma única vez.",
          "Montei as equipes com supervisor e coordenador.",
          "Cadastrei os feriados estaduais e municipais do ano.",
          "Publiquei o <b>Plano do mês</b> com metas e valores da premiação.",
          "Enviei o Extrato da operadora de uma quinzena e conferi os pagamentos.",
          "Lancei a lista de FPD da operadora."),
        DICA("Treine com calma no começo do mês: o sistema guarda o histórico de tudo, então um erro é sempre corrigível e sempre rastreável na Central de alterações."),
      ],
    },
    {
      k: "painel", nome: "Visão geral e previsão", icone: "chart", paginas: ["dashboard", "equipe", "meu"],
      resumo: "O painel de abertura, a previsão por dia útil e a visão das equipes.",
      blocos: [
        P("A <b>Visão geral</b> é a primeira tela de quem entra. Ela muda conforme o perfil: o gerente vê a empresa toda, o backoffice vê a fila de trabalho do dia, o vendedor vê o próprio desempenho."),
        IMG("painel"),
        H("Previsão de vendas (escala 6x1)"),
        P("A faixa escura no topo responde a pergunta “se o mês continuar nesse ritmo, onde a gente chega?”. O cálculo é simples e você pode conferir na mão:"),
        PASSOS(
          "O sistema conta quantos dias úteis o mês tem, na escala 6x1 (segunda a sábado).",
          "Desconta os feriados nacionais, estaduais e da cidade da equipe.",
          "Divide o que já foi vendido pelos dias úteis que já passaram e multiplica pelo total de dias úteis do mês."),
        IMG("previsao"),
        DICA("Domingo já é folga na escala 6x1. Por isso feriado que cai no domingo não muda a conta. Quem cadastra os feriados é o gerente, em <b>Feriados e dias úteis</b>."),
        H("Visão das equipes"),
        P("Mostra uma linha por equipe, com vendas do mês, mês anterior no mesmo período, conectividade, BL contra a meta, chips, ritmo e FPD. Os grupos começam fechados: clique no nome da equipe para abrir a lista de vendedores. Clique no título de uma coluna para ordenar por ela."),
        DICA("A tabela é larga. Quando houver mais colunas do lado, aparece uma sombra na borda e uma barra de rolagem embaixo: arraste para ver o resto (Ticket, Última venda)."),
      ],
    },
    {
      k: "vendas", nome: "Vendas", icone: "list", paginas: ["vendas", "nova", "lote"],
      resumo: "Lançar, procurar, corrigir e exportar vendas.",
      blocos: [
        P("Toda venda vive em dois pedaços: o <b>cliente</b> (nome, documento, contato) e o <b>contrato</b> (produtos, valor, situação, datas). A lista mostra os contratos."),
        IMG("vendas"),
        H("Procurar uma venda"),
        ITENS("Busque por nome, CPF/CNPJ ou número do contrato.",
          "Filtre por situação (pendente, ativo, cancelado) e por período da venda.",
          "Clique na linha para abrir a ficha completa do cliente e do contrato."),
        H("Lançar uma venda nova"),
        PASSOS(
          "Abra <b>Nova venda</b>.",
          "Digite o CPF/CNPJ: se o cliente já existir, o sistema aproveita o cadastro.",
          "Marque os produtos (banda larga, TV, móvel, fone...) e a quantidade de cada um.",
          "Preencha endereço, vendedor, origem e forma de pagamento.",
          "Salve. A venda nasce como <b>pendente</b> e vira <b>conectada</b> quando a instalação é confirmada."),
        H("Lançamento em lote"),
        P("Para quem recebe uma planilha com várias vendas de uma vez. Cole ou envie as linhas, confira a prévia (o sistema valida linha por linha e mostra o motivo de cada recusa) e só então grave. Uma linha com erro não impede as outras de entrarem."),
        H("Histórico do cliente"),
        P("Na ficha do cliente existe o campo de <b>observações</b>. Cada observação fica guardada com autor e data, em ordem. Serve para registrar combinados com o cliente sem perder o histórico."),
        ATEN("Nada é apagado de verdade: toda alteração fica registrada na <b>Central de alterações</b>, com quem fez, quando e o que mudou."),
      ],
    },
    {
      k: "operacao", nome: "Operação do dia", icone: "flow", paginas: ["viabilidade", "confirmacao", "rota", "fechamento", "produtividade"],
      resumo: "Viabilidade, confirmações D+1 e D+15, rota de instalação e o fechamento do dia.",
      blocos: [
        H("Viabilidade"),
        P("É o pedido para saber se um endereço tem rede disponível. O vendedor pede, o backoffice responde e o vendedor recebe o aviso na hora, sem depender de mensagem em grupo."),
        IMG("viabilidade"),
        ITENS("O vendedor informa CEP, número e, se quiser, o nome e o telefone do cliente.",
          "O backoffice marca <b>atende</b> ou <b>não atende</b> e escreve a observação (ex.: “rede HFC, até 1 Giga”).",
          "Os dois lados podem conversar pelas observações do pedido.",
          "A fila mostra há quanto tempo cada pedido está esperando."),
        H("Confirmação D+1 e D+15"),
        P("São dois contatos de pós-venda, contados a partir da data da venda: um no dia seguinte (D+1) e outro quinze dias depois (D+15). O sistema monta a lista do dia sozinho; o backoffice registra o resultado de cada ligação."),
        H("Rota de instalação"),
        P("Agrupa as instalações agendadas por região e por dia, para organizar o deslocamento do técnico e acompanhar o que já foi instalado."),
        H("Fechamento do dia"),
        P("É o relatório que fecha o movimento: vendas do dia, instalações, cancelamentos, mix de produtos e o mês até aqui, agrupado por equipe, cidade, supervisor, coordenador ou origem."),
        IMG("fechamento"),
        PASSOS(
          "Escolha o dia e o agrupamento.",
          "Clique no nome de um grupo para abrir os vendedores dele.",
          "Use <b>WhatsApp</b> para o texto pronto do grupo, <b>Excel</b> para a planilha e <b>Exportar PDF</b> para o relatório inteiro.",
          "Use <b>Separados</b> para gerar um arquivo por equipe (ou por supervisor): dá para baixar todos de uma vez ou um por um."),
        DICA("O arquivo separado sai com o nome do grupo e já traz os totais e os destaques só daquela equipe. É o que você manda direto para o supervisor."),
        H("Produtividade"),
        P("Mostra o trabalho da equipe de backoffice: quantas vendas cada pessoa lançou, quantas viabilidades respondeu e em quanto tempo."),
      ],
    },
    {
      k: "qualidade", nome: "Qualidade e FPD", icone: "shield", paginas: ["ind-qualidade", "fpd", "ind-vendas", "ind-operacao", "ind-pessoas", "ind-geo"],
      resumo: "O que é FPD, como ler as safras e como lançar a lista da operadora.",
      blocos: [
        H("O que é FPD"),
        P("FPD é o cliente que <b>não pagou a primeira fatura</b> no prazo. É o indicador de qualidade da venda: venda boa é a que instala e paga. O FPD é olhado por <b>safra</b>, que é o mês em que a venda foi feita."),
        IMG("fpd"),
        ITENS("Uma safra só é confiável depois que as faturas dela venceram; por isso o mês atual quase nunca aparece.",
          "A referência usada hoje é 25%: acima disso a barra fica vermelha.",
          "O FPD entra na premiação: quem tem FPD alto cai para a Faixa 1 ou fica inelegível."),
        H("Lançar uma lista nova de FPD"),
        PASSOS(
          "Abra <b>Lançar FPD</b>.",
          "Anexe a planilha da operadora (.xlsx ou .csv) ou lance manualmente, contrato por contrato.",
          "Confira a prévia: o sistema mostra quantas linhas vão entrar e quais não reconheceu.",
          "Confirme. O histórico guarda cada envio, com data e quem enviou."),
        DICA("Na mesma tela existe o botão para baixar um <b>modelo em branco</b> e o botão para <b>exportar</b> no mesmo formato, útil para conferir com a operadora."),
        H("Os outros indicadores"),
        ITENS("<b>Vendas</b>: volume por mês, conectividade, cancelamento e motivos.",
          "<b>Operação</b>: prazos de instalação e desempenho do backoffice.",
          "<b>Vendedores</b>: ranking e comparação entre as pessoas.",
          "<b>Geografia</b>: onde estão as vendas, por estado, cidade e bairro."),
        ATEN("O Backoffice de Cadastro não vê FPD nem valores somados em R$. Isso fica com Gerente e Administrador."),
      ],
    },
    {
      k: "premiacao", nome: "Premiação", icone: "medal", paginas: ["comissao", "plano"],
      resumo: "Como a premiação é calculada e o que cada um precisa fazer para subir de faixa.",
      blocos: [
        P("A premiação é calculada pelo sistema a partir do <b>Plano do mês</b>: metas, valores por faixa, bônus e limites. Enquanto o mês está aberto os valores são parciais; quando o gerente fecha o mês, eles travam."),
        IMG("premiacao"),
        H("Faixa 1 e Faixa 2"),
        ITENS("A faixa depende do <b>FPD</b> da pessoa: dentro do limite, Faixa 2 (valor maior por BL); acima, Faixa 1.",
          "Quem ainda não tem FPD apurado fica na Faixa 1.",
          "Acima do limite de inelegibilidade a pessoa não recebe naquele mês.",
          "Quem está há pouco tempo de casa pode ficar só na Faixa 1, conforme o plano."),
        H("Bônus"),
        ITENS("Bônus por bater a meta de BL.", "Bônus de DCC (venda com débito em conta).", "Bônus por FPD baixo, para o vendedor e para o supervisor."),
        H("Plano do mês (só gerente)"),
        P("Em <b>Plano do mês</b> o gerente define metas e valores. O mês seguinte já vem sugerido com base no anterior, bastando ajustar. Depois de fechado, o mês não muda mais sozinho."),
        DICA("O vendedor vê a própria premiação em <b>Minha premiação</b>, com o que falta para bater a meta mínima. O supervisor vê a da equipe."),
      ],
    },
    {
      k: "financeiro", nome: "Extrato da operadora", icone: "money", paginas: ["extrato"],
      resumo: "Enviar o extrato da operadora e conferir o que foi pago.",
      blocos: [
        P("A Operadora paga por quinzena: P1 são as instalações ativadas do dia 1 ao 15, P2 do dia 16 ao fim do mês. O Extrato da operadora é onde você confere, linha por linha, o que foi pago, o que foi estornado e o que ficou de fora."),
        IMG("extrato"),
        PASSOS(
          "No portal da operadora, baixe o <b>Extrato Detalhado</b> da quinzena (arquivo .csv).",
          "Sem abrir nem salvar no Excel, arraste o arquivo para a área de envio.",
          "Confira a prévia: o sistema compara com o que já foi enviado e mostra o que é novo.",
          "Importe. Só entram linhas novas, então mandar o mesmo arquivo duas vezes não duplica nada."),
        H("As abas da tela"),
        ITENS("<b>Resumo dos pagamentos</b>: comissões pagas, estornos e líquido recebido.",
          "<b>Conferência com as vendas</b>: instaladas que não foram pagas e pagas que não achamos no sistema.",
          "<b>Linhas do extrato</b>: a lista completa, com filtro.",
          "<b>Histórico de envios</b>: cada envio feito, com a opção de desfazer um envio errado."),
        ATEN("Essa tela é só do Gerente e do Administrador, porque mostra valores da operação inteira."),
      ],
    },
    {
      k: "admin", nome: "Administração", icone: "gear", paginas: ["usuarios", "feriados", "central"],
      resumo: "Colaboradores, acessos, equipes, feriados e o histórico de alterações.",
      blocos: [
        H("Usuários e acessos"),
        P("É aqui que entra gente nova, sai gente que saiu da empresa e se resolve problema de acesso."),
        IMG("usuarios"),
        PASSOS(
          "<b>Novo colaborador</b>: cadastro, funções, equipe e, se quiser, o acesso ao site de uma vez.",
          "<b>Editar</b>: muda nome, funções, equipe e, na parte “Acesso ao site e ao app”, o e-mail de login, o perfil e se o acesso está liberado.",
          "<b>Vincular uma conta</b>: para quem está cadastrado mas ainda não tem login. Se o e-mail já pertencer a outro cadastro, o sistema oferece transferir o acesso (a pessoa continua com a mesma senha).",
          "<b>Nova senha</b>: gera uma senha temporária, mostrada uma única vez na tela."),
        DICA("Quando alguém usa o “Esqueci a senha”, aparece um aviso amarelo no topo desta tela com o botão para gerar a senha na hora."),
        H("Equipes"),
        P("No fim da tela de usuários ficam as equipes, com o supervisor e o coordenador de cada uma. É isso que define o que o supervisor e o coordenador enxergam, e é a cidade da equipe que define o calendário de feriados usado na previsão."),
        H("Feriados e dias úteis"),
        P("Os feriados nacionais o sistema calcula sozinho, inclusive os que mudam de data (Carnaval, Sexta-feira Santa, Corpus Christi). Você cadastra os estaduais e os municipais. Ponto facultativo em que a equipe trabalha é só desmarcar “conta como folga”."),
        H("Central de alterações"),
        P("O histórico de tudo que foi alterado no sistema: quem fez, quando, em qual registro e o que mudou. Serve para auditoria e para resolver dúvida de “quem mexeu nisso?”."),
      ],
    },
    {
      k: "app", nome: "App do vendedor", icone: "phone", sempre: true,
      resumo: "Instalar o aplicativo no celular e usar no dia a dia.",
      blocos: [
        P("O app é o mesmo sistema, numa versão feita para o celular do vendedor: letras grandes, barra de navegação embaixo e só o que importa na rua."),
        IMG("app"),
        H("Instalar"),
        PASSOS(
          "Abra o endereço do sistema no navegador do celular e entre com o seu acesso.",
          "No <b>Android (Chrome)</b>: toque no menu ⋮ e em “Instalar aplicativo” (ou “Adicionar à tela inicial”).",
          "No <b>iPhone (Safari)</b>: toque em Compartilhar e em “Adicionar à Tela de Início”.",
          "Abra pelo ícone que apareceu na tela inicial."),
        H("O que tem no app"),
        ITENS("<b>Início</b>: sua meta do mês, quanto falta, quantas BL por dia útil, vendas de hoje e sua posição na equipe.",
          "<b>Vendas</b>: suas vendas em cartões, com busca e filtro por situação; toque numa venda para ver a ficha.",
          "<b>Viabilidade</b>: pedir e acompanhar as consultas de endereço.",
          "<b>Premiação</b>: quanto você já ganhou no mês e o que falta para a meta."),
        DICA("O app é exclusivo do vendedor. Outros cargos usam o sistema pelo navegador, que tem todas as telas."),
        ATEN("Se o app parecer “pequeno” ou desatualizado, feche e abra de novo. Se persistir, desinstale e instale outra vez, com a opção “Site para computador” desmarcada no navegador."),
      ],
    },
    {
      k: "novidades", nome: "O que mudou", icone: "spark", sempre: true,
      resumo: "As novidades mais recentes do sistema, em ordem.",
      blocos: [
        P("Esta lista mostra o que mudou nas últimas versões. Se alguma tela estiver diferente do que você lembra, provavelmente está aqui."),
        H("11 de outubro de 2026"),
        ITENS(
          "<b>Wiki por função</b>: o manual agora é separado em pastas por cargo; cada um lê só o que precisa. Gerente e administrador enxergam todas as pastas.",
          "<b>Sábado vale meio dia útil</b>: a escala 6x1 passou a contar segunda a sexta como 1 dia e sábado como 0,5. A previsão, o ritmo necessário e os dias úteis do mês mudaram por causa disso.",
          "<b>Entrar como</b>: depois do login, o master escolhe com qual função abrir o sistema; a lista mostra só as pessoas que estão naquela função.",
          "<b>Segurança do banco</b>: as regras de acesso por linha (RLS) foram completadas nas tabelas de feriados, observações, confirmações e lotes de FPD."),
        H("10 de outubro de 2026"),
        ITENS(
          "<b>Wiki do sistema</b>: este manual, com passo a passo, desenhos das telas e roteiro de treinamento. Cada tela também ganhou um botão <b>Ajuda</b> que abre a Wiki no assunto certo.",
          "<b>Esqueci a senha</b>: na tela de entrada, o pedido chega ao gerente, que libera uma senha temporária em Usuários e acessos.",
          "<b>Vincular conta</b>: ao editar um colaborador dá para criar o acesso, trocar o e-mail de login, mudar o perfil e bloquear a entrada. Se o e-mail já for de outro cadastro, o sistema oferece transferir o acesso.",
          "<b>Fechamento separado</b>: o botão <b>Separados</b> gera um arquivo por equipe ou por supervisor, de uma vez ou um por um.",
          "<b>Equipes recolhidas</b>: na Visão das equipes e no Fechamento, os grupos começam fechados; clique no nome para abrir.",
          "<b>Previsão por dia útil (6x1)</b>: a projeção do mês passou a descontar os feriados nacionais, estaduais e da cidade de cada equipe, com a tela <b>Feriados e dias úteis</b> para manter o calendário.",
          "<b>Lançar FPD</b>: a lista da operadora pode ser anexada ou lançada manualmente, com prévia, histórico de envios e exportação no mesmo modelo.",
          "<b>App do vendedor</b>: letras grandes, barra de navegação embaixo, início com a meta do mês, vendas em cartões e premiação em destaque.",
          "<b>Exportação em todas as telas</b>: supervisor, coordenador e gerente podem baixar em Excel o que estão vendo.",
          "<b>Mais rápido</b>: as telas abrem bem mais rápido, os arquivos do site vão compactados e voltar a uma tela já aberta é quase instantâneo.",
          "<b>Permissões revisadas</b>: o Backoffice não vê FPD nem valores somados em R$; isso fica com Gerente e Administrador."),
        DICA("Depois de uma atualização, feche e abra o navegador (ou o app) uma vez. Se alguma tela parecer antiga, atualize com F5."),
      ],
    },
    {
      k: "glossario", nome: "Glossário e dúvidas", icone: "book", sempre: true,
      resumo: "O significado de cada sigla e as perguntas que mais aparecem.",
      blocos: [
        H("Glossário"),
        TAB(["Termo", "O que quer dizer"], [
          ["BL", "Banda larga. É a venda que conta para a meta principal."],
          ["Instalada", "Venda já instalada e funcionando."],
          ["Pendente", "Venda feita, aguardando instalação."],
          ["FPD", "First Payment Default: cliente que não pagou a primeira fatura no prazo."],
          ["Safra", "O mês em que a venda foi feita. O FPD é medido por safra."],
          ["DCC", "Débito em conta corrente como forma de pagamento."],
          ["M/P", "Chip de migração ou portabilidade (não é linha nova)."],
          ["D+1 / D+15", "Contatos de pós-venda: no dia seguinte e quinze dias depois da venda."],
          ["P1 / P2", "Quinzenas de pagamento da operadora: dia 1 ao 15 e 16 ao fim do mês."],
          ["Escala 6x1", "Seis dias de trabalho (segunda a sábado) e um de folga."],
          ["Ticket médio", "Valor médio do pacote vendido."],
          ["Conectividade", "Instaladas ÷ total de vendas do mês."],
        ]),
        H("Dúvidas frequentes"),
        ITENS("<b>Mudei algo e não aparece.</b> Atualize a página (F5). Se tiver acabado de sair uma versão nova, feche e abra o navegador.",
          "<b>O número está diferente do meu controle.</b> Confira o filtro de período e de situação: cancelada não conta como venda válida.",
          "<b>Minha equipe aparece vazia.</b> O supervisor precisa estar marcado como supervisor da equipe, em Usuários e acessos → Equipes.",
          "<b>A previsão parece baixa.</b> Ela usa só os dias úteis já passados. No começo do mês, um dia fraco mexe muito no número.",
          "<b>Não consigo entrar.</b> Cinco erros de senha bloqueiam por 15 minutos. Passado esse tempo, tente de novo ou peça nova senha ao gerente."),
        DICA("Achou algo errado ou faltando nesta Wiki? Fale com o gerente: ela é editada junto com o sistema."),
      ],
    },
    /* ---------- tópicos escritos para cada função ---------- */
    {
      k: "v_dia", nome: "Meu dia no app", icone: "phone",
      resumo: "A tela de início: meta, ritmo e o que fazer hoje.",
      blocos: [
        P("A tela de início do app responde três perguntas: quanto eu já vendi, quanto falta e quantas vendas por dia eu preciso fazer para bater a meta."),
        IMG("app"),
        H("O cartão grande"),
        ITENS("<b>Minhas BL no mês</b>: quantas bandas largas você já vendeu e a sua meta.",
          "<b>A barra</b>: o quanto da meta já foi, e o tom mais claro mostra até onde você chega se continuar no mesmo ritmo.",
          "<b>BL faltam</b>: quantas ainda faltam para a meta.",
          "<b>Por dia útil</b>: quantas por dia, nos dias que sobram, para bater a meta.",
          "<b>Previsão do mês</b>: onde você chega mantendo o ritmo atual."),
        DICA("A cor do cartão muda sozinha: verde quando a previsão bate a meta, azul quando está perto e vinho quando está abaixo."),
        H("Dia útil e sábado"),
        P("A conta usa a escala 6x1: de segunda a sexta cada dia vale 1 dia útil, <b>o sábado vale meio dia (0,5)</b> e o domingo não conta. Feriado da sua cidade também não conta. Por isso você vê “dia útil 8 de 23,5”."),
        H("Os quatro blocos"),
        ITENS("<b>Vendas hoje</b> e <b>No mês</b>: quantidade de vendas válidas (cancelada não conta).",
          "<b>Conectividade</b>: quantas das suas vendas já foram instaladas.",
          "<b>Chips</b>: migração e portabilidade no mês, contra a sua meta de chips.",
          "Tocar num bloco abre a lista de vendas já filtrada."),
        H("Minha posição em BL"),
        P("Mostra em que lugar você está na sua equipe e na empresa, pela quantidade de BL vendida no mês. Canceladas não contam."),
      ],
    },
    {
      k: "v_vendas", nome: "Minhas vendas", icone: "list",
      resumo: "Acompanhar cada venda e entender a situação dela.",
      blocos: [
        P("Em <b>Vendas</b> ficam todas as suas vendas, da mais nova para a mais antiga, uma em cada cartão."),
        H("As situações"),
        TAB(["Situação", "O que quer dizer"], [
          ["Pendente", "A venda foi lançada e está aguardando a instalação."],
          ["Instalada", "O cliente já está instalado e funcionando. É a que conta para a meta."],
          ["Cancelada", "A venda caiu. Não conta para a meta nem para a premiação."],
        ]),
        H("Como achar uma venda"),
        PASSOS("Toque nos botões <b>Todas / Pendentes / Instaladas / Canceladas</b> para filtrar.",
          "Ou digite o número do contrato ou o CPF na busca e toque na lupa.",
          "Toque no cartão para abrir a ficha com data, produtos, cidade, pagamento e origem."),
        DICA("Não achou uma venda que você fez? Fale com o backoffice: ela pode ainda não ter sido lançada no sistema."),
      ],
    },
    {
      k: "v_viab", nome: "Pedir viabilidade", icone: "flow",
      resumo: "Saber se o endereço tem rede antes de oferecer o plano.",
      blocos: [
        P("A viabilidade diz se naquele endereço existe rede disponível. O pedido vai para o backoffice e a resposta volta para você dentro do sistema, com aviso na hora."),
        IMG("viabilidade"),
        PASSOS("Toque em <b>Viabilidade</b> e depois em <b>Nova consulta</b>.",
          "Digite o CEP: cidade, bairro e UF vêm preenchidos.",
          "Complete o número e, se ajudar, o ponto de referência.",
          "Se quiser, informe o nome e o telefone do cliente.",
          "Escreva na observação o que o backoffice precisa saber (ex.: “prédio de 3 andares, cliente quer 500 mega”).",
          "Envie e acompanhe na lista: <b>Aguardando</b>, <b>Atende</b> ou <b>Não atende</b>."),
        DICA("Mande o pedido ainda na porta do cliente. A resposta costuma vir rápido e você já fecha a venda na hora."),
        ATEN("Viabilidade não é venda. Depois do “atende”, a venda precisa ser lançada pelo backoffice."),
      ],
    },
    {
      k: "v_premio", nome: "Minha premiação", icone: "medal",
      resumo: "Quanto você já ganhou no mês e o que aumenta esse valor.",
      blocos: [
        P("A tela mostra quanto você já tem de premiação no mês, pelas vendas que conectaram. Enquanto o mês está aberto o valor é parcial; quando o gerente fecha o mês, ele trava."),
        H("O que entra na conta"),
        ITENS("<b>Base</b>: o valor por banda larga conectada, de acordo com a sua faixa.",
          "<b>Bônus</b>: pagamento em débito em conta (DCC), meta de BL e meta de chips.",
          "<b>Meta mínima</b>: abaixo dela não há pagamento; a tela mostra quantas BL faltam.",
          "<b>Ajuste</b>: algum acerto lançado pelo gerente, para mais ou para menos."),
        H("Faixa 1 e Faixa 2"),
        P("A faixa é o valor que você recebe por BL. Quem mantém o FPD dentro do limite entra na <b>Faixa 2</b>, que paga mais. FPD é o cliente que não paga a primeira fatura."),
        ITENS("Venda para quem tem condição de pagar: isso segura o seu FPD.",
          "Confirme os dados de cobrança na hora da venda.",
          "Débito em conta costuma reduzir o FPD e ainda gera bônus."),
        DICA("Toque em <b>Ver detalhes da premiação</b> para ver a conta aberta, item por item."),
      ],
    },
    {
      k: "s_equipe", nome: "Visão da equipe", icone: "chart",
      resumo: "Ler a tabela da equipe e saber onde agir hoje.",
      blocos: [
        P("A <b>Visão da equipe</b> é a sua tela de trabalho: numa linha por vendedor você vê quem está no ritmo, quem parou de vender e quem precisa de ajuda."),
        IMG("painel"),
        H("Como ler a tabela"),
        TAB(["Coluna", "O que mostra"], [
          ["Vendas", "Vendas válidas no mês (sem as canceladas)."],
          ["Mês ant.", "O mesmo período do mês passado, para comparar."],
          ["Instal.", "Quantas já foram instaladas."],
          ["% conect.", "Instaladas ÷ total de vendas do mês."],
          ["BL × meta", "Banda larga do mês contra a meta da pessoa."],
          ["Ritmo", "Se a projeção bate a meta: no ritmo, atenção ou abaixo."],
          ["FPD 3m", "Primeira fatura não paga nas 3 últimas safras fechadas."],
          ["Últ. venda", "Há quantos dias a pessoa não vende."],
        ]),
        PASSOS("Clique no nome da equipe para abrir os vendedores dela.",
          "Clique no título de uma coluna para ordenar por ela (ex.: “Últ. venda” para achar quem parou).",
          "Use o filtro de mês para comparar com meses fechados."),
        H("Previsão e ritmo"),
        P("A previsão usa a escala 6x1: segunda a sexta valem 1 dia útil, <b>sábado vale 0,5</b> e domingo não conta, descontando os feriados da cidade da equipe. O “ritmo necessário” é quantas BL por dia útil faltam para bater a meta."),
        IMG("previsao"),
        DICA("Se a tabela for maior que a tela, arraste para o lado: aparece uma sombra na borda avisando que há mais colunas."),
      ],
    },
    {
      k: "s_fech", nome: "Fechamento e envio para a equipe", icone: "flow",
      resumo: "Fechar o dia e mandar o resultado para cada supervisor.",
      blocos: [
        P("O <b>Fechamento do dia</b> resume o movimento: vendas, instalações, cancelamentos, mix de produtos e o mês até aqui."),
        IMG("fechamento"),
        PASSOS("Escolha o dia e como quer agrupar (equipe, supervisor, cidade...).",
          "Clique no nome de um grupo para abrir os vendedores.",
          "Use <b>WhatsApp</b> para o texto pronto do grupo.",
          "Use <b>Separados</b> para gerar um arquivo por equipe: dá para baixar todos de uma vez ou um por um."),
        DICA("O arquivo separado traz só a equipe escolhida, com os totais e os destaques dela. É o que você manda direto para o supervisor."),
      ],
    },
    {
      k: "s_premio", nome: "Premiação da equipe", icone: "medal",
      resumo: "Como a premiação da sua gente é calculada.",
      blocos: [
        P("A premiação sai do <b>Plano do mês</b>, que o gerente publica: metas, valor por faixa, bônus e limites. Enquanto o mês está aberto, os valores são parciais."),
        IMG("premiacao"),
        ITENS("A <b>faixa</b> depende do FPD de cada pessoa: dentro do limite, Faixa 2 (paga mais).",
          "Quem não tem FPD apurado fica na Faixa 1.",
          "Acima do limite de inelegibilidade, a pessoa não recebe no mês.",
          "O supervisor é premiado pelo conjunto do que a equipe conectou e também tem bônus por FPD baixo."),
        PASSOS("Abra <b>Premiação</b> e escolha o mês.",
          "Clique numa pessoa para ver a conta aberta dela.",
          "Use a exportação para conferir com o financeiro."),
        DICA("Vale mais insistir em qualidade do que em volume: FPD alto derruba a faixa de todo mundo."),
      ],
    },
    {
      k: "bc_lancar", nome: "Lançar vendas", icone: "list",
      resumo: "Cadastro unitário, lançamento em lote e correções.",
      blocos: [
        P("O backoffice de Cadastro é quem coloca a venda no sistema. Uma venda tem duas partes: o <b>cliente</b> e o <b>contrato</b> (produtos, valor, datas e situação)."),
        IMG("vendas"),
        H("Venda nova, uma a uma"),
        PASSOS("Abra <b>Nova venda</b>.",
          "Digite o CPF/CNPJ: se o cliente já existir, o cadastro é reaproveitado.",
          "Marque os produtos e a quantidade de cada um.",
          "Preencha endereço, vendedor, origem e forma de pagamento.",
          "Salve: a venda nasce <b>pendente</b> e vira <b>conectada</b> quando a instalação é confirmada."),
        H("Lançamento em lote"),
        P("Para planilhas com várias vendas. Cole ou envie as linhas, confira a prévia (o sistema valida linha por linha e mostra o motivo de cada recusa) e só então grave. Linha com erro não impede as outras."),
        H("Corrigir e registrar"),
        ITENS("Clique na venda para abrir a ficha e corrigir o que for preciso.",
          "Use as <b>observações</b> do cliente para registrar combinados: fica com autor e data.",
          "Toda alteração vai para a Central de alterações, com quem fez e o que mudou."),
        ATEN("Confira o vendedor na hora de lançar: é por ele que a venda entra na meta e na premiação."),
      ],
    },
    {
      k: "bc_dia", nome: "A fila do dia", icone: "flow",
      resumo: "Viabilidade, confirmações D+1 e D+15 e rota de instalação.",
      blocos: [
        H("Viabilidade"),
        P("Os vendedores pedem e você responde. A fila mostra há quanto tempo cada pedido está esperando."),
        IMG("viabilidade"),
        PASSOS("Abra o pedido na fila.",
          "Consulte no portal da operadora.",
          "Marque <b>Atende</b> ou <b>Não atende</b> e escreva a observação (ex.: “rede HFC, até 1 Giga”).",
          "O vendedor recebe o aviso na hora."),
        DICA("Responda sempre com a observação. Um “não atende” sem explicação volta como pergunta e gasta o seu tempo de novo."),
        H("Confirmação D+1 e D+15"),
        P("São dois contatos de pós-venda contados da data da venda: no dia seguinte (D+1) e quinze dias depois (D+15). O sistema monta a lista sozinho; você registra o resultado de cada ligação."),
        H("Rota de instalação"),
        P("Agrupa as instalações agendadas por região e por dia, para organizar o deslocamento do técnico e acompanhar o que já foi instalado."),
        H("Fechamento do dia"),
        P("No fim do expediente, o <b>Fechamento do dia</b> mostra o resultado e gera o texto do WhatsApp, o Excel e o PDF."),
        IMG("fechamento"),
      ],
    },
    {
      k: "bq_ind", nome: "Os indicadores", icone: "chart",
      resumo: "Vendas, operação, vendedores e geografia: o que cada tela responde.",
      blocos: [
        P("O backoffice de Qualidade acompanha a saúde da operação. Cada tela de indicadores responde uma pergunta diferente."),
        TAB(["Tela", "A pergunta que ela responde"], [
          ["Vendas", "Estamos vendendo mais ou menos? O que está sendo cancelado e por quê?"],
          ["Operação", "Quanto tempo leva da venda até a instalação? Onde trava?"],
          ["Vendedores", "Quem vende bem e com qualidade? Quem precisa de treino?"],
          ["Geografia", "Onde estão as vendas e onde o cancelamento é maior?"],
        ]),
        IMG("painel"),
        H("O que olhar primeiro"),
        ITENS("<b>Conectividade</b>: vendas que viraram instalação. Caindo, é sinal de problema na operação ou na qualidade da venda.",
          "<b>Cancelamento e motivos</b>: o pareto mostra os poucos motivos que respondem pela maior parte dos cancelamentos.",
          "<b>Dia da semana</b>: ajuda a planejar a escala.",
          "<b>Geografia</b>: bairro com cancelamento alto costuma ser problema de rede."),
        ATEN("Valores somados em R$ e o FPD somado ficam com Gerente e Administrador. As telas da Qualidade mostram quantidades e percentuais."),
      ],
    },
    /* ---------- primeiros passos: um roteiro curto por função ---------- */
    {
      k: "pp_vendedor", nome: "Primeiros passos", icone: "flag",
      resumo: "O roteiro do seu primeiro dia, para marcar conforme for fazendo.",
      blocos: [
        P("Marque cada item quando terminar. As marcações ficam guardadas neste aparelho, então você pode parar e continuar depois."),
        CHECK("Primeiro dia do vendedor",
          "Entrei no sistema e troquei a senha temporária por uma minha.",
          "Instalei o aplicativo na tela inicial do celular.",
          "Vi a minha meta do mês e quantas BL faltam por dia útil.",
          "Entendi que sábado vale meio dia útil e domingo não conta.",
          "Pedi uma viabilidade de teste e acompanhei a resposta.",
          "Abri Minhas vendas e entendi conectada, pendente e cancelada.",
          "Abri Minha premiação e vi o que falta para a meta mínima.",
          "Sei que, se esquecer a senha, uso o link <b>Esqueci a senha</b> e o gerente libera uma nova."),
        DICA("Dúvida em alguma tela? Toque no botão <b>Ajuda</b> no alto dela: a Wiki abre já no assunto certo."),
      ],
    },
    {
      k: "pp_supervisor", nome: "Primeiros passos", icone: "flag",
      resumo: "O roteiro do supervisor e do coordenador que está começando.",
      blocos: [
        P("Marque cada item quando terminar. As marcações ficam guardadas neste aparelho."),
        CHECK("Primeira semana do supervisor",
          "Entrei no sistema e troquei a senha temporária.",
          "Conferi se eu estou marcado como supervisor da minha equipe (Usuários e acessos → Equipes).",
          "Abri a Visão da equipe e abri um grupo para ver os vendedores.",
          "Ordenei por <b>Últ. venda</b> para achar quem parou de vender.",
          "Entendi a previsão por dia útil (sábado vale 0,5) e o ritmo necessário.",
          "Exportei o fechamento do dia só da minha equipe, pelo botão Separados.",
          "Abri a premiação da equipe e entendi o que muda a faixa de cada um."),
        ATEN("Sem equipe atribuída, as telas aparecem vazias. Se for o seu caso, peça ao gerente para te vincular à equipe."),
      ],
    },
    {
      k: "pp_cadastro", nome: "Primeiros passos", icone: "flag",
      resumo: "O roteiro de quem entra no backoffice de Cadastro.",
      blocos: [
        P("Marque cada item quando terminar. As marcações ficam guardadas neste aparelho."),
        CHECK("Primeira semana no Cadastro",
          "Entrei no sistema e troquei a senha temporária.",
          "Lancei uma venda nova do começo ao fim, com produtos e endereço.",
          "Usei o Lançamento em lote e li a prévia antes de gravar.",
          "Respondi uma viabilidade com observação clara para o vendedor.",
          "Trabalhei a lista de Confirmação D+1 / D+15 do dia.",
          "Conferi a Rota de instalação do dia seguinte.",
          "Fechei o dia e mandei o texto no grupo do WhatsApp."),
        DICA("Na dúvida sobre um campo, lance como pendente e registre uma observação no cliente. Tudo fica no histórico e dá para corrigir depois."),
      ],
    },
    {
      k: "pp_qualidade", nome: "Primeiros passos", icone: "flag",
      resumo: "O roteiro de quem entra no backoffice de Qualidade.",
      blocos: [
        P("Marque cada item quando terminar. As marcações ficam guardadas neste aparelho."),
        CHECK("Primeira semana na Qualidade",
          "Entrei no sistema e troquei a senha temporária.",
          "Entendi o que é FPD e o que é safra.",
          "Li o gráfico de FPD por safra e a referência de 25%.",
          "Olhei os motivos de cancelamento no pareto.",
          "Comparei a conectividade dos últimos meses.",
          "Vi na Geografia onde o cancelamento é maior."),
        ATEN("Valores somados em R$ ficam com Gerente e Administrador. Suas telas mostram quantidades e percentuais."),
      ],
    },
    {
      k: "s_vendas", nome: "Vendas da equipe", icone: "list",
      resumo: "Procurar e conferir as vendas de quem está com você.",
      blocos: [
        P("Em <b>Vendas da equipe</b> você vê as vendas de todo mundo que está sob a sua responsabilidade, com os mesmos filtros da lista geral."),
        IMG("vendas"),
        PASSOS("Filtre por situação para separar pendentes, instaladas e canceladas.",
          "Use o período para olhar só o mês corrente ou comparar com o anterior.",
          "Filtre por vendedor quando for conversar com uma pessoa específica.",
          "Clique na linha para abrir a ficha completa da venda."),
        H("O que vale olhar toda semana"),
        ITENS("<b>Pendentes antigas</b>: venda parada há muitos dias costuma virar cancelamento.",
          "<b>Canceladas e o motivo</b>: motivo repetido na mesma pessoa é assunto de treino.",
          "<b>Vendas sem produto principal</b>: confira se a BL foi marcada, porque é ela que conta na meta."),
        DICA("Pode exportar em Excel o que estiver filtrado, pelo botão no alto da tela."),
      ],
    },
    {
      k: "v_qualidade", nome: "Vender com qualidade", icone: "shield",
      resumo: "O que é FPD e como ele mexe no seu bolso.",
      blocos: [
        P("FPD é quando o cliente <b>não paga a primeira fatura</b> no prazo. Para a operadora, essa venda vale menos; para você, derruba a faixa da premiação e pode tirar o bônus."),
        IMG("fpd"),
        H("Como o FPD é medido"),
        ITENS("Ele é olhado por <b>safra</b>, que é o mês em que a venda foi feita.",
          "Uma safra só conta depois que as faturas dela venceram, por isso o mês atual quase nunca aparece.",
          "A referência usada hoje é 25%: acima disso, acende o alerta.",
          "Quem fica dentro do limite entra na Faixa 2, que paga mais por BL."),
        H("O que ajuda na prática"),
        ITENS("Explique o valor da primeira fatura, que costuma vir diferente por causa da proporcionalidade.",
          "Confirme a data de vencimento com o cliente e combine uma que caiba no bolso dele.",
          "Ofereça o débito em conta: cai menos fatura em aberto e ainda gera bônus.",
          "Confira telefone e e-mail: é por onde a cobrança avisa antes de vencer.",
          "Desconfie de venda feita 'na pressa' só para bater meta: ela volta como FPD no mês seguinte."),
        DICA("Dez vendas que pagam valem mais, no fim do mês, do que quinze com cinco calotes."),
      ],
    },
    {
      k: "g_rotina", nome: "Rotina do gerente", icone: "flag",
      resumo: "O que olhar todo dia, toda semana e todo mês.",
      blocos: [
        P("Com o sistema no ar, a gestão vira rotina. Esta é uma sugestão de ritmo, usando só telas que já existem."),
        H("Todo dia (10 minutos)"),
        ITENS("<b>Visão geral</b>: a previsão do mês e o ritmo necessário.",
          "<b>Fechamento do dia</b>: o resultado de ontem; mande o texto no grupo e os arquivos separados para cada supervisor.",
          "<b>Viabilidade</b>: veja se tem pedido parado esperando resposta.",
          "<b>Confirmação D+1 / D+15</b>: confira se a fila do dia foi trabalhada."),
        H("Toda semana (30 minutos)"),
        ITENS("<b>Visão das equipes</b>: ordene por <b>Últ. venda</b> e cobre quem está parado.",
          "<b>Vendedores</b>: veja quem vende muito com qualidade e quem vende muito com FPD alto.",
          "<b>Operação</b>: prazo entre a venda e a instalação; atraso vira cancelamento.",
          "<b>Geografia</b>: bairro com cancelamento alto costuma ser problema de rede."),
        H("Todo mês"),
        PASSOS("No início do mês, publique o <b>Plano do mês</b> com metas e valores.",
          "Na virada da quinzena, envie o <b>Extrato da operadora</b> e confira os pagamentos.",
          "Quando a operadora mandar a lista, use <b>Lançar FPD</b> para atualizar a qualidade.",
          "Feche a premiação e confira pessoa por pessoa antes de pagar.",
          "No fim do ano, revise os <b>feriados</b> do ano seguinte para a previsão não errar."),
        DICA("Se a equipe mudar de supervisor ou de cidade, atualize em Usuários e acessos → Equipes: é isso que define quem vê o quê e qual calendário de feriados entra na previsão."),
      ],
    },
    {
      k: "g_plano", nome: "Plano do mês, campo a campo", icone: "money",
      resumo: "O que cada parâmetro da premiação faz, com exemplo.",
      blocos: [
        P("O <b>Plano do mês</b> é a régua da premiação: metas, limites de FPD e quanto vale cada produto. Nada é calculado sem ele. O mês seguinte já vem sugerido com base no anterior, bastando ajustar e salvar."),
        IMG("premiacao"),
        H("Os parâmetros"),
        TAB(["Campo", "O que faz"], [
          ["Meta mínima de BL", "Banda larga que o vendedor precisa conectar no mês para receber. Para o supervisor, a meta é essa multiplicada pelo número de vendedores ativos da equipe (HC)."],
          ["Meta de chips", "Chips de migração ou portabilidade esperados no mês, por vendedor."],
          ["FPD máximo para Faixa 2 (%)", "Até esse FPD a pessoa fica na faixa que paga mais. Acima, cai para a Faixa 1."],
          ["FPD a partir do qual não é elegível (%)", "Passando desse ponto, a pessoa não recebe premiação naquele mês."],
          ["FPD para o bônus (%)", "Limite de FPD para ganhar o bônus de qualidade (vale para vendedor e supervisor)."],
          ["FPD para o bônus menor do supervisor (%)", "Uma segunda faixa, intermediária, só do supervisor: FPD um pouco maior ainda rende um bônus reduzido."],
          ["% de DCC da equipe para o bônus do supervisor", "Quanto da equipe precisa vender em débito em conta para o supervisor ganhar o bônus de DCC."],
          ["BL do vendedor que rende bônus ao supervisor", "A partir de quantas BL de um vendedor o supervisor ganha um bônus por aquela pessoa."],
          ["Mínimo de BL com FPD apurado", "Volume mínimo para o FPD do vendedor valer. Com pouca venda apurada, o percentual engana e o bônus não é liberado."],
          ["Meses de casa que só recebem Faixa 1", "Período inicial do vendedor novo, em que ele fica na faixa menor mesmo com FPD bom."],
        ]),
        H("As tabelas de valores"),
        P("Abaixo dos parâmetros ficam duas tabelas, uma do <b>vendedor</b> e outra do <b>supervisor</b>. Em cada linha você define quanto vale o item na Faixa 1 e na Faixa 2:"),
        ITENS("<b>Banda larga</b>, <b>TV</b>, <b>TV+</b>, <b>chip linha nova</b>, <b>chip migração</b>, <b>chip portabilidade</b> e os bônus de <b>STREAMING</b> e <b>MDU</b> (apartamento).",
          "<b>Bônus DCC</b>: pago por venda de banda larga com débito em conta.",
          "<b>Bônus FPD (faixa melhor)</b> e <b>(faixa intermediária)</b>: os bônus de qualidade. No supervisor eles não somam — vale o maior que a equipe alcançar.",
          "<b>Bônus por vendedor com meta de BL</b>: o supervisor ganha por cada pessoa da equipe que bateu a meta."),
        H("Como publicar o mês"),
        PASSOS("Abra <b>Plano do mês (metas)</b> e confira o mês sugerido no alto.",
          "Revise os parâmetros e os valores das duas tabelas.",
          "Salve. A partir daí a tela de Premiação já calcula com essa régua.",
          "No fim do mês, confira pessoa por pessoa e então feche o mês: os valores travam."),
        H("Ajuste individual"),
        P("Na tela de Premiação, clicar numa pessoa abre a conta aberta dela. Ali dá para mudar a meta só daquela pessoa, lançar um <b>ajuste</b> em R$ (para mais ou para menos) com o motivo, e marcar <b>PAP Tools ok</b>. Sem o PAP Tools marcado a pessoa não recebe bônus. Meta em branco usa a do plano, e todo ajuste fica registrado na Central de alterações."),
        ATEN("Mexer no plano de um mês já fechado não é possível. Se precisar corrigir, use o ajuste individual, que deixa o motivo registrado."),
      ],
    },
    {
      k: "g_importar", nome: "Planilhas: lote e FPD", icone: "list",
      resumo: "As colunas que cada planilha precisa ter e o que o sistema faz com elas.",
      blocos: [
        P("Duas telas recebem planilha: o <b>Lançamento em lote</b> (vendas) e o <b>Lançar FPD</b> (qualidade). As duas mostram uma prévia antes de gravar, e nenhuma delas grava nada sem a sua confirmação."),
        H("Lançamento em lote: as colunas, nesta ordem"),
        P("A tela é uma grade. Copie do Excel e cole (Ctrl+V) a partir da primeira célula; o sistema distribui as colunas sozinho."),
        TAB(["#", "Coluna", "Como preencher"], [
          ["1", "Data venda", "dd/mm/aaaa"],
          ["2", "Nome do cliente", "nome completo"],
          ["3", "CPF/CNPJ", "só números; pontos e traços são limpos"],
          ["4", "Telefone", "com DDD"],
          ["5", "Vendedor (login)", "o login do vendedor, não o nome"],
          ["6", "Origem", "PAP, LOJA, INDICAÇÃO… conforme o cadastro"],
          ["7", "Cidade", "no formato UF - CIDADE (ex.: RO - PORTO VELHO)"],
          ["8", "Bairro", "texto livre"],
          ["9", "Endereço", "rua e número"],
          ["10", "Venc.", "dia do vencimento (1 a 28)"],
          ["11", "Pagamento", "BOLETO ou DCC"],
          ["12", "Pacote R$", "valor do pacote, ex.: 99,90"],
          ["13", "Produtos", "separados por ponto e vírgula, ex.: 500; MOVEL PÓS 30 GB; 2x WI-FI MESH"],
          ["14", "Nº contrato", "se já tiver; pode ficar vazio"],
        ]),
        PASSOS("Cole as linhas (ou use <b>+ 10 linhas</b> e digite).",
          "Se todas forem do mesmo vendedor, origem ou data, preencha em cima e clique em <b>Preencher linhas</b>.",
          "Clique em <b>Validar</b>: o sistema aponta o erro de cada linha sem gravar nada.",
          "Corrija o que estiver vermelho e clique em <b>Gravar</b>. As linhas boas entram; as com erro continuam na tela."),
        DICA("Na coluna de produtos, a quantidade vai na frente com “x” (2x WI-FI MESH). O que define se a venda conta como BL é ter um produto de internet marcado."),
        H("Lançar FPD: o modelo da operadora"),
        P("A planilha é a mesma do “CONTROLE DE QUALIDADE”, com uma aba por safra (ex.: “OUT 26”). As colunas lidas são:"),
        TAB(["Coluna", "O que o sistema faz com ela"], [
          ["CONTRATO", "Encontra a venda no sistema. Sem contrato, a linha é ignorada e aparece na lista de “sem contrato”."],
          ["STATUS CONTRATO", "Atualiza a situação do contrato, se o status existir no cadastro."],
          ["DATA BASE", "Data que serve de referência para o prazo da primeira fatura."],
          ["FORMA DE PAGAMENTO", "Boleto ou DCC (débito/cartão/recorrente viram DCC)."],
          ["1ª FATURA / 2ª FATURA", "Paga no prazo, paga fora do prazo, não paga ou em aberto."],
          ["DT DE PG 1° FATURA / 2° FATURA", "Data do pagamento de cada uma."],
          ["FPD", "OK, NÃO OK ou PRAZO. É o que alimenta o indicador de qualidade."],
          ["DEPOIS DO PRAZO · PRAZO OPERADORA", "Informações de prazo que acompanham a apuração."],
          ["TRATATIVA CHURN · STATUS OBS · C/ OU S/ OFERTA", "Registro do trabalho de retenção."],
        ]),
        PASSOS("Abra <b>Lançar FPD</b> e anexe o arquivo (.xlsx ou .csv).",
          "Confira a prévia: quantas linhas entram, quantas não têm contrato e quais avisos apareceram.",
          "Confirme. O envio fica no histórico, com data e autor.",
          "Se precisar, use <b>Exportar no modelo</b> para devolver à operadora no mesmo formato, ou baixe o modelo em branco."),
        ATEN("Datas podem vir como número do Excel (ex.: 45678) ou como dd/mm/aaaa: o sistema entende as duas. O que ele não adivinha é contrato trocado, então confira a coluna CONTRATO antes de enviar."),
      ],
    },
    {
      k: "g_conferencia", nome: "Conferir o que a operadora pagou", icone: "money",
      resumo: "A aba de conferência do Extrato: onde aparece dinheiro que ficou para trás.",
      blocos: [
        P("Depois de enviar o extrato, a aba <b>3. Conferência com as vendas</b> cruza o que a operadora pagou com o que existe no sistema. É a parte que mais devolve dinheiro, porque mostra o que ficou de fora."),
        IMG("extrato"),
        H("As três listas"),
        TAB(["Lista", "O que significa", "O que fazer"], [
          ["Instaladas sem pagamento", "A venda está instalada no sistema, mas não apareceu no extrato.", "Separe as que já passaram do prazo e conteste com a operadora."],
          ["Pagas, mas canceladas no sistema", "A Operadora pagou, mas no sistema a venda está cancelada.", "Confirme se o cancelamento é real: se for, espere o estorno; se não for, corrija a situação da venda."],
          ["Pagas, mas fora do sistema", "Veio pagamento de um contrato que não existe aqui.", "Normalmente é venda que não foi lançada: lance para a pessoa receber a premiação."],
        ]),
        H("Como trabalhar a lista"),
        PASSOS("Abra a aba de conferência depois de importar a quinzena.",
          "Comece pelas <b>instaladas sem pagamento</b> que já passaram do prazo (o sistema separa as que ainda é cedo para cobrar).",
          "Exporte a lista em Excel e leve para a reunião com a operadora.",
          "Depois de resolver, reimporte o extrato novo: só as linhas novas entram."),
        H("Resumo dos pagamentos"),
        ITENS("<b>Comissões pagas</b>: o que a operadora pagou na quinzena.",
          "<b>Estornos descontados</b>: o que ela tirou por cancelamento ou inadimplência.",
          "<b>Líquido recebido</b>: pago menos estornos.",
          "<b>Estornos a debitar</b>: o que ainda deve ser descontado nas próximas quinzenas."),
        DICA("Mandou o arquivo errado? Em <b>Histórico de envios</b> dá para desfazer um envio: só as linhas que entraram por ele são apagadas."),
        ATEN("Abrir o .csv da operadora no Excel e salvar por cima costuma estragar o arquivo (datas e números mudam). Envie o arquivo como veio do portal."),
      ],
    },
  ];

  /* ===================== pastas por perfil ===================== */
  /* Cada pasta é uma função do canal e leva só o que aquela função precisa aprender.
     Quem é gerente ou administrador vê todas as pastas (é quem treina a equipe); os demais veem a sua. */
  const PASTAS = [
    { k: "vendedor", nome: "Vendedor", perfil: "vendedor", icone: "medal",
      resumo: "Quem vende na rua: app, viabilidade, acompanhamento das vendas e premiação.",
      topicos: ["inicio", "pp_vendedor", "app", "v_dia", "v_vendas", "v_viab", "v_qualidade", "v_premio", "glossario"] },
    { k: "supervisor", nome: "Supervisor", perfil: "lider", icone: "chart",
      resumo: "Quem toca uma equipe: ritmo do mês, cobrança diária e premiação do time.",
      topicos: ["inicio", "pp_supervisor", "s_equipe", "s_vendas", "s_fech", "s_premio", "glossario"] },
    { k: "coordenador", nome: "Coordenador", perfil: "coordenador", icone: "chart",
      resumo: "Quem cuida de várias equipes: as mesmas telas do supervisor, com o escopo maior.",
      topicos: ["inicio", "pp_supervisor", "s_equipe", "s_vendas", "s_fech", "s_premio", "glossario"] },
    { k: "cadastro", nome: "Backoffice · Cadastro", perfil: "backoffice:CADASTRO", icone: "list",
      resumo: "Quem lança as vendas e toca a operação do dia.",
      topicos: ["inicio", "pp_cadastro", "bc_lancar", "g_importar", "bc_dia", "glossario"] },
    { k: "qualidade", nome: "Backoffice · Qualidade", perfil: "backoffice:QUALIDADE", icone: "shield",
      resumo: "Quem acompanha a qualidade da venda e o FPD.",
      topicos: ["inicio", "pp_qualidade", "bq_ind", "qualidade", "glossario"] },
    { k: "gerente", nome: "Gerente", perfil: "gestor", icone: "gear",
      resumo: "Quem administra o canal inteiro: metas, premiação, extrato, acessos e indicadores.",
      topicos: ["inicio", "primeiros", "g_rotina", "painel", "vendas", "operacao", "qualidade", "premiacao", "g_plano", "financeiro", "g_conferencia", "g_importar", "admin", "app", "novidades", "glossario"] },
    { k: "adm", nome: "Administrador", perfil: "administrador", icone: "gear",
      resumo: "As mesmas telas e permissões do gerente; muda só o nome do cargo.",
      topicos: ["inicio", "primeiros", "g_rotina", "painel", "vendas", "operacao", "qualidade", "premiacao", "g_plano", "financeiro", "g_conferencia", "g_importar", "admin", "app", "novidades", "glossario"] },
  ];
  const TOPICO = Object.fromEntries(SECOES.map((t) => [t.k, t]));
  const topicosDe = (pasta) => pasta.topicos.map((k) => TOPICO[k]).filter(Boolean);

  /** A pasta do usuário que está logado. */
  function minhaPasta() {
    const u = S.sessao?.usuario || {};
    const chave = u.perfil === "backoffice" ? `backoffice:${u.setor === "QUALIDADE" ? "QUALIDADE" : "CADASTRO"}` : (u.cargo === "administrador" ? "administrador" : u.perfil);
    return PASTAS.find((p) => p.perfil === chave) || PASTAS.find((p) => p.perfil === "gestor");
  }
  /** Gerente, administrador e master enxergam todas as pastas (são quem treina a equipe). */
  const todasAsPastas = () => {
    const u = S.sessao?.usuario || {};
    return u.master || u.perfil === "gestor" ? PASTAS : [minhaPasta()];
  };

  /** Endereço da Wiki para a tela em que a pessoa está (usado pelo botão Ajuda do cabeçalho). */
  const DE_TELA = { dashboard: ["painel", "s_equipe", "v_dia", "bq_ind"], equipe: ["s_equipe", "painel"], meu: ["v_dia", "painel"],
    vendas: ["v_vendas", "bc_lancar", "vendas"], nova: ["bc_lancar", "vendas"], lote: ["bc_lancar", "vendas"], venda: ["v_vendas", "bc_lancar", "vendas"],
    viabilidade: ["v_viab", "bc_dia", "operacao"], confirmacao: ["bc_dia", "operacao"], rota: ["bc_dia", "operacao"],
    fechamento: ["s_fech", "bc_dia", "operacao"], produtividade: ["bc_dia", "operacao"],
    "ind-vendas": ["bq_ind", "qualidade"], "ind-qualidade": ["qualidade"], "ind-operacao": ["bq_ind", "qualidade"], "ind-pessoas": ["bq_ind", "qualidade"], "ind-geo": ["bq_ind", "qualidade"], fpd: ["qualidade"],
    comissao: ["v_premio", "s_premio", "premiacao"], plano: ["premiacao"], extrato: ["financeiro"],
    usuarios: ["admin"], feriados: ["admin"], central: ["admin"], perfil: ["inicio"] };
  S.wikiLink = (pagina) => {
    const pasta = minhaPasta(); if (!pasta) return "";
    const cand = DE_TELA[pagina] || [];
    const k = cand.find((x) => pasta.topicos.includes(x)) || cand.find((x) => TOPICO[x]);
    return k ? `#/wiki/${pasta.k}/${k}` : `#/wiki/${pasta.k}`;
  };

  /* ===================== montagem da tela ===================== */
  const ICO = {
    rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2a2.1 2.1 0 00-3-3z"/><path d="M14.5 13.5L18 10a5.7 5.7 0 001.6-4.9A5.7 5.7 0 0014.7 6l-3.5 3.5"/><path d="M9 11l4 4"/><path d="M11.2 9.5L8 8.8 5.5 11l2.6.9M14.5 13.5l.7 3.2-2.2 2.5-.9-2.6"/>',
    chart: '<path d="M3 20h18"/><rect x="5" y="11" width="3.5" height="6" rx="1"/><rect x="10.3" y="7" width="3.5" height="10" rx="1"/><rect x="15.6" y="13" width="3.5" height="4" rx="1"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    flow: '<rect x="3" y="4" width="7" height="6" rx="2"/><rect x="14" y="14" width="7" height="6" rx="2"/><path d="M10 7h4a3 3 0 013 3v4"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    medal: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/>',
    money: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    phone: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10.5 18.5h3"/>',
    spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
    flag: '<path d="M5 21V4"/><path d="M5 5h11l-1.6 3.5L16 12H5z"/>',
    book: '<path d="M4 4.5A1.5 1.5 0 015.5 3H18a1 1 0 011 1v15a1 1 0 01-1 1H5.5A1.5 1.5 0 014 18.5z"/><path d="M4 16.5A1.5 1.5 0 015.5 15H19"/><path d="M8 7h7"/>',
  };
  const ico = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[k] || ICO.book}</svg>`;

  const bloco = (b) => {
    switch (b.t) {
      case "h": return `<h3 class="wk-h">${esc(b.v)}</h3>`;
      case "p": return b.v.map((t) => `<p class="wk-p">${t}</p>`).join("");
      case "passos": return `<ol class="wk-passos">${b.v.map((t) => `<li>${t}</li>`).join("")}</ol>`;
      case "itens": return `<ul class="wk-itens">${b.v.map((t) => `<li>${t}</li>`).join("")}</ul>`;
      case "dica": return `<div class="wk-nota dica"><b>Dica</b><span>${b.v}</span></div>`;
      case "aten": return `<div class="wk-nota aten"><b>Atenção</b><span>${b.v}</span></div>`;
      case "fig": return FIG[b.v] ? FIG[b.v]() : "";
      case "check": return `<div class="wk-check"><b>${esc(b.titulo)}</b>${b.v.map((t, i) => `<label><input type="checkbox" data-ck="${esc(b.titulo)}#${i}"><span>${t}</span></label>`).join("")}</div>`;
      case "tab": return `<div class="tab wk-tab"><table><thead><tr>${b.cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>
        <tbody>${b.linhas.map((l) => `<tr>${l.map((c, i) => `<td data-l="${esc(b.cols[i] || "")}">${i === 0 ? `<b>${c}</b>` : c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      default: return "";
    }
  };

  const textoDe = (s) => (s.nome + " " + s.resumo + " " + JSON.stringify(s.blocos)).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const semAcento = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  S.wikiFig = FIG;   // desenhos das telas, disponíveis para outras partes do site

  S.PAGES.wiki = async (el) => {
    const pastas = todasAsPastas();
    const partes = (location.hash || "").split("/");            // #/wiki/<pasta>/<topico>
    let pasta = pastas.find((p) => p.k === partes[2]) || minhaPasta();
    if (!pastas.includes(pasta)) pasta = pastas[0];
    let atual = TOPICO[partes[3]] && pasta.topicos.includes(partes[3]) ? TOPICO[partes[3]] : topicosDe(pasta)[0];
    let busca = "";

    const pintar = () => {
      const b = semAcento(busca);
      const lista = b ? topicosDe(pasta).filter((t) => textoDe(t).includes(b)) : topicosDe(pasta);
      // procurando: mostra também o que foi achado nas outras pastas que a pessoa pode ver
      const fora = b ? pastas.filter((p) => p !== pasta).flatMap((p) => topicosDe(p).filter((t) => textoDe(t).includes(b)).map((t) => ({ p, t })))
        .filter((x, i, a) => a.findIndex((y) => y.t.k === x.t.k) === i).slice(0, 8) : [];
      if (b && lista.length && !lista.includes(atual)) atual = lista[0];
      const i = lista.indexOf(atual), prox = i >= 0 && i < lista.length - 1 ? lista[i + 1] : null;
      el.innerHTML = `<div class="cab"><div><div class="migalha">Ajuda</div><h1>Wiki do sistema</h1><p>O manual separado por função. Abra a pasta do cargo e leia só o que aquela função precisa.</p></div>
          <div class="acoes"><button class="btn sec" id="wimp" title="Abrir a janela de impressão deste assunto">Imprimir este assunto</button><button class="btn sec" id="wimpt" title="Gera um manual com todos os assuntos desta pasta, pronto para imprimir ou salvar em PDF">Imprimir a pasta inteira</button></div></div>
        <div class="wk" data-sem-exp>
          <aside class="wk-nav">
            <div class="campo wk-busca"><label>Buscar nesta pasta</label><input id="wq" type="search" placeholder="ex.: FPD, viabilidade, senha" value="${esc(busca)}"></div>
            ${pastas.length > 1 ? `<div class="wk-pastas"><label>Pasta</label>${pastas.map((p) => `<button type="button" class="wk-pasta ${p === pasta ? "on" : ""}" data-pasta="${p.k}"><span class="wk-ic">${ico(p.icone)}</span><span><b>${esc(p.nome)}</b><small>${esc(p.resumo)}</small></span></button>`).join("")}</div>
              <div class="wk-sep">Assuntos de ${esc(pasta.nome)}</div>` : ""}
            ${lista.length ? lista.map((t) => `<button type="button" class="wk-aba ${t === atual ? "on" : ""}" data-s="${t.k}"><span class="wk-ic">${ico(t.icone)}</span><span><b>${esc(t.nome)}</b><small>${esc(t.resumo)}</small></span></button>`).join("")
              : `<p class="mut" style="padding:10px 10px 4px">Nada encontrado para “${esc(busca)}” nesta pasta.</p>`}
            ${b && fora.length ? `<div class="wk-sep">Em outras pastas</div>${fora.map(({ p, t }) => `<button type="button" class="wk-aba fora" data-ir="${p.k}|${t.k}"><span class="wk-ic">${ico(t.icone)}</span><span><b>${esc(t.nome)}</b><small>na pasta ${esc(p.nome)}</small></span></button>`).join("")}` : ""}
          </aside>
          <article class="wk-corpo" id="wkc">
            ${lista.length ? `<header class="wk-top"><span class="wk-ic gd">${ico(atual.icone)}</span><div><div class="wk-pasta-nome">${esc(pasta.nome)}</div><h2>${esc(atual.nome)}</h2><p>${esc(atual.resumo)}</p></div></header>
              ${atual.blocos.map(bloco).join("")}
              <div class="wk-fim">${prox ? `<button type="button" class="btn sec" data-s="${prox.k}">Próximo: ${esc(prox.nome)} →</button>` : `<span class="mut">Você chegou ao fim da pasta ${esc(pasta.nome)}.</span>`}</div>` : ""}
          </article>
        </div>`;

      el.querySelectorAll("[data-ir]").forEach((btn) => btn.addEventListener("click", () => {
        const [pk, tk] = btn.dataset.ir.split("|");
        pasta = pastas.find((p) => p.k === pk) || pasta; atual = TOPICO[tk] || atual; busca = "";
        location.hash = `#/wiki/${pasta.k}/${atual.k}`;
        pintar(); el.querySelector("#wkc")?.scrollIntoView({ block: "start", behavior: "smooth" });
      }));
      el.querySelectorAll("[data-pasta]").forEach((btn) => btn.addEventListener("click", () => {
        pasta = pastas.find((p) => p.k === btn.dataset.pasta) || pasta;
        atual = topicosDe(pasta)[0]; busca = "";
        location.hash = `#/wiki/${pasta.k}/${atual.k}`;
        pintar(); el.querySelector("#wkc")?.scrollIntoView({ block: "start", behavior: "smooth" });
      }));
      el.querySelectorAll("[data-s]").forEach((btn) => btn.addEventListener("click", () => {
        atual = TOPICO[btn.dataset.s] || atual;
        location.hash = `#/wiki/${pasta.k}/${atual.k}`;
        pintar(); el.querySelector("#wkc")?.scrollIntoView({ block: "start", behavior: "smooth" });
      }));
      const q = el.querySelector("#wq");
      q.addEventListener("input", () => { busca = q.value; const p = q.selectionStart; pintar(); const n = el.querySelector("#wq"); n.focus(); n.setSelectionRange(p, p); });
      // as marcações do treinamento ficam guardadas neste aparelho
      const CH = "seven_wiki_check";
      let feitos = {};
      try { feitos = JSON.parse(localStorage.getItem(CH) || "{}"); } catch {}
      el.querySelectorAll("[data-ck]").forEach((c) => {
        c.checked = !!feitos[c.dataset.ck];
        c.closest("label").classList.toggle("feito", c.checked);
        c.addEventListener("change", () => {
          feitos[c.dataset.ck] = c.checked;
          c.closest("label").classList.toggle("feito", c.checked);
          try { localStorage.setItem(CH, JSON.stringify(feitos)); } catch {}
        });
      });
      el.querySelector("#wimpt").addEventListener("click", () => {
        const corpo = el.querySelector("#wkc");
        const antes = corpo.innerHTML, titulo = document.title;
        corpo.innerHTML = `<header class="wk-top"><span class="wk-ic gd">${ico(pasta.icone)}</span><div><div class="wk-pasta-nome">Manual completo</div><h2>${esc(pasta.nome)}</h2><p>${esc(pasta.resumo)}</p></div></header>`
          + topicosDe(pasta).map((t, i) => `<section class="wk-cap"><h2 class="wk-cap-t"><span>${i + 1}</span>${esc(t.nome)}</h2><p class="wk-p mut">${esc(t.resumo)}</p>${t.blocos.map(bloco).join("")}</section>`).join("");
        document.title = `Wiki Norte Link · ${pasta.nome}`;
        document.body.classList.add("wk-imprimindo");
        const fim = () => { document.body.classList.remove("wk-imprimindo"); corpo.innerHTML = antes; document.title = titulo; pintar(); removeEventListener("afterprint", fim); };
        addEventListener("afterprint", fim);
        setTimeout(() => window.print(), 80);
      });
      el.querySelector("#wimp").addEventListener("click", () => {
        document.body.classList.add("wk-imprimindo");
        const fim = () => { document.body.classList.remove("wk-imprimindo"); removeEventListener("afterprint", fim); };
        addEventListener("afterprint", fim);
        setTimeout(() => window.print(), 60);
      });
    };
    pintar();
  };
})();
