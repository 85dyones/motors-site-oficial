import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import type { RelatorioDeDocumento } from "../src/lib/relatorioDeDocumento";

/**
 * `/relatorio/[token]` — o link público que o consultor manda (18/10/2026,
 * depois da revisão).
 *
 * Os robôs de pré-visualização (WhatsApp, Gmail, o antivírus do banco) fazem
 * GET; se o GET entregasse o relatório, o CPF iria para o cartão da conversa
 * e cada robô contaria um acesso. O que estes testes seguram:
 *  - GET é só a porta: sem dado nenhum e SEM tocar o banco, mesmo com um
 *    token de forma válida;
 *  - token sem a forma de um token nosso é 404, em GET e em POST, sem banco;
 *  - POST (o botão, uma pessoa) abre pela função do banco, mandando o TOKEN
 *    cru (o hash é calculado lá dentro), com os cabeçalhos do link;
 *  - link vencido, revogado ou desconhecido (a função não devolve linha) é
 *    404, sem dizer qual;
 *  - nenhuma das páginas leva GTM, gtag, Pixel ou aviso de cookies.
 */

const rpc = vi.fn();
vi.mock("../src/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => null, createAdminSupabaseClient: () => null }));

const { GET, POST } = await import("../src/app/relatorio/[token]/route");
const { CABECALHOS_DO_LINK } = await import("../src/lib/relatorioDeDocumento");
const { gerarTokenDoLink, hashDoToken } = await import("../src/lib/linkDoRelatorio");

const RELATORIO: RelatorioDeDocumento = {
  tipo: "cpf",
  documento: "123.456.789-09",
  titular: "JOAO FICTICIO DE OLIVEIRA",
  nivel: "Completo integral",
  geradoEm: "2026-10-18T15:00:00.000Z",
  homologacao: false,
  resumo: [{ rotulo: "Decisão do bureau", valor: "NEGOCIAÇÃO NÃO RECOMENDADA", estado: "impeditivo" }],
  secoes: [],
  faltou: [],
};

const MALFORMADOS = ["curto", "A".repeat(42), "A".repeat(44), `${"A".repeat(42)}.`, "0f8fad5b-d9cb-469f-a165-70867728950e", "..%2F..%2Fetc%2Fpasswd", hashDoToken("x")];

const params = (token: string) => ({ params: Promise.resolve({ token }) });
const pedir = (metodo: "GET" | "POST", token: string) => (metodo === "GET" ? GET : POST)(new Request(`http://localhost/relatorio/${token}`, { method: metodo }), params(token));
const RASTREADOR = /googletagmanager|gtag|dataLayer|fbq|connect\.facebook|cookie/i;

function confereCabecalhos(res: Response) {
  for (const [k, v] of Object.entries(CABECALHOS_DO_LINK)) expect(res.headers.get(k), k).toBe(v);
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [{ relatorio: RELATORIO, tipo_documento: "cpf", nivel: "completo_integral", criado_em: "2026-10-18T15:00:00Z", expira_em: "2026-10-25T15:00:00Z" }], error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET: a porta, sem dados", () => {
  it("token de forma válida: 200 com o botão de abrir, título genérico e nenhum dado — e o banco não é tocado", async () => {
    const res = await pedir("GET", gerarTokenDoLink());
    expect(res.status).toBe(200);
    confereCabecalhos(res);
    const html = await res.text();
    expect(html).toContain('<form method="post">');
    expect(html).toContain("Abrir relatório");
    expect(html).toContain("<title>Relatório confidencial — Motors Store</title>");
    expect(html).not.toContain("123.456.789-09");
    expect(html).not.toContain("JOAO");
    expect(html).not.toMatch(/<script/i);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("token malformado: 404 'indisponível', sem banco", async () => {
    for (const token of MALFORMADOS) {
      const res = await pedir("GET", token);
      expect(res.status, token).toBe(404);
      confereCabecalhos(res);
      expect(await res.text()).toContain("Relatório indisponível");
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST: o botão abre", () => {
  it("token malformado: 404, sem chamar a função", async () => {
    for (const token of MALFORMADOS) expect((await pedir("POST", token)).status, token).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("token válido: a função recebe o TOKEN cru, não o hash, e a página é o relatório com os cabeçalhos do link e a validade", async () => {
    const token = gerarTokenDoLink();
    const res = await pedir("POST", token);
    expect(res.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("abrir_relatorio_compartilhado", { p_token: token });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(createHash("sha256").update(token).digest("hex"));
    confereCabecalhos(res);
    const html = await res.text();
    expect(html).toContain("JOAO FICTICIO DE OLIVEIRA");
    expect(html).toContain("123.456.789-09");
    expect(html).toContain("Este link vale até 25/10/2026");
    expect(html).toContain('onclick="window.print()"');
    expect(html).toContain("<title>Relatório confidencial — Motors Store</title>");
  });

  it("vencido, revogado ou desconhecido (a função não devolve linha), ou erro da função: 404 sem dizer qual", async () => {
    for (const resposta of [{ data: [], error: null }, { data: null, error: null }, { data: null, error: { code: "XX000", message: "falhou" } }]) {
      rpc.mockResolvedValueOnce(resposta);
      const res = await pedir("POST", gerarTokenDoLink());
      expect(res.status, JSON.stringify(resposta)).toBe(404);
      confereCabecalhos(res);
      const html = await res.text();
      expect(html).toContain("Este link venceu, foi revogado ou não existe.");
      expect(html).not.toContain("123.456.789-09");
    }
  });
});

describe("nenhuma página do link leva rastreador", () => {
  it("porta, relatório e 'indisponível' sem GTM, gtag, dataLayer, Pixel ou cookie, e sem script de fora", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const paginas = await Promise.all([pedir("GET", gerarTokenDoLink()), pedir("POST", gerarTokenDoLink()), pedir("GET", "curto"), pedir("POST", gerarTokenDoLink())]);
    for (const res of paginas) {
      const html = await res.text();
      expect(html, String(res.status)).not.toMatch(RASTREADOR);
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/(src|href)=["']?(https?:)?\/\//i);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });
});
