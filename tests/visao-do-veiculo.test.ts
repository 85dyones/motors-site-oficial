import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { VeiculoDaVisao } from "../src/components/admin/VisaoDoVeiculo";
import { checklistDoVeiculo } from "../src/lib/checklistDoVeiculo";
import { historicoVisivel, type LinhaDeHistorico } from "../src/lib/historicoDoVeiculo";
import type { Perfil } from "../src/lib/permissoes";

/**
 * A visão do veículo no painel, só leitura (pedido do dono em 01/10): abrir o
 * carro mostra o cadastro inteiro em texto, e editar é um botão. O que a visão
 * NÃO pode fazer pesa tanto quanto o que ela mostra: nenhum campo editável, e
 * nada de custo para quem não vê custo.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));
// A visão importa o módulo de abertura (para `podeEditarOVeiculo`), que lê a
// sessão; aqui só o que a tela usa.
vi.mock("../src/lib/supabase-server", () => ({ createServerSupabaseClient: async () => ({}) }));

const raiz = join(__dirname, "..");
const ler = (...c: string[]) => readFileSync(join(raiz, ...c), "utf8");

const FOTO = (i: number) => `https://s3.carro57.com.br/FC/9037/123_${i}.jpeg`;

const carro = (over: Partial<VeiculoDaVisao> = {}): VeiculoDaVisao => ({
  id: 8453942,
  marca: "BMW",
  modelo: "X1",
  versao: "sDrive20i GP",
  ano: 2018,
  ano_fabricacao: 2017,
  quilometragem: 45000,
  cambio: "Automático",
  combustivel: "Flex",
  cor: "Branco",
  cor_interna: "Preto",
  motor: "2.0 turbo",
  placa: "ABC1D23",
  donos_anteriores: 1,
  garantia_fabrica: "Não",
  tipo: "SUV",
  perfis_uso: ["familia"],
  origem: "sync",
  preco_original: 129900,
  preco_promocional: 0,
  preco_compra: 98765,
  status_tag: "ÚNICO DONO",
  em_preparacao: false,
  previsao_chegada_em: null,
  vendido: false,
  estado_cadastro: "publicado",
  pericia: "Aprovado",
  laudo_pericia: "Pequeno risco no para-choque traseiro.",
  opcionais: "Teto solar, Bancos de couro",
  descricao: "SUV revisado.\n\nPneus novos.",
  descricao_seo: "BMW X1 2018 em Curitiba.",
  whatsapp_images: Array.from({ length: 8 }, (_, i) => FOTO(i)),
  web_full_images: Array.from({ length: 8 }, (_, i) => FOTO(i)),
  created_at: "2026-09-01T12:00:00Z",
  ...over,
});

async function visao(veiculo: VeiculoDaVisao, perfis: Perfil[], historico: LinhaDeHistorico[] | null = []) {
  const { default: VisaoDoVeiculo } = await import("../src/components/admin/VisaoDoVeiculo");
  // O real sai com espaço fixo depois do "R$"; o teste lê como espaço comum.
  return renderToStaticMarkup(
    createElement(VisaoDoVeiculo, {
      veiculo,
      perfis,
      visitas30Dias: 120,
      historico,
      agora: new Date("2026-10-01T15:00:00Z"),
    }),
  ).replace(/\u00a0/g, " ");
}

describe("a visão é só leitura", () => {
  it("nenhum campo, nenhum botão de salvar ou publicar", async () => {
    const html = await visao(carro(), ["admin"]);
    expect(html).not.toMatch(/<(input|textarea|select|form)\b/);
    expect(html).not.toMatch(/<button\b/);
    expect(html).not.toMatch(/Salvar|Publicar|Arquivar|Descartar/);
  });

  it("mostra o cadastro: ficha, preço, perícia e laudo, opcionais, textos", async () => {
    const html = await visao(carro(), ["comercial"]);
    for (const trecho of [
      "BMW X1",
      "sDrive20i GP",
      "2017/2018",
      "45.000 km",
      "ABC1D23",
      "Família",
      "Importado do RevendaMais",
      "R$ 129.900",
      "ÚNICO DONO",
      "Aprovado",
      "Pequeno risco no para-choque traseiro.",
      "Teto solar",
      "Pneus novos.",
      "BMW X1 2018 em Curitiba.",
    ]) {
      expect(html, trecho).toContain(trecho);
    }
  });

  it("campo vazio é 'Não informado', e não uma afirmação sobre o carro", async () => {
    const html = await visao(carro({ motor: null, placa: null }), ["comercial"]);
    expect(html).toContain("Não informado");
  });
});

describe("as portas do editor valem aqui", () => {
  it("quem não vê custo não recebe preço de compra nem margem no HTML", async () => {
    for (const perfil of ["comercial", "marketing", "sdr"] as Perfil[]) {
      const html = await visao(carro(), [perfil]);
      expect(html, perfil).not.toContain("98.765");
      expect(html, perfil).not.toContain("Preço de compra");
      expect(html, perfil).not.toContain("Margem");
    }
  });

  it("quem vê custo vê o preço de compra e a margem", async () => {
    const html = await visao(carro(), ["financeiro"]);
    expect(html).toContain("R$ 98.765");
    expect(html).toContain("R$ 31.135");
  });

  it("o preço de compra sai da linha antes de chegar às telas de quem não vê custo", () => {
    // O editor é componente cliente: a linha inteira viaja no payload da
    // página. Por isso o corte é no carregamento, e não só no JSX.
    const abertura = ler("src", "lib", "veiculoNoPainel.ts");
    expect(abertura).toContain('podeGravarCampo(perfis, "preco_compra") ? data : { ...data, preco_compra: null }');
    expect(abertura).toContain("return { supabase, veiculo, perfis };");
  });

  it("'Editar' só para quem grava algum campo do painel, e leva ao editor", async () => {
    expect(await visao(carro(), ["comercial"])).toContain('href="/admin/estoque/8453942/editar"');
    expect(await visao(carro(), ["sdr"])).not.toContain("/editar");
  });

  it("o histórico perde a linha do preço de compra para quem não vê custo", () => {
    const linhas = [
      { id: "1", campo: "preco_compra", valor_anterior: "90000", valor_novo: "98765", autor_nome: "A", registrado_em: "2026-09-30T12:00:00Z" },
      { id: "2", campo: "descricao", valor_anterior: null, valor_novo: "x", autor_nome: "A", registrado_em: "2026-09-30T12:00:00Z" },
    ];
    expect(historicoVisivel(linhas, { podeVerCusto: false }).map((l) => l.campo)).toEqual(["descricao"]);
    expect(historicoVisivel(linhas, { podeVerCusto: true })).toHaveLength(2);
    // E a rota do histórico, que o editor lê, aplica o mesmo filtro.
    expect(ler("src", "app", "api", "estoque", "[id]", "historico", "route.ts")).toContain("historicoVisivel(data ?? [], { podeVerCusto })");
  });
});

describe("o que a visão diz sobre o carro", () => {
  it("o checklist é o mesmo do editor (mesma função, mesma contagem)", async () => {
    const v = carro({ descricao: null });
    const itens = checklistDoVeiculo(v, { totalDeFotos: 8, podeVerCusto: false });
    const feitos = itens.filter((i) => i.ok).length;
    const html = await visao(v, ["comercial"]);
    expect(html).toContain(`${feitos}/${itens.length}`);
    expect(ler("src", "components", "admin", "EditorDeVeiculo.tsx")).toContain("checklistDoVeiculo(v, {");
  });

  it("carro com poucas fotos: a faixa de fora da vitrine, como no editor", async () => {
    const html = await visao(carro({ whatsapp_images: [FOTO(1)], web_full_images: [FOTO(1)] }), ["comercial"]);
    expect(html).toContain("Fora da vitrine");
  });

  it("'Ver no site' só no carro publicado e que está na vitrine", async () => {
    expect(await visao(carro(), ["comercial"])).toContain("Ver no site");
    expect(await visao(carro({ estado_cadastro: "rascunho" }), ["comercial"])).not.toContain("Ver no site");
    expect(await visao(carro({ whatsapp_images: [FOTO(1)], web_full_images: [FOTO(1)] }), ["comercial"])).not.toContain("Ver no site");
  });

  it("donos anteriores ausente conta como ficha pendente", () => {
    const itens = checklistDoVeiculo(carro({ donos_anteriores: undefined as unknown as null }), { totalDeFotos: 8, podeVerCusto: false });
    expect(itens.find((i) => i.l === "Ficha própria completa")?.ok).toBe(false);
  });

  it("promoção aparece com o 'por' e o desconto arredondado", async () => {
    const html = await visao(carro({ preco_promocional: 119900 }), ["comercial"]);
    expect(html).toContain("por R$ 119.900 (8% de desconto)");
  });
});

describe("as rotas e os caminhos", () => {
  it("abrir o carro é a visão; o editor mora em /editar", () => {
    expect(ler("src", "app", "admin", "estoque", "[id]", "page.tsx")).toContain("<VisaoDoVeiculo");
    expect(ler("src", "app", "admin", "estoque", "[id]", "editar", "page.tsx")).toContain("<EditorDeVeiculo");
    expect(existsSync(join(raiz, "src", "app", "admin", "estoque", "[id]", "editar", "page.tsx"))).toBe(true);
  });

  it("a tabela tem Ver e Editar; o cadastro novo abre direto o editor; o editor volta à visão", () => {
    const tabela = ler("src", "components", "admin", "TabelaDeEstoque.tsx");
    expect(tabela).toContain("href={`/admin/estoque/${l.id}`}");
    expect(tabela).toContain("href={`/admin/estoque/${l.id}/editar`}");
    expect(ler("src", "components", "admin", "CadastroDeVeiculo.tsx")).toContain("href={`/admin/estoque/${criado.id}/editar`}");
    expect(ler("src", "components", "admin", "EditorDeVeiculo.tsx")).toContain("VER O VEÍCULO");
  });
});
