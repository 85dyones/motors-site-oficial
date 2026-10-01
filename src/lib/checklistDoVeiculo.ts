import {
  FOTOS_DA_FICHA_COMPLETA,
  MINIMO_DE_FOTOS,
  MINIMO_DE_FOTOS_EM_PREPARACAO,
  liberadoEmPreparacao,
} from "./coerenciaDoCadastro";

/**
 * O checklist de publicação do veículo, num lugar só (01/10/2026).
 *
 * Morava dentro do `EditorDeVeiculo`. Com a visão só de leitura
 * (`VisaoDoVeiculo`), as duas telas passaram a mostrar o mesmo checklist, e a
 * conta não pode morar em duas cópias: um dia uma mudaria e o painel passaria a
 * discordar de si mesmo sobre o que falta no carro. As explicações de cada
 * item, e de por que o laudo saiu da lista em 29/08, seguem aqui.
 */

export interface VeiculoDoChecklist {
  whatsapp_images?: string[] | null;
  web_full_images?: string[] | null;
  em_preparacao?: boolean | null;
  previsao_chegada_em?: string | null;
  placa?: string | null;
  motor?: string | null;
  cor_interna?: string | null;
  donos_anteriores?: number | null;
  garantia_fabrica?: string | null;
  descricao?: string | null;
  opcionais?: string | null;
  origem?: string | null;
  preco_compra?: number | null;
  tipo?: string | null;
  perfis_uso?: string[] | null;
}

export interface ItemDoChecklist {
  l: string;
  d: string;
  ok: boolean;
  estado: string;
}

/** Placa, motor, cor interna, donos anteriores e garantia: a ficha que é nossa. */
export function fichaPropriaCompleta(v: VeiculoDoChecklist): boolean {
  return Boolean(v.placa && v.motor && v.cor_interna && v.donos_anteriores !== null && v.donos_anteriores !== undefined && v.garantia_fabrica);
}

/** A porta de fotos que vale PARA ESTE carro — a mesma conta de
 *  `bloqueiosDePublicacao`, para a tela não discordar do site. */
export function minimoDeFotosDo(v: VeiculoDoChecklist): number {
  return liberadoEmPreparacao(v) ? MINIMO_DE_FOTOS_EM_PREPARACAO : MINIMO_DE_FOTOS;
}

/**
 * Os itens do checklist. `totalDeFotos` vem de quem chama porque a contagem é
 * do pareamento de `fotosDoVeiculo`, e não do tamanho de uma das colunas.
 * `podeVerCusto`: o item do preço de compra só existe para quem vê custo —
 * "PENDENTE" ali já contaria a quem não pode ver que o preço está (ou não)
 * lançado.
 */
export function checklistDoVeiculo(
  v: VeiculoDoChecklist,
  { totalDeFotos, podeVerCusto }: { totalDeFotos: number; podeVerCusto: boolean },
): ItemDoChecklist[] {
  const minimo = minimoDeFotosDo(v);
  const ficha = fichaPropriaCompleta(v);
  return [
    {
      // O número vem da constante, não da mão: `MINIMO_DE_FOTOS` é a mesma
      // régua que `bloqueiosDePublicacao` aplica e que `getEstoque` usa para
      // filtrar a vitrine.
      l:
        minimo === MINIMO_DE_FOTOS
          ? `${MINIMO_DE_FOTOS} fotos — libera a publicação`
          : `${MINIMO_DE_FOTOS_EM_PREPARACAO} foto — em preparação, libera a publicação`,
      d: "Frente, traseira, uma lateral e o interior já contam a história.",
      ok: totalDeFotos >= minimo,
      estado: totalDeFotos >= minimo ? "OK" : `FALTAM ${minimo - totalDeFotos}`,
    },
    {
      // Criado em 01/09. NÃO bloqueia — o carro já está no ar quando esta linha
      // aparece pendente —, e por isso o rótulo fala de ficha, não de
      // publicação. Ver `FOTOS_DA_FICHA_COMPLETA`.
      l: `${FOTOS_DA_FICHA_COMPLETA} fotos — ficha completa`,
      d: "As duas laterais, painel, porta-malas e motor. Não segura o carro fora do ar.",
      ok: totalDeFotos >= FOTOS_DA_FICHA_COMPLETA,
      estado: totalDeFotos >= FOTOS_DA_FICHA_COMPLETA ? "OK" : `FALTAM ${FOTOS_DA_FICHA_COMPLETA - totalDeFotos}`,
    },
    {
      l: "Ficha própria completa",
      d: "Placa, motor, cor interna, donos anteriores e garantia.",
      ok: ficha,
      estado: ficha ? "OK" : "PENDENTE",
    },
    // O laudo saiu do checklist em 29/08. Ele acusava PENDENTE em 33 dos 34
    // publicados, sobre uma premissa errada: 100% do pátio é periciado, e
    // `laudo_pericia` guarda APONTAMENTOS pontuais. Vazio é o melhor caso, não
    // uma falta — e checklist que fica vermelho no carro impecável ensina a
    // ignorar o checklist.
    {
      l: "Texto do anúncio revisado",
      d: "Descrição editorial que abre a página do veículo.",
      ok: Boolean(v.descricao),
      estado: v.descricao ? "OK" : "PENDENTE",
    },
    {
      l: "Opcionais preenchidos",
      // No carro do feed quem preenche é o RevendaMais: a pendência precisa
      // dizer onde se resolve.
      d:
        v.origem === "painel"
          ? "Os primeiros aparecem no card do catálogo."
          : "Os primeiros aparecem no card do catálogo. Vêm do RevendaMais: o que faltar, preencha lá.",
      ok: Boolean(v.opcionais),
      estado: v.opcionais ? "OK" : "PENDENTE",
    },
    ...(podeVerCusto
      ? [
          {
            l: "Preço de compra lançado",
            d: "Sem ele a margem por veículo não fecha.",
            ok: v.preco_compra !== null && v.preco_compra !== undefined,
            estado: v.preco_compra ? "OK" : "PENDENTE",
          },
        ]
      : []),
    {
      l: "Carroceria e perfil",
      d: "Alimentam os filtros e a curadoria do site.",
      ok: Boolean(v.tipo && (v.perfis_uso ?? []).length > 0),
      estado: v.tipo && (v.perfis_uso ?? []).length > 0 ? "OK" : "PENDENTE",
    },
  ];
}
