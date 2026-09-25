import type { Veiculo } from "../types";
import { precoVigente } from "./regrasEstoque";

/**
 * O que o Garagem Profiler pode AFIRMAR sobre um carro, e de onde vem cada
 * afirmação.
 *
 * ---------------------------------------------------------------------------
 * Por que um arquivo novo, e não mais etiquetas em `car-match.ts`
 * ---------------------------------------------------------------------------
 * O motor antigo decidia pelo `perfis_uso`, marcado à mão no painel. Medido nas
 * 320 combinações do quiz sobre os 37 publicados em 25/09: o Ford Ka 2020, com
 * cinco perfis marcados, aparecia em 42% dos resultados; quem pedia câmbio
 * automático recebia 41% de carros manuais. Etiqueta diz o que alguém ACHOU do
 * carro; o Profiler precisa dizer o que o carro É.
 *
 * Aqui só entram três fontes, cada uma com o peso que merece:
 *
 *   · campo do sync (preço, ano, km, câmbio, combustível, portas, carroceria)
 *     → verdade ou mentira: `atende` / `nao-atende`;
 *   · nome da versão ("2.0 TSI 4Motion", "1.3 T270 4x2")
 *     → idem, quando o nome diz; `nao-consta` quando cala;
 *   · ficha de opcionais, numa lista fechada de termos
 *     → `atende` ou `nao-consta`, NUNCA `nao-atende`.
 *
 * A ficha não prova ausência. Doze carros chegaram do RevendaMais sem opcional
 * nenhum, e o Versa 2025 não lista nem ABS. Dizer "não tem câmera de ré" a
 * partir disso seria afirmar o que ninguém conferiu — o cliente leria como
 * defeito do carro o que é lacuna do cadastro.
 *
 * Sem import de `./supabase`: este arquivo roda no navegador (o CarMatch) e
 * no servidor (`/api/match`), como `perfisDeUso.ts` e `regrasEstoque.ts`.
 */

export type EstadoDoFato = "atende" | "nao-consta" | "nao-atende";

/** Minúsculas, sem acento — a forma em que tudo aqui é comparado. */
export function normalizar(valor: string | null | undefined): string {
  return (valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Marca, modelo e versão juntos: é onde o nome da versão guarda "4x4" e "TSI". */
function nomeCompleto(v: Pick<Veiculo, "marca" | "modelo" | "versao">): string {
  return normalizar([v.marca, v.modelo, v.versao].filter(Boolean).join(" "));
}

// ---------------------------------------------------------------------------
// Campos do sync
// ---------------------------------------------------------------------------

export const precoDoCarro = (v: Pick<Veiculo, "preco_original" | "preco_promocional">): number =>
  precoVigente(v);

/** `true` automático, `false` manual, `null` quando o campo não diz. */
export function ehAutomatico(v: Pick<Veiculo, "cambio">): boolean | null {
  const c = normalizar(v.cambio);
  if (!c) return null;
  if (c.includes("manual")) return false;
  if (c.includes("autom") || c.includes("cvt")) return true;
  return null;
}

export function combustivelDe(v: Pick<Veiculo, "combustivel">): string {
  return normalizar(v.combustivel);
}

/** A carroceria como está cadastrada, na grafia de exibição ("SUV", "Picape"). */
export function carroceriaDe(v: Pick<Veiculo, "tipo">): string {
  return (v.tipo ?? "").trim();
}

export function ehMoto(v: Pick<Veiculo, "tipo">): boolean {
  const t = normalizar(v.tipo);
  return t === "motocicleta" || t === "moto" || t === "scooter";
}

/**
 * Três épocas, e não o ano cru: "2014 contra 2016" não é outro caminho para
 * quem escolhe carro, "2014 contra 2024" é.
 */
export function epocaDe(ano: number): "ate-2016" | "2017-2021" | "2022-em-diante" {
  if (ano <= 2016) return "ate-2016";
  if (ano <= 2021) return "2017-2021";
  return "2022-em-diante";
}

/**
 * Marca + primeira palavra do modelo: "ford ka" para os três Ka do pátio
 * (hatch SE Plus, Ka Sedan SE e o Ka+ Sedan que o painel renomeou para "Ka").
 * É a chave que impede o Profiler de sugerir três vezes o mesmo carro com
 * versões diferentes.
 */
export function modeloBase(v: Pick<Veiculo, "marca" | "modelo">): string {
  const primeira = normalizar(v.modelo).split(/[\s+]+/)[0] ?? "";
  return `${normalizar(v.marca)} ${primeira}`.trim();
}

// ---------------------------------------------------------------------------
// Nome da versão
// ---------------------------------------------------------------------------

/**
 * Cilindrada em litros: primeiro o nome ("1.6 advance", "2.0 tsi"), depois o
 * campo `motor` do feed, que às vezes chega "0.0" (Saveiro Robust) ou "150.0"
 * (a moto, em cc). Fora de 0,8–8,0 é ruído, e ruído vira `null`.
 */
export function cilindradaDe(v: Pick<Veiculo, "marca" | "modelo" | "versao" | "motor">): number | null {
  const doNome = nomeCompleto(v).match(/(?:^|\s)(\d\.\d)(?=\s|$)/);
  const candidatos = [doNome?.[1], v.motor];
  for (const bruto of candidatos) {
    const n = Number(String(bruto ?? "").replace(",", "."));
    if (Number.isFinite(n) && n >= 0.8 && n <= 8) return n;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Ficha de opcionais
// ---------------------------------------------------------------------------

export interface ItemDaFicha {
  id: string;
  /** Como o item aparece para o cliente, em minúsculas para caber na frase. */
  rotulo: string;
  /** Pedaços procurados em cada opcional, já normalizados. */
  termos: readonly string[];
}

/**
 * A lista fechada. Termo que não está aqui não vira motivo, por mais que esteja
 * escrito na ficha — "farol de milha" não decide compra.
 */
export const ITENS_DA_FICHA: readonly ItemDaFicha[] = [
  { id: "camera", rotulo: "câmera de ré", termos: ["camera de re", "camera 360"] },
  { id: "multimidia", rotulo: "central multimídia", termos: ["central multimidia", "kit multimidia", "espelhamento"] },
  { id: "sensor", rotulo: "sensor de estacionamento", termos: ["sensor de estacionamento"] },
  { id: "airbag-lateral", rotulo: "airbag lateral", termos: ["airbag lateral"] },
  { id: "airbag-cortina", rotulo: "airbag de cortina", termos: ["airbag de cortina"] },
  { id: "estabilidade", rotulo: "controle de estabilidade", termos: ["controle de estabilidade"] },
  { id: "controle-tracao", rotulo: "controle de tração", termos: ["controle de tracao"] },
  { id: "couro", rotulo: "bancos em couro", termos: ["bancos em couro"] },
  { id: "teto", rotulo: "teto solar", termos: ["teto solar"] },
  { id: "chave-presencial", rotulo: "chave presencial", termos: ["chave presencial"] },
  { id: "unico-dono", rotulo: "único dono", termos: ["unico dono"] },
  { id: "revisoes", rotulo: "revisões em dia", termos: ["revisoes em dia"] },
];

/** Os opcionais do carro, um por item, normalizados. */
export function opcionaisDe(v: Pick<Veiculo, "opcionais">): string[] {
  return (v.opcionais ?? "")
    .split(",")
    .map((o) => normalizar(o))
    .filter(Boolean);
}

export function fichaVazia(v: Pick<Veiculo, "opcionais">): boolean {
  return opcionaisDe(v).length === 0;
}

function fichaDiz(v: Pick<Veiculo, "opcionais">, termos: readonly string[]): boolean {
  return opcionaisDe(v).some((o) => termos.some((t) => o.includes(t)));
}

/** `atende` quando a ficha traz o item; `nao-consta` em qualquer outro caso. */
export function itemNaFicha(v: Pick<Veiculo, "opcionais">, item: ItemDaFicha): EstadoDoFato {
  return fichaDiz(v, item.termos) ? "atende" : "nao-consta";
}

/** Quantos itens da lista fechada a ficha traz. */
export function itensQueConstam(v: Pick<Veiculo, "opcionais">): number {
  return ITENS_DA_FICHA.filter((i) => fichaDiz(v, i.termos)).length;
}

// ---------------------------------------------------------------------------
// Fatos que vêm do nome OU da ficha
// ---------------------------------------------------------------------------

type ComNomeEFicha = Pick<Veiculo, "marca" | "modelo" | "versao" | "opcionais">;

/**
 * Tração 4x4. O nome confirma ("4x4", "4Motion") ou nega ("4x2"); a ficha
 * também, quando escreve a tração ("Tração 4x4", "Tração 4x2" no Outlander).
 * Picape grande sem nada escrito fica `nao-consta` — a Toro D4 é o caso.
 */
export function tracao4x4(v: ComNomeEFicha): EstadoDoFato {
  const nome = nomeCompleto(v);
  if (/\b4x4\b|4motion|\bawd\b|quattro|xdrive/.test(nome)) return "atende";
  if (/\b4x2\b/.test(nome)) return "nao-atende";
  if (fichaDiz(v, ["tracao 4x4"])) return "atende";
  if (fichaDiz(v, ["tracao 4x2"])) return "nao-atende";
  return "nao-consta";
}

/**
 * Motor turbo. O nome só CONFIRMA (TSI, T270, TB, "turbo"): nome calado não
 * prova motor aspirado, então nunca vira `nao-atende`.
 */
export function motorTurbo(v: ComNomeEFicha): EstadoDoFato {
  if (/\b(tsi|tfsi|t200|t270|turbo|tb|thp|ecoboost)\b/.test(nomeCompleto(v))) return "atende";
  if (fichaDiz(v, ["motor turbo"])) return "atende";
  return "nao-consta";
}
