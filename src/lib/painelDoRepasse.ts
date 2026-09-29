/** As abas da lista `/admin/repasse` (spec §6): por situação, com contagem. */
import { SITUACOES_DO_REPASSE, type SituacaoDoRepasse } from "./repasse";

/**
 * Os endereços do carro no painel. Desde 28/09 (pedido do dono: "não existe
 * um modo visualização interna, ele só abre edição") abrir o carro mostra a
 * VISÃO, e o editor mora em `/editar`. Todo link interno para um carro vai à
 * visão; só o "Cadastrar carro" leva direto ao editor, porque quem acabou de
 * criar o rascunho vai preencher o resto.
 */
export const CAMINHO_DO_PAINEL_DO_REPASSE = "/admin/repasse";
export const caminhoDoCarroNoPainel = (id: string) => `${CAMINHO_DO_PAINEL_DO_REPASSE}/${id}`;
export const caminhoDoEditorNoPainel = (id: string) => `${caminhoDoCarroNoPainel(id)}/editar`;

export const ABAS_DO_PAINEL: ReadonlyArray<{ situacao: SituacaoDoRepasse; rotulo: string }> = [
  { situacao: "em_validacao", rotulo: "Aguardando validação" },
  { situacao: "rascunho", rotulo: "Rascunhos" },
  { situacao: "publicado", rotulo: "Publicados" },
  { situacao: "reservado", rotulo: "Reservados" },
  { situacao: "vendido", rotulo: "Vendidos" },
  { situacao: "arquivado", rotulo: "Arquivados" },
];

export function contarPorSituacao(repasses: ReadonlyArray<{ situacao: SituacaoDoRepasse }>): Record<SituacaoDoRepasse, number> {
  const contagem = Object.fromEntries(SITUACOES_DO_REPASSE.map((s) => [s, 0])) as Record<SituacaoDoRepasse, number>;
  for (const r of repasses) contagem[r.situacao] += 1;
  return contagem;
}

/** Quem valida começa pelo que o espera; quem cadastra, pelos rascunhos. */
export function abaInicial(contagem: Record<SituacaoDoRepasse, number>, valida: boolean): SituacaoDoRepasse {
  if (!valida) return "rascunho";
  return contagem.em_validacao > 0 ? "em_validacao" : "publicado";
}

export function abaDaUrl(valor: string | undefined, padrao: SituacaoDoRepasse): SituacaoDoRepasse {
  return (SITUACOES_DO_REPASSE as readonly string[]).includes(valor ?? "") ? (valor as SituacaoDoRepasse) : padrao;
}
