/**
 * A leitura do arquivo de contatos NO NAVEGADOR: o arquivo vira uma tabela de
 * texto (`string[][]`, a primeira linha é o cabeçalho) e nada dele sobe ao
 * servidor. Quem decide o que sobe é `lerPlanilha` (`lib/baseDeMarketing.ts`),
 * que só reconhece as colunas da lista dela.
 *
 * O formato é decidido pelo CONTEÚDO, e não pela extensão: o ".xls" que o
 * RevendaMais exporta é uma tabela HTML.
 *
 *   tabela HTML ..... começa com `<table` ou `<html` — lida com `DOMParser`
 *   .xlsx ........... zip (começa com "PK") — lido sem biblioteca, com o
 *                     `DecompressionStream` do navegador
 *   .csv / .txt ..... separador `;`, `,` ou tab, com aspas duplas
 *
 * Limites do leitor de .xlsx (não há biblioteca de planilha no projeto):
 *   - lê UMA aba: `xl/worksheets/sheet1.xml`, ou a primeira que houver;
 *   - fórmula entra pelo valor guardado; célula mesclada, só a primeira;
 *   - data vira "dd/mm/aaaa hh:mm:ss" quando a célula tem formato de data;
 *   - zip64, zip cifrado e o .xls binário antigo são recusados com o pedido
 *     de salvar como CSV.
 */

/** Um arquivo que não deu para ler. A mensagem é para a tela. */
export class ErroDeLeituraDoArquivo extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeLeituraDoArquivo";
  }
}

const SALVE_COMO_CSV = "Salve o arquivo como CSV e envie de novo.";

export async function lerArquivoComoTabela(file: File): Promise<string[][]> {
  const bytes = await bytesDoArquivo(file);
  if (bytes.length === 0) throw new ErroDeLeituraDoArquivo("O arquivo está vazio.");
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return lerXlsx(bytes);
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new ErroDeLeituraDoArquivo(`Este é um arquivo do Excel antigo (.xls binário), que o navegador não lê. ${SALVE_COMO_CSV}`);
  }
  const texto = textoDosBytes(bytes);
  const comeco = texto.slice(0, 4000).toLowerCase();
  return comeco.includes("<table") || comeco.includes("<html") ? lerTabelaHtml(texto) : lerCsv(texto);
}

async function bytesDoArquivo(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") return new Uint8Array(await file.arrayBuffer());
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(new Uint8Array(leitor.result as ArrayBuffer));
    leitor.onerror = () => reject(new ErroDeLeituraDoArquivo("O navegador não conseguiu abrir o arquivo."));
    leitor.readAsArrayBuffer(file);
  });
}

/** UTF-8; se sair caractere de substituição, o arquivo é do Windows antigo (windows-1252). */
export function textoDosBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  if (!utf8.includes("�")) return utf8;
  try {
    return new TextDecoder("windows-1252").decode(bytes);
  } catch {
    return utf8;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tabela HTML (a "planilha" do RevendaMais)
// ─────────────────────────────────────────────────────────────────────────────

const limpo = (s: string | null | undefined) => (s ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();

function lerTabelaHtml(html: string): string[][] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  // A tabela com mais linhas é a dos dados; as outras, se houver, são moldura.
  let maior: HTMLTableElement | null = null;
  let linhasDaMaior = 0;
  for (const tabela of Array.from(doc.querySelectorAll("table"))) {
    const n = tabela.querySelectorAll("tr").length;
    if (n > linhasDaMaior) {
      maior = tabela;
      linhasDaMaior = n;
    }
  }
  if (!maior) throw new ErroDeLeituraDoArquivo("Não achei tabela dentro do arquivo.");
  const tabela: string[][] = [];
  for (const tr of Array.from(maior.querySelectorAll("tr"))) {
    if (tr.closest("table") !== maior) continue;
    const celulas = Array.from(tr.children).filter((c) => c.tagName === "TD" || c.tagName === "TH");
    if (celulas.length > 0) tabela.push(celulas.map((c) => limpo(c.textContent)));
  }
  return tabela;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV
// ─────────────────────────────────────────────────────────────────────────────

/** O separador é o que mais aparece na primeira linha, fora de aspas. */
function separadorDoCsv(texto: string): string {
  const contagem: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  let entreAspas = false;
  for (const c of texto) {
    if (c === '"') entreAspas = !entreAspas;
    else if (!entreAspas && (c === "\n" || c === "\r")) break;
    else if (!entreAspas && c in contagem) contagem[c]++;
  }
  return [";", ",", "\t"].reduce((melhor, s) => (contagem[s] > contagem[melhor] ? s : melhor), ";");
}

function lerCsv(bruto: string): string[][] {
  const texto = bruto.replace(/^﻿/, "");
  const sep = separadorDoCsv(texto);
  const tabela: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let entreAspas = false;
  let teveAspas = false;
  const fecharCampo = () => {
    linha.push(teveAspas ? campo : campo.trim());
    campo = "";
    teveAspas = false;
  };
  const fecharLinha = () => {
    fecharCampo();
    if (linha.some((c) => c !== "")) tabela.push(linha);
    linha = [];
  };
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreAspas) {
      if (c !== '"') campo += c;
      else if (texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else entreAspas = false;
    } else if (c === '"' && campo.trim() === "") {
      entreAspas = true;
      teveAspas = true;
      campo = "";
    } else if (c === sep) fecharCampo();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fecharLinha();
    } else campo += c;
  }
  if (campo !== "" || linha.length > 0) fecharLinha();
  return tabela;
}

// ─────────────────────────────────────────────────────────────────────────────
// XLSX (zip + XML), sem biblioteca
// ─────────────────────────────────────────────────────────────────────────────

interface EntradaDoZip {
  metodo: number;
  cifrado: boolean;
  tamanhoComprimido: number;
  posicao: number;
}

const u16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

/** O diretório central do zip: nome → onde está e como foi guardado. */
function entradasDoZip(b: Uint8Array): Map<string, EntradaDoZip> {
  let fim = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (u32(b, i) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new ErroDeLeituraDoArquivo(`O arquivo parece um .xlsx, mas está truncado ou corrompido. ${SALVE_COMO_CSV}`);
  const quantas = u16(b, fim + 10);
  let p = u32(b, fim + 16);
  if (quantas === 0xffff || p === 0xffffffff) throw new ErroDeLeituraDoArquivo(`A planilha é grande demais para o leitor do navegador. ${SALVE_COMO_CSV}`);
  const nomes = new TextDecoder("utf-8");
  const entradas = new Map<string, EntradaDoZip>();
  for (let n = 0; n < quantas && p + 46 <= b.length && u32(b, p) === 0x02014b50; n++) {
    const tamanhoDoNome = u16(b, p + 28);
    const nome = nomes.decode(b.subarray(p + 46, p + 46 + tamanhoDoNome));
    entradas.set(nome, { metodo: u16(b, p + 10), cifrado: (u16(b, p + 8) & 1) === 1, tamanhoComprimido: u32(b, p + 20), posicao: u32(b, p + 42) });
    p += 46 + tamanhoDoNome + u16(b, p + 30) + u16(b, p + 32);
  }
  return entradas;
}

async function inflar(comprimido: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new ErroDeLeituraDoArquivo(`Este navegador não abre .xlsx. ${SALVE_COMO_CSV}`);
  }
  const fluxo = new DecompressionStream("deflate-raw");
  const escritor = fluxo.writable.getWriter();
  // O erro de dado corrompido chega pela leitura; a escrita só não pode ficar sem dono.
  void escritor.write(comprimido as BufferSource).catch(() => undefined);
  void escritor.close().catch(() => undefined);
  const leitor = fluxo.readable.getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    pedacos.push(value as Uint8Array);
    total += (value as Uint8Array).length;
  }
  const tudo = new Uint8Array(total);
  let pos = 0;
  for (const pedaco of pedacos) {
    tudo.set(pedaco, pos);
    pos += pedaco.length;
  }
  return tudo;
}

async function textoDaEntrada(b: Uint8Array, entradas: Map<string, EntradaDoZip>, nome: string): Promise<string | null> {
  const e = entradas.get(nome);
  if (!e) return null;
  if (e.cifrado) throw new ErroDeLeituraDoArquivo(`A planilha está protegida por senha. ${SALVE_COMO_CSV}`);
  if (u32(b, e.posicao) !== 0x04034b50) throw new ErroDeLeituraDoArquivo(`O arquivo .xlsx está corrompido. ${SALVE_COMO_CSV}`);
  const inicio = e.posicao + 30 + u16(b, e.posicao + 26) + u16(b, e.posicao + 28);
  const dados = b.subarray(inicio, inicio + e.tamanhoComprimido);
  if (e.metodo !== 0 && e.metodo !== 8) throw new ErroDeLeituraDoArquivo(`A planilha usa uma compressão que o navegador não lê. ${SALVE_COMO_CSV}`);
  let aberto: Uint8Array;
  try {
    aberto = e.metodo === 0 ? dados : await inflar(dados);
  } catch (erro) {
    if (erro instanceof ErroDeLeituraDoArquivo) throw erro;
    throw new ErroDeLeituraDoArquivo(`O arquivo .xlsx está corrompido. ${SALVE_COMO_CSV}`);
  }
  return new TextDecoder("utf-8").decode(aberto);
}

const xml = (texto: string) => new DOMParser().parseFromString(texto, "application/xml");
const filhos = (el: Element | Document, nome: string) => Array.from(el.getElementsByTagNameNS("*", nome));

/** "C5" → 2. Sem referência, `null`. */
function colunaDaReferencia(ref: string | null): number | null {
  const letras = (ref ?? "").match(/^[A-Za-z]+/)?.[0];
  if (!letras) return null;
  let n = 0;
  for (const l of letras.toUpperCase()) n = n * 26 + (l.charCodeAt(0) - 64);
  return n - 1;
}

/** Formatos de número embutidos do Excel que são data ou hora. */
const FORMATOS_DE_DATA_EMBUTIDOS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

/** Para cada estilo de célula (`s="3"`), se ele é de data. */
function estilosDeData(estilos: string | null): boolean[] {
  if (!estilos) return [];
  const doc = xml(estilos);
  const proprios = new Map<number, boolean>();
  for (const f of filhos(doc, "numFmt")) {
    const codigo = (f.getAttribute("formatCode") ?? "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
    proprios.set(Number(f.getAttribute("numFmtId")), /[dmyh]/i.test(codigo));
  }
  const cellXfs = filhos(doc, "cellXfs")[0];
  if (!cellXfs) return [];
  return filhos(cellXfs, "xf").map((xf) => {
    const id = Number(xf.getAttribute("numFmtId") ?? 0);
    return proprios.get(id) ?? FORMATOS_DE_DATA_EMBUTIDOS.has(id);
  });
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** O número de série do Excel → "31/12/2025" ou "31/12/2025 23:38:18", como `dataDaPlanilha` lê. */
function dataDoNumeroDeSerie(serie: number, base1904: boolean): string {
  const segundos = Math.round(serie * 86400);
  const data = new Date(Date.UTC(base1904 ? 1904 : 1899, base1904 ? 0 : 11, base1904 ? 1 : 30) + segundos * 1000);
  const dia = `${doisDigitos(data.getUTCDate())}/${doisDigitos(data.getUTCMonth() + 1)}/${data.getUTCFullYear()}`;
  if (segundos % 86400 === 0) return dia;
  return `${dia} ${doisDigitos(data.getUTCHours())}:${doisDigitos(data.getUTCMinutes())}:${doisDigitos(data.getUTCSeconds())}`;
}

/** Telefone guardado como número pode vir em notação científica ("5.541999990000E12"). */
function numeroPorExtenso(v: string): string {
  if (!/^-?\d+(\.\d+)?[eE][+-]?\d+$/.test(v)) return v;
  const n = Number(v);
  return Number.isSafeInteger(n) ? String(n) : v;
}

async function lerXlsx(bytes: Uint8Array): Promise<string[][]> {
  const entradas = entradasDoZip(bytes);
  const abas = [...entradas.keys()].filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const aba = entradas.has("xl/worksheets/sheet1.xml") ? "xl/worksheets/sheet1.xml" : abas[0];
  if (!aba) throw new ErroDeLeituraDoArquivo(`O arquivo não é uma planilha do Excel (.xlsx). ${SALVE_COMO_CSV}`);

  const [folha, compartilhadas, estilos, pasta] = await Promise.all([
    textoDaEntrada(bytes, entradas, aba),
    textoDaEntrada(bytes, entradas, "xl/sharedStrings.xml"),
    textoDaEntrada(bytes, entradas, "xl/styles.xml"),
    textoDaEntrada(bytes, entradas, "xl/workbook.xml"),
  ]);

  // O texto fonético (<rPh>) fica dentro do <si> e não é o valor da célula.
  const textoDe = (el: Element) => filhos(el, "t").filter((t) => t.parentElement?.localName !== "rPh").map((t) => t.textContent ?? "").join("");
  const textos = compartilhadas ? filhos(xml(compartilhadas), "si").map(textoDe) : [];
  const ehData = estilosDeData(estilos);
  const base1904 = /<(?:\w+:)?workbookPr\b[^>]*\bdate1904="(1|true)"/.test(pasta ?? "");

  const tabela: string[][] = [];
  for (const row of filhos(xml(folha ?? ""), "row")) {
    const linha: string[] = [];
    let proxima = 0;
    for (const c of filhos(row, "c")) {
      // Célula vazia é omitida do arquivo: quem diz a coluna é a referência ("C5").
      const coluna = colunaDaReferencia(c.getAttribute("r")) ?? proxima;
      proxima = coluna + 1;
      const tipo = c.getAttribute("t");
      const v = filhos(c, "v")[0]?.textContent ?? "";
      let valor: string;
      if (tipo === "s") valor = textos[Number(v)] ?? "";
      else if (tipo === "inlineStr") valor = textoDe(c);
      else if (tipo === "str" || tipo === "b" || tipo === "e") valor = v;
      else if (v !== "" && ehData[Number(c.getAttribute("s") ?? -1)] && Number.isFinite(Number(v))) valor = dataDoNumeroDeSerie(Number(v), base1904);
      else valor = numeroPorExtenso(v);
      while (linha.length < coluna) linha.push("");
      linha[coluna] = limpo(valor);
    }
    if (linha.some((x) => x !== "")) tabela.push(linha);
  }
  return tabela;
}
