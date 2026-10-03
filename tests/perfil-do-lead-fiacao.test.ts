// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ETAPAS_PADRAO } from "../src/lib/funil";
import { CANAL_DO_PROFILER, montarPerfilDoLead } from "../src/lib/perfilDoLead";
import { lerCodigo } from "./fonte";
import { cardDe, definirLargura, detalheDeTeste, gaveta, leadDaUrl, zerarRota } from "./quadroDeLeadsDeTeste";

/**
 * O perfil do Profiler no card do lead — a fiação.
 *
 * `perfil-do-lead.test.ts` executa a lib, o bloco solto, a rota e o PATCH. O
 * que fica aqui é o que só aparece com as peças LIGADAS (desde 03/10, com o
 * card enxuto, o bloco mora no DETALHE do lead, nos dados do negócio):
 *   - o detalhe do lead do Profiler desenha o bloco, e só o dele;
 *   - um `leads.perfil` torto — jsonb que o staff pode escrever pelo
 *     PostgREST — não derruba o quadro nem o detalhe: o card continua lá, e o
 *     detalhe abre sem o bloco;
 *   - na fonte, as três decisões que o comportamento sozinho não mostra: o
 *     perfil é montado FORA do `try` do insert, a segunda tentativa sem a
 *     coluna nomeia a migração, e o PATCH do painel não tem campo `perfil`.
 *
 * Nada do app é dublê na parte montada: o kanban e as libs de verdade; só o
 * `fetch` e o `next/link`, como em `bloco-da-avaliacao-fiacao.test.ts`.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  // O card desenha `SinalDeAbertura`, que lê o estado do link.
  useLinkStatus: () => ({ pending: false }),
  default: ({ href, children, ...resto }: { href: string; children?: unknown }) =>
    createElement("a", { href, ...resto } as never, children as never),
}));
vi.mock("next/navigation", async () => (await import("./quadroDeLeadsDeTeste")).navegacaoDeTeste);

const AGORA = new Date().toISOString();

const lead = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  telefone: "5541999990000",
  interesse: "Olá! Montei meu perfil no Garagem Match do site.",
  canal: CANAL_DO_PROFILER,
  responsavel: "Bruno",
  observacoes: null,
  situacao: "novo",
  created_at: AGORA,
  ag_uid: null,
  desfecho: null,
  ...extra,
});

const DO_PROFILER = lead("l1", "Paula Perfil", {
  perfil: montarPerfilDoLead({
    canal: CANAL_DO_PROFILER,
    intencao_busca: {
      aiQuery: "",
      budgetTab: "presets",
      modo: "aviso",
      orcamento: "até R$ 75 mil",
      filtros: ["até R$ 75 mil", "só automático"],
      afrouxados: ["portas"],
      prazo: "",
      perfil: { leva: "Eu e mais um", jeitos: [], cambio: "Só automático", nao_pode_faltar: ["Câmera de ré"] },
      na_faixa: 0,
      carros: [{ id: "101", nome: "Onix Premier 2021", preco: 72900, lugar: "abaixo-da-faixa", manchete: "O único com câmera", pesa_contra: null }],
    },
  }),
});
const SEM_PERFIL = lead("l2", "Carlos Compra", { canal: "WhatsApp Proposta", interesse: "Onix 2022" });
// Os tortos que chegam do banco: lista, texto, forma de outra versão e
// `versao: 1` sem nada legível. Nenhum pode derrubar o quadro.
const TORTOS = [
  lead("l3", "Tito Lista", { perfil: [1, 2, 3] }),
  lead("l4", "Tânia Texto", { perfil: "Família, SUV" }),
  lead("l5", "Téo Versão", { perfil: { versao: 2, orcamento: "até R$ 75 mil" } }),
  lead("l6", "Tina Vazia", { perfil: { versao: 1, carros: "Onix", perfil: [], orcamento: 7, na_faixa: "3" } }),
];

const TODOS = () => [DO_PROFILER, SEM_PERFIL, ...TORTOS];

function dublarFetch() {
  globalThis.fetch = (async (url: string) => {
    const doLead = leadDaUrl(String(url));
    if (doLead) {
      return { ok: true, json: async () => detalheDeTeste(TODOS().find((l) => l.id === doLead.id)!) };
    }
    return respostaDaFila;
  }) as never;
}

const respostaDaFila = {
    ok: true,
    json: async () => ({
      leads: [DO_PROFILER, SEM_PERFIL, ...TORTOS],
      atendentes: [{ nome: "Bruno" }],
      etapas: ETAPAS_PADRAO,
      motivos: [],
      funilPendente: false,
      podeConfigurar: false,
      busca: null,
    }),
};

let container: HTMLDivElement;
let root: Root;

async function assentar() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((pronto) => setTimeout(pronto, 0));
    });
  }
}

async function montar() {
  const { default: LeadsKanban } = await import("../src/components/admin/LeadsKanban");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(LeadsKanban));
  });
  await assentar();
}

function card(nome: string): HTMLElement {
  const achado = [...container.querySelectorAll<HTMLElement>("[draggable='true']")].find((c) =>
    (c.textContent ?? "").includes(nome),
  );
  expect(achado, `o card de ${nome} precisa estar na tela`).toBeDefined();
  return achado!;
}

/** Texto do card com o espaço não separável do `Intl` virado espaço comum. */
const textoDoCard = (nome: string) => (card(nome).textContent ?? "").replace(/ /g, " ");

/** Abre a gaveta do lead e devolve o texto do detalhe, com o mesmo trato. */
async function textoDoDetalhe(id: string) {
  await act(async () => cardDe(container, id)!.click());
  await assentar();
  return (gaveta()?.textContent ?? "").replace(/\u00a0/g, " ");
}

beforeEach(() => {
  zerarRota();
  definirLargura(true);
  dublarFetch();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("o bloco do perfil no detalhe do lead", () => {
  it("mostra o que o cliente respondeu ao Profiler, e só no lead dele", async () => {
    await montar();
    // O card enxuto não carrega o bloco: ele mora no detalhe.
    expect(textoDoCard("Paula Perfil")).not.toContain("Perfil do Profiler");

    const daPaula = await textoDoDetalhe("l1");
    for (const trecho of [
      "Perfil do Profiler",
      "Pediu aviso quando chegar",
      "até R$ 75 mil · 1 carro",
      "Eu e mais um",
      "Só automático",
      "Câmera de ré",
      "Aceitou tirar4 portas",
      "Onix Premier 2021 · R$ 72.900 · Abaixo da faixa",
      "Nenhum carro passava em tudo na faixa",
    ]) {
      expect(daPaula, trecho).toContain(trecho);
    }
    // `jeitos: []` é "tanto faz" OU pergunta pulada: o card não escolhe.
    expect(daPaula).not.toContain("Jeito");

    const doCarlos = await textoDoDetalhe("l2");
    expect(doCarlos).toContain("Carlos Compra");
    expect(doCarlos).not.toContain("Perfil do Profiler");
  });

  it("perfil torto no banco não derruba o quadro nem o detalhe: abre, sem o bloco", async () => {
    await montar();
    for (const { id, nome } of TORTOS) {
      // O card está no quadro...
      expect(textoDoCard(nome), nome).toContain(nome);
      // ...e o detalhe abre inteiro, só sem o bloco do perfil.
      const detalhe = await textoDoDetalhe(id);
      expect(detalhe, nome).toContain("Dados do negócio");
      expect(detalhe, nome).not.toContain("Perfil do Profiler");
    }
    // E o lead bom continua mostrando o seu.
    expect(await textoDoDetalhe("l1")).toContain("Perfil do Profiler");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Na fonte
// ─────────────────────────────────────────────────────────────────────────────

describe("a rota de leads grava o perfil sem arriscar o lead", () => {
  const rota = lerCodigo("src/app/api/leads/route.ts");
  // Da montagem do perfil até a CAPI, que vem logo depois da gravação. Âncoras
  // de CÓDIGO: `lerCodigo` tira os comentários, e o "5.5 Meta CAPI" é um.
  const inicio = rota.indexOf("let perfil");
  const fim = rota.indexOf("const { companySettings }");
  const persistencia = rota.slice(inicio, fim);

  it("as âncoras existem — sem elas o recorte seria vazio e as travas abaixo, mudas", () => {
    expect(inicio).toBeGreaterThan(-1);
    expect(fim).toBeGreaterThan(inicio);
  });

  it("monta o perfil FORA do try do insert, com a própria rede", () => {
    // Dentro do try do insert, uma montagem que lançasse levaria o insert
    // junto: o lead inteiro perdido por causa de um campo a mais.
    expect(persistencia).toMatch(
      /let perfil: PerfilDoLead \| null = null;\s*try \{\s*perfil = montarPerfilDoLead\(body\);\s*\} catch \(\w+\) \{[^}]*\}\s*try \{/,
    );
    expect(persistencia.indexOf("montarPerfilDoLead(body)")).toBeLessThan(persistencia.indexOf('from("leads").insert('));
  });

  it("só põe a chave quando há perfil, e tenta de novo sem ela quando a coluna falta", () => {
    expect(persistencia).toContain("...(comPerfil && perfil ? { perfil } : {})");
    expect(persistencia).toMatch(
      /if \(erroLead && colunaDoPerfilAusente\(erroLead\)\) \{[\s\S]*?20260925200000_perfil_no_lead\.sql[\s\S]*?inserir\(false\)/,
    );
  });

  it("o n8n não ganha campo novo — ele já recebe `intencao_busca`", () => {
    const payload = rota.slice(rota.indexOf("const n8nPayload = {"), rota.indexOf("};", rota.indexOf("const n8nPayload = {")));
    expect(payload).toContain("intencao_busca");
    expect(payload).not.toMatch(/\bperfil\b/);
  });
});

describe("o painel lê o perfil e não o escreve", () => {
  it("o detalhe do lead desenha o bloco com o perfil do lead", () => {
    // Desde 03/10 o bloco mora nos dados do negócio do detalhe, e não no card.
    const dados = lerCodigo("src/components/admin/lead/DadosDoNegocio.tsx");
    expect(dados).toContain("<BlocoDoPerfil perfil={lead.perfil} />");
  });

  it("o GET entrega a coluna: a fila lê `*`, sem lista fechada de colunas", () => {
    const rota = lerCodigo("src/app/api/leads/gerenciar/route.ts");
    const get = rota.slice(rota.indexOf("export async function GET"), rota.indexOf("export async function PATCH"));
    expect(get).toMatch(/\.from\("leads"\)\s*\.select\("\*"\)/);
  });

  it("o PATCH não tem campo `perfil`", () => {
    // É o que o cliente respondeu no site; o painel não o reescreve. A
    // execução está em `perfil-do-lead.test.ts`; aqui, a forma que a garante:
    // o PATCH só grava o que desestrutura do corpo.
    const rota = lerCodigo("src/app/api/leads/gerenciar/route.ts");
    const patch = rota.slice(rota.indexOf("export async function PATCH"), rota.indexOf("export async function DELETE"));
    const campos = patch.slice(patch.indexOf("const body = await request.json();"), patch.indexOf("} = body;"));
    expect(campos).toContain("observacoes");
    expect(campos).toContain("avaliacao_valor_pago");
    expect(campos).not.toMatch(/\bperfil\b/);
    expect(patch).not.toMatch(/body\.perfil|body\[["']perfil|atualizacao\.perfil|atualizacao\[["']perfil|\.\.\.body/);
  });
});
