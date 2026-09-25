import { describe, it, expect, vi, beforeEach } from "vitest";
import { Children, Suspense, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CompanySettings, Veiculo } from "../src/types";
import { PORTAS_DO_REPASSE, abertosHoje } from "../src/lib/paginaDoRepasse";
import { repasseDeTeste } from "./repasseDeTeste";

/**
 * A faixa do repasse na `/estoque`, renderizada (spec 2026-09-24 §10;
 * decisões 2 e 6 do plano do PR 4): depois da grade e fora do `<Suspense>`,
 * só com carro aberto a todos, e uma pane na leitura do repasse não derruba a
 * segunda página mais visitada do site. Mocks no molde de
 * `paginas-de-entidade.test.ts`.
 */
const EMPRESA: CompanySettings = {
  name: "Motors Store",
  phone: "41 99737-2165",
  whatsapp: "41 99737-2165",
  whatsappRaw: "5541997372165",
  address: "Rua Ernesto Piazzetta, 98 - Bacacheri, Curitiba - PR, 82510-350",
  hours: "Seg a sex 8h30-18h30",
  instagram: "https://instagram.com/motorsstore.oficial",
  facebook: "https://facebook.com/motorsstore.oficial",
  cnpj: "",
};

const VEICULO = {
  id: "1",
  marca: "Fiat",
  modelo: "Argo",
  versao: "Drive 1.0",
  ano: 2022,
  preco_original: 70000,
  preco_promocional: 0,
  quilometragem: 30000,
  tipo: "Hatch",
  cor: "Prata",
  cambio: "Manual",
  combustivel: "Flex",
  motor: "1.0",
  vendido: false,
  estado_cadastro: "publicado",
  web_full_images: ["https://x/1.webp"],
  whatsapp_images: ["https://x/1-zap.jpg"],
} as unknown as Veiculo;

const estado = vi.hoisted(() => ({ repasses: [] as unknown[], falha: null as Error | null }));
const registrarFalha = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}));

vi.mock("../src/lib/settings", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getCachedSettings: async () => ({ companySettings: EMPRESA }),
}));
vi.mock("../src/lib/supabase", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getEstoque: async () => [VEICULO],
}));
vi.mock("../src/lib/telemetry", () => ({ trackContactClick: () => {} }));
vi.mock("../src/app/ThemeContext", () => ({ useTheme: () => ({ companySettings: EMPRESA }) }));
vi.mock("../src/lib/leituraDosRepasses", () => ({
  lerRepassesPublicos: async () => {
    if (estado.falha) throw estado.falha;
    return estado.repasses;
  },
}));
vi.mock("../src/lib/observabilidade", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  registrarFalha,
}));

const { default: EstoquePage } = await import("../src/app/estoque/page");
const { default: FaixaDoRepasseNoEstoque } = await import("../src/components/repasse/FaixaDoRepasseNoEstoque");

const publicado = { situacao: "publicado" as const, lojistas_desde: "2026-09-20T12:00:00Z" };
const ABERTO_1 = repasseDeTeste({ ...publicado, id: "a1000000-0000-4000-8000-000000000001", slug: "aberto-1-a10000", aberto_ao_publico_em: "2026-09-24T12:00:00Z" });
const ABERTO_2 = repasseDeTeste({ ...publicado, id: "a2000000-0000-4000-8000-000000000002", slug: "aberto-2-a20000", aberto_ao_publico_em: "2026-09-23T12:00:00Z" });
const LOJISTAS = repasseDeTeste({ ...publicado, id: "b1000000-0000-4000-8000-000000000001", slug: "lojistas-b10000", aberto_ao_publico_em: null });
const RESERVADO = repasseDeTeste({ situacao: "reservado", id: "c1000000-0000-4000-8000-000000000001", slug: "reservado-c10000", lojistas_desde: "2026-09-20T12:00:00Z", aberto_ao_publico_em: "2026-09-21T12:00:00Z", reservado_em: "2026-09-23T12:00:00Z" });

beforeEach(() => {
  estado.repasses = [];
  estado.falha = null;
  registrarFalha.mockClear();
});

const servida = async () => renderToStaticMarkup(await EstoquePage());

describe("a faixa do repasse na /estoque", () => {
  it("com carro aberto, sai com o texto da prancha e a contagem só dos abertos", async () => {
    estado.repasses = [ABERTO_1, ABERTO_2, LOJISTAS, RESERVADO];
    const h = await servida();
    expect(h).toContain(PORTAS_DO_REPASSE.estoque.titulo);
    expect(h).toContain(abertosHoje(2));
  });

  it("depois da grade, fora do <Suspense> e antes do índice do estoque", async () => {
    estado.repasses = [ABERTO_1];
    const pagina = (await EstoquePage()) as ReactElement<{ children: ReactNode }>;
    const tipos = Children.toArray(pagina.props.children).map((filho) => (filho as ReactElement).type);

    const grade = tipos.indexOf(Suspense);
    const faixa = tipos.indexOf(FaixaDoRepasseNoEstoque);
    const indice = tipos.indexOf("nav");
    expect(grade, "a grade (o <Suspense>) é filha direta da página").toBeGreaterThan(-1);
    expect(faixa, "a faixa é filha direta da página, depois do <Suspense>").toBeGreaterThan(grade);
    expect(indice, "o índice do estoque vem depois da faixa").toBeGreaterThan(faixa);
  });

  it("sem carro aberto a todos, nenhum pedaço da faixa", async () => {
    estado.repasses = [LOJISTAS, RESERVADO];
    const h = await servida();
    expect(h).not.toContain(PORTAS_DO_REPASSE.estoque.titulo);
    expect(h).not.toContain(PORTAS_DO_REPASSE.rotulo);
    expect(h).not.toContain('href="/repasse"');
  });

  it("pane na leitura do repasse: a página inteira fica, a faixa some e a falha é registrada", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    estado.falha = new Error("Leitura dos repasses falhou: banco fora");
    const h = await servida();

    expect(h).toContain("Carros seminovos em Curitiba</h1>");
    expect(h).toContain('aria-label="Índice do estoque"');
    expect(h).not.toContain(PORTAS_DO_REPASSE.estoque.titulo);
    expect(registrarFalha).toHaveBeenCalledWith("quebra", "repasse-leitura-das-portas", estado.falha, {
      rota: "/estoque",
      origem: "servidor",
    });
  });
});
