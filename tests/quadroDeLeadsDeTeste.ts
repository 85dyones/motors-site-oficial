import { vi } from "vitest";
import { act } from "react";
import { ETAPAS_PADRAO, type EtapaDoFunil } from "../src/lib/funil";

/**
 * O que os testes de tela do funil de leads compartilham: o roteador de
 * mentira, a resposta de `GET /api/leads/[id]` montada a partir de um lead da
 * fila, e os gestos (clicar, digitar, esperar a tela assentar).
 *
 * Nada do app é dublê: o quadro, o detalhe e as libs são os de verdade. Só o
 * `fetch`, o `next/link` e o `next/navigation` (que fora do Next não têm
 * roteador) são substituídos, por quem monta.
 */

/** O `next/navigation` de mentira. Cada teste lê `rota` para ver o que a tela pediu. */
export const rota = {
  /** A query com que a tela "abre" (`vista=lista&lead=l1`). */
  query: "",
  replace: vi.fn<(url: string, opcoes?: unknown) => void>(),
  push: vi.fn<(url: string) => void>(),
};

const roteador = {
  replace: (url: string, opcoes?: unknown) => rota.replace(url, opcoes),
  push: (url: string) => rota.push(url),
};

export const navegacaoDeTeste = {
  useRouter: () => roteador,
  useSearchParams: () => new URLSearchParams(rota.query),
  usePathname: () => "/admin/leads",
};

export function zerarRota() {
  rota.query = "";
  rota.replace.mockClear();
  rota.push.mockClear();
  // A vista, o escopo e o lead aberto são escritos na barra de endereços com
  // `history.replaceState`: cada teste começa com ela limpa.
  if (typeof window !== "undefined") window.history.replaceState(null, "", "/admin/leads");
}

/** O que a barra de endereços mostra: é onde a tela escreve `?vista=`, `?escopo=` e `?lead=`. */
export const urlDaTela = () => window.location.pathname + window.location.search;

/** A tela é larga (gaveta) ou estreita (página)? O jsdom não tem `matchMedia`. */
export function definirLargura(larga: boolean) {
  (window as unknown as { matchMedia: unknown }).matchMedia = () => ({
    matches: larga,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

/** Deixa a cadeia `fetch` → `json` → `setState` terminar, e os efeitos que ela dispara. */
export async function assentar(voltas = 5) {
  for (let i = 0; i < voltas; i++) {
    await act(async () => {
      await new Promise((pronto) => setTimeout(pronto, 0));
    });
  }
}

export async function clicar(el: Element | null | undefined) {
  if (!el) throw new Error("o elemento a clicar não está na tela");
  await act(async () => {
    (el as HTMLElement).click();
  });
  await assentar();
}

/**
 * Mudar o valor de um controle do React: pelo setter NATIVO do protótipo, que
 * é o que o React substituiu, e só então o evento que ele escuta.
 */
export async function mudar(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, valor: string) {
  const proto =
    el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, valor);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}

export async function teclar(tecla: string) {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: tecla, bubbles: true }));
  });
  await assentar(2);
}

/** Um lead como `GET /api/leads/gerenciar` o devolve. */
export const leadDeTeste = (id: string, nome: string, extra: Record<string, unknown> = {}) => ({
  id,
  nome,
  telefone: "5541999990000",
  interesse: null,
  canal: "site",
  responsavel: null,
  observacoes: null,
  situacao: "novo",
  created_at: new Date().toISOString(),
  ag_uid: null,
  desfecho: null,
  transferencias: 0,
  chatwoot_conversation_id: null,
  etiquetas: [],
  proximo_passo: null,
  proximo_passo_vence_em: null,
  ultima_interacao: null,
  ...extra,
});

/** O corpo de `GET /api/leads/gerenciar` para quem vê lead. */
export function filaDeTeste(leads: unknown[], extra: Record<string, unknown> = {}) {
  return {
    leads,
    escopo: "todos",
    atendentes: [{ nome: "Ana" }, { nome: "Bruno" }],
    etapas: ETAPAS_PADRAO,
    motivos: [],
    funilPendente: false,
    podeConfigurar: false,
    busca: null,
    avisos: [],
    etiquetasDisponiveis: [],
    etiquetasEditaveis: false,
    ...extra,
  };
}

/** O corpo de `GET /api/leads/[id]`, a partir de um lead da fila. */
export function detalheDeTeste(lead: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const etapas = (extra.etapas as EtapaDoFunil[] | undefined) ?? ETAPAS_PADRAO;
  const etapa = etapas.find((e) => e.chave === lead.situacao) ?? null;
  return {
    lead: { email: null, carro_na_troca: null, faixa_entrada: null, pagamento_pretendido: null, veiculo_id: null, ref: null, ...lead },
    etapa: etapa ? { chave: etapa.chave, rotulo: etapa.rotulo, tipo: etapa.tipo } : null,
    aberto: !lead.desfecho,
    estagnacao: { nivel: "ok", minutos_parado: 0, parado_desde: lead.created_at },
    passo: null,
    veiculo: null,
    historico: [],
    sugestoes: [],
    vizinhos: { anterior: null, proximo: null },
    etapas,
    motivos: [],
    atendentes: [{ nome: "Ana" }, { nome: "Bruno" }],
    escopo: "todos",
    podeRemoverResponsavel: true,
    etiquetasEditaveis: false,
    funilPendente: false,
    avisos: [],
    ...extra,
  };
}

/** O id do lead numa URL `/api/leads/<id>` ou `/api/leads/<id>/<acao>`; `null` nas outras. */
export function leadDaUrl(url: string): { id: string; acao: string | null } | null {
  const m = /^\/api\/leads\/([^/?]+)(?:\/([^/?]+))?$/.exec(url);
  if (!m || m[1] === "gerenciar" || m[1] === "etiquetas") return null;
  return { id: decodeURIComponent(m[1]), acao: m[2] ?? null };
}

/** O botão do card (ou da linha da lista) que abre o detalhe de um lead. */
export const quemAbre = (raiz: ParentNode, id: string) =>
  raiz.querySelector<HTMLButtonElement>(`[data-abre-lead="${id}"]`);

/** O card do lead no quadro. */
export const cardDe = (raiz: ParentNode, id: string) => raiz.querySelector<HTMLElement>(`[data-lead="${id}"]`);

/** A gaveta do detalhe, quando aberta. */
export const gaveta = () => document.querySelector<HTMLElement>('[role="dialog"][data-layout="gaveta"]');
