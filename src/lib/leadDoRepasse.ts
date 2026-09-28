/**
 * O lead do repasse: o que os três formulários mandam para `/api/leads` e o
 * que a rota aceita (spec §8, decisões 9 a 11 do PR 3).
 *
 * Uma porta só: a lista (duas trilhas) e o exame no pátio entram pela rota de
 * leads de sempre, com `canal` próprio. O corpo é montado aqui, e não dentro
 * do `onSubmit`, pelo mesmo motivo de `encomenda.ts`: um campo trocado não
 * quebra tela nenhuma, e o lead chegaria mudo do outro lado.
 *
 * A mesma função que monta a mensagem no navegador monta na rota
 * (`MENSAGEM_DA_INSCRICAO`, `mensagemDoExame`): o servidor não confia na
 * `mensagem` do corpo. `leads` é lida por toda a equipe; CNPJ, faixa e tipos
 * de carro ficam fora de `leads`: vão para `repasse_inscritos`, que só quem
 * valida lê (e ao n8n, dentro de `intencao_busca`).
 *
 * Módulo puro: roda no navegador (formulários) e no servidor (rota).
 */
import type { TrilhaDoRepasse } from "./avisosDoRepasse";
import { cnpjValido, formatarCnpj, soCaracteresDoCnpj } from "./cnpj";
import { diaAceitoParaOExame, rotuloCompletoDoDia, turnoDoExame, type TurnoDoExame } from "./exameNoPatio";
import { nomeComAno } from "./nomeDoVeiculo";
import { ERROS_DO_REPASSE } from "./paginaDoRepasse";
import {
  FAIXAS_DO_REPASSE,
  ehIdDeRepasse,
  type CarroceriaDoRepasse,
  type FaixaDoRepasse,
  type Repasse,
} from "./repasse";
import type { UtmParameters } from "./telemetry";
import { telefoneDoLead } from "./whatsapp";

export const CANAL_DA_LISTA = "repasse";
export const CANAL_DA_LISTA_LOJISTA = "repasse-lojista";
export const CANAL_DO_EXAME = "repasse-exame";

export const FORM_DA_LISTA = "form-lista-repasse";
export const FORM_DA_LISTA_LOJISTA = "form-lista-repasse-lojista";
export const FORM_DO_EXAME = "form-exame-repasse";

/** As quatro que o formulário oferece; "Tanto faz" é a lista vazia (decisão 9). */
export const CARROCERIAS_DA_LISTA = ["hatch", "seda", "suv", "picape"] as const satisfies readonly CarroceriaDoRepasse[];
export type CarroceriaDaLista = (typeof CARROCERIAS_DA_LISTA)[number];

/** O texto que a equipe lê no Kanban (decisão 10): sem CNPJ, faixa nem tipos. */
export const MENSAGEM_DA_INSCRICAO: Record<TrilhaDoRepasse, string> = {
  consumidor: "Entrou na lista do repasse (compra para usar).",
  lojista: "Entrou na lista do repasse (lojista).",
};

/**
 * Como a lista se chama na medição, no navegador (`trackLeadSubmission`) e no
 * servidor (`contentName` da CAPI): os dois lados do mesmo `event_id`
 * descrevem a mesma coisa.
 */
export const VEICULO_DA_LISTA: Record<TrilhaDoRepasse, { marca: string; modelo: string }> = {
  consumidor: { marca: "Repasse Motors", modelo: "Lista" },
  lojista: { marca: "Repasse Motors", modelo: "Lista lojista" },
};

export type CarroDoExame = Pick<Repasse, "marca" | "modelo" | "versao" | "ano_modelo">;
export type CarroParaOExame = Pick<Repasse, "id" | "slug" | "marca" | "modelo" | "versao" | "ano_modelo" | "preco">;

export interface InscricaoNaLista {
  trilha: TrilhaDoRepasse;
  nome: string;
  /** Com DDI (`telefoneDoLead(...).comDDI`): com a trilha, a chave da lista. */
  whatsapp: string;
  faixa: FaixaDoRepasse | null;
  carrocerias: CarroceriaDaLista[];
  /** "00.000.000/0000-00"; null fora da trilha lojista. */
  cnpj: string | null;
  loja_cidade: string | null;
}

export interface PedidoDeExame {
  repasseId: string;
  dia: string;
  turno: TurnoDoExame;
  levaMecanico: boolean;
}

export type PedidoDoRepasse = { tipo: "lista"; inscricao: InscricaoNaLista } | { tipo: "exame"; exame: PedidoDeExame };

export type DecisaoDoLeadDoRepasse = { ok: true; pedido: PedidoDoRepasse } | { ok: false; erro: string };

/** Spec §8: "quando o canal começa com repasse". */
export function ehCanalDoRepasse(canal: unknown): boolean {
  return typeof canal === "string" && canal.startsWith("repasse");
}

const LIMITE_DO_TEXTO = 120;
const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");
const objeto = (valor: unknown): Record<string, unknown> =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
const recusa = (erro: string): DecisaoDoLeadDoRepasse => ({ ok: false, erro });

/**
 * A régua da rota, pura e testada (decisão 11): roda ANTES de qualquer
 * gravação. Canal, trilha e o tipo do pedido têm de concordar entre si — um
 * corpo com `canal: "repasse"` e trilha lojista não passa.
 */
export function decidirLeadDoRepasse(corpo: unknown, agora: Date): DecisaoDoLeadDoRepasse {
  const c = objeto(corpo);
  const canal = c.canal;
  if (canal !== CANAL_DA_LISTA && canal !== CANAL_DA_LISTA_LOJISTA && canal !== CANAL_DO_EXAME) {
    return recusa(ERROS_DO_REPASSE.canal);
  }
  const cliente = objeto(c.cliente);
  const nome = texto(cliente.nome);
  if (!nome || nome.length > LIMITE_DO_TEXTO) return recusa(ERROS_DO_REPASSE.nome);
  const whatsapp = telefoneDoLead(texto(cliente.whatsapp)).comDDI;
  if (!whatsapp) return recusa(ERROS_DO_REPASSE.whatsapp);
  const repasse = objeto(objeto(c.intencao_busca).repasse);

  if (canal === CANAL_DO_EXAME) {
    const repasseId = texto(repasse.repasse_id).toLowerCase();
    if (repasse.tipo !== "exame" || !ehIdDeRepasse(repasseId)) return recusa(ERROS_DO_REPASSE.carro);
    const dia = repasse.dia;
    if (!diaAceitoParaOExame(dia, agora)) return recusa(ERROS_DO_REPASSE.dia);
    const turno = turnoDoExame(repasse.turno);
    if (!turno) return recusa(ERROS_DO_REPASSE.turno);
    return {
      ok: true,
      pedido: { tipo: "exame", exame: { repasseId, dia, turno, levaMecanico: repasse.leva_mecanico === true } },
    };
  }

  if (repasse.tipo !== "lista") return recusa(ERROS_DO_REPASSE.canal);

  if (canal === CANAL_DA_LISTA_LOJISTA) {
    if (repasse.trilha !== "lojista") return recusa(ERROS_DO_REPASSE.canal);
    const cnpj = texto(repasse.cnpj);
    if (!cnpjValido(cnpj)) return recusa(ERROS_DO_REPASSE.cnpj);
    const lojaCidade = texto(repasse.loja_cidade);
    if (!lojaCidade || lojaCidade.length > LIMITE_DO_TEXTO) return recusa(ERROS_DO_REPASSE.loja);
    return {
      ok: true,
      pedido: {
        tipo: "lista",
        inscricao: { trilha: "lojista", nome, whatsapp, faixa: null, carrocerias: [], cnpj: formatarCnpj(cnpj), loja_cidade: lojaCidade },
      },
    };
  }

  if (repasse.trilha !== "consumidor") return recusa(ERROS_DO_REPASSE.canal);
  const faixa = FAIXAS_DO_REPASSE.find((f) => f.id === repasse.faixa)?.id;
  if (!faixa) return recusa(ERROS_DO_REPASSE.faixa);
  const brutas = Array.isArray(repasse.carrocerias) ? (repasse.carrocerias as unknown[]) : null;
  const carrocerias = (brutas ?? []).filter((c): c is CarroceriaDaLista =>
    (CARROCERIAS_DA_LISTA as readonly unknown[]).includes(c),
  );
  // Um valor fora da lista NUNCA casaria com carro nenhum no painel: a pessoa
  // ficaria na lista sem ser avisada. Recusa em vez de descartar calado.
  if (!brutas || carrocerias.length !== brutas.length) return recusa(ERROS_DO_REPASSE.carroceria);
  return {
    ok: true,
    pedido: {
      tipo: "lista",
      inscricao: {
        trilha: "consumidor",
        nome,
        whatsapp,
        faixa,
        carrocerias: [...new Set(carrocerias)],
        cnpj: null,
        loja_cidade: null,
      },
    },
  };
}

export interface LinhaNovaDoInscrito extends InscricaoNaLista {
  lead_id: string | null;
}

export type ColunasDoInscrito = Partial<Omit<LinhaNovaDoInscrito, "trilha" | "whatsapp">> & {
  cnpj_conferido_em?: null;
  cnpj_conferido_por?: null;
};

export type EscritaDaInscricao =
  | { operacao: "insert"; linha: LinhaNovaDoInscrito }
  | { operacao: "update"; id: string; colunas: ColunasDoInscrito };

/**
 * Quem já está na lista (mesma trilha e mesmo WhatsApp) é ATUALIZADO, não
 * duplicado — a unique `(org_id, trilha, whatsapp)` recusaria de qualquer
 * jeito. CNPJ trocado perde a conferência: quem conferiu, conferiu outro
 * número. Lead que não gravou (`leadId` nulo) não apaga o elo antigo.
 */
export function decidirInscricao(
  existente: { id: string; cnpj: string | null } | null,
  nova: InscricaoNaLista,
  leadId: string | null,
): EscritaDaInscricao {
  if (!existente) return { operacao: "insert", linha: { ...nova, lead_id: leadId } };
  const cnpjTrocado = soCaracteresDoCnpj(existente.cnpj ?? "") !== soCaracteresDoCnpj(nova.cnpj ?? "");
  return {
    operacao: "update",
    id: existente.id,
    colunas: {
      nome: nova.nome,
      faixa: nova.faixa,
      carrocerias: nova.carrocerias,
      cnpj: nova.cnpj,
      loja_cidade: nova.loja_cidade,
      ...(leadId ? { lead_id: leadId } : {}),
      ...(cnpjTrocado ? { cnpj_conferido_em: null, cnpj_conferido_por: null } : {}),
    },
  };
}

/** "Quero marcar o exame no pátio do Renault Kwid Zen 1.0 2021: Sáb 26/09, tarde. Vou levar o meu mecânico." */
export function mensagemDoExame(
  carro: CarroDoExame,
  exame: { dia: string; turno: TurnoDoExame; levaMecanico: boolean },
): string {
  const nome = nomeComAno({ marca: carro.marca, modelo: carro.modelo, versao: carro.versao, ano: carro.ano_modelo });
  const turno = exame.turno === "manha" ? "manhã" : "tarde";
  const mecanico = exame.levaMecanico ? " Vou levar o meu mecânico." : "";
  return `Quero marcar o exame no pátio do ${nome}: ${rotuloCompletoDoDia(exame.dia)}, ${turno}.${mecanico}`;
}

export interface ExtrasDoLeadDoRepasse {
  agUid: string;
  eventId: string | null;
  turnstileToken: string;
  utm: UtmParameters;
  eventSourceUrl?: string;
  fbp: string | null;
  fbc: string | null;
}

/**
 * Medição e captcha, iguais nos dois corpos. Campo a campo, e não
 * `...extras`: só estes chegam à rota, mesmo que quem chama passe mais.
 */
function camposDosExtras(extras: ExtrasDoLeadDoRepasse) {
  return {
    utm: extras.utm,
    agUid: extras.agUid,
    eventId: extras.eventId,
    eventSourceUrl: extras.eventSourceUrl,
    fbp: extras.fbp,
    fbc: extras.fbc,
    turnstileToken: extras.turnstileToken,
  };
}

export interface DadosDaLista {
  trilha: TrilhaDoRepasse;
  nome: string;
  whatsapp: string;
  faixa: FaixaDoRepasse | null;
  carrocerias: CarroceriaDaLista[];
  cnpj: string;
  lojaCidade: string;
  /** Onde a pessoa estava: `/repasse`, a ficha, o endereço que não abriu carro. */
  caminho: string;
}

export function montarLeadDaLista(dados: DadosDaLista, extras: ExtrasDoLeadDoRepasse) {
  const lojista = dados.trilha === "lojista";
  const veiculo = VEICULO_DA_LISTA[dados.trilha];
  return {
    tipo: "lead_repasse",
    canal: lojista ? CANAL_DA_LISTA_LOJISTA : CANAL_DA_LISTA,
    mensagem: MENSAGEM_DA_INSCRICAO[dados.trilha],
    cliente: { nome: dados.nome.trim(), whatsapp: dados.whatsapp.trim() },
    intencao_busca: {
      repasse: lojista
        ? { tipo: "lista", trilha: "lojista", cnpj: dados.cnpj.trim(), loja_cidade: dados.lojaCidade.trim(), caminho: dados.caminho }
        : { tipo: "lista", trilha: "consumidor", faixa: dados.faixa, carrocerias: dados.carrocerias, caminho: dados.caminho },
    },
    contentName: `${veiculo.marca} ${veiculo.modelo}`,
    ...camposDosExtras(extras),
  };
}

export interface DadosDoExame {
  nome: string;
  whatsapp: string;
  dia: string;
  turno: TurnoDoExame;
  levaMecanico: boolean;
}

/**
 * Sem `veiculo` no corpo, de propósito: a rota converteria o uuid em
 * `veiculo_id` (bigint, vira null) e o mandaria como `content_ids` à CAPI —
 * um id que não existe no catálogo da Meta (spec §8). O elo com o carro é o
 * `repasse_id`, que a rota grava depois de conferir o carro.
 */
export function montarLeadDoExame(carro: CarroParaOExame, dados: DadosDoExame, extras: ExtrasDoLeadDoRepasse) {
  return {
    tipo: "lead_repasse_exame",
    canal: CANAL_DO_EXAME,
    mensagem: mensagemDoExame(carro, dados),
    cliente: { nome: dados.nome.trim(), whatsapp: dados.whatsapp.trim() },
    intencao_busca: {
      repasse: {
        tipo: "exame",
        repasse_id: carro.id,
        slug: carro.slug,
        dia: dados.dia,
        turno: dados.turno,
        leva_mecanico: dados.levaMecanico,
      },
    },
    contentName: `${carro.marca} ${carro.modelo}`,
    ...camposDosExtras(extras),
  };
}

/**
 * O que o formulário mostra quando a rota recusa: só texto de
 * `ERROS_DO_REPASSE`. Mensagem de servidor que não é nossa ("Erro interno…",
 * a do limite de envios) vira a genérica.
 */
export function mensagemDeErroDaRota(corpo: unknown): string {
  const erro = objeto(corpo).error;
  const nossas: readonly string[] = Object.values(ERROS_DO_REPASSE);
  return typeof erro === "string" && nossas.includes(erro) ? erro : ERROS_DO_REPASSE.generico;
}
