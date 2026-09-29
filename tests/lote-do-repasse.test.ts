import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ORDENS_DO_LOTE,
  QUANTOS_JA_SAIRAM,
  contagemPorFiltro,
  ordenarLote,
  resumoDoLote,
} from "../src/lib/loteDoRepasse";
import { CARD_DO_REPASSE, LOTE_DO_REPASSE } from "../src/lib/paginaDoRepasse";
import type { Repasse } from "../src/lib/repasse";
import { repasseDeTeste } from "./repasseDeTeste";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, sizes: _sizes, priority: _priority, unoptimized: _uo, ...resto } = props;
    return createElement("img", resto as never);
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));
// O botão do WhatsApp do card abre o pré-cadastro, que lê o tema (28/09).
vi.mock("../src/app/ThemeContext", () => ({ useTheme: () => ({ companySettings: {} }) }));

const { default: CardDoRepasse } = await import("../src/components/repasse/CardDoRepasse");

/**
 * O lote e o card (pranchas "Página /repasse" e "Card do repasse e estados"),
 * sem DOM: a régua do lote é pura, e o card não tem estado.
 */
const AGORA = new Date("2026-09-24T15:00:00Z"); // qui 24/09, 12h em Curitiba
const LOJA = { whatsappRaw: "5541997372165", whatsapp: "(41) 99737-2165" };

let n = 0;
function carro(parcial: Partial<Repasse>): Repasse {
  n += 1;
  const sufixo = String(n).padStart(6, "0");
  return repasseDeTeste({ id: `${sufixo}00-0000-4000-8000-000000000000`, slug: `carro-${sufixo}`, ...parcial });
}
const ABERTO = carro({ situacao: "publicado", lojistas_desde: "2026-09-22T12:00:00Z", aberto_ao_publico_em: "2026-09-24T12:00:00Z" });
const LOJISTAS = carro({ situacao: "publicado", lojistas_desde: "2026-09-23T12:00:00Z", laudo: "nao_feito", itens_de_estado: [], sem_defeitos_conhecidos: true, preco: 27500, fipe_valor: 33200 });
const RESERVADO = carro({ situacao: "reservado", lojistas_desde: "2026-09-20T12:00:00Z", aberto_ao_publico_em: "2026-09-20T12:00:00Z", reservado_em: "2026-09-23T12:00:00Z", preco: 46900, fipe_valor: 52600, itens_de_estado: [], sem_defeitos_conhecidos: true });
const VENDIDOS = [15, 18, 20, 21].map((dia) =>
  carro({ situacao: "vendido", lojistas_desde: "2026-09-10T12:00:00Z", aberto_ao_publico_em: "2026-09-10T12:00:00Z", vendido_em: `2026-09-${dia}T12:00:00Z` }),
);

describe("a régua do lote", () => {
  it("as ordens da tela são as do código", () => {
    expect(Object.keys(LOTE_DO_REPASSE.ordens)).toEqual([...ORDENS_DO_LOTE]);
  });

  it("mais recentes pela publicação; maior diferença pela FIPE; menor preço pelo à vista", () => {
    const lote = [RESERVADO, ABERTO, LOJISTAS];
    expect(ordenarLote(lote, "recentes").map((r) => r.id)).toEqual([ABERTO.id, LOJISTAS.id, RESERVADO.id]);
    // abaixo da FIPE: ABERTO 3.180 · LOJISTAS 5.700 · RESERVADO 5.700 (empate → mais recente primeiro)
    expect(ordenarLote(lote, "diferenca").map((r) => r.id)).toEqual([LOJISTAS.id, RESERVADO.id, ABERTO.id]);
    expect(ordenarLote(lote, "preco").map((r) => r.id)).toEqual([LOJISTAS.id, ABERTO.id, RESERVADO.id]);
  });

  it("os filtros não são exclusivos: um carro com laudo e reparo conta nos dois", () => {
    expect(contagemPorFiltro([ABERTO, LOJISTAS, RESERVADO])).toEqual({
      todos: 3,
      "com-laudo": 2,
      "sem-laudo": 1,
      "reparo-orcado": 1,
    });
  });

  it("o resumo separa o lote, os abertos, os só-lojistas e os que já saíram", () => {
    const resumo = resumoDoLote([...VENDIDOS, RESERVADO, LOJISTAS, ABERTO], AGORA);
    expect(resumo.lote.map((r) => r.id)).toEqual([ABERTO.id, LOJISTAS.id, RESERVADO.id]);
    expect(resumo.abertos.map((r) => r.id)).toEqual([ABERTO.id]);
    expect(resumo.soLojistas).toBe(1);
    expect(resumo.sairam).toHaveLength(QUANTOS_JA_SAIRAM);
    expect(resumo.sairam[0].vendido_em).toBe("2026-09-21T12:00:00Z");
    expect(resumo.ultimaSaida).toBe("21/09");
    expect(resumo.atualizacao).toEqual({ hoje: true, dia: "24/09" });
  });

  it("hoje só quando a publicação mais recente é de hoje em Curitiba", () => {
    const ontem = { ...ABERTO, aberto_ao_publico_em: "2026-09-24T02:00:00Z" }; // 23h de quarta
    expect(resumoDoLote([ontem], AGORA).atualizacao).toEqual({ hoje: false, dia: "23/09" });
  });

  it("os exemplos preferem reparo (herói) e sinistro declarado (a conta), e só entre os abertos", () => {
    const comSinistro = carro({
      situacao: "publicado",
      lojistas_desde: "2026-09-21T12:00:00Z",
      aberto_ao_publico_em: "2026-09-21T12:00:00Z",
      sinistro_consta: true,
      sinistro_detalhe: "pequena monta em 2021",
      itens_de_estado: [],
      sem_defeitos_conhecidos: true,
    });
    const resumo = resumoDoLote([comSinistro, ABERTO, LOJISTAS], AGORA);
    expect(resumo.exemploDoHeroi?.id).toBe(ABERTO.id);
    expect(resumo.exemploDaConta?.id).toBe(comSinistro.id);
    expect(resumoDoLote([LOJISTAS], AGORA).exemploDoHeroi).toBeNull();
  });

  it("sem nada no ar, tudo vazio e nenhuma data inventada", () => {
    expect(resumoDoLote([], AGORA)).toMatchObject({ lote: [], abertos: [], sairam: [], ultimaSaida: null, atualizacao: null });
  });
});

describe("o card nos quatro estados", () => {
  // `\s` também pega o espaço inseparável que `toLocaleString` põe depois do "R$".
  const html = (r: Repasse) =>
    renderToStaticMarkup(createElement(CardDoRepasse, { repasse: r, whatsappDaLoja: LOJA })).replace(/\s+/g, " ");

  // O card do lote também mostrava o cadastro em maiúsculas (dono, 29/09).
  it("o nome na grafia de sempre, não em maiúsculas", () => {
    const h = html({ ...ABERTO, marca: "FIAT", modelo: "PALIO", versao: "1.0 ECONOMY FIRE FLEX 8V 4P" });
    expect(h).toContain(">Palio</span>");
    expect(h).toContain(">1.0 Economy Fire Flex 8V 4P</span>");
    expect(h).toContain('alt="Fiat Palio 1.0 Economy Fire Flex 8V 4P"');
    expect(h).not.toContain("PALIO");
  });

  it("aberto: etiqueta, conta, histórico, WhatsApp pelo pré-cadastro e a ficha de estado", () => {
    const h = html(ABERTO);
    expect(h).toContain("REPARO ORÇADO");
    // Botão que abre o modal (28/09), não link: a referência vai na mensagem
    // montada no envio (`whatsapp-do-repasse-fiacao`).
    expect(h).toMatch(new RegExp(`<button type="button"[^>]*>.*?${CARD_DO_REPASSE.quero}</button>`));
    expect(h).not.toContain("wa.me");
    expect(h).toContain(`href="/repasse/${ABERTO.slug}#ficha-de-estado"`);
    expect(h).toContain("Laudo: aprovado, sai a pedido");
    expect(h).toContain("R$ 36.900");
  });

  it("só-lojistas: a camada e as duas saídas, sem WhatsApp", () => {
    const h = html(LOJISTAS);
    expect(h).toContain(CARD_DO_REPASSE.soLojistas);
    expect(h).toContain(CARD_DO_REPASSE.soLojistasTexto);
    expect(h).toContain('href="/repasse#lista-lojista"');
    expect(h).toContain('href="/repasse#lista"');
    expect(h).not.toContain("wa.me");
  });

  it("reservado e vendido: a camada e a lista, sem WhatsApp", () => {
    const reservado = html(RESERVADO);
    expect(reservado).toContain(CARD_DO_REPASSE.reservado);
    expect(reservado).toContain(CARD_DO_REPASSE.aviseSeVoltar);
    expect(reservado).not.toContain("wa.me");
    const vendido = html(VENDIDOS[0]);
    expect(vendido).toContain(CARD_DO_REPASSE.vendido);
    expect(vendido).toContain(CARD_DO_REPASSE.entrarNaLista);
    expect(vendido).not.toContain("wa.me");
  });

  it("carro que não aparece não desenha card", () => {
    expect(html(repasseDeTeste({ situacao: "arquivado" }))).toBe("");
  });
});
