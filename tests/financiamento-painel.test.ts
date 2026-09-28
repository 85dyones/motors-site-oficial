import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { MATRIZ_DE_PERMISSOES, PERFIS } from "../src/lib/permissoes";
import { ACAO_DO_FINANCIAMENTO, podeEditarFinanciamento } from "../src/lib/parametrosDoFinanciamento";

/**
 * O painel das condições do simulador (/admin/financiamento) e a rota que
 * abre a vigência nova. Pedido do dono em 28/09/2026: "sim, gostaria muito de
 * ter isso disponível".
 *
 * Quem edita é a linha da matriz A17 "Editar texto legal e condições de
 * financiamento" — e as três camadas (trilho, página/rota e a função do
 * banco) precisam dizer a mesma coisa.
 */

const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => revalidateTag(...args),
  unstable_cache: <T,>(fn: T) => fn,
}));

let porta: unknown;
const rpc = vi.fn();
vi.mock("../src/lib/parametrosDoFinanciamento-servidor", () => ({
  ETIQUETA_DO_FINANCIAMENTO: "parametros_financiamento",
  autorizarEdicaoDoFinanciamento: async () => porta,
}));

const { POST } = await import("../src/app/api/financiamento/parametros/route");

const VALIDA = {
  taxaExcelenteAm: "1,79",
  taxaRegularAm: 1.95,
  taxaRiscoAm: 2.7,
  anoDeReferencia: 2026,
  anoMaisAntigo: 2009,
  bancosParceiros: ["Sicredi", " Safra "],
  fonteDasTaxas: "média de mercado",
  descricao: "revisão de outubro",
};

async function enviar(corpo: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/financiamento/parametros", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );
  return { status: res.status, json: await res.json() };
}

beforeEach(() => {
  revalidateTag.mockReset();
  rpc.mockReset();
  porta = { ok: true, uid: "u1", supabase: { rpc } };
});

describe("quem edita", () => {
  it("a matriz A17 dá a tela a Administrador e Financeiro, e a mais ninguém", () => {
    const linha = MATRIZ_DE_PERMISSOES.find((l) => l.acao === ACAO_DO_FINANCIAMENTO);
    expect(linha, "a linha da matriz existe").toBeTruthy();
    const fazem = PERFIS.filter((p) => linha!.permissoes[p] === "faz");
    expect(fazem).toEqual(["admin", "financeiro"]);
    expect(podeEditarFinanciamento({ papeis: ["comercial", "financeiro"] })).toBe(true);
    expect(podeEditarFinanciamento({ role: "admin" })).toBe(true);
    for (const papel of ["gestor", "comercial", "marketing", "sdr", "investidor", "cliente"]) {
      expect(podeEditarFinanciamento({ papeis: [papel] }), papel).toBe(false);
    }
  });

  it("o trilho mostra o item aos mesmos papéis — e a função do banco cobra os mesmos", () => {
    const trilho = readFileSync(join(__dirname, "..", "src", "components", "admin", "SidebarNav.tsx"), "utf8");
    expect(trilho).toMatch(
      /title: "Financiamento",\s*roles: \["admin", "financeiro"\],\s*items: \[\{ name: "Condições do simulador", href: "\/admin\/financiamento" \}\]/,
    );
    const sql = readFileSync(
      join(__dirname, "..", "supabase", "migrations", "20260928120000_parametros_financiamento.sql"),
      "utf8",
    );
    expect(sql).toMatch(/tem_papel\([^)]*'admin'\)/);
    expect(sql).toMatch(/tem_papel\([^)]*'financeiro'\)/);
  });

  it("sem sessão, 401; sem papel, 403 — e nada chega ao banco", async () => {
    porta = { ok: false, status: 401, motivo: "Não autenticado." };
    expect((await enviar(VALIDA)).status).toBe(401);
    porta = { ok: false, status: 403, motivo: "As condições do simulador são do Administrador e do Financeiro." };
    expect((await enviar(VALIDA)).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("a gravação", () => {
  it("vai inteira à função, com os bancos limpos e a vírgula lida — e o site revalida na hora", async () => {
    rpc.mockResolvedValue({
      data: {
        id: "v2",
        taxa_excelente_am: 1.79,
        taxa_regular_am: 1.95,
        taxa_risco_am: 2.7,
        ano_de_referencia: 2026,
        ano_mais_antigo: 2009,
        bancos_parceiros: ["Sicredi", "Safra"],
        fonte_das_taxas: "média de mercado",
        vigencia_desde: "2026-10-01",
      },
      error: null,
    });
    const { status, json } = await enviar(VALIDA);
    expect(status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("financiamento_nova_vigencia", {
      p_taxa_excelente_am: 1.79,
      p_taxa_regular_am: 1.95,
      p_taxa_risco_am: 2.7,
      p_ano_de_referencia: 2026,
      p_ano_mais_antigo: 2009,
      p_bancos_parceiros: ["Sicredi", "Safra"],
      p_fonte_das_taxas: "média de mercado",
      p_descricao: "revisão de outubro",
    });
    // `{ expire: 0 }`, e não "max": quem salva uma taxa espera vê-la no site.
    expect(revalidateTag).toHaveBeenCalledWith("parametros_financiamento", { expire: 0 });
    expect(json.parametros.id).toBe("v2");
    expect(json.parametros.taxas.regular).toBeCloseTo(0.0195, 10);
  });

  it("campo errado volta como lista legível, antes do banco", async () => {
    const { status, json } = await enviar({ ...VALIDA, taxaRegularAm: 1.5, bancosParceiros: [] });
    expect(status).toBe(400);
    expect(json.problemas).toHaveLength(2);
    expect(rpc).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("migração não aplicada vira 503 com o nome da migração — e nada revalida", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    const { status, json } = await enviar(VALIDA);
    expect(status).toBe(503);
    expect(json.error).toContain("20260928120000_parametros_financiamento");
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("o banco recusando o papel vira 403, e o CHECK vira 400", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Só Administrador e Financeiro." } });
    expect((await enviar(VALIDA)).status).toBe(403);
    rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "parametros_financiamento_taxas_em_ordem" } });
    expect((await enviar(VALIDA)).status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});

describe("a tela", () => {
  vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
  vi.mock("../src/components/admin/ConfirmDialog", () => ({ useConfirm: () => ({ confirm: async () => true }) }));

  const desenhar = async (historico: unknown) => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { PARAMETROS_DE_FABRICA } = await import("../src/lib/finance-calculator");
    const { default: CondicoesDoSimulador } = await import("../src/components/admin/CondicoesDoSimulador");
    return renderToStaticMarkup(
      createElement(CondicoesDoSimulador, { vigente: PARAMETROS_DE_FABRICA, historico: historico as never }),
    )
      .replace(/&quot;/g, '"')
      .replace(/ /g, " ");
  };

  it("sem a migração: diz o que falta, mostra os de fábrica e não deixa salvar", async () => {
    const html = await desenhar({ tabela: false, motivo: 'relation "parametros_financiamento" does not exist' });
    expect(html).toContain("A tabela ainda não existe no banco.");
    expect(html).toContain("20260928120000_parametros_financiamento");
    expect(html).toMatch(/<button[^>]* disabled=""[^>]*>SALVAR NOVA VIGÊNCIA/);
    // O formulário parte dos valores que o site está usando, com vírgula.
    expect(html).toContain('value="1,95"');
    expect(html).toContain("Banco BBC");
  });

  it("o exemplo ao vivo usa a mesma conta e o mesmo texto do site", async () => {
    const html = await desenhar({ tabela: true, vigencias: [] });
    expect(html).toContain("COMO FICA NO SITE");
    expect(html).toMatch(/≈ 48× R\$ [\d.]+/);
    expect(html).toContain("Simulação, não é oferta de crédito. Sujeito a aprovação mediante validação de cadastro.");
    expect(html).toContain("Carro de 2008: Sem estimativa de parcela: os bancos parceiros financiam carros de 2009 em diante.");
    expect(html).not.toMatch(/<button[^>]* disabled=""[^>]*>SALVAR NOVA VIGÊNCIA/);
  });
});
