/**
 * A parte SEM CUSTO da consulta de placa — o que dá para saber de graça depois
 * que a consulta paga disse qual é o carro.
 *
 * Pedido do dono em 06/10/2026: "faça mesclado, os serviços que possam ser
 * feitos sem custo". Duas perguntas saem daqui, as duas na BrasilAPI (pública,
 * sem chave, a mesma fonte do CEP em `ciclo/cep.ts`):
 *
 *   1. QUEM COMPROU O CARRO ZERO. A consulta paga traz o CNPJ de faturamento e
 *      mais nada. O cadastro da Receita diz o nome da empresa e a atividade
 *      principal, e é assim que se sabe se o primeiro dono foi locadora, mesmo
 *      quando o fornecedor responde que não há "registro em locadora".
 *   2. A FIPE DO MÊS NA FONTE PÚBLICA, pelo código FIPE, para conferir o valor
 *      que o fornecedor mandou. Só roda quando o código veio na consulta paga.
 *
 * O que é de graça e NÃO precisa de rede (ano e origem pelo chassi) está em
 * `consultaDePlaca.ts`, junto do leitor.
 *
 * Nada aqui pode derrubar a consulta: ela já foi paga. Toda falha vira uma
 * linha em `falhas`, que a tela mostra, e a função nunca lança.
 *
 * Só dado de EMPRESA sai daqui. Do cadastro da Receita ficam razão social,
 * nome fantasia e atividade; o quadro de sócios, que a BrasilAPI também
 * devolve, não é lido.
 */
import { cnpjValido } from "./cnpj";
import {
  CNAE_DE_LOCADORA,
  numeroDoFornecedor,
  type DadosGratuitos,
  type EmpresaDoFaturamento,
  type FipeOficial,
} from "./consultaDePlaca";

export const BRASIL_API = "https://brasilapi.com.br/api";

/** Cada chamada gratuita espera no máximo isto: a tela já tem o retrato pago. */
export const ESPERA_GRATUITA_MS = 6000;

export type BuscarGratuito = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** O cadastro da Receita, como a BrasilAPI o devolve em `/cnpj/v1/{cnpj}`. */
export function lerEmpresa(corpo: unknown): EmpresaDoFaturamento | null {
  if (!corpo || typeof corpo !== "object") return null;
  const c = corpo as Record<string, unknown>;
  const razaoSocial = texto(c.razao_social);
  // `cnae_fiscal` vem como número (7711000) ou texto; sete dígitos nos dois casos.
  const cnae = String(c.cnae_fiscal ?? "").replace(/\D/g, "") || null;
  if (!razaoSocial && !cnae) return null;
  return {
    razaoSocial,
    nomeFantasia: texto(c.nome_fantasia),
    cnae,
    atividade: texto(c.cnae_fiscal_descricao),
    locadora: cnae === CNAE_DE_LOCADORA,
  };
}

/**
 * A FIPE do mês em `/fipe/preco/v1/{codigo}`: uma linha por ano-modelo e
 * combustível. Fica a do ano-modelo do carro; havendo mais de uma (flex e
 * diesel do mesmo ano, por exemplo), não dá para escolher e a resposta é
 * `null` — melhor sem conferência do que conferir contra o carro errado.
 */
export function lerFipeOficial(corpo: unknown, anoModelo: number): FipeOficial | null {
  if (!Array.isArray(corpo)) return null;
  const doAno = corpo.filter(
    (l): l is Record<string, unknown> => !!l && typeof l === "object" && Number((l as Record<string, unknown>).anoModelo) === anoModelo,
  );
  if (doAno.length !== 1) return null;
  // "R$ 128.430,00"
  const valor = numeroDoFornecedor(String(doAno[0].valor ?? "").replace(/[^\d.,]/g, ""));
  if (valor === null || valor <= 0) return null;
  return { valor, mesReferencia: texto(doAno[0].mesReferencia) };
}

async function buscarJson(url: string, buscar: BuscarGratuito): Promise<unknown> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), ESPERA_GRATUITA_MS);
  try {
    const r = await buscar(url, { signal: controle.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * As duas consultas gratuitas, em paralelo. Sem CNPJ válido ou sem código
 * FIPE, a pergunta correspondente nem sai, e isso também é dito em `falhas`.
 */
export async function consultarGratuito(
  entrada: { cnpj: string | null; codigoFipe: string | null; anoModelo: number | null },
  buscar: BuscarGratuito = (url, init) => fetch(url, { ...init, cache: "no-store" }),
): Promise<DadosGratuitos> {
  const falhas: string[] = [];

  const empresa = (async (): Promise<EmpresaDoFaturamento | null> => {
    if (!entrada.cnpj || !cnpjValido(entrada.cnpj)) {
      falhas.push("Empresa do primeiro faturamento: a consulta não trouxe um CNPJ válido.");
      return null;
    }
    try {
      const lida = lerEmpresa(await buscarJson(`${BRASIL_API}/cnpj/v1/${entrada.cnpj}`, buscar));
      if (!lida) falhas.push("Empresa do primeiro faturamento: a Receita respondeu sem os dados da empresa.");
      return lida;
    } catch (erro) {
      falhas.push(`Empresa do primeiro faturamento: a consulta pública falhou (${(erro as Error)?.message ?? "erro"}).`);
      return null;
    }
  })();

  const fipe = (async (): Promise<FipeOficial | null> => {
    if (!entrada.codigoFipe || entrada.anoModelo === null || !/^\d{6}-\d$/.test(entrada.codigoFipe)) {
      falhas.push("FIPE na tabela pública: a consulta paga não trouxe o código FIPE do carro.");
      return null;
    }
    try {
      const lida = lerFipeOficial(await buscarJson(`${BRASIL_API}/fipe/preco/v1/${entrada.codigoFipe}`, buscar), entrada.anoModelo);
      if (!lida) falhas.push("FIPE na tabela pública: não há uma linha única para o ano-modelo deste carro.");
      return lida;
    } catch (erro) {
      falhas.push(`FIPE na tabela pública: a consulta falhou (${(erro as Error)?.message ?? "erro"}).`);
      return null;
    }
  })();

  const [empresaDoFaturamento, fipeOficial] = await Promise.all([empresa, fipe]);
  return { empresaDoFaturamento, fipeOficial, falhas };
}
