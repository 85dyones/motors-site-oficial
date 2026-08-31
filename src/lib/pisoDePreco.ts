import { precoEfetivo } from "./precoPromocional";

/**
 * O piso do preço — nenhum carro sai por menos do que entrou.
 *
 * Decisão do dono em 2026-08-31, quando a alternativa foi posta como faixas
 * percentuais de alçada: *"sobre a margem de alteração de preço, só trave
 * preços abaixo do preço de entrada"*. É a régua inteira. Não há banda de 5%,
 * não há aprovação em dois passos, não há teto de desconto: a loja desconta o
 * quanto quiser, desde que não venda no prejuízo.
 *
 * "Preço de entrada" é `preco_compra` — o custo de aquisição, o que a loja
 * pagou pelo carro. As telas o chamam de "preço de compra", e é esse o nome
 * que aparece para quem opera; "entrada" é o vocabulário do núcleo, onde a
 * aquisição é um evento (`veiculo_entradas`, spec 10).
 *
 * ## O que a trava compara
 *
 * O **preço EFETIVO**, não o de tabela. Um carro anunciado a 68.900 com
 * promoção de 50.000 e custo de 55.000 está vendendo no prejuízo, ainda que o
 * anúncio diga 68.900 — quem paga, paga 50.000. Comparar contra
 * `preco_original` deixaria a promoção passar por baixo da trava, que é
 * exatamente o caminho que o campo novo abriu.
 *
 * ## Quando ela NÃO tem o que travar
 *
 * Quando o custo não está lançado. Medido em 2026-08-31: **2 dos 38 veículos
 * ativos** tinham `preco_compra` preenchido (3 de 104 na base inteira). A trava
 * é silenciosa nos outros 36 — não porque falhe, mas porque não há contra o que
 * comparar. Ela ganha alcance à medida que o custo for lançado, e passa a valer
 * sozinha quando o núcleo registrar a entrada como evento.
 *
 * Nenhum veículo ativo estava abaixo do custo quando isto entrou, então ligar a
 * trava não invalidou preço nenhum que já estivesse no ar.
 */

/**
 * Por que este preço não pode ser gravado — `null` quando pode.
 *
 * `podeVerCusto` decide se a mensagem NOMEIA o valor. Hoje todos os perfis que
 * alteram preço (Admin, Gestor, Financeiro) também veem custo, então a
 * distinção não muda nada na prática — ela existe para o dia em que a linha
 * "Alterar preço até 5%" do Comercial ganhar tela: o Comercial vê preço e
 * desconto, **não vê custo** (matriz A17), e uma recusa que dissesse "abaixo de
 * R$ 55.000" entregaria a ele exatamente o número que a matriz esconde.
 */
export function recusaPorPisoDeCusto(
  efetivo: number | null | undefined,
  custo: number | null | undefined,
  opcoes: { podeVerCusto: boolean },
): string | null {
  const c = custo === null || custo === undefined ? null : Number(custo);
  // Sem custo lançado não há piso. Zero é "não lançado", como no resto do
  // painel — a checklist do editor conta `preco_compra` nulo como PENDENTE.
  if (c === null || Number.isNaN(c) || c <= 0) return null;

  const p = efetivo === null || efetivo === undefined ? null : Number(efetivo);
  if (p === null || Number.isNaN(p)) return null;

  if (p >= c) return null;

  const reais = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

  return opcoes.podeVerCusto
    ? `${reais(p)} fica abaixo do preço de compra deste veículo (${reais(c)}). ` +
        `Vender abaixo da entrada não se faz pelo painel.`
    : "Este preço fica abaixo do custo de aquisição do veículo. Fale com quem vê custo.";
}

/**
 * O preço efetivo que uma gravação produz — o que a trava precisa julgar.
 *
 * Recebe o estado ANTERIOR e o que está sendo escrito, porque as duas pontas
 * podem mudar na mesma chamada: quem reprecifica um veículo nativo pode mandar
 * preço novo e promoção nova juntos, e julgar contra o valor velho recusaria
 * uma combinação válida.
 */
export function efetivoDepoisDaEscrita(
  anterior: Record<string, unknown>,
  escrita: Record<string, unknown>,
): number | null {
  const depois = { ...anterior, ...escrita };
  const original =
    depois.preco_original === null || depois.preco_original === undefined
      ? null
      : Number(depois.preco_original);
  const promo =
    depois.preco_promocional === null || depois.preco_promocional === undefined
      ? null
      : Number(depois.preco_promocional);

  // `preco` explícito na escrita vence: é o efetivo que quem chamou derivou.
  if (escrita.preco !== undefined && escrita.preco !== null) return Number(escrita.preco);
  return precoEfetivo(promo, original);
}
