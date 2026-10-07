// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { crc32, deflateRawSync } from "node:zlib";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  CONTATOS_POR_LOTE,
  agruparPorPessoa,
  lerContatoImportado,
  lerPlanilha,
  type ContatoImportado,
  type ImportacaoNaLista,
  type RespostaDoLoteDeImportacao,
  type ResumoDaBase,
} from "../src/lib/baseDeMarketing";
import { lerArquivoComoTabela } from "../src/components/marketing/base/lerArquivo";

/**
 * A tela "Base de contatos" montada de verdade (07/10/2026): só o `fetch`, o
 * `next/navigation`, o `next/link` e o diálogo são dublados.
 *
 * O que só a fiação prova: o arquivo é lido no navegador, nos três formatos;
 * a prévia é a de `agruparPorPessoa`; nada sobe sem confirmação; os lotes vão
 * em sequência e retomam de onde pararam; e NENHUMA coluna fora de
 * `ContatoImportado` (CPF, endereço) sai do navegador.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const refresh = vi.fn();
let confirma = true;
const confirm = vi.fn(async (opcoes: unknown) => (opcoes ? confirma : false));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) => createElement("a", { href, ...resto } as never, children as never),
}));
vi.mock("../src/components/admin/ConfirmDialog", () => ({ useConfirm: () => ({ confirm }) }));

beforeAll(async () => {
  // O jsdom não traz o `DecompressionStream`; o do Node é o mesmo do navegador.
  const g = globalThis as Record<string, unknown>;
  if (typeof g.DecompressionStream === "undefined") g.DecompressionStream = (await import("node:stream/web")).DecompressionStream;
  if (typeof g.TextDecoder === "undefined") g.TextDecoder = (await import("node:util")).TextDecoder;
});

const arquivo = (nome: string, conteudo: string | Uint8Array) => new File([conteudo as BlobPart], nome);

// ─────────────────────────────────────────────────────────────────────────────
// A leitura do arquivo
// ─────────────────────────────────────────────────────────────────────────────

/** Um zip mínimo, escrito à mão: entradas com deflate, diretório central e o registro de fim. */
function zip(entradas: Array<{ nome: string; texto: string }>): Uint8Array {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let posicao = 0;
  for (const e of entradas) {
    const nome = Buffer.from(e.nome, "utf8");
    const cru = Buffer.from(e.texto, "utf8");
    const comprimido = deflateRawSync(cru);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(cru), 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(cru.length, 22);
    local.writeUInt16LE(nome.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc32(cru), 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(cru.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(posicao, 42);
    locais.push(local, nome, comprimido);
    centrais.push(central, nome);
    posicao += 30 + nome.length + comprimido.length;
  }
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(posicao, 16);
  return new Uint8Array(Buffer.concat([...locais, diretorio, fim]));
}

const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';

describe("a leitura do arquivo no navegador", () => {
  it("o .xls do RevendaMais é uma tabela HTML: lê as células e desfaz as entidades", async () => {
    const html =
      "<table><tr><th>Id</th><th>T&#xED;tulo</th><th>Cliente</th><th>Telefone</th><th>Ve&#xED;culo</th></tr>" +
      "<tr><td>77</td><td>[P&#xF3;s-Venda] vendedor: Jo&#xE3;o</td><td>Jos&#xE9; da Silva</td><td>(41) 99999-0001</td><td>C4 CACTUS CITRO&#xCB;N Placa: ABC1D23</td></tr>" +
      "<tr><td>78</td><td></td><td>Ana &amp; Cia</td><td>&nbsp;</td><td>Placa:</td></tr></table>";
    const tabela = await lerArquivoComoTabela(arquivo("leads.xls", html));
    expect(tabela).toEqual([
      ["Id", "Título", "Cliente", "Telefone", "Veículo"],
      ["77", "[Pós-Venda] vendedor: João", "José da Silva", "(41) 99999-0001", "C4 CACTUS CITROËN Placa: ABC1D23"],
      ["78", "", "Ana & Cia", "", "Placa:"],
    ]);
  });

  it("CSV com ';': respeita aspas (separador, aspas dobradas e quebra de linha dentro do campo) e acento", async () => {
    const csv = 'Nome;Telefone;Veículo\r\n"Silva; José";41999990001;"Citroën ""Cactus""\nShine"\r\n\r\nAna;41999990002;\r\n';
    const tabela = await lerArquivoComoTabela(arquivo("lista.csv", csv));
    expect(tabela).toEqual([
      ["Nome", "Telefone", "Veículo"],
      ["Silva; José", "41999990001", 'Citroën "Cactus"\nShine'],
      ["Ana", "41999990002", ""],
    ]);
  });

  it("CSV com vírgula e com tab: o separador é o da primeira linha", async () => {
    expect(await lerArquivoComoTabela(arquivo("a.csv", "nome,telefone\nAna,41999990002\n"))).toEqual([
      ["nome", "telefone"],
      ["Ana", "41999990002"],
    ]);
    expect(await lerArquivoComoTabela(arquivo("a.txt", "nome\ttelefone\nAna, a prima\t41999990002"))).toEqual([
      ["nome", "telefone"],
      ["Ana, a prima", "41999990002"],
    ]);
  });

  it("CSV em windows-1252 é relido quando o UTF-8 sai com caractere de substituição", async () => {
    // "Nome;Veículo\nJosé;Citroën\n" em windows-1252: í=ED, é=E9, ë=EB.
    const bytes = Uint8Array.from([..."Nome;Ve"].map((c) => c.charCodeAt(0)).concat([0xed], [..."culo\nJos"].map((c) => c.charCodeAt(0)), [0xe9], [...";Citro"].map((c) => c.charCodeAt(0)), [0xeb], [..."n\n"].map((c) => c.charCodeAt(0))));
    const tabela = await lerArquivoComoTabela(arquivo("antigo.csv", bytes));
    expect(tabela).toEqual([
      ["Nome", "Veículo"],
      ["José", "Citroën"],
    ]);
  });

  it(".xlsx de verdade: sharedStrings, texto embutido, data pelo estilo, e célula vazia que não desloca as colunas", async () => {
    const xlsx = zip([
      { nome: "[Content_Types].xml", texto: "<Types/>" },
      { nome: "xl/workbook.xml", texto: `<workbook ${NS}><workbookPr/><sheets><sheet name="Leads" sheetId="1"/></sheets></workbook>` },
      { nome: "xl/styles.xml", texto: `<styleSheet ${NS}><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>` },
      {
        nome: "xl/sharedStrings.xml",
        texto: `<sst ${NS}><si><t>Nome</t></si><si><t>Telefone</t></si><si><t>Data</t></si><si><r><t>José </t></r><r><t>da Silva</t></r></si></sst>`,
      },
      {
        nome: "xl/worksheets/sheet1.xml",
        texto:
          `<worksheet ${NS}><sheetData>` +
          `<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="inlineStr"><is><t>E-mail</t></is></c><c r="D1" t="s"><v>2</v></c></row>` +
          // B2 é número; C2 não existe no arquivo (célula vazia); D2 é data (estilo 1 → formato 14).
          `<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>41999990001</v></c><c r="D2" s="1"><v>45000.5</v></c></row>` +
          // Só a última coluna preenchida.
          `<row r="3"><c r="D3" s="1"><v>45000</v></c></row>` +
          `</sheetData></worksheet>`,
      },
    ]);
    expect(xlsx[0]).toBe(0x50);
    const tabela = await lerArquivoComoTabela(arquivo("leads.xlsx", xlsx));
    expect(tabela).toEqual([
      ["Nome", "Telefone", "E-mail", "Data"],
      ["José da Silva", "41999990001", "", "15/03/2023 12:00:00"],
      ["", "", "", "15/03/2023"],
    ]);
    // E a planilha lida serve a `lerPlanilha`: o e-mail vazio não virou a data.
    const planilha = lerPlanilha(tabela);
    expect(planilha.ok && planilha.linhas[0]).toMatchObject({ nome: "José da Silva", telefone: "41999990001", email: null });
    expect(planilha.ok && planilha.linhas[0].ocorreuEm).toBe("2023-03-15T15:00:00.000Z");
  });

  it("recusa com texto útil o .xls binário e o zip truncado", async () => {
    await expect(lerArquivoComoTabela(arquivo("velho.xls", Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0])))).rejects.toThrow(/CSV/);
    await expect(lerArquivoComoTabela(arquivo("quebrado.xlsx", Uint8Array.from([0x50, 0x4b, 3, 4, 0, 0])))).rejects.toThrow(/CSV/);
    await expect(lerArquivoComoTabela(arquivo("vazio.csv", ""))).rejects.toThrow(/vazio/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A tela
// ─────────────────────────────────────────────────────────────────────────────

let chamadas: Array<{ url: string; metodo: string; corpo: unknown; bruto: string }>;
/** As respostas por rota, na ordem. A última se repete. */
let respostas: Record<string, Array<{ status: number; corpo: unknown }>>;
/** Quantas chamadas chegaram a estar no ar ao mesmo tempo. */
let maximoNoAr: number;
/** Enquanto existir, os lotes ficam no ar esperando por ele. */
let portao: Promise<void> | null;
let container: HTMLDivElement;
let root: Root;

function dublarFetch() {
  let noAr = 0;
  globalThis.fetch = (async (url: string, opcoes?: RequestInit) => {
    const bruto = opcoes?.body ? String(opcoes.body) : "";
    chamadas.push({ url, metodo: opcoes?.method ?? "GET", corpo: bruto ? JSON.parse(bruto) : null, bruto });
    noAr++;
    maximoNoAr = Math.max(maximoNoAr, noAr);
    await new Promise((r) => setTimeout(r, 1));
    if (portao && url.endsWith("/lote")) await portao;
    noAr--;
    const fila = respostas[url] ?? [{ status: 404, corpo: { error: "Rota não dublada." } }];
    const r = fila.length > 1 ? fila.shift()! : fila[0];
    return { ok: r.status < 400, status: r.status, json: async () => r.corpo };
  }) as never;
}

const esperar = (ms = 0) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

const q = <T extends Element = HTMLElement>(seletor: string) => container.querySelector(seletor) as T;

async function clicar(el: Element | null | undefined) {
  expect(el, "o elemento a clicar existe").toBeTruthy();
  await act(async () => {
    (el as HTMLElement).click();
  });
  await esperar(30);
}

const RESUMO: ResumoDaBase = {
  pessoas: 7310,
  clientes: 1200,
  comDataDeCompra: 950,
  semInteresse: 310,
  interessadosComCarro: 2800,
  interessadosSemCarro: 3310,
  canais: [
    { canal: "Webmotors", pessoas: 3000 },
    { canal: "Instagram", pessoas: 1500 },
  ],
  marcas: [
    { marca: "JEEP", pessoas: 800 },
    { marca: "VOLKSWAGEN", pessoas: 400 },
  ],
};

const IMPORTACAO: ImportacaoNaLista = {
  id: "imp-0",
  origem: "revenda_mais",
  arquivo: "leads-revenda.xls",
  linhas: 7964,
  contatosNovos: 5100,
  contatosAtualizados: 12,
  registrosNovos: 6400,
  criadoEm: "2026-10-07T12:00:00Z",
  criadoPorNome: "Dyones",
};

const MIGRACAO = "20261007120000_sms_campanhas";

async function tela(props: Record<string, unknown> = {}) {
  const { default: BaseDeContatos } = await import("../src/components/marketing/base/BaseDeContatos");
  dublarFetch();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(BaseDeContatos as never, { leitura: { ok: true, resumo: RESUMO, importacoes: [IMPORTACAO] }, migracao: MIGRACAO, ...props } as never));
  });
  await esperar();
}

async function escolherArquivo(file: File) {
  const campo = q<HTMLInputElement>("[data-arquivo-da-base]");
  Object.defineProperty(campo, "files", { configurable: true, value: [file] });
  await act(async () => {
    campo.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await esperar(30);
}

/** Uma planilha comum com CPF e endereço, que não podem sair do navegador. */
const CPF = "987.654.321-00";
const ENDERECO = "Rua do Segredo, 1234";
const PESSOAS = CONTATOS_POR_LOTE * 2 + 50;
function planilhaGrande(): string[][] {
  const tabela: string[][] = [["Nome", "Telefone", "cpf_cnpj", "Canal", "Veículo", "Endereço", "Marca", "Modelo"]];
  for (let i = 0; i < PESSOAS; i++) {
    tabela.push([`Pessoa ${String.fromCharCode(65 + (i % 26))}`, `419${String(90000000 + i)}`, CPF, i % 2 === 0 ? "Webmotors" : "Instagram", "", ENDERECO, i % 5 === 0 ? "" : "Jeep", i % 5 === 0 ? "" : "Compass"]);
  }
  // Uma linha sem celular, e uma repetida (mesma pessoa).
  tabela.push(["Sem Celular", "4133334444", CPF, "Loja", "", ENDERECO, "", ""]);
  tabela.push(["Pessoa A", "41990000000", CPF, "Loja", "", ENDERECO, "Fiat", "Pulse"]);
  return tabela;
}
const emCsv = (tabela: string[][]) => tabela.map((l) => l.map((c) => (/[;"\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(";")).join("\n");

const CRIAR = "/api/marketing/base/importacoes";
const LOTE = "/api/marketing/base/importacoes/imp-1/lote";
const lote = (parcial: Partial<RespostaDoLoteDeImportacao> = {}): { status: number; corpo: RespostaDoLoteDeImportacao } => ({
  status: 200,
  corpo: { contatosNovos: 0, contatosAtualizados: 0, registrosNovos: 0, recusados: 0, ...parcial },
});

const CHAVES_DO_CONTATO = ["canais", "cliente", "comprouEm", "email", "nome", "primeiroContatoEm", "registros", "semInteresse", "telefone", "ultimoContatoEm"].sort();
const CHAVES_DO_REGISTRO = ["origemId", "tipo", "marca", "modelo", "placa", "canal", "marcador", "ocorreuEm"].sort();

beforeEach(() => {
  chamadas = [];
  respostas = {};
  maximoNoAr = 0;
  portao = null;
  confirma = true;
  refresh.mockClear();
  confirm.mockClear();
});

afterEach(() => {
  if (!container) return;
  act(() => root.unmount());
  container.remove();
});

describe("a tela Base de contatos", () => {
  it("mostra o resumo da base em cartões e listas, com um título só e a volta para as campanhas", async () => {
    await tela();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(q("h1").textContent).toBe("Base de contatos");
    expect(container.textContent).toContain("Não é a fila de leads dos vendedores");
    expect(q("a[href='/admin/marketing/sms']")).toBeTruthy();
    expect(q("[data-cartao='pessoas']").textContent).toContain("7.310");
    expect(q("[data-cartao='interessados-com-carro']").textContent).toContain("2.800");
    expect(q("[data-cartao='interessados-sem-carro']").textContent).toContain("3.310");
    expect(q("[data-cartao='clientes']").textContent).toContain("1.200");
    expect(q("[data-cartao='clientes']").textContent).toContain("950 com data de compra");
    expect(q("[data-cartao='sem-interesse']").textContent).toContain("310");
    expect(q("[data-lista='canais']").textContent).toContain("Webmotors3.000");
    expect(q("[data-lista='marcas']").textContent).toContain("JEEP800");
    expect(q("[data-avisos-de-configuracao]")).toBeNull();
    expect(q<HTMLInputElement>("[data-arquivo-da-base]").accept).toBe(".xls,.xlsx,.csv,.txt,.html");
  });

  it("base vazia explica o primeiro passo; histórico vazio também", async () => {
    await tela({ leitura: { ok: true, resumo: { ...RESUMO, pessoas: 0, canais: [], marcas: [] }, importacoes: [] } });
    expect(q("[data-base-vazia]").textContent).toContain("O primeiro passo");
    expect(q("[data-resumo-da-base]")).toBeNull();
    expect(q("[data-historico-vazio]").textContent).toContain("Nenhuma importação ainda");
  });

  it("os avisos citam a migração e a chave de serviço, e bloqueiam a importação", async () => {
    await tela({ leitura: { ok: false, faltaMigracao: true, motivo: "relation does not exist" } });
    expect(q("[data-aviso='migracao']").textContent).toContain(MIGRACAO);
    expect(q("[data-aviso='migracao'] svg[data-estado='impeditivo']")).toBeTruthy();
    await escolherArquivo(arquivo("a.csv", "nome;telefone\nAna;41999990002\n"));
    expect(q<HTMLButtonElement>("[data-importar]").disabled).toBe(true);
    expect(q("[data-impedimento]").textContent).toContain("ainda não existem");
    act(() => root.unmount());
    container.remove();

    await tela({ leitura: { ok: false, faltaMigracao: false, motivo: "sem chave" }, semChaveDeServico: true });
    expect(q("[data-aviso='servico']").textContent).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(q("[data-aviso='leitura']")).toBeNull();
  });

  it("arquivo sem coluna de telefone é recusado com o motivo, e nada vai ao servidor", async () => {
    await tela();
    await escolherArquivo(arquivo("x.csv", "nome;cpf\nAna;1\n"));
    expect(q("[data-erro-do-arquivo]").textContent).toContain("Não achei a coluna de telefone");
    expect(q("[data-previa-da-planilha]")).toBeNull();
    expect(chamadas).toEqual([]);
  });

  it("a prévia mostra os números de `agruparPorPessoa`, a origem e as colunas ignoradas", async () => {
    const tabela = planilhaGrande();
    const planilha = lerPlanilha(tabela);
    if (!planilha.ok) throw new Error(planilha.motivo);
    const { resumo } = agruparPorPessoa(planilha.linhas, planilha.origem);
    expect(resumo.pessoas).toBe(PESSOAS);
    expect(resumo.semCelular).toBe(1);

    await tela();
    await escolherArquivo(arquivo("lista.csv", emCsv(tabela)));
    const n = (x: number) => x.toLocaleString("pt-BR");
    expect(q("[data-cartao='previa-linhas']").textContent).toContain(n(resumo.linhas));
    expect(q("[data-cartao='previa-linhas']").textContent).toContain(`${n(resumo.semCelular)} sem celular`);
    expect(q("[data-cartao='previa-pessoas']").textContent).toContain(n(resumo.pessoas));
    expect(q("[data-cartao='previa-clientes']").textContent).toContain(`${n(resumo.comDataDeCompra)} com data de compra`);
    expect(q("[data-cartao='previa-com-carro'] dd").textContent).toBe(n(resumo.interessadosComCarro));
    expect(q("[data-cartao='previa-sem-carro'] dd").textContent).toBe(n(resumo.interessadosSemCarro));
    expect(q("[data-cartao='previa-sem-interesse'] dd").textContent).toBe(n(resumo.semInteresse));
    expect(resumo.interessadosComCarro).toBeGreaterThan(0);
    expect(resumo.interessadosSemCarro).toBeGreaterThan(0);
    expect(q("[data-lista='previa-canais']").textContent).toContain(`${resumo.canais[0].canal}${n(resumo.canais[0].pessoas)}`);
    expect(q("[data-lista='previa-marcas']").textContent).toContain("JEEP");
    expect(q("[data-origem-reconhecida='planilha']").textContent).toBe("Planilha comum");
    expect(q("[data-periodo-da-planilha]").textContent).toBe("sem data nas linhas");
    const ignoradas = q("[data-colunas-ignoradas]").textContent!;
    expect(ignoradas).toContain("cpf_cnpj");
    expect(ignoradas).toContain("Endereço");
    expect(ignoradas).toContain("NÃO são enviadas ao servidor");
    expect(q("[data-importar]").textContent).toBe(`Importar ${n(PESSOAS)} pessoas`);
    // A prévia é contagem: nem o CPF nem telefone inteiro aparecem na tela.
    expect(container.textContent).not.toContain(CPF);
    expect(container.textContent).not.toMatch(/\d{11}/);
    expect(chamadas).toEqual([]);
  });

  it("a exportação do RevendaMais é reconhecida, com o período do arquivo", async () => {
    const html =
      "<table><tr><th>Id</th><th>T&#xED;tulo</th><th>Cliente</th><th>Telefone</th><th>Canal</th><th>Data cria&#xE7;&#xE3;o</th><th>Marcador</th><th>Ve&#xED;culo</th></tr>" +
      "<tr><td>1</td><td>Lead</td><td>Ana</td><td>41999990001</td><td>OLX</td><td>02/01/2025 10:00:00</td><td></td><td>COMPASS LONGITUDE JEEP Placa: ABC1D23</td></tr>" +
      "<tr><td>2</td><td>[P&#xF3;s-Venda] vendedor: X</td><td>Bia</td><td>41999990002</td><td>Loja</td><td>31/12/2025 23:38:18</td><td></td><td>PULSE FIAT Placa: XYZ1A23</td></tr></table>";
    await tela();
    await escolherArquivo(arquivo("leads.xls", html));
    expect(q("[data-origem-reconhecida='revenda_mais']").textContent).toBe("Exportação do RevendaMais");
    expect(q("[data-periodo-da-planilha]").textContent).toBe("de 02/01/2025 até 31/12/2025");
    expect(q("[data-cartao='previa-clientes'] dd").textContent).toBe("1");
    expect(q("[data-cartao='previa-clientes']").textContent).toContain("1 com data de compra");
  });

  it("importar pede confirmação; quem cancela não chama rota nenhuma", async () => {
    confirma = false;
    await tela();
    await escolherArquivo(arquivo("lista.csv", emCsv(planilhaGrande())));
    await clicar(q("[data-importar]"));
    expect(confirm).toHaveBeenCalledTimes(1);
    const pedido = confirm.mock.calls[0][0] as { message: string; confirmLabel: string };
    expect(pedido.message).toContain(`${PESSOAS} pessoas`);
    expect(pedido.message).toContain("lista.csv");
    expect(pedido.message).toContain("3 lotes");
    expect(chamadas).toEqual([]);
    expect(q("[data-importacao]")).toBeNull();
  });

  it("confirmando: cria a importação e manda os lotes em sequência, somando as respostas, sem CPF nem endereço", async () => {
    const tabela = planilhaGrande();
    respostas[CRIAR] = [{ status: 200, corpo: { id: "imp-1" } }];
    respostas[LOTE] = [
      lote({ contatosNovos: 390, contatosAtualizados: 10, registrosNovos: 500 }),
      lote({ contatosNovos: 400, registrosNovos: 410, recusados: 0 }),
      lote({ contatosNovos: 47, contatosAtualizados: 1, registrosNovos: 60, recusados: 2 }),
    ];
    await tela();
    await escolherArquivo(arquivo("lista.csv", emCsv(tabela)));
    await clicar(q("[data-importar]"));
    await esperar(60);

    expect(chamadas.map((c) => `${c.metodo} ${c.url}`)).toEqual([`POST ${CRIAR}`, `POST ${LOTE}`, `POST ${LOTE}`, `POST ${LOTE}`]);
    expect(maximoNoAr).toBe(1);
    expect(chamadas[0].corpo).toEqual({ origem: "planilha", arquivo: "lista.csv", linhas: tabela.length - 1 });

    const lotes = chamadas.slice(1).map((c) => (c.corpo as { contatos: ContatoImportado[] }).contatos);
    expect(lotes.map((l) => l.length)).toEqual([CONTATOS_POR_LOTE, CONTATOS_POR_LOTE, 50]);
    for (const c of chamadas.slice(1)) expect(Object.keys(c.corpo as object)).toEqual(["contatos"]);
    // Juntos, os lotes são exatamente as pessoas de `agruparPorPessoa`, uma vez cada.
    const planilha = lerPlanilha(tabela);
    if (!planilha.ok) throw new Error(planilha.motivo);
    expect(lotes.flat()).toEqual(agruparPorPessoa(planilha.linhas, planilha.origem).contatos);
    expect(new Set(lotes.flat().map((c) => c.telefone)).size).toBe(PESSOAS);

    // Nenhuma chave fora de `ContatoImportado`, e o servidor aceita cada contato como veio.
    for (const contato of lotes.flat()) {
      expect(Object.keys(contato).sort()).toEqual(CHAVES_DO_CONTATO);
      for (const r of contato.registros) expect(Object.keys(r).sort()).toEqual(CHAVES_DO_REGISTRO);
    }
    expect(lerContatoImportado(lotes[0][0])).toEqual(lotes[0][0]);
    for (const c of chamadas) {
      expect(c.bruto).not.toContain("987.654");
      expect(c.bruto).not.toContain("98765432100");
      expect(c.bruto).not.toContain("Segredo");
      expect(c.bruto.toLowerCase()).not.toContain("cpf");
      expect(c.bruto.toLowerCase()).not.toContain("endere");
    }

    expect(q("[data-importacao='concluida']").textContent).toContain("Importação concluída");
    expect(q("[data-importacao='concluida'] svg[data-estado='ok']")).toBeTruthy();
    expect(q("[role=progressbar][aria-label='Progresso da importação']").getAttribute("aria-valuenow")).toBe(String(PESSOAS));
    expect(q("[data-progresso-da-importacao]").textContent).toContain(`${PESSOAS} de ${PESSOAS} pessoas enviadas · 100%`);
    expect(q("[data-contador='novas'] dd").textContent).toBe("837");
    expect(q("[data-contador='atualizadas'] dd").textContent).toBe("11");
    expect(q("[data-contador='registros'] dd").textContent).toBe("970");
    expect(q("[data-contador='recusadas'] dd").textContent).toBe("2");
    expect(q("[data-resumo-final]").textContent).toContain("837 pessoas novas");
    expect(refresh).toHaveBeenCalled();
    // O arquivo já entrou: não fica na tela para ser importado de novo.
    expect(q("[data-importar]")).toBeNull();
  });

  it("erro no 2º lote para e mostra quantos já entraram; 'Continuar' retoma do 2º com o mesmo id", async () => {
    respostas[CRIAR] = [{ status: 200, corpo: { id: "imp-1" } }];
    respostas[LOTE] = [
      lote({ contatosNovos: 400 }),
      { status: 500, corpo: { error: "O banco recusou o lote." } },
      lote({ contatosNovos: 400 }),
      lote({ contatosNovos: 50 }),
    ];
    await tela();
    await escolherArquivo(arquivo("lista.csv", emCsv(planilhaGrande())));
    await clicar(q("[data-importar]"));
    await esperar(40);

    expect(chamadas.map((c) => c.url)).toEqual([CRIAR, LOTE, LOTE]);
    const parada = q("[data-importacao='parada']");
    expect(parada.textContent).toContain("Importação parada");
    expect(q("[data-erro-do-lote]").textContent).toContain("O banco recusou o lote.");
    expect(q("[data-erro-do-lote]").textContent).toContain(`${CONTATOS_POR_LOTE} pessoas de ${PESSOAS} já entraram`);
    expect(q("[data-progresso-da-importacao]").textContent).toContain(`${CONTATOS_POR_LOTE} de ${PESSOAS}`);
    expect(q("[data-contador='novas'] dd").textContent).toBe("400");
    // Enquanto está parada, não há um segundo "Importar" que abriria outra importação.
    expect(q("[data-importar]")).toBeNull();

    const segundoQueFalhou = (chamadas[2].corpo as { contatos: ContatoImportado[] }).contatos;
    await clicar(q("[data-continuar-importacao]"));
    await esperar(40);
    // Mesmo id (a mesma URL de lote), sem criar outra importação e sem pedir confirmação de novo.
    expect(chamadas.map((c) => c.url)).toEqual([CRIAR, LOTE, LOTE, LOTE, LOTE]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect((chamadas[3].corpo as { contatos: ContatoImportado[] }).contatos).toEqual(segundoQueFalhou);
    expect((chamadas[4].corpo as { contatos: ContatoImportado[] }).contatos).toHaveLength(50);
    expect(q("[data-importacao='concluida']")).toBeTruthy();
    expect(q("[data-contador='novas'] dd").textContent).toBe("850");
    expect(maximoNoAr).toBe(1);
  });

  it("se a importação não abre, nada entra e a tela diz", async () => {
    respostas[CRIAR] = [{ status: 500, corpo: { error: "Sem permissão para importar." } }];
    await tela();
    await escolherArquivo(arquivo("a.csv", "nome;telefone\nAna;41999990002\n"));
    expect(q("[data-importar]").textContent).toBe("Importar 1 pessoa");
    await clicar(q("[data-importar]"));
    expect(chamadas.map((c) => c.url)).toEqual([CRIAR]);
    expect(q("[data-erro-de-criar]").textContent).toContain("Sem permissão para importar.");
    expect(q("[data-importacao]")).toBeNull();
    expect(q<HTMLButtonElement>("[data-importar]").disabled).toBe(false);
  });

  it("sair da página no meio da importação pede confirmação ao navegador; fora dela, não", async () => {
    const sair = () => {
      const e = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    respostas[CRIAR] = [{ status: 200, corpo: { id: "imp-1" } }];
    respostas[LOTE] = [lote({ contatosNovos: 1 })];
    await tela();
    expect(sair()).toBe(false);
    await escolherArquivo(arquivo("lista.csv", emCsv(planilhaGrande())));
    let abrir = () => {};
    portao = new Promise((r) => {
      abrir = r;
    });
    // A confirmação e a criação passam; o primeiro lote fica no ar.
    await clicar(q("[data-importar]"));
    expect(q("[data-importacao='enviando']").textContent).toContain("Importando");
    expect(q<HTMLInputElement>("[data-arquivo-da-base]").disabled).toBe(true);
    expect(q<HTMLButtonElement>("[data-desfazer='imp-0']").disabled).toBe(true);
    expect(sair()).toBe(true);
    abrir();
    await esperar(60);
    expect(q("[data-importacao='concluida']")).toBeTruthy();
    expect(sair()).toBe(false);
  });

  it("o histórico lista cada importação; 'Desfazer' pede confirmação clara e chama DELETE", async () => {
    respostas["/api/marketing/base/importacoes/imp-0"] = [{ status: 200, corpo: { contatosRemovidos: 5100, registrosRemovidos: 6400 } }];
    await tela();
    const linha = q("tr[data-importacao-do-historico='imp-0']");
    expect(linha.textContent).toContain("Dyones");
    expect(linha.textContent).toContain("leads-revenda.xls");
    expect(linha.textContent).toContain("Exportação do RevendaMais");
    expect(linha.textContent).toContain("7.964");
    expect(linha.textContent).toContain("5.100");
    expect(linha.textContent).toContain("6.400");

    confirma = false;
    await clicar(q("[data-desfazer='imp-0']"));
    expect(confirm).toHaveBeenCalledTimes(1);
    const pedido = confirm.mock.calls[0][0] as { message: string; type: string };
    expect(pedido.type).toBe("danger");
    expect(pedido.message).toContain("5.100 pessoas que esta importação CRIOU");
    expect(pedido.message).toContain("Pessoas que já existiam antes ficam");
    expect(pedido.message).toContain("envios de SMS feitos para elas");
    expect(pedido.message).toContain("inclusive os que outra importação acrescentou");
    expect(chamadas).toEqual([]);

    confirma = true;
    await clicar(q("[data-desfazer='imp-0']"));
    expect(chamadas.map((c) => ({ url: c.url, metodo: c.metodo, corpo: c.corpo }))).toEqual([{ url: "/api/marketing/base/importacoes/imp-0", metodo: "DELETE", corpo: null }]);
    expect(q("[data-importacao-desfeita='ok']").textContent).toContain("5.100 pessoas e 6.400 registros saíram da base");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("erro ao desfazer aparece na tela e não atualiza a página", async () => {
    respostas["/api/marketing/base/importacoes/imp-0"] = [{ status: 409, corpo: { error: "Há campanha em envio para estas pessoas." } }];
    await tela();
    await clicar(q("[data-desfazer='imp-0']"));
    expect(q("[data-importacao-desfeita='erro']").textContent).toContain("Há campanha em envio para estas pessoas.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
