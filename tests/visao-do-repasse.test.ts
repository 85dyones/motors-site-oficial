import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { bancoDeTeste, sessaoDeTeste, type Banco } from "./bancoDoRepasseDeTeste";
import { fotoDeTeste, linhaDoBancoDeTeste } from "./repasseDeTeste";
import { emReais, type Repasse } from "../src/lib/repasse";
import type { Perfil } from "../src/lib/permissoes";
import { REGRAS_DOS_ATOS, atosPossiveis } from "../src/lib/transicoesDoRepasse";
import { urlDoSite } from "../src/lib/site";

/**
 * A visão do carro de repasse no painel (pedido do dono em 28/09: "a gestão
 * do painel está confusa, não existe um modo visualização interna, ele só
 * abre edição"). Abrir o carro mostra a leitura; editar é um botão.
 */
let banco: Banco;
let sessao: ReturnType<typeof sessaoDeTeste>;
vi.mock("../src/lib/supabase-server", () => ({
  createServerSupabaseClient: async () => sessao,
  createAdminSupabaseClient: () => banco.cliente,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }),
  usePathname: () => "/admin/repasse",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

const { ConfirmProvider } = await import("../src/components/admin/ConfirmDialog");
const VisaoDoCarro = (await import("../src/app/admin/repasse/[id]/page")).default;
const NaoEncontradoNaVisao = (await import("../src/app/admin/repasse/[id]/not-found")).default;
const NaoEncontradoNoEditor = (await import("../src/app/admin/repasse/[id]/editar/not-found")).default;

const ID = "3f9a1c2e-5b7d-4e1a-9c3b-0a1b2c3d4e5f";
const ISO = "2026-09-24T12:00:00Z";

function entrarComo(papeis: string[]) {
  banco = bancoDeTeste();
  sessao = sessaoDeTeste(banco, papeis);
}
beforeEach(() => entrarComo(["comercial"]));

const carro = (parcial: Partial<Repasse> = {}) => {
  banco.leituras.repasses = { data: linhaDoBancoDeTeste(parcial), error: null };
};

// Só espaço, tab e quebra: `\s` pegaria o U+00A0 de `emReais`, e "R$ 36.900"
// deixaria de bater com `emReais(36900)`.
const ESPACOS = /[ \t\r\n]+/g;
const html = (el: ReactElement) => renderToStaticMarkup(createElement(ConfirmProvider, null, el)).replace(ESPACOS, " ");
const semTags = (h: string) => h.replace(/<[^>]+>/g, " ").replace(ESPACOS, " ");
const abrir = async (id = ID) => html(await VisaoDoCarro({ params: Promise.resolve({ id }) }));

/** Os rótulos dos botões, na ordem da tela. */
const botoes = (h: string) => [...h.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) => semTags(m[1]).trim());

/** O trecho de uma seção pelo `aria-labelledby`, até o fim dela. */
function secao(h: string, id: string): string {
  const inicio = h.indexOf(`aria-labelledby="${id}"`);
  expect(inicio, `a tela precisa da seção ${id}`).toBeGreaterThan(-1);
  return h.slice(inicio, h.indexOf("</section>", inicio));
}

describe("a visão do carro", () => {
  it("abre só leitura: nenhum campo de formulário", async () => {
    carro();
    const h = await abrir();
    expect(h).not.toMatch(/<input|<textarea|<select/);
    const t = semTags(h);
    expect(t).toContain("Renault Kwid Zen 1.0 2021");
    expect(t).toContain("Rascunho");
  });

  it("os dados do editor aparecem como texto", async () => {
    carro();
    const t = semTags(await abrir());
    for (const trecho of ["Renault", "Kwid", "Zen 1.0", "2020/2021", "71.200 km", "Manual", "Flex", "Prata", "Hatch", "025258-0", "setembro de 2026"]) {
      expect(t).toContain(trecho);
    }
    expect(t).toContain(emReais(36900));
    expect(t).toContain("Entrou na troca de um SUV em setembro.");
    expect(t).toContain("Embreagem patinando e pneus dianteiros no fim.");
  });

  it("a faixa de fotos e a conta", async () => {
    carro();
    const h = await abrir();
    expect(h).toContain(`src="${fotoDeTeste("l1")}"`);
    // A conta da ficha: preço + reparo orçado = o que se gasta.
    expect(semTags(h)).toContain(emReais(36900 + 1400 + 620));
  });

  it("a ficha de estado com foto e orçamento", async () => {
    carro();
    const h = await abrir();
    const t = semTags(h);
    expect(t).toContain("Embreagem patinando nas arrancadas");
    expect(t).toContain("Câmbio");
    expect(t).toContain(emReais(1400));
    expect(t).toContain("Estético, sem orçamento");
    expect(t).toContain("Oficina Exemplo");
    expect(h).toContain(`src="${fotoDeTeste("d1")}"`);
  });

  it("sem defeito conhecido, diz isso", async () => {
    carro({ itens_de_estado: [], sem_defeitos_conhecidos: true });
    expect(semTags(await abrir())).toContain("Nenhum defeito conhecido.");
  });

  it("o histórico como a ficha pública escreve", async () => {
    carro({ sinistro_consta: true, sinistro_detalhe: "Batida leve na traseira em 2023." });
    const t = semTags(await abrir());
    expect(t).toContain("Aprovado, sai a pedido");
    expect(t).toContain("Não consta");
    expect(t).toContain("Consta: Batida leve na traseira em 2023");
    expect(t).toContain("Feita em 22/09");
  });

  it("histórico não informado não vira \"não consta\" nem \"não feito\"", async () => {
    carro({ laudo: null, leilao_consta: null, sinistro_consta: null });
    const t = semTags(await abrir());
    expect(t).not.toContain("Não feito");
    expect(t).not.toContain("Não consta");
    expect(t).toContain("Não informado");
  });

  // Pedido do dono em 29/09: depois da validação, "pode ir à validação" é falso.
  it.each([
    { situacao: "publicado", lojistas_desde: ISO },
    { situacao: "reservado", lojistas_desde: ISO, aberto_ao_publico_em: ISO, reservado_em: ISO },
    { situacao: "vendido", lojistas_desde: ISO, aberto_ao_publico_em: ISO, vendido_em: ISO },
  ] as Partial<Repasse>[])("$situacao e completo: o checklist diz só \"Completo\"", async (parcial) => {
    carro(parcial);
    const t = semTags(await abrir());
    expect(t).toContain("Completo");
    expect(t).not.toContain("pode ir à validação");
  });

  it("rascunho completo: o checklist aponta a validação", async () => {
    carro();
    expect(semTags(await abrir())).toContain("Completo: o carro pode ir à validação.");
  });

  it("o checklist e a nota da devolução continuam à vista", async () => {
    banco.leituras.repasses = { data: { ...linhaDoBancoDeTeste({ resumo: null }), devolvido_com: "Falta a foto do farol" }, error: null };
    const t = semTags(await abrir());
    expect(t).toContain("Escreva a linha do card.");
    expect(t).toContain("Falta a foto do farol");
  });
});

describe("Editar", () => {
  const editar = `href="/admin/repasse/${ID}/editar"`;

  it("quem pode editar vê o botão, e ele leva ao editor", async () => {
    carro();
    const h = await abrir();
    expect(h).toContain(editar);
    expect(semTags(h)).toContain("Editar");
  });

  it("quem não valida não vê o Editar num carro publicado", async () => {
    entrarComo(["marketing"]);
    carro({ situacao: "publicado", lojistas_desde: ISO });
    expect(await abrir()).not.toContain("/editar");
  });

  it("vendido não se edita, nem para quem valida", async () => {
    carro({ situacao: "vendido", vendido_em: ISO });
    expect(await abrir()).not.toContain("/editar");
  });

  it("quem valida edita o publicado", async () => {
    carro({ situacao: "publicado", lojistas_desde: ISO });
    expect(await abrir()).toContain(editar);
  });
});

describe("os atos da situação", () => {
  const casos: Array<{ papeis: Perfil[]; parcial: Partial<Repasse> }> = [
    { papeis: ["marketing"], parcial: { situacao: "rascunho" } },
    { papeis: ["comercial"], parcial: { situacao: "em_validacao" } },
    { papeis: ["comercial"], parcial: { situacao: "publicado", lojistas_desde: ISO } },
    { papeis: ["marketing"], parcial: { situacao: "publicado", lojistas_desde: ISO } },
    { papeis: ["gestor"], parcial: { situacao: "reservado", lojistas_desde: ISO, aberto_ao_publico_em: ISO, reservado_em: ISO } },
  ];

  it.each(casos)("$papeis em $parcial.situacao: os mesmos atos do editor", async ({ papeis, parcial }) => {
    entrarComo(papeis);
    carro(parcial);
    const esperados = atosPossiveis({ situacao: parcial.situacao ?? "rascunho", aberto_ao_publico_em: parcial.aberto_ao_publico_em ?? null }, papeis).map(
      (a) => REGRAS_DOS_ATOS[a].rotulo,
    );
    const naTela = botoes(await abrir()).filter((b) => Object.values(REGRAS_DOS_ATOS).some((r) => r.rotulo === b));
    expect(naTela).toEqual(esperados);
  });

  it("marketing no rascunho: só o envio", async () => {
    entrarComo(["marketing"]);
    carro();
    expect(botoes(await abrir())).toContain("Enviar para validação");
  });
});

describe("o cabeçalho", () => {
  it("publicado só para lojistas diz isso, e leva ao site", async () => {
    carro({ situacao: "publicado", lojistas_desde: ISO });
    const h = await abrir();
    expect(semTags(h)).toContain("Publicado");
    expect(semTags(h)).toContain("Só para lojistas");
    expect(h).toContain(`href="${urlDoSite("/repasse/renault-kwid-zen-1-0-2021-3f9a1c")}"`);
    expect(semTags(h)).toContain("Ver no site ↗");
  });

  it("aberto a todos diz isso", async () => {
    carro({ situacao: "publicado", lojistas_desde: ISO, aberto_ao_publico_em: ISO });
    expect(semTags(await abrir())).toContain("Aberto a todos");
  });

  it("rascunho não aparece no site, e não tem o link", async () => {
    carro();
    expect(semTags(await abrir())).not.toContain("Ver no site");
  });
});

describe("quem avisar", () => {
  const LOJISTA = {
    id: "7b1e2d3c-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
    trilha: "lojista",
    nome: "Auto Bom Ltda",
    whatsapp: "41999990000",
    faixa: null,
    carrocerias: [],
    cnpj: "12345678000190",
    loja_cidade: "Auto Bom, Curitiba",
    cnpj_conferido_em: ISO,
    created_at: ISO,
  };

  it("quem valida vê, no publicado", async () => {
    carro({ situacao: "publicado", lojistas_desde: ISO });
    banco.leituras.repasse_inscritos = { data: [LOJISTA], error: null };
    banco.leituras.repasse_avisos = { data: [], error: null };
    const t = semTags(await abrir());
    expect(t).toContain("Quem avisar");
    expect(t).toContain("Auto Bom Ltda");
  });

  it("marketing não vê, e a página nem lê a lista", async () => {
    entrarComo(["marketing"]);
    carro({ situacao: "publicado", lojistas_desde: ISO });
    banco.leituras.repasse_inscritos = { data: [LOJISTA], error: null };
    expect(semTags(await abrir())).not.toContain("Quem avisar");
    expect(banco.lidas).not.toContain("repasse_inscritos");
  });
});

describe("os leads do carro", () => {
  const ETAPAS = [
    { chave: "novo", rotulo: "Novo", ordem: 1, tipo: "aberta", ativa: true },
    { chave: "proposta", rotulo: "Proposta enviada", ordem: 2, tipo: "aberta", ativa: true },
    { chave: "perdido", rotulo: "Perdido", ordem: 3, tipo: "perdido", ativa: true },
    { chave: "descartado", rotulo: "Não é oportunidade", ordem: 4, tipo: "descartado", ativa: true },
  ];
  const MOTIVOS = [
    { chave: "preco", rotulo: "Achou caro", tipo: "perdido", ordem: 1, ativo: true },
    { chave: "teste", rotulo: "Teste", tipo: "descartado", ordem: 1, ativo: true },
  ];
  const linha = (parcial: Record<string, unknown>) => ({
    telefone: "5541997372165",
    interesse: null,
    created_at: "2026-09-24T15:00:00Z",
    situacao: "novo",
    desfecho: null,
    desfecho_motivo: null,
    responsavel: null,
    ...parcial,
  });

  beforeEach(() => {
    carro({ situacao: "publicado", lojistas_desde: ISO, aberto_ao_publico_em: ISO });
    banco.leituras.funil_etapas = { data: ETAPAS, error: null };
    banco.leituras.funil_motivos = { data: MOTIVOS, error: null };
    banco.leituras.leads = {
      data: [
        linha({ id: "e-1", nome: "Ana Exame", canal: "repasse-exame", interesse: "Sáb 26/09, tarde", situacao: "perdido", desfecho: "perdido", desfecho_motivo: "preco", responsavel: "Carla Vendas" }),
        linha({ id: "e-2", nome: "Davi Exame", canal: "repasse-exame", situacao: "proposta" }),
        linha({ id: "w-1", nome: "Bruno Zap", canal: "repasse-whatsapp", situacao: "descartado", desfecho: "descartado", desfecho_motivo: "teste", responsavel: "Carla Vendas" }),
      ],
      error: null,
    };
  });

  it("cada lista com o seu canal, e o desfecho em cada linha", async () => {
    const h = await abrir();
    const exame = semTags(secao(h, "pedidos-de-exame"));
    const zap = semTags(secao(h, "contatos-pelo-whatsapp"));

    expect(exame).toContain("Pedidos de exame no pátio");
    expect(exame).toContain("Ana Exame");
    expect(exame).toContain("Perdido · Achou caro");
    expect(exame).toContain("Sáb 26/09, tarde");
    expect(exame).toContain("Davi Exame");
    expect(exame).toContain("Em aberto · Proposta enviada");
    expect(exame).not.toContain("Bruno Zap");

    expect(zap).toContain("Contatos pelo WhatsApp");
    expect(zap).toContain("Bruno Zap");
    expect(zap).toContain("Não é oportunidade · Teste");
    expect(zap).toContain("24/09");
    expect(zap).not.toContain("Ana Exame");
  });

  it("quem atende, ou sem responsável", async () => {
    const exame = semTags(secao(await abrir(), "pedidos-de-exame"));
    expect(exame).toContain("Carla Vendas");
    expect(exame).toContain("Sem responsável");
  });

  // Uma leitura de `leads` POR CANAL, cada uma com o seu limite (revisão de
  // 29/09): numa leitura só, com o limite sobre a soma, cem contatos pelo
  // WhatsApp mais novos expulsavam o pedido de exame da lista.
  it("leads: uma leitura por canal, cada uma com o seu limite; o resto, uma por tabela", async () => {
    await abrir();
    const doLead = banco.consultas.filter((c) => c.tabela === "leads");
    expect(doLead.map((c) => c.filtros)).toEqual([
      [
        ["repasse_id", ID],
        ["canal", "repasse-exame"],
      ],
      [
        ["repasse_id", ID],
        ["canal", "repasse-whatsapp"],
      ],
    ]);
    expect(doLead.map((c) => c.limite)).toEqual([50, 50]);
    for (const tabela of new Set(banco.lidas.filter((t) => t !== "leads"))) {
      expect(banco.lidas.filter((t) => t === tabela), `${tabela} lida mais de uma vez`).toHaveLength(1);
    }
    expect(banco.lidas).toContain("funil_etapas");
    expect(banco.lidas).toContain("funil_motivos");
  });

  it("cem contatos pelo WhatsApp mais novos não escondem o pedido de exame", async () => {
    const zap = Array.from({ length: 100 }, (_, i) =>
      linha({ id: `w-${i}`, nome: `Contato ${i}`, canal: "repasse-whatsapp", created_at: `2026-09-2${5 + (i % 3)}T1${i % 10}:00:00Z` }),
    );
    const exame = linha({ id: "e-velho", nome: "Pedido Antigo", canal: "repasse-exame", created_at: "2026-09-20T12:00:00Z" });
    const noBanco = [...zap, exame].map((l) => ({ ...l, repasse_id: ID }));
    // O banco de verdade: filtra, ordena do mais novo e corta no limite.
    banco.responderLeitura("leads", (c) => {
      const casa = (l: Record<string, unknown>) =>
        c.filtros.every(([coluna, valor]) => (Array.isArray(valor) ? valor.includes(l[coluna]) : l[coluna] === valor));
      const ordem = noBanco.filter(casa).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return { data: c.limite ? ordem.slice(0, c.limite) : ordem, error: null };
    });
    const exames = semTags(secao(await abrir(), "pedidos-de-exame"));
    expect(exames).toContain("Pedido Antigo");
    expect(exames).not.toContain("Nenhum pedido de exame");
  });

  it("sem lead, as duas listas dizem que não há", async () => {
    banco.leituras.leads = { data: [], error: null };
    const t = semTags(await abrir());
    expect(t).toContain("Nenhum pedido de exame para este carro ainda.");
    expect(t).toContain("Nenhum contato pelo WhatsApp para este carro ainda.");
  });

  // Leitura que falhou não é lista vazia (revisão de 29/09): "nenhum pedido"
  // seria afirmação falsa sobre o carro.
  it("leitura de leads que falhou: diz que não deu para ler, e registra no log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    banco.leituras.leads = { data: null, error: { message: "column leads.desfecho does not exist", code: "42703" } };
    const h = await abrir();
    const exames = semTags(secao(h, "pedidos-de-exame"));
    const zap = semTags(secao(h, "contatos-pelo-whatsapp"));
    expect(exames).toContain("Não deu para ler os leads deste carro agora.");
    expect(exames).not.toContain("Nenhum pedido de exame");
    expect(zap).toContain("Não deu para ler os leads deste carro agora.");
    expect(zap).not.toContain("Nenhum contato pelo WhatsApp");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("[Repasse no painel]"), expect.stringContaining("desfecho does not exist"));
    log.mockRestore();
  });
});

describe("as portas da página", () => {
  it("id que não é uuid: não encontrado", async () => {
    await expect(VisaoDoCarro({ params: Promise.resolve({ id: "123" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("carro que não existe: não encontrado", async () => {
    banco.leituras.repasses = { data: null, error: null };
    await expect(VisaoDoCarro({ params: Promise.resolve({ id: ID }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sem sessão, login", async () => {
    sessao = sessaoDeTeste(banco, ["comercial"], null);
    carro();
    await expect(VisaoDoCarro({ params: Promise.resolve({ id: ID }) })).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("quem não é da equipe volta para a home", async () => {
    entrarComo(["cliente"]);
    carro();
    await expect(VisaoDoCarro({ params: Promise.resolve({ id: ID }) })).rejects.toThrow("NEXT_REDIRECT:/");
  });
});

describe("não encontrado tem saída (regra do dono de 20/09)", () => {
  const raiz = join(__dirname, "..", "src", "app", "admin", "repasse", "[id]");

  it.each([
    ["a visão", join(raiz, "not-found.tsx")],
    ["o editor", join(raiz, "editar", "not-found.tsx")],
  ])("%s tem o seu not-found", (_, arquivo) => {
    expect(existsSync(arquivo), arquivo).toBe(true);
  });

  it.each([
    ["a visão", NaoEncontradoNaVisao],
    ["o editor", NaoEncontradoNoEditor],
  ])("%s leva de volta à lista e ao cadastro", (_, Pagina) => {
    const h = renderToStaticMarkup(createElement(Pagina));
    expect(h).toContain('href="/admin/repasse"');
    expect(h).toContain('href="/admin/repasse/novo"');
  });
});
