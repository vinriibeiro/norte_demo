"use strict";
/* Gera planilhas .xlsx de verdade no navegador, sem bibliotecas externas (a política de segurança do site só aceita scripts próprios).
   Uso: XLSX7.baixar("arquivo.xlsx", [{ nome, linhas: [[valor | {v, s}]], larguras, mesclar, congelar, imagem, alturas }])
   Estilos (s): ver ESTILOS abaixo. Números ficam como número (dá para somar/filtrar no Excel). */
const XLSX7 = (() => {
  /* ---------- zip (método "store", sem compressão) ---------- */
  const TAB = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = TAB[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const enc = new TextEncoder();
  function zip(arquivos) {
    const partes = [], central = []; let pos = 0;
    const d = new Date(), dosT = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dosD = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const [nome, dado] of arquivos) {
      const dados = typeof dado === "string" ? enc.encode(dado) : dado, n = enc.encode(nome), crc = crc32(dados);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosT, true); h.setUint16(12, dosD, true); h.setUint32(14, crc, true); h.setUint32(18, dados.length, true); h.setUint32(22, dados.length, true);
      h.setUint16(26, n.length, true); h.setUint16(28, 0, true);
      partes.push(new Uint8Array(h.buffer), n, dados);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosT, true); c.setUint16(14, dosD, true); c.setUint32(16, crc, true); c.setUint32(20, dados.length, true); c.setUint32(24, dados.length, true);
      c.setUint16(28, n.length, true); c.setUint32(42, pos, true);
      central.push(new Uint8Array(c.buffer), n);
      pos += 30 + n.length + dados.length;
    }
    const tamC = central.reduce((s, x) => s + x.length, 0), f = new DataView(new ArrayBuffer(22));
    f.setUint32(0, 0x06054b50, true); f.setUint16(8, arquivos.length, true); f.setUint16(10, arquivos.length, true); f.setUint32(12, tamC, true); f.setUint32(16, pos, true);
    return new Blob([...partes, ...central, new Uint8Array(f.buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  /* ---------- estilos ---------- */
  const FONTES = [
    '<font><sz val="10"/><color rgb="FF1D2433"/><name val="Calibri"/></font>',                 // 0 normal
    '<font><b/><sz val="10"/><color rgb="FF1D2433"/><name val="Calibri"/></font>',             // 1 negrito
    '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>',             // 2 negrito branco
    '<font><b/><sz val="18"/><color rgb="FF1D2433"/><name val="Calibri"/></font>',             // 3 título
    '<font><sz val="10"/><color rgb="FF6B7488"/><name val="Calibri"/></font>',                 // 4 cinza
    '<font><b/><sz val="9"/><color rgb="FFA3161F"/><name val="Calibri"/></font>',              // 5 grupo de colunas (vermelho)
    '<font><b/><sz val="16"/><color rgb="FF1D2433"/><name val="Calibri"/></font>',             // 6 número grande
    '<font><b/><sz val="10"/><color rgb="FF23855A"/><name val="Calibri"/></font>',             // 7 verde
    '<font><b/><sz val="10"/><color rgb="FFA87508"/><name val="Calibri"/></font>',             // 8 âmbar
    '<font><b/><sz val="10"/><color rgb="FFC23A4A"/><name val="Calibri"/></font>',             // 9 vermelho
    '<font><sz val="10"/><color rgb="FFB8BFCC"/><name val="Calibri"/></font>',                 // 10 zero apagado
  ];
  const cor = (rgb) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  const FUNDOS = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>',
    cor("C9202E"), cor("F1F3F7"), cor("1D2433"), cor("E3F4EC"), cor("FBF0D6"), cor("FBE6E8"), cor("FDECEE"), cor("F8F9FB")];
  const BORDAS = ['<border><left/><right/><top/><bottom/><diagonal/></border>',
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FFE6E8EE"/></bottom><diagonal/></border>',
    '<border><left/><right/><top style="thin"><color rgb="FFD5D9E2"/></top><bottom style="thin"><color rgb="FFD5D9E2"/></bottom><diagonal/></border>'];
  const FMT = { int: 3, brl: 164, pct: 165, dec: 166 };
  const NUMFMTS = '<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="0%"/><numFmt numFmtId="166" formatCode="#,##0.0"/></numFmts>';
  // nome -> [fonte, fundo, borda, formato, alinhamento]
  const BASE = { "": [0, 0, 1], g: [1, 3, 2], t: [2, 4, 0], h: [2, 2, 0, 0, "center"], hg: [5, 8, 0, 0, "center"], titulo: [3, 0, 0], sub: [4, 0, 0],
    kr: [4, 9, 0], kv: [6, 9, 0], ok: [7, 5, 1, 0, "center"], alerta: [8, 6, 1, 0, "center"], ruim: [9, 7, 1, 0, "center"], z: [10, 0, 1, 0, "right"], b: [1, 0, 1] };
  const ESTILOS = {}, XFS = [];
  for (const [k, [fo, fu, bo, fm = 0, al]] of Object.entries(BASE)) for (const [sf, f] of [["", fm], ["_int", FMT.int], ["_brl", FMT.brl], ["_pct", FMT.pct], ["_dec", FMT.dec]]) {
    ESTILOS[k + sf] = XFS.length;
    const alin = al ? `<alignment horizontal="${al}" vertical="center"/>` : '<alignment vertical="center"/>';
    XFS.push(`<xf numFmtId="${f}" fontId="${fo}" fillId="${fu}" borderId="${bo}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${alin}</xf>`);
  }
  const estilosXml = () => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${NUMFMTS}
<fonts count="${FONTES.length}">${FONTES.join("")}</fonts><fills count="${FUNDOS.length}">${FUNDOS.join("")}</fills><borders count="${BORDAS.length}">${BORDAS.join("")}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${XFS.length}">${XFS.join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  /* ---------- planilhas ---------- */
  const xe = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  const col = (i) => { let s = ""; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  function folhaXml(f, temImg) {
    const linhas = f.linhas.map((l, r) => {
      const alt = f.alturas?.[r] ? ` ht="${f.alturas[r]}" customHeight="1"` : "";
      const cels = (l || []).map((c0, ci) => {
        const c = c0 !== null && typeof c0 === "object" ? c0 : { v: c0 };
        const ref = col(ci) + (r + 1), s = ESTILOS[c.s || ""] ?? 0;
        if (c.v === null || c.v === undefined || c.v === "") return `<c r="${ref}" s="${s}"/>`;
        if (typeof c.v === "number" && isFinite(c.v)) return `<c r="${ref}" s="${s}"><v>${c.v}</v></c>`;
        return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xe(c.v)}</t></is></c>`;
      }).join("");
      return `<row r="${r + 1}"${alt}>${cels}</row>`;
    }).join("");
    const cong = f.congelar ? `<pane xSplit="${f.congelar.coluna || 0}" ySplit="${f.congelar.linha || 0}" topLeftCell="${col(f.congelar.coluna || 0)}${(f.congelar.linha || 0) + 1}" activePane="bottomRight" state="frozen"/>` : "";
    const larg = f.larguras ? `<cols>${f.larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    const mes = f.mesclar?.length ? `<mergeCells count="${f.mesclar.length}">${f.mesclar.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
    const filtro = f.filtro ? `<autoFilter ref="${f.filtro}"/>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0">${cong}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="16"/>${larg}<sheetData>${linhas}</sheetData>${filtro}${mes}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>${temImg ? '<drawing r:id="rId1"/>' : ""}</worksheet>`;
  }
  const desenhoXml = (img) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<xdr:oneCellAnchor><xdr:from><xdr:col>${img.coluna || 0}</xdr:col><xdr:colOff>${img.dx || 0}</xdr:colOff><xdr:row>${img.linha || 0}</xdr:row><xdr:rowOff>${img.dy || 0}</xdr:rowOff></xdr:from><xdr:ext cx="${Math.round(img.w * 9525)}" cy="${Math.round(img.h * 9525)}"/>
<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="Logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(img.w * 9525)}" cy="${Math.round(img.h * 9525)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>`;

  function gerar(folhas, props = {}) {
    const arq = [], R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const temImg = folhas.some((f) => f.imagem);
    arq.push(["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${temImg ? '<Default Extension="png" ContentType="image/png"/>' : ""}
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
${folhas.map((f, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${f.imagem ? `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : ""}`).join("")}</Types>`]);
    arq.push(["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`]);
    arq.push(["docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xe(props.titulo || "")}</dc:title><dc:creator>${xe(props.autor || "")}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`]);
    arq.push(["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"><sheets>${folhas.map((f, i) => `<sheet name="${xe(f.nome.slice(0, 31).replace(/[\\/?*[\]:]/g, " "))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`]);
    arq.push(["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${folhas.map((f, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${folhas.length + 1}" Type="${R}/styles" Target="styles.xml"/></Relationships>`]);
    arq.push(["xl/styles.xml", estilosXml()]);
    folhas.forEach((f, i) => {
      arq.push([`xl/worksheets/sheet${i + 1}.xml`, folhaXml(f, !!f.imagem)]);
      if (f.imagem) {
        arq.push([`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/drawing" Target="../drawings/drawing${i + 1}.xml"/></Relationships>`]);
        arq.push([`xl/drawings/drawing${i + 1}.xml`, desenhoXml(f.imagem)]);
        arq.push([`xl/drawings/_rels/drawing${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/image" Target="../media/image${i + 1}.png"/></Relationships>`]);
        arq.push([`xl/media/image${i + 1}.png`, f.imagem.png]);
      }
    });
    return zip(arq);
  }

  /** Lê um PNG do próprio site (a logo) e devolve bytes + tamanho. */
  async function png(url, alturaPx) {
    try {
      const r = await fetch(url); if (!r.ok) return null;
      const b = new Uint8Array(await r.arrayBuffer());
      if (b[0] !== 0x89 || b[1] !== 0x50) return null;
      const dv = new DataView(b.buffer), w = dv.getUint32(16), h = dv.getUint32(20);
      return { png: b, w: Math.round(alturaPx * w / h), h: alturaPx };
    } catch { return null; }
  }

  function baixar(nome, folhas, props) {
    const blob = gerar(folhas, props), a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  /* ---------- leitura de .xlsx (para importar planilhas) ---------- */
  /** Lê um arquivo .xlsx e devolve [{ nome, linhas: [[valor]] }]. Datas chegam como número de série do Excel. */
  async function ler(arquivo) {
    const buf = new Uint8Array(await arquivo.arrayBuffer()), dv = new DataView(buf.buffer);
    let fim = -1; for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
    if (fim < 0) throw new Error("O arquivo não é um .xlsx válido (salve como \"Pasta de Trabalho do Excel\").");
    const n = dv.getUint16(fim + 10, true); let p = dv.getUint32(fim + 16, true);
    const ent = new Map(), dec = new TextDecoder();
    for (let i = 0; i < n; i++) {
      const met = dv.getUint16(p + 10, true), tamC = dv.getUint32(p + 20, true), ln = dv.getUint16(p + 28, true), le = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      ent.set(dec.decode(buf.subarray(p + 46, p + 46 + ln)), { met, tamC, off }); p += 46 + ln + le + lc;
    }
    const abrir = async (nome) => {
      const e = ent.get(nome); if (!e) return null;
      const ini = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true), dados = buf.subarray(ini, ini + e.tamC);
      if (e.met === 0) return dec.decode(dados);
      if (e.met !== 8 || typeof DecompressionStream === "undefined") throw new Error("Seu navegador não consegue abrir este .xlsx. Atualize o navegador ou envie a planilha em CSV.");
      const s = new Blob([dados]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return await new Response(s).text();
    };
    const xml = (t) => new DOMParser().parseFromString(t, "application/xml");
    const ss = [], sst = await abrir("xl/sharedStrings.xml");
    if (sst) xml(sst).querySelectorAll("si").forEach((si) => ss.push([...si.getElementsByTagName("t")].map((t) => t.textContent).join("")));
    const wb = xml(await abrir("xl/workbook.xml")), rels = xml(await abrir("xl/_rels/workbook.xml.rels"));
    const alvo = new Map([...rels.getElementsByTagName("Relationship")].map((r) => [r.getAttribute("Id"), r.getAttribute("Target")]));
    const out = [];
    for (const sh of wb.getElementsByTagName("sheet")) {
      const rid = sh.getAttribute("r:id") || sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      let t = alvo.get(rid) || ""; t = t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, "");
      const txt = await abrir(t); if (!txt) continue;
      const linhas = [];
      xml(txt).querySelectorAll("sheetData > row").forEach((row) => {
        const r = +row.getAttribute("r") - 1, l = [];
        row.querySelectorAll("c").forEach((c) => {
          const ref = c.getAttribute("r") || "", letras = ref.replace(/\d+/g, ""); let ci = 0; for (const ch of letras) ci = ci * 26 + ch.charCodeAt(0) - 64; ci--;
          const tp = c.getAttribute("t"), v = c.getElementsByTagName("v")[0]?.textContent;
          l[ci < 0 ? l.length : ci] = tp === "s" ? ss[+v] : tp === "inlineStr" ? [...c.getElementsByTagName("t")].map((x) => x.textContent).join("") : tp === "str" || tp === "e" ? v : tp === "b" ? v === "1" : v == null ? null : isNaN(+v) ? v : +v;
        });
        linhas[r >= 0 ? r : linhas.length] = l;
      });
      out.push({ nome: sh.getAttribute("name"), linhas: Array.from(linhas, (l) => l || []) });
    }
    return out;
  }
  return { gerar, baixar, png, col, ler };
})();
