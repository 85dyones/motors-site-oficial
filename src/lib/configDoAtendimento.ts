import {
  LIMIARES_DE_FABRICA,
  PESOS_DE_FABRICA,
  TEMPERATURAS,
  limiaresValidos,
  pesosValidos,
  type LimiaresDoAquecimento,
  type PesosDoAquecimento,
  type Temperatura,
} from "./aquecimento";
import { CADENCIAS_DE_FABRICA, reguaValida, type ReguaDeCadencias } from "./cadencias";
import { MODELO_PADRAO } from "./deepseek";
import { temInjecaoDePrompt } from "./injecaoDePrompt";

/**
 * A configuração do assistente de atendimento — uma linha por loja em
 * `atendimento_config`, editada em **Leads → Atendimento IA**.
 *
 * Tudo que é escolha de negócio mora aqui, e não no código: se o assistente
 * diz preço, a partir de que temperatura o vendedor é avisado, quem escolhe o
 * vendedor, os pesos e as cadências. Os valores de fábrica são a semente da
 * migração e a rede quando a linha não é legível.
 *
 * **`ativo` nasce falso.** Ligar o assistente é mandar mensagem de verdade
 * para cliente de verdade; isso é decisão do dono, num clique, depois de
 * conferir a configuração — nunca efeito colateral de um deploy.
 */

/**
 * Quem escolhe o vendedor do lead que esquentou sem dono.
 *
 *   - `administrador`: o resumo vai a quem distribui (administrador do
 *     comercial) e ao gestor, que escolhem no painel; o resumo segue para o
 *     escolhido. É a decisão vigente do dono para lead novo (10/10/2026:
 *     *"ele vai determinar o dono e depois começa a dança"*), e por isso é o
 *     padrão.
 *   - `rodizio`: o vendedor ativo com menos leads abertos — a régua da
 *     transferência do funil — recebe na hora, como no manobrAI.
 */
export type DistribuicaoDoAtendimento = "administrador" | "rodizio";
export const DISTRIBUICOES: readonly DistribuicaoDoAtendimento[] = ["administrador", "rodizio"];

export interface ConfigDoAtendimento {
  ativo: boolean;
  nome_do_assistente: string;
  modelo: string;
  /** O assistente informa o preço anunciado do catálogo? */
  informar_preco: boolean;
  /** A partir de que temperatura o lead vai ao vendedor. */
  avisar_a_partir: Temperatura;
  distribuicao: DistribuicaoDoAtendimento;
  limiares: LimiaresDoAquecimento;
  pesos: PesosDoAquecimento;
  /**
   * O que a loja quer que o assistente saiba e que não está no site: política
   * de troca, documentos para o financiamento, um tom. Texto livre, lido como
   * DADO pelo modelo e filtrado contra injeção na gravação.
   */
  regras_da_loja: string;
  cadencias: ReguaDeCadencias;
  atualizado_em: string | null;
  atualizado_por: string | null;
}

export const NOME_PADRAO_DO_ASSISTENTE = "Ney";

/** A migração que cria o atendimento — citada quando a tabela ainda não existe. */
export const MIGRACAO_DO_ATENDIMENTO = "20261020120000_atendimento_ia.sql";

export const CONFIG_DE_FABRICA: ConfigDoAtendimento = {
  ativo: false,
  nome_do_assistente: NOME_PADRAO_DO_ASSISTENTE,
  modelo: MODELO_PADRAO,
  // Decisão do dono em 05/09/2026, para o Ney do Chatwoot: *"não vai discutir
  // valores"*. Continua valendo até ele mudar na tela.
  informar_preco: false,
  avisar_a_partir: "quente",
  distribuicao: "administrador",
  limiares: { ...LIMIARES_DE_FABRICA },
  pesos: { ...PESOS_DE_FABRICA },
  regras_da_loja: "",
  cadencias: structuredClone(CADENCIAS_DE_FABRICA),
  atualizado_em: null,
  atualizado_por: null,
};

export const TETO_DAS_REGRAS_DA_LOJA = 4000;

function textoCurto(v: unknown, padrao: string, max: number): string {
  if (typeof v !== "string") return padrao;
  const t = v.trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : padrao;
}

/** A linha do banco (ou nada) virando configuração inteira e coerente. */
export function configValida(linha: unknown): ConfigDoAtendimento {
  if (!linha || typeof linha !== "object") return structuredClone(CONFIG_DE_FABRICA);
  const l = linha as Record<string, unknown>;
  const avisar = TEMPERATURAS.includes(l.avisar_a_partir as Temperatura) && l.avisar_a_partir !== "frio"
    ? (l.avisar_a_partir as Temperatura)
    : CONFIG_DE_FABRICA.avisar_a_partir;
  return {
    ativo: l.ativo === true,
    nome_do_assistente: textoCurto(l.nome_do_assistente, NOME_PADRAO_DO_ASSISTENTE, 40),
    modelo: textoCurto(l.modelo, MODELO_PADRAO, 60),
    informar_preco: l.informar_preco === true,
    avisar_a_partir: avisar,
    distribuicao: DISTRIBUICOES.includes(l.distribuicao as DistribuicaoDoAtendimento)
      ? (l.distribuicao as DistribuicaoDoAtendimento)
      : CONFIG_DE_FABRICA.distribuicao,
    limiares: limiaresValidos(l.limiar_morno, l.limiar_quente),
    pesos: pesosValidos(l.pesos),
    regras_da_loja: typeof l.regras_da_loja === "string" ? l.regras_da_loja.trim().slice(0, TETO_DAS_REGRAS_DA_LOJA) : "",
    cadencias: reguaValida(l.cadencias),
    atualizado_em: typeof l.atualizado_em === "string" ? l.atualizado_em : null,
    atualizado_por: typeof l.atualizado_por === "string" ? l.atualizado_por : null,
  };
}

export type DecisaoDaConfig =
  | { ok: true; linha: Record<string, unknown> }
  | { ok: false; erro: string };

/**
 * O que a tela mandou, conferido e pronto para gravar.
 *
 * Recusa em vez de corrigir calado: limiar incoerente, temperatura "frio"
 * como gatilho (entregaria todo lead na primeira mensagem) e texto da loja
 * com cara de injeção de prompt voltam 400 com o motivo — a tela mostra e a
 * pessoa conserta. As cadências e os pesos passam pelos mesmos validadores da
 * leitura, então o que se grava é exatamente o que se vai ler.
 */
export function decidirConfig(corpo: unknown): DecisaoDaConfig {
  if (!corpo || typeof corpo !== "object") return { ok: false, erro: "Corpo inválido." };
  const c = corpo as Record<string, unknown>;

  if (c.avisar_a_partir !== undefined && c.avisar_a_partir !== "quente" && c.avisar_a_partir !== "morno") {
    return { ok: false, erro: "Avisar a partir de: escolha morno ou quente." };
  }
  if (c.distribuicao !== undefined && !DISTRIBUICOES.includes(c.distribuicao as DistribuicaoDoAtendimento)) {
    return { ok: false, erro: "Distribuição inválida." };
  }
  const morno = c.limiar_morno ?? LIMIARES_DE_FABRICA.morno;
  const quente = c.limiar_quente ?? LIMIARES_DE_FABRICA.quente;
  const m = Number(morno);
  const q = Number(quente);
  if (!Number.isInteger(m) || !Number.isInteger(q) || m < 1 || q > 100 || m >= q) {
    return { ok: false, erro: "Os limiares precisam ser inteiros, com 1 ≤ morno < quente ≤ 100." };
  }
  const regras = typeof c.regras_da_loja === "string" ? c.regras_da_loja.trim() : "";
  if (regras.length > TETO_DAS_REGRAS_DA_LOJA) {
    return { ok: false, erro: `As regras da loja passam de ${TETO_DAS_REGRAS_DA_LOJA} caracteres.` };
  }
  if (temInjecaoDePrompt(regras)) {
    return { ok: false, erro: "As regras da loja têm um trecho que parece instrução para o modelo. Reescreva como informação da loja." };
  }
  if (temInjecaoDePrompt(c.cadencias)) {
    return { ok: false, erro: "Um texto das cadências parece instrução para o modelo. Reescreva como mensagem ao cliente." };
  }
  const nome = typeof c.nome_do_assistente === "string" ? c.nome_do_assistente.trim() : NOME_PADRAO_DO_ASSISTENTE;
  if (!nome || nome.length > 40 || temInjecaoDePrompt(nome)) {
    return { ok: false, erro: "O nome do assistente precisa ter até 40 caracteres." };
  }

  return {
    ok: true,
    linha: {
      ativo: c.ativo === true,
      nome_do_assistente: nome,
      informar_preco: c.informar_preco === true,
      avisar_a_partir: c.avisar_a_partir ?? CONFIG_DE_FABRICA.avisar_a_partir,
      distribuicao: c.distribuicao ?? CONFIG_DE_FABRICA.distribuicao,
      limiar_morno: m,
      limiar_quente: q,
      pesos: pesosValidos(c.pesos),
      regras_da_loja: regras,
      cadencias: reguaValida(c.cadencias),
    },
  };
}
