/**
 * O que o painel grava num carro de repasse, e quem grava (spec §5 e §6).
 *
 * Desde 20260924200000_repasse_escrita_pela_rota.sql, `authenticated` não
 * escreve nas tabelas do repasse: a rota do painel roda ESTE portão e só
 * então grava com a chave de serviço (decisão I4 da revisão do PR 1). Por
 * isso a lista de campos é FECHADA. Campo fora dela é recusado, e as colunas
 * do ciclo de vida (situação, datas, quem validou) só mudam por
 * `decidirTransicao` (transicoesDoRepasse.ts).
 *
 * Módulo puro: o editor usa `formularioDe` e `alteracoes` no navegador.
 */
import { anoMaximo } from "./anoDoVeiculo";
import { checklistDoRepasse } from "./checklistDoRepasse";
import { ehFotoPropria } from "./fotosDoVeiculo";
import { podeFazer, type Perfil } from "./permissoes";
import {
  CARROCERIAS_DO_REPASSE,
  LAUDOS_DO_REPASSE,
  PISO_DO_ANO_NO_BANCO,
  slugDoRepasse,
  type ItemDeEstado,
  type Repasse,
} from "./repasse";

export const CAMPOS_EDITAVEIS_DO_REPASSE = [
  "marca",
  "modelo",
  "versao",
  "ano_modelo",
  "ano_fabricacao",
  "quilometragem",
  "cambio",
  "combustivel",
  "cor",
  "carroceria",
  "preco",
  "fipe_valor",
  "fipe_codigo",
  "fipe_mes_referencia",
  "laudo",
  "laudo_apontamento",
  "leilao_consta",
  "leilao_detalhe",
  "sinistro_consta",
  "sinistro_detalhe",
  "historico_consultado_em",
  "resumo",
  "motivo",
  "itens_de_estado",
  "sem_defeitos_conhecidos",
  "oficina_do_orcamento",
  "orcamento_em",
  "web_full_images",
  "whatsapp_images",
] as const;
export type CampoEditavelDoRepasse = (typeof CAMPOS_EDITAVEIS_DO_REPASSE)[number];
export type FormularioDoRepasse = Pick<Repasse, CampoEditavelDoRepasse>;

/** O que a galeria do estoque manda junto e o repasse não tem. */
const CAMPOS_DESCARTADOS: readonly string[] = ["url_imagem"];

/** As colunas `not null` sem default de `repasses`. */
export const OBRIGATORIOS_PARA_CRIAR = ["marca", "modelo", "ano_modelo", "quilometragem", "preco"] as const;
const MENSAGEM_DO_OBRIGATORIO: Record<(typeof OBRIGATORIOS_PARA_CRIAR)[number], string> = {
  marca: "Informe a marca.",
  modelo: "Informe o modelo.",
  ano_modelo: "Informe o ano do modelo.",
  quilometragem: "Informe a quilometragem.",
  preco: "Informe o preço à vista.",
};

export const LIMITE_DE_ITENS_DE_ESTADO = 30;
export const LIMITE_DE_FOTOS_DO_REPASSE = 40;
const CURTO = 120;
const LONGO = 2000;
const RESUMO = 140;
const DESCRICAO_DO_ITEM = 300;
const VALOR_MAXIMO = 99_999_999;

export interface RecusaDoPainel {
  ok: false;
  status: 400 | 403 | 404 | 409 | 422;
  erro: string;
  problemas?: string[];
}

export function cadastraRepasse(perfis: Perfil[]): boolean {
  return podeFazer(perfis, "Cadastrar carro de repasse") === "faz";
}

export function validaRepasse(perfis: Perfil[]): boolean {
  return podeFazer(perfis, "Validar e publicar repasse") === "faz";
}

/**
 * Rascunho é de quem cadastra; em validação, publicado e reservado, de quem
 * valida (spec §5: "quem não valida pede a um validador que devolva o carro
 * para rascunho"); vendido e arquivado, de ninguém.
 */
export function podeEditarORepasse(r: Pick<Repasse, "situacao">, perfis: Perfil[]): boolean {
  if (r.situacao === "rascunho") return cadastraRepasse(perfis);
  if (r.situacao === "em_validacao" || r.situacao === "publicado" || r.situacao === "reservado") {
    return validaRepasse(perfis);
  }
  return false;
}

const INVISIVEIS = /[\u200B-\u200D\u2060\uFEFF]/g;

/** Sem as bordas e sem o invisível; o que sobra vazio vira null. */
function limpo(v: string): string | null {
  const t = v.replace(INVISIVEIS, "").trim();
  return t === "" ? null : t;
}

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type Normalizado = { ok: true; valor: unknown } | { ok: false; problema: string };
const aceita = (valor: unknown): Normalizado => ({ ok: true, valor });
const recusa = (problema: string): Normalizado => ({ ok: false, problema });

function textoOpcional(v: unknown, limite: number, nome: string): Normalizado {
  if (v === null) return aceita(null);
  if (typeof v !== "string") return recusa(`${nome}: texto inválido.`);
  const t = limpo(v);
  if (t !== null && t.length > limite) return recusa(`${nome}: até ${limite} caracteres.`);
  return aceita(t);
}

function textoObrigatorio(v: unknown, seVazio: string): Normalizado {
  if (typeof v !== "string") return recusa(seVazio);
  const t = limpo(v);
  if (t === null) return recusa(seVazio);
  if (t.length > CURTO) return recusa(`${seVazio.replace(/\.$/, "")}: até ${CURTO} caracteres.`);
  return aceita(t);
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

function dataOpcional(v: unknown, nome: string): Normalizado {
  if (v === null) return aceita(null);
  if (typeof v !== "string" || !DATA.test(v)) return recusa(`${nome}: data inválida.`);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return recusa(`${nome}: data inválida.`);
  return aceita(v);
}

function inteiroEntre(v: unknown, min: number, max: number): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null;
}

function reaisPositivos(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 && v <= VALOR_MAXIMO ? v : null;
}

function itensDeEstado(v: unknown): Normalizado {
  if (!Array.isArray(v)) return recusa("A ficha de estado precisa ser uma lista.");
  if (v.length > LIMITE_DE_ITENS_DE_ESTADO) return recusa(`A ficha de estado tem até ${LIMITE_DE_ITENS_DE_ESTADO} itens.`);
  const itens: ItemDeEstado[] = [];
  for (let i = 0; i < v.length; i += 1) {
    const linha = `Linha ${i + 1} da ficha`;
    const bruto: unknown = v[i];
    if (!ehObjeto(bruto)) return recusa(`${linha}: formato inválido.`);
    const descricao = typeof bruto.descricao === "string" ? limpo(bruto.descricao) : null;
    if (!descricao) return recusa(`${linha}: descreva o defeito antes de salvar.`);
    if (descricao.length > DESCRICAO_DO_ITEM) return recusa(`${linha}: a descrição tem até ${DESCRICAO_DO_ITEM} caracteres.`);
    const local = typeof bruto.local === "string" ? (limpo(bruto.local) ?? "") : "";
    if (local.length > CURTO) return recusa(`${linha}: o local tem até ${CURTO} caracteres.`);
    const foto = typeof bruto.foto === "string" ? limpo(bruto.foto) : null;
    if (foto !== null && !ehFotoPropria(foto)) return recusa(`${linha}: a foto precisa ser enviada pelo painel.`);
    let orcamento: number | null = null;
    if (bruto.orcamento !== null && bruto.orcamento !== undefined) {
      orcamento = reaisPositivos(bruto.orcamento);
      if (orcamento === null) return recusa(`${linha}: o orçamento é um valor em reais maior que zero.`);
    }
    itens.push({ descricao, local, foto, orcamento, estetico: bruto.estetico === true });
  }
  return aceita(itens);
}

function listaDeFotos(v: unknown): Normalizado {
  if (!Array.isArray(v) || v.some((u) => typeof u !== "string")) return recusa("Fotos: lista de endereços inválida.");
  const urls = (v as string[]).map((u) => u.trim()).filter((u) => u !== "");
  if (urls.length > LIMITE_DE_FOTOS_DO_REPASSE) return recusa(`Fotos: até ${LIMITE_DE_FOTOS_DO_REPASSE}.`);
  if (urls.some((u) => !ehFotoPropria(u))) return recusa("Há foto de fora do nosso armazenamento. Envie as fotos pelo painel.");
  return aceita(urls);
}

function daLista(v: unknown, lista: readonly string[], mensagem: string): Normalizado {
  return v === null || (typeof v === "string" && lista.includes(v)) ? aceita(v) : recusa(mensagem);
}

function normalizarCampo(campo: CampoEditavelDoRepasse, v: unknown, agora: Date): Normalizado {
  const teto = anoMaximo(agora);
  switch (campo) {
    case "marca":
      return textoObrigatorio(v, "Informe a marca.");
    case "modelo":
      return textoObrigatorio(v, "Informe o modelo.");
    case "versao":
      return textoOpcional(v, CURTO, "Versão");
    case "cambio":
      return textoOpcional(v, CURTO, "Câmbio");
    case "combustivel":
      return textoOpcional(v, CURTO, "Combustível");
    case "cor":
      return textoOpcional(v, CURTO, "Cor");
    case "fipe_codigo":
      return textoOpcional(v, CURTO, "Código FIPE");
    case "fipe_mes_referencia":
      return textoOpcional(v, CURTO, "Mês da FIPE");
    case "oficina_do_orcamento":
      return textoOpcional(v, CURTO, "Oficina do orçamento");
    case "laudo_apontamento":
      return textoOpcional(v, LONGO, "Apontamento do laudo");
    case "leilao_detalhe":
      return textoOpcional(v, LONGO, "Registro de leilão");
    case "sinistro_detalhe":
      return textoOpcional(v, LONGO, "Registro de sinistro");
    case "motivo":
      return textoOpcional(v, LONGO, "Por que está no repasse");
    case "resumo":
      return textoOpcional(v, RESUMO, "Linha do card");
    case "ano_modelo": {
      const n = inteiroEntre(v, PISO_DO_ANO_NO_BANCO, teto);
      return n === null ? recusa(`Ano do modelo entre ${PISO_DO_ANO_NO_BANCO} e ${teto}.`) : aceita(n);
    }
    case "ano_fabricacao": {
      if (v === null) return aceita(null);
      const n = inteiroEntre(v, PISO_DO_ANO_NO_BANCO, teto);
      return n === null ? recusa(`Ano de fabricação entre ${PISO_DO_ANO_NO_BANCO} e ${teto}.`) : aceita(n);
    }
    case "quilometragem": {
      const n = inteiroEntre(v, 0, 9_999_999);
      return n === null ? recusa("Quilometragem é um número inteiro, zero ou mais.") : aceita(n);
    }
    case "preco": {
      const n = reaisPositivos(v);
      return n === null ? recusa("O preço à vista é um valor em reais maior que zero.") : aceita(n);
    }
    case "fipe_valor": {
      if (v === null) return aceita(null);
      const n = reaisPositivos(v);
      return n === null ? recusa("O valor FIPE é um valor em reais maior que zero.") : aceita(n);
    }
    case "carroceria":
      return daLista(v, CARROCERIAS_DO_REPASSE, "Carroceria fora da lista.");
    case "laudo":
      return daLista(v, LAUDOS_DO_REPASSE, "Situação do laudo fora da lista.");
    case "leilao_consta":
    case "sinistro_consta":
      return v === null || typeof v === "boolean" ? aceita(v) : recusa("Responda sim ou não.");
    case "sem_defeitos_conhecidos":
      return typeof v === "boolean" ? aceita(v) : recusa("Responda sim ou não.");
    case "historico_consultado_em":
      return dataOpcional(v, "Data da consulta do histórico");
    case "orcamento_em":
      return dataOpcional(v, "Data do orçamento");
    case "itens_de_estado":
      return itensDeEstado(v);
    case "web_full_images":
    case "whatsapp_images":
      return listaDeFotos(v);
  }
}

export function normalizarCampos(
  corpo: Record<string, unknown>,
  agora: Date,
): { colunas: Partial<FormularioDoRepasse>; problemas: string[] } {
  const colunas: Record<string, unknown> = {};
  const problemas: string[] = [];
  for (const [chave, valor] of Object.entries(corpo)) {
    if (CAMPOS_DESCARTADOS.includes(chave)) continue;
    if (!(CAMPOS_EDITAVEIS_DO_REPASSE as readonly string[]).includes(chave)) {
      problemas.push(`O painel não grava o campo ${chave}.`);
      continue;
    }
    const r = normalizarCampo(chave as CampoEditavelDoRepasse, valor, agora);
    if (r.ok) colunas[chave] = r.valor;
    else problemas.push(r.problema);
  }
  const temWeb = "web_full_images" in colunas;
  const temZap = "whatsapp_images" in colunas;
  if (temWeb !== temZap) {
    problemas.push("As fotos vão em par: as duas listas juntas.");
  } else if (temWeb && (colunas.web_full_images as string[]).length !== (colunas.whatsapp_images as string[]).length) {
    problemas.push("Cada foto tem duas versões e uma delas faltou. Envie a foto de novo.");
  }
  return { colunas: colunas as Partial<FormularioDoRepasse>, problemas };
}

export type LinhaNovaDoRepasse = Partial<FormularioDoRepasse> & {
  id: string;
  slug: string;
  situacao: "rascunho";
  criado_por: string;
  marca: string;
  modelo: string;
  ano_modelo: number;
  quilometragem: number;
  preco: number;
};

export function decidirCriacao(args: {
  corpo: unknown;
  perfis: Perfil[];
  id: string;
  autorId: string;
  agora: Date;
}): { ok: true; linha: LinhaNovaDoRepasse } | RecusaDoPainel {
  if (!cadastraRepasse(args.perfis)) {
    return { ok: false, status: 403, erro: "Seu perfil não cadastra carro de repasse." };
  }
  const corpo = args.corpo;
  if (!ehObjeto(corpo)) return { ok: false, status: 400, erro: "Corpo inválido." };
  const faltando = OBRIGATORIOS_PARA_CRIAR.filter((c) => !(c in corpo)).map((c) => MENSAGEM_DO_OBRIGATORIO[c]);
  const { colunas, problemas } = normalizarCampos(corpo, args.agora);
  const todos = [...faltando, ...problemas];
  if (todos.length > 0) return { ok: false, status: 400, erro: todos[0], problemas: todos };

  const marca = colunas.marca as string;
  const modelo = colunas.modelo as string;
  const ano_modelo = colunas.ano_modelo as number;
  const slug = slugDoRepasse({ id: args.id, marca, modelo, versao: colunas.versao ?? null, ano_modelo });
  return {
    ok: true,
    linha: {
      ...colunas,
      id: args.id,
      slug,
      situacao: "rascunho",
      criado_por: args.autorId,
      marca,
      modelo,
      ano_modelo,
      quilometragem: colunas.quilometragem as number,
      preco: colunas.preco as number,
    },
  };
}

export function decidirEdicao(args: {
  repasse: Repasse;
  corpo: unknown;
  perfis: Perfil[];
  agora: Date;
}): { ok: true; colunas: Partial<FormularioDoRepasse> & { slug?: string } } | RecusaDoPainel {
  const { repasse, corpo, perfis, agora } = args;
  if (repasse.situacao === "vendido" || repasse.situacao === "arquivado") {
    return { ok: false, status: 409, erro: "Carro vendido ou arquivado não se edita." };
  }
  if (!podeEditarORepasse(repasse, perfis)) {
    return {
      ok: false,
      status: 403,
      erro:
        repasse.situacao === "rascunho"
          ? "Seu perfil não cadastra carro de repasse."
          : "Fora do rascunho, só quem valida edita. Peça a um validador que devolva o carro para rascunho.",
    };
  }
  if (!ehObjeto(corpo)) return { ok: false, status: 400, erro: "Corpo inválido." };
  const { colunas, problemas } = normalizarCampos(corpo, agora);
  if (problemas.length > 0) return { ok: false, status: 400, erro: problemas[0], problemas };

  const depois: Repasse = { ...repasse, ...colunas };
  if (repasse.situacao !== "rascunho") {
    // Carro já conferido não pode sair da edição incompleto: o site o mostra.
    const faltas = checklistDoRepasse(depois, agora);
    if (faltas.length > 0) {
      return {
        ok: false,
        status: 422,
        erro: "Fora do rascunho, o carro precisa continuar completo.",
        problemas: faltas.map((f) => f.mensagem),
      };
    }
    // A URL publicada fica estável: o slug só muda no rascunho.
    return { ok: true, colunas };
  }
  const mudouAIdentidade = (["marca", "modelo", "versao", "ano_modelo"] as const).some((c) => c in colunas);
  return { ok: true, colunas: mudouAIdentidade ? { ...colunas, slug: slugDoRepasse(depois) } : colunas };
}

export function formularioDe(r: Repasse): FormularioDoRepasse {
  const f: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITAVEIS_DO_REPASSE) f[campo] = r[campo];
  return f as FormularioDoRepasse;
}

/** Só o que mudou — é o corpo do PATCH. Compara por valor, listas e itens inclusive. */
export function alteracoes(atual: FormularioDoRepasse, salvo: FormularioDoRepasse): Partial<FormularioDoRepasse> {
  const saida: Record<string, unknown> = {};
  for (const campo of CAMPOS_EDITAVEIS_DO_REPASSE) {
    if (JSON.stringify(atual[campo]) !== JSON.stringify(salvo[campo])) saida[campo] = atual[campo];
  }
  return saida as Partial<FormularioDoRepasse>;
}
