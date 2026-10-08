/**
 * A Tabela FIPE paga, mês a mês: produto "Tabela Fipe Crédito" da APIBrasil.
 *
 * Por que existe (dono, 08/10/2026): o token gratuito da FIPE pública só
 * libera os meses mais recentes (em 07 e 08/10/2026: outubro, setembro e
 * agosto; julho para trás respondeu 402). O histórico de 24 meses da consulta
 * por modelo sai daqui, a R$ 0,06 por mês consultado, e só para os meses que a
 * FIPE gratuita não entrega. O que vem fica em `fipe_historico`: valor de
 * tabela de mês fechado não muda, e reabrir o modelo não paga de novo.
 *
 * Contrato do fornecedor (doc.apibrasil.io, "Tabela Fipe Crédito", lido em
 * 08/10/2026):
 *   POST https://gateway.apibrasil.io/api/v2/consulta/veiculos/credits
 *   Authorization: Bearer <token>
 *   { "tipo": "consulta-valor-com-todos-parametros",
 *     "codigoTabelaReferencia": 331, "codigoTipoVeiculo": 1,
 *     "codigoMarca": 47, "codigoModelo": 10193,
 *     "ano": "2025-1", "anoModelo": 2025, "codigoTipoCombustivel": 1,
 *     "homolog": false }
 *   → { error, message, data: { Valor: "R$ 123.456,78", Marca, Modelo,
 *       AnoModelo, Combustivel, CodigoFipe, MesReferencia, ... } }
 *
 * Os códigos são os da FIPE oficial, os mesmos da FIPE pública (Parallelum
 * v2): na doc, o código 331 é março/2026; na Parallelum, 338 é outubro/2026.
 *
 * As regras da consulta de placa valem aqui (`apiBrasil.ts`): erro chega com
 * HTTP 200 e quem decide é o corpo; NÃO há nova tentativa (cada chamada é
 * cobrada); 402 é falta de saldo. Em homologação o fornecedor responde um
 * carro de exemplo ("R$ 123.456,78") e não cobra: quem chama NÃO pode guardar
 * nem mostrar esse valor como tabela.
 */
import type { TipoFipe } from "./consultaFipe";
import type { ValorDaFipe } from "./mercadoPorModelo";
import { APIBRASIL_CONSULTA_DE_VEICULOS, type BuscarNaApiBrasil } from "./apiBrasil";

export const PRODUTO_TABELA_FIPE = "consulta-valor-com-todos-parametros";

/** Um mês da tabela custa pouco e responde rápido; a espera é curta para a fila andar. */
export const ESPERA_DA_TABELA_FIPE_MS = 20000;

const TIPO_DE_VEICULO: Record<TipoFipe, number> = { carros: 1, motos: 2, caminhoes: 3 };

export interface PedidoDaTabelaPaga {
  tipo: TipoFipe;
  marca: string;
  modelo: string;
  /** "2022-1": ano-modelo e combustível, como na FIPE. "32000-1" é zero-km. */
  ano: string;
  /** O código do mês de referência da FIPE. */
  referencia: number;
}

export type LeituraPaga =
  | { tipo: "valor"; valor: ValorDaFipe }
  /** A FIPE respondeu, e não tinha este carro neste mês. */
  | { tipo: "sem_valor" }
  /** 402: a conta está sem saldo. A fila inteira para. */
  | { tipo: "sem_saldo"; motivo: string }
  /** Token ausente ou recusado. A fila inteira para. */
  | { tipo: "sem_acesso"; motivo: string }
  | { tipo: "falha"; porque: string };

/** O corpo do pedido. Puro, para os testes conferirem campo a campo. */
export function corpoDaTabelaPaga(p: PedidoDaTabelaPaga, homologacao: boolean): Record<string, unknown> | null {
  const [anoTexto, combustivelTexto] = p.ano.split("-");
  const anoModelo = Number(anoTexto);
  const combustivel = Number(combustivelTexto);
  const marca = Number(p.marca);
  const modelo = Number(p.modelo);
  if (![anoModelo, combustivel, marca, modelo, p.referencia].every((n) => Number.isInteger(n) && n > 0)) return null;
  return {
    tipo: PRODUTO_TABELA_FIPE,
    codigoTabelaReferencia: p.referencia,
    codigoTipoVeiculo: TIPO_DE_VEICULO[p.tipo],
    codigoMarca: marca,
    codigoModelo: modelo,
    ano: p.ano,
    anoModelo,
    codigoTipoCombustivel: combustivel,
    homolog: homologacao,
  };
}

const texto = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/**
 * "Não tinha este carro neste mês". A FIPE oficial responde isso com
 * `{ codigo: "2", erro: "Parâmetros inválidos" }`; o fornecedor embrulha em
 * `error`/`message`. Qualquer outra recusa é falha, e falha não fica guardada.
 */
const NAO_TINHA = /par[âa]metros? inv[áa]lidos?|n[ãa]o encontrad|nenhum (ve[íi]culo|resultado|registro)|sem resultado|inexistente/i;

/** Lê o corpo de uma resposta 200 (ou 4xx com corpo). Puro. */
export function lerRespostaDaTabelaPaga(corpo: unknown): LeituraPaga {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return { tipo: "falha", porque: "respondeu algo ilegível" };
  const c = corpo as Record<string, unknown>;
  const data = c.data && typeof c.data === "object" && !Array.isArray(c.data) ? (c.data as Record<string, unknown>) : null;
  const mensagem = [texto(c.message), data ? texto(data.erro) : null].filter(Boolean).join(" · ");
  if (c.error === true || (data && data.erro !== undefined)) {
    if (/saldo|cr[ée]dito insuficiente/i.test(mensagem)) return { tipo: "sem_saldo", motivo: "A conta da APIBrasil está sem saldo. Ponha crédito no painel deles e analise de novo." };
    if (NAO_TINHA.test(mensagem)) return { tipo: "sem_valor" };
    return { tipo: "falha", porque: mensagem ? `recusou: ${mensagem.slice(0, 120)}` : "recusou sem dizer o motivo" };
  }
  if (!data) return { tipo: "falha", porque: "respondeu sem o valor" };
  const bruto = texto(data.Valor);
  const digitos = bruto ? bruto.replace(/[^\d]/g, "") : "";
  const valor = digitos ? Number(digitos) / 100 : NaN;
  if (!Number.isFinite(valor) || valor <= 0) return { tipo: "falha", porque: "respondeu sem o valor" };
  const anoModelo = Number(data.AnoModelo);
  return {
    tipo: "valor",
    valor: {
      valor,
      marca: texto(data.Marca),
      modelo: texto(data.Modelo),
      anoModelo: Number.isInteger(anoModelo) && anoModelo > 1900 && anoModelo < 3000 ? anoModelo : null,
      combustivel: texto(data.Combustivel),
      codigoFipe: texto(data.CodigoFipe),
    },
  };
}

/** Uma chamada, um mês. Sem nova tentativa: quem decide é a fila. */
export async function lerMesNaTabelaPaga(
  pedido: PedidoDaTabelaPaga,
  opcoes: { token: string; homologacao: boolean; buscar?: BuscarNaApiBrasil },
): Promise<LeituraPaga> {
  const corpo = corpoDaTabelaPaga(pedido, opcoes.homologacao);
  // Pedido torto não sai: seria uma chamada cobrada para nada.
  if (!corpo) return { tipo: "falha", porque: "o pedido não tem os códigos da FIPE" };
  const buscar: BuscarNaApiBrasil = opcoes.buscar ?? ((url, init) => fetch(url, { ...init, cache: "no-store" }));
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), ESPERA_DA_TABELA_FIPE_MS);
  try {
    const r = await buscar(APIBRASIL_CONSULTA_DE_VEICULOS, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opcoes.token}` },
      body: JSON.stringify(corpo),
      signal: controle.signal,
    });
    if (r.status === 402) return { tipo: "sem_saldo", motivo: "A conta da APIBrasil está sem saldo. Ponha crédito no painel deles e analise de novo." };
    if (r.status === 401 || r.status === 403) return { tipo: "sem_acesso", motivo: "A APIBrasil recusou o token da loja. Confira APIBRASIL_TOKEN na Vercel." };
    if (r.status >= 500) return { tipo: "falha", porque: `está fora do ar (HTTP ${r.status})` };
    return lerRespostaDaTabelaPaga(await r.json().catch(() => null));
  } catch (erro) {
    return { tipo: "falha", porque: (erro as Error)?.name === "AbortError" ? "não respondeu a tempo" : "não respondeu" };
  } finally {
    clearTimeout(relogio);
  }
}

/** O preço por mês consultado (`APIBRASIL_FIPE_PRECO`, ex.: "0,06"), ou `null` se ninguém disse. */
export function precoDaTabelaPaga(env: Record<string, string | undefined> = process.env): number | null {
  const n = Number((env.APIBRASIL_FIPE_PRECO ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
