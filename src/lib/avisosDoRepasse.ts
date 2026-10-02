/**
 * A lista do repasse no painel: quem combina com um carro, e a mensagem que
 * a equipe copia para o Chatwoot (spec §6, "Inscritos que combinam").
 *
 * O aviso é MANUAL (dono, 24/09): o site guarda quem está na lista e o perfil
 * de cada um; uma pessoa da equipe manda. Nada aqui dispara mensagem.
 *
 * Quem combina:
 *   - enquanto o carro é só para lojistas: os lojistas com CNPJ conferido.
 *     A conferência existe para isso — o aviso antecipado é vantagem de
 *     lojista, e CNPJ não conferido ainda não é lojista para a loja;
 *   - depois do switch "abrir para todos": os mesmos lojistas e quem compra
 *     para usar cuja faixa casa com o preço à vista e cuja carroceria casa
 *     (faixa ou carroceria em branco casam com qualquer carro; a moto só
 *     casa com quem a marcou).
 */
import { validaRepasse, type RecusaDoPainel } from "./edicaoDoRepasse";
import type { Perfil } from "./permissoes";
import {
  FAIXAS_DO_REPASSE,
  contaDoRepasse,
  emReais,
  etiquetaDoRepasse,
  faixaDoPreco,
  soParaLojistas,
  temLaudo,
  type FaixaDoRepasse,
  type Repasse,
} from "./repasse";

export const TRILHAS_DO_REPASSE = ["consumidor", "lojista"] as const;
export type TrilhaDoRepasse = (typeof TRILHAS_DO_REPASSE)[number];

export interface InscritoDoRepasse {
  id: string;
  trilha: TrilhaDoRepasse;
  nome: string;
  whatsapp: string;
  faixa: FaixaDoRepasse | null;
  carrocerias: string[];
  cnpj: string | null;
  loja_cidade: string | null;
  cnpj_conferido_em: string | null;
  created_at: string;
}

export const COLUNAS_DO_INSCRITO =
  "id, trilha, nome, whatsapp, faixa, carrocerias, cnpj, loja_cidade, cnpj_conferido_em, created_at";

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export function inscritoDaLinha(linha: Record<string, unknown>): InscritoDoRepasse | null {
  const id = texto(linha.id);
  const nome = texto(linha.nome);
  const whatsapp = texto(linha.whatsapp);
  const trilha = TRILHAS_DO_REPASSE.find((t) => t === linha.trilha) ?? null;
  const created_at = texto(linha.created_at);
  if (!id || !nome || !whatsapp || !trilha || !created_at) return null;
  const faixa = FAIXAS_DO_REPASSE.find((f) => f.id === linha.faixa)?.id ?? null;
  const carrocerias = Array.isArray(linha.carrocerias)
    ? linha.carrocerias.filter((c): c is string => typeof c === "string")
    : [];
  return {
    id,
    trilha,
    nome,
    whatsapp,
    faixa,
    carrocerias,
    cnpj: texto(linha.cnpj),
    loja_cidade: texto(linha.loja_cidade),
    cnpj_conferido_em: texto(linha.cnpj_conferido_em),
    created_at,
  };
}

export interface CombinaComORepasse {
  inscrito: InscritoDoRepasse;
  avisado: boolean;
}

export function inscritosQueCombinam(
  r: Pick<Repasse, "situacao" | "aberto_ao_publico_em" | "preco" | "carroceria">,
  inscritos: InscritoDoRepasse[],
  avisados: ReadonlySet<string>,
): { combinam: CombinaComORepasse[]; lojistasSemConferencia: number } {
  const lojistasSemConferencia = inscritos.filter((i) => i.trilha === "lojista" && !i.cnpj_conferido_em).length;
  if (r.situacao !== "publicado") return { combinam: [], lojistasSemConferencia };

  const lojistas = inscritos.filter((i) => i.trilha === "lojista" && i.cnpj_conferido_em);
  const faixa = faixaDoPreco(r.preco);
  const consumidores = soParaLojistas(r)
    ? []
    : inscritos.filter(
        (i) =>
          i.trilha === "consumidor" &&
          (i.faixa === null || i.faixa === faixa) &&
          // A lista vazia é qualquer carro: a moto só vai para quem a marcou.
          (i.carrocerias.length === 0
            ? r.carroceria !== "moto"
            : r.carroceria !== null && i.carrocerias.includes(r.carroceria)),
      );

  const ordem = (c: CombinaComORepasse) => (c.avisado ? 2 : 0) + (c.inscrito.trilha === "lojista" ? 0 : 1);
  const combinam = [...lojistas, ...consumidores]
    .map((inscrito) => ({ inscrito, avisado: avisados.has(inscrito.id) }))
    .sort((a, b) => ordem(a) - ordem(b) || a.inscrito.created_at.localeCompare(b.inscrito.created_at));
  return { combinam, lojistasSemConferencia };
}

/**
 * O texto que a equipe cola no Chatwoot. Passa em `termosProibidosEm` com a
 * lista inteira (tests/avisos-do-repasse.test.ts): nada de "não girou", de
 * CDC ou de direitos — e laudo, quando há, "sai a pedido" (regra de 16/09).
 */
export function mensagemDeAvisoDoRepasse(
  r: Repasse,
  inscrito: Pick<InscritoDoRepasse, "nome" | "trilha">,
  url: string,
): string {
  const primeiroNome = inscrito.nome.trim().split(/\s+/)[0];
  const carro = [r.marca, r.modelo, r.versao, String(r.ano_modelo)].filter(Boolean).join(" ");
  const conta = contaDoRepasse(r);
  // "Antes do site" só é verdade enquanto o carro é só para lojistas. Depois do
  // switch "abrir para todos" o lojista ainda aparece na lista (e na frente),
  // e a mensagem não pode afirmar o que já deixou de ser fato.
  let abertura: string;
  if (inscrito.trilha !== "lojista") {
    const umVeiculo = r.carroceria === "moto" ? "uma moto" : "um carro";
    abertura = `Entrou no Repasse Motors ${umVeiculo} que combina com o que você procura: ${carro}.`;
  } else if (soParaLojistas(r)) {
    abertura = `Repasse Motors, aviso para lojistas antes do site: ${carro}.`;
  } else {
    abertura = `Entrou no Repasse Motors: ${carro}.`;
  }
  const linhas: Array<string | null> = [
    `Olá, ${primeiroNome}!`,
    abertura,
    `${r.quilometragem.toLocaleString("pt-BR")} km · ${etiquetaDoRepasse(r)}.`,
    temLaudo(r) ? "O laudo cautelar sai a pedido, antes de qualquer sinal." : null,
    `À vista: ${emReais(r.preco)}.`,
    conta.reparoOrcado > 0
      ? `Reparo orçado: ${emReais(conta.reparoOrcado)}. Você gasta ${emReais(conta.voceGasta)}.`
      : null,
    conta.fipe !== null && conta.abaixoDaFipe !== null && conta.abaixoDaFipe > 0
      ? `FIPE${r.fipe_mes_referencia ? ` de ${r.fipe_mes_referencia}` : ""}: ${emReais(conta.fipe)}. Fica ${emReais(conta.abaixoDaFipe)} abaixo.`
      : null,
    `Fotos, conta e defeitos conhecidos: ${url}`,
    "Pagamento só à vista, PIX ou TED. O exame é no pátio, com hora marcada.",
  ];
  return linhas.filter((l): l is string => l !== null).join("\n");
}

export function decidirAviso(args: {
  repasse: Pick<Repasse, "situacao">;
  inscrito: InscritoDoRepasse | null;
  perfis: Perfil[];
}): { ok: true } | RecusaDoPainel {
  if (!validaRepasse(args.perfis)) return { ok: false, status: 403, erro: "Só quem valida marca aviso." };
  if (args.repasse.situacao !== "publicado") return { ok: false, status: 409, erro: "Só se avisa sobre carro publicado." };
  if (!args.inscrito) return { ok: false, status: 404, erro: "Inscrito não encontrado. A pessoa pode ter saído da lista." };
  return { ok: true };
}

export function decidirMarcacaoDeInscrito(args: {
  inscrito: InscritoDoRepasse;
  corpo: unknown;
  perfis: Perfil[];
  autorId: string;
  agora: Date;
}): { ok: true; colunas: { cnpj_conferido_em: string | null; cnpj_conferido_por: string | null } } | RecusaDoPainel {
  if (!validaRepasse(args.perfis)) return { ok: false, status: 403, erro: "Só quem valida mexe na lista do repasse." };
  const corpo = args.corpo as { cnpj_conferido?: unknown } | null;
  if (!corpo || typeof corpo !== "object" || typeof corpo.cnpj_conferido !== "boolean") {
    return { ok: false, status: 400, erro: "Diga se o CNPJ foi conferido." };
  }
  if (args.inscrito.trilha !== "lojista") return { ok: false, status: 409, erro: "Só lojista tem CNPJ para conferir." };
  return corpo.cnpj_conferido
    ? { ok: true, colunas: { cnpj_conferido_em: args.agora.toISOString(), cnpj_conferido_por: args.autorId } }
    : { ok: true, colunas: { cnpj_conferido_em: null, cnpj_conferido_por: null } };
}
