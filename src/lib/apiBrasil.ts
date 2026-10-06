/**
 * A rede da consulta de placa: uma chamada à APIBrasil, produto "Veículos
 * Total". O leitor da resposta é `lerRespostaDaApiBrasil` (`consultaDePlaca.ts`).
 *
 * Contrato do fornecedor (doc.apibrasil.io, lido em 06/10/2026):
 *   POST https://gateway.apibrasil.io/api/v2/consulta/veiculos/credits
 *   Authorization: Bearer <token>
 *   { "tipo": "veiculos-total", "placa": "ABC1D23", "homolog": false }
 *
 * Três avisos da documentação dele que viraram regra aqui:
 *
 *   1. ERRO CHEGA COM HTTP 200. Quem decide é o campo `error` do corpo, e é o
 *      leitor que o confere. Daqui sai o corpo; o status só fala quando é ruim.
 *   2. NÃO HÁ NOVA TENTATIVA. Cada consulta custa R$ 30, e a documentação
 *      avisa que repetir multiplica a cobrança. Uma chamada por clique; se ela
 *      falhar, a pessoa decide se tenta de novo. Em estouro de prazo a tela
 *      avisa que a consulta PODE ter sido cobrada.
 *   3. HTTP 402 É FALTA DE SALDO. Não se resolve por código: a mensagem manda
 *      pôr crédito.
 *
 * O token é segredo de servidor (`APIBRASIL_TOKEN`). `APIBRASIL_HOMOLOGACAO=1`
 * liga o modo de teste do fornecedor: ele responde com um carro de exemplo e
 * não cobra. É como Preview e desenvolvimento devem rodar.
 */
import { PRODUTO_VEICULOS_TOTAL } from "./consultaDePlaca";

export const APIBRASIL_CONSULTA_DE_VEICULOS = "https://gateway.apibrasil.io/api/v2/consulta/veiculos/credits";

/** O fornecedor reúne várias bases numa resposta; a espera é longa de propósito. */
export const ESPERA_DA_APIBRASIL_MS = 45000;

export type BuscarNaApiBrasil = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

export type RespostaDaRede =
  | { ok: true; corpo: unknown }
  | {
      ok: false;
      /** O status que a rota devolve ao painel. */
      status: 402 | 502 | 503 | 504;
      motivo: string;
      /** A consulta pode ter sido cobrada mesmo sem resposta. */
      podeTerCobrado: boolean;
    };

export function configuracaoDaApiBrasil(env: Record<string, string | undefined> = process.env): {
  token: string | null;
  homologacao: boolean;
} {
  return {
    token: env.APIBRASIL_TOKEN?.trim() || null,
    homologacao: env.APIBRASIL_HOMOLOGACAO?.trim() === "1",
  };
}

export async function consultarVeiculosTotal(
  placa: string,
  opcoes: { token: string; homologacao: boolean; buscar?: BuscarNaApiBrasil },
): Promise<RespostaDaRede> {
  const buscar: BuscarNaApiBrasil = opcoes.buscar ?? ((url, init) => fetch(url, { ...init, cache: "no-store" }));
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), ESPERA_DA_APIBRASIL_MS);
  try {
    const r = await buscar(APIBRASIL_CONSULTA_DE_VEICULOS, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opcoes.token}` },
      body: JSON.stringify({ tipo: PRODUTO_VEICULOS_TOTAL, placa, homolog: opcoes.homologacao }),
      signal: controle.signal,
    });
    if (r.status === 402) {
      return {
        ok: false,
        status: 402,
        motivo: "A conta da APIBrasil está sem saldo. Ponha crédito no painel deles e consulte de novo.",
        podeTerCobrado: false,
      };
    }
    if (r.status === 401 || r.status === 403) {
      return {
        ok: false,
        status: 503,
        motivo: "A APIBrasil recusou o token da loja. Confira APIBRASIL_TOKEN na Vercel.",
        podeTerCobrado: false,
      };
    }
    const corpo = await r.json().catch(() => null);
    if (r.status >= 500) {
      return {
        ok: false,
        status: 502,
        motivo: `A APIBrasil está fora do ar (HTTP ${r.status}). Confira o saldo no painel deles antes de consultar de novo.`,
        podeTerCobrado: true,
      };
    }
    if (corpo === null) {
      return { ok: false, status: 502, motivo: "A APIBrasil respondeu algo ilegível.", podeTerCobrado: true };
    }
    // 200 e os demais 4xx: o corpo diz o que houve (`error` e `message`).
    return { ok: true, corpo };
  } catch (erro) {
    const estourou = (erro as Error)?.name === "AbortError";
    return {
      ok: false,
      status: estourou ? 504 : 502,
      motivo: estourou
        ? "A APIBrasil não respondeu a tempo. A consulta PODE ter sido cobrada: confira o saldo no painel deles antes de consultar de novo."
        : "Não deu para falar com a APIBrasil. Confira o saldo no painel deles antes de consultar de novo.",
      podeTerCobrado: true,
    };
  } finally {
    clearTimeout(relogio);
  }
}
