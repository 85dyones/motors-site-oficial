/**
 * A máquina de situações do repasse (spec §5).
 *
 *   rascunho ──enviar──▶ em_validacao ──publicar──▶ publicado ◀──▶ reservado
 *      ▲                     │                         │              │
 *      └─────devolver────────┴─────────────────────────┘   vendido ◀──┘
 *                                        (qualquer um, menos arquivado) ──▶ arquivado
 *
 * Quem faz cada ato sai da matriz A17: "Cadastrar carro de repasse" (todos
 * os perfis) envia; "Validar e publicar repasse" (Administrador, Gestor,
 * Comercial) faz o resto. A rota roda `decidirTransicao` e grava com a chave
 * de serviço — `authenticated` não escreve na tabela (20260924200000).
 *
 * "Abrir para todos" é um switch manual e não volta atrás (dono, 24/09).
 * Devolver um carro publicado zera a publicação: quando ele voltar, quem
 * valida escolhe de novo entre "só para lojistas" e "aberto a todos".
 */
import { checklistDoRepasse } from "./checklistDoRepasse";
import { cadastraRepasse, validaRepasse, type RecusaDoPainel } from "./edicaoDoRepasse";
import type { Perfil } from "./permissoes";
import type { Repasse, SituacaoDoRepasse } from "./repasse";

export const ATOS_DO_REPASSE = [
  "enviar",
  "devolver",
  "publicar_lojistas",
  "publicar_todos",
  "abrir_para_todos",
  "reservar",
  "liberar_reserva",
  "vender",
  "arquivar",
] as const;
export type AtoDoRepasse = (typeof ATOS_DO_REPASSE)[number];

export interface RegraDoAto {
  de: readonly SituacaoDoRepasse[];
  quem: "cadastra" | "valida";
  rotulo: string;
}

export const REGRAS_DOS_ATOS: Record<AtoDoRepasse, RegraDoAto> = {
  enviar: { de: ["rascunho"], quem: "cadastra", rotulo: "Enviar para validação" },
  devolver: { de: ["em_validacao", "publicado"], quem: "valida", rotulo: "Devolver para rascunho" },
  publicar_lojistas: { de: ["em_validacao"], quem: "valida", rotulo: "Publicar só para lojistas" },
  publicar_todos: { de: ["em_validacao"], quem: "valida", rotulo: "Publicar aberto a todos" },
  abrir_para_todos: { de: ["publicado"], quem: "valida", rotulo: "Abrir para todos" },
  reservar: { de: ["publicado"], quem: "valida", rotulo: "Reservar" },
  liberar_reserva: { de: ["reservado"], quem: "valida", rotulo: "Liberar a reserva" },
  vender: { de: ["publicado", "reservado"], quem: "valida", rotulo: "Marcar como vendido" },
  arquivar: {
    de: ["rascunho", "em_validacao", "publicado", "reservado", "vendido"],
    quem: "valida",
    rotulo: "Arquivar",
  },
};

export interface ColunasDaTransicao {
  situacao: SituacaoDoRepasse;
  enviado_em?: string | null;
  devolvido_com?: string | null;
  validado_por?: string | null;
  validado_em?: string | null;
  lojistas_desde?: string | null;
  aberto_ao_publico_em?: string | null;
  reservado_em?: string | null;
  vendido_em?: string | null;
  arquivado_em?: string | null;
}

export type DecisaoDaTransicao = { ok: true; ato: AtoDoRepasse; colunas: ColunasDaTransicao } | RecusaDoPainel;

export const LIMITE_DA_NOTA = 500;
const INVISIVEIS = /[\u200B-\u200D\u2060\uFEFF]/g;

/** "Este ato não vale para um carro …" */
const NA_SITUACAO: Record<SituacaoDoRepasse, string> = {
  rascunho: "em rascunho",
  em_validacao: "em validação",
  publicado: "publicado",
  reservado: "reservado",
  vendido: "vendido",
  arquivado: "arquivado",
};

function pode(quem: RegraDoAto["quem"], perfis: Perfil[]): boolean {
  return quem === "cadastra" ? cadastraRepasse(perfis) : validaRepasse(perfis);
}

export function atosPossiveis(r: Pick<Repasse, "situacao" | "aberto_ao_publico_em">, perfis: Perfil[]): AtoDoRepasse[] {
  return ATOS_DO_REPASSE.filter((ato) => {
    const regra = REGRAS_DOS_ATOS[ato];
    if (!regra.de.includes(r.situacao) || !pode(regra.quem, perfis)) return false;
    return ato !== "abrir_para_todos" || r.aberto_ao_publico_em === null;
  });
}

export function decidirTransicao(args: {
  repasse: Repasse;
  ato: unknown;
  nota?: unknown;
  perfis: Perfil[];
  autorId: string;
  agora: Date;
}): DecisaoDaTransicao {
  const { repasse, perfis, autorId } = args;
  if (typeof args.ato !== "string" || !(ATOS_DO_REPASSE as readonly string[]).includes(args.ato)) {
    return { ok: false, status: 400, erro: "Ato desconhecido." };
  }
  const ato = args.ato as AtoDoRepasse;
  const regra = REGRAS_DOS_ATOS[ato];
  if (!pode(regra.quem, perfis)) return { ok: false, status: 403, erro: "Seu perfil não faz este ato." };
  if (!regra.de.includes(repasse.situacao)) {
    return { ok: false, status: 409, erro: `"${regra.rotulo}" não vale para um carro ${NA_SITUACAO[repasse.situacao]}.` };
  }

  if (ato === "enviar" || ato === "publicar_lojistas" || ato === "publicar_todos") {
    const faltas = checklistDoRepasse(repasse, args.agora);
    if (faltas.length > 0) {
      return { ok: false, status: 422, erro: "O carro ainda não está completo.", problemas: faltas.map((f) => f.mensagem) };
    }
  }

  const agora = args.agora.toISOString();
  switch (ato) {
    case "enviar":
      return { ok: true, ato, colunas: { situacao: "em_validacao", enviado_em: agora, devolvido_com: null } };
    case "devolver": {
      const nota = typeof args.nota === "string" ? args.nota.replace(INVISIVEIS, "").trim() : "";
      if (!nota) return { ok: false, status: 400, erro: "Escreva o que falta para o carro voltar à validação." };
      if (nota.length > LIMITE_DA_NOTA) return { ok: false, status: 400, erro: `A nota tem até ${LIMITE_DA_NOTA} caracteres.` };
      return {
        ok: true,
        ato,
        colunas: {
          situacao: "rascunho",
          devolvido_com: nota,
          validado_por: null,
          validado_em: null,
          lojistas_desde: null,
          aberto_ao_publico_em: null,
        },
      };
    }
    case "publicar_lojistas":
    case "publicar_todos":
      return {
        ok: true,
        ato,
        colunas: {
          situacao: "publicado",
          validado_por: autorId,
          validado_em: agora,
          lojistas_desde: agora,
          aberto_ao_publico_em: ato === "publicar_todos" ? agora : null,
          devolvido_com: null,
        },
      };
    case "abrir_para_todos":
      if (repasse.aberto_ao_publico_em !== null) {
        return { ok: false, status: 409, erro: "O carro já está aberto a todos." };
      }
      return { ok: true, ato, colunas: { situacao: "publicado", aberto_ao_publico_em: agora } };
    case "reservar":
      return { ok: true, ato, colunas: { situacao: "reservado", reservado_em: agora } };
    case "liberar_reserva":
      return { ok: true, ato, colunas: { situacao: "publicado", reservado_em: null } };
    case "vender":
      return { ok: true, ato, colunas: { situacao: "vendido", vendido_em: agora } };
    case "arquivar":
      return { ok: true, ato, colunas: { situacao: "arquivado", arquivado_em: agora } };
  }
}
